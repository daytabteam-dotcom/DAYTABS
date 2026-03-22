import { Router, type IRouter } from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs/promises";
import os from "os";
import { exec } from "child_process";
import { promisify } from "util";
import { db } from "@workspace/db";
import { analysisJobsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { runAnalysisPipeline } from "./pipeline";
import { openai } from "@workspace/integrations-openai-ai-server";
import { cloneVoiceFromAudio, generateTtsWithVoice, deleteClonedVoice } from "../../lib/elevenLabsVoiceClone";
import {
  GetAnalysisStatusParams,
  GetAnalysisResultParams,
  ExportVideoParams,
  ExportVideoBody,
} from "@workspace/api-zod";

const execAsync = promisify(exec);

const router: IRouter = Router();

const uploadDir = path.join(os.tmpdir(), "daytabs-uploads");

const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".mp4";
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm", "video/mpeg", "video/mov"];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(mp4|mov|avi|webm|mpeg|mkv)$/i)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only video files are allowed."));
    }
  },
});

router.post("/upload", upload.single("video"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No video file uploaded" });
      return;
    }

    const platform = req.body.platform as string;
    if (!platform) {
      res.status(400).json({ error: "Platform is required" });
      return;
    }

    const validPlatforms = ["youtube_long", "youtube_shorts", "tiktok", "instagram", "linkedin", "x"];
    if (!validPlatforms.includes(platform)) {
      res.status(400).json({ error: "Invalid platform" });
      return;
    }

    const jobId = uuidv4();
    const translateSubtitles = req.body.translateSubtitles === "true" || req.body.translateSubtitles === true;
    const replaceAudio = req.body.replaceAudio === "true" || req.body.replaceAudio === true;

    await db.insert(analysisJobsTable).values({
      id: jobId,
      status: "queued",
      progress: 2,
      currentStep: "Uploading",
      platform,
      translateSubtitles: translateSubtitles ? 1 : 0,
      subtitleLanguage: req.body.subtitleLanguage || null,
      replaceAudio: replaceAudio ? 1 : 0,
      audioLanguage: req.body.audioLanguage || null,
      videoPath: req.file.path,
    });

    setImmediate(() => {
      runAnalysisPipeline(jobId, req.file!.path, platform, {
        translateSubtitles,
        subtitleLanguage: req.body.subtitleLanguage || undefined,
        replaceAudio,
        audioLanguage: req.body.audioLanguage || undefined,
      }).catch((err) => {
        req.log.error({ err, jobId }, "Pipeline error");
      });
    });

    res.json({ jobId, message: "Video uploaded successfully. Analysis started." });
  } catch (err) {
    req.log.error({ err }, "Upload error");
    res.status(500).json({ error: "Upload failed", details: err instanceof Error ? err.message : String(err) });
  }
});

router.get("/:jobId/status", async (req, res) => {
  try {
    const params = GetAnalysisStatusParams.parse(req.params);
    const job = await db.select().from(analysisJobsTable).where(eq(analysisJobsTable.id, params.jobId)).limit(1);

    if (!job.length) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    const j = job[0];
    res.json({
      jobId: j.id,
      status: j.status,
      progress: j.progress,
      currentStep: j.currentStep,
      error: j.error || undefined,
    });
  } catch (err) {
    req.log.error({ err }, "Status error");
    res.status(500).json({ error: "Failed to get status" });
  }
});

router.get("/:jobId/result", async (req, res) => {
  try {
    const params = GetAnalysisResultParams.parse(req.params);
    const job = await db.select().from(analysisJobsTable).where(eq(analysisJobsTable.id, params.jobId)).limit(1);

    if (!job.length) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    const j = job[0];
    if (j.status !== "complete") {
      res.status(425).json({ error: "Analysis not yet complete", details: j.status });
      return;
    }

    res.json(j.result);
  } catch (err) {
    req.log.error({ err }, "Result error");
    res.status(500).json({ error: "Failed to get result" });
  }
});

router.post("/:jobId/export", async (req, res) => {
  try {
    const params = ExportVideoParams.parse(req.params);
    const body = ExportVideoBody.parse(req.body);

    const job = await db.select().from(analysisJobsTable).where(eq(analysisJobsTable.id, params.jobId)).limit(1);

    if (!job.length) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    const j = job[0];
    if (j.status !== "complete") {
      res.status(425).json({ error: "Analysis not yet complete" });
      return;
    }

    const resolutionMap: Record<string, string> = {
      "240p": "426:240",
      "480p": "854:480",
      "720p": "1280:720",
      "1080p": "1920:1080",
      "4k": "3840:2160",
    };
    const scale = resolutionMap[body.resolution] || "1280:720";

    const exportId = uuidv4();
    const exportDir = path.join(os.tmpdir(), "daytabs-exports");
    await fs.mkdir(exportDir, { recursive: true });
    const outputFilename = `daytabs_export_${body.resolution}_${exportId}.mp4`;
    const outputPath = path.join(exportDir, outputFilename);

    const originalVideoPath = j.videoPath;
    if (!originalVideoPath) {
      res.status(409).json({ error: "Original video is no longer available. Please re-upload to export." });
      return;
    }

    try {
      await fs.access(originalVideoPath);
    } catch {
      res.status(409).json({ error: "Original video file has been cleaned up. Please re-upload to export." });
      return;
    }

    const shouldReplaceAudio = j.replaceAudio === 1 && j.audioLanguage;

    if (shouldReplaceAudio) {
      const result = j.result as Record<string, unknown> | null;
      const subtitles = result?.subtitles as { fullText?: string } | undefined;
      const originalText = subtitles?.fullText || "";

      if (!originalText) {
        req.log.warn({ jobId: params.jobId }, "No transcript text available for audio replacement — skipping");
      } else {
        const targetLanguage = j.audioLanguage!;
        req.log.info({ jobId: params.jobId, targetLanguage }, "Translating transcript for audio replacement");

        let textForTts = originalText;
        try {
          const translationResp = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `You are a professional translator. Translate the following text to ${targetLanguage}. Output only the translated text, preserving natural speech flow. Do not add any commentary.`,
              },
              { role: "user", content: originalText.slice(0, 4000) },
            ],
            max_completion_tokens: 2000,
          });
          textForTts = translationResp.choices[0]?.message?.content || originalText;
        } catch (err) {
          req.log.warn({ err }, "Translation failed, using original text for TTS");
        }

        req.log.info({ jobId: params.jobId }, "Generating TTS audio with voice cloning");
        const ttsPath = path.join(exportDir, `tts_${exportId}.mp3`);
        let clonedVoiceId: string | null = null;

        try {
          const audioPath = j.audioPath;
          if (audioPath) {
            try {
              await fs.access(audioPath);
              clonedVoiceId = await cloneVoiceFromAudio(audioPath, `daytabs_${params.jobId.slice(0, 8)}`);
              req.log.info({ voiceId: clonedVoiceId }, "Voice cloned from original audio");
            } catch (cloneErr) {
              req.log.warn({ cloneErr }, "Voice cloning failed, will use standard TTS voice");
            }
          }

          let ttsBuffer: Buffer;
          if (clonedVoiceId) {
            ttsBuffer = await generateTtsWithVoice(textForTts, clonedVoiceId);
          } else {
            const { textToSpeech } = await import("@workspace/integrations-openai-ai-server/audio");
            ttsBuffer = await textToSpeech(textForTts, "alloy", "mp3");
          }

          await fs.writeFile(ttsPath, ttsBuffer);

          const scaledPath = path.join(exportDir, `scaled_${exportId}.mp4`);
          await execAsync(`ffmpeg -i "${originalVideoPath}" -vf "scale=${scale}" -c:v libx264 -an "${scaledPath}" -y`);
          await execAsync(`ffmpeg -i "${scaledPath}" -i "${ttsPath}" -map 0:v -map 1:a -c:v copy -c:a aac -shortest "${outputPath}" -y`);

          await fs.unlink(scaledPath).catch(() => {});
          await fs.unlink(ttsPath).catch(() => {});

          if (clonedVoiceId) {
            deleteClonedVoice(clonedVoiceId).catch(() => {});
          }

          res.json({ downloadUrl: `/api/analysis/download/${outputFilename}`, filename: outputFilename });
          return;
        } catch (err) {
          req.log.warn({ err }, "Audio replacement failed, falling back to standard export");
          await fs.unlink(ttsPath).catch(() => {});
          if (clonedVoiceId) {
            deleteClonedVoice(clonedVoiceId).catch(() => {});
          }
        }
      }
    }

    await execAsync(`ffmpeg -i "${originalVideoPath}" -vf "scale=${scale}" -c:v libx264 -c:a aac "${outputPath}" -y`);
    res.json({ downloadUrl: `/api/analysis/download/${outputFilename}`, filename: outputFilename });
  } catch (err) {
    req.log.error({ err }, "Export error");
    res.status(500).json({ error: "Export failed", details: err instanceof Error ? err.message : String(err) });
  }
});

router.get("/download/:filename", async (req, res) => {
  try {
    const { filename } = req.params;
    if (!filename || filename.includes("..") || filename.includes("/")) {
      res.status(400).json({ error: "Invalid filename" });
      return;
    }

    const exportDir = path.join(os.tmpdir(), "daytabs-exports");
    const filePath = path.join(exportDir, filename);

    try {
      await fs.access(filePath);
    } catch {
      res.status(404).json({ error: "File not found or has expired" });
      return;
    }

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "video/mp4");

    const { createReadStream } = await import("fs");
    const stream = createReadStream(filePath);
    stream.pipe(res as unknown as NodeJS.WritableStream);

    stream.on("end", () => {
      fs.unlink(filePath).catch(() => {});
    });
  } catch (err) {
    req.log.error({ err }, "Download error");
    res.status(500).json({ error: "Download failed" });
  }
});

export default router;
