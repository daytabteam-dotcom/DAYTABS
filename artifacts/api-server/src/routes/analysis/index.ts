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
import { runAnalysisPipeline, type PipelineMode } from "./pipeline";
import { updateJob } from "./services";
import { openai } from "../../lib/openai";
import {
  GetAnalysisStatusParams,
  GetAnalysisResultParams,
  ExportVideoParams,
  ExportVideoBody,
} from "@workspace/api-zod";
import { optionalAuth } from "../../middlewares/auth";
import { normalizePlan, getLimits, buildFileTooLargeError } from "../../lib/planLimits";
import { checkVideoAnalysisLimit, incrementVideoAnalysis, getOrCreateUsage } from "../../lib/usageService";

const execAsync = promisify(exec);

const router: IRouter = Router();

router.use(optionalAuth);

const voiceSampleCache = new Map<string, Buffer>();

const VOICE_SAMPLE_TEXT: Record<string, string> = {
  alloy:   "Hi there! I'm Alloy — balanced, neutral, and versatile. I'm great for narration, explainers, and professional content.",
  echo:    "Hello, I'm Echo. I have a soft, measured delivery that works beautifully for intimate storytelling and documentary-style content.",
  fable:   "Hey! I'm Fable. I bring warmth and expressiveness to every word — perfect for bringing characters and stories to life.",
  onyx:    "I'm Onyx. Deep, rich, and authoritative. I command attention and lend credibility to serious, impactful content.",
  nova:    "Hi! I'm Nova! Bright, energetic, and full of enthusiasm. I'll make your content pop and keep audiences engaged!",
  shimmer: "Hello! I'm Shimmer — clear, friendly, and approachable. I'm ideal for tutorials, how-tos, and educational content.",
};

const uploadDir = path.join(os.tmpdir(), "daytabs-uploads");

// Multer streams files directly to disk — never buffers in memory.
// Limit is 2 GB (Studio plan max). Plan-specific size checks happen after upload.
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
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB hard cap
  fileFilter: (_req, file, cb) => {
    const allowed = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm", "video/mpeg", "video/mov"];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(mp4|mov|avi|webm|mpeg|mkv)$/i)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only video files are allowed (MP4, MOV, AVI, WebM)."));
    }
  },
});

// ── Voice preview ─────────────────────────────────────────────────────────────
router.get("/voice-preview/:voice", async (req, res) => {
  const { voice } = req.params;
  const validVoices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
  if (!validVoices.includes(voice)) { res.status(400).json({ error: "Invalid voice" }); return; }
  try {
    if (!voiceSampleCache.has(voice)) {
      const sampleText = VOICE_SAMPLE_TEXT[voice];
      const resp = await openai.audio.speech.create({
        model: "tts-1",
        voice: voice as "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer",
        input: sampleText,
        response_format: "mp3",
      });
      const buffer = Buffer.from(await resp.arrayBuffer());
      voiceSampleCache.set(voice, buffer);
    }
    const buffer = voiceSampleCache.get(voice)!;
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(buffer);
  } catch (err) {
    req.log.error({ err, voice }, "Voice preview generation failed");
    res.status(500).json({ error: "Failed to generate voice sample" });
  }
});

// ── Video upload + analysis ───────────────────────────────────────────────────
// Files are streamed from the client directly to disk via multer.
// The pipeline runs on the local file, then deletes it.
router.post("/upload", (req, res, next) => {
  // Extend request/response timeout for large file uploads (up to 2 GB)
  req.socket.setTimeout(60 * 60 * 1000); // 1 hour

  upload.single("video")(req, res, (multerErr) => {
    if (multerErr) {
      const code = (multerErr as any).code as string | undefined;
      if (code === "LIMIT_FILE_SIZE") {
        // The hard 2 GB limit was hit — report plan limit for clarity
        const rawPlan = (req as any).auth?.plan ?? "free";
        const norm = normalizePlan(rawPlan);
        const planLimits = getLimits(rawPlan);
        res.status(413).json(buildFileTooLargeError(norm, planLimits.max_video_size_bytes + 1));
      } else {
        res.status(400).json({ error: multerErr.message ?? "File upload error" });
      }
      return;
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) { res.status(400).json({ error: "No video file uploaded" }); return; }

    const validatedMode: PipelineMode = "video-analyzer";

    if (req.body.mode === "dubbing") {
      await fs.unlink(req.file.path).catch(() => {});
      res.status(403).json({ error: "Dubbing is coming soon and not yet available." });
      return;
    }

    const validPlatforms = ["youtube_long", "youtube_shorts", "tiktok", "instagram", "linkedin", "x"];

    let validatedPlatforms: string[] = [];
    if (req.body.platforms) {
      try {
        const parsed = JSON.parse(req.body.platforms as string);
        validatedPlatforms = Array.isArray(parsed) ? parsed.filter((p: string) => validPlatforms.includes(p)) : [];
      } catch {
        validatedPlatforms = [];
      }
    }
    if (validatedPlatforms.length === 0) {
      const singlePlatform = (req.body.platform as string) || "youtube_long";
      validatedPlatforms = validPlatforms.includes(singlePlatform) ? [singlePlatform] : ["youtube_long"];
    }

    let validatedModules: string[] = ["quality", "editing"];
    if (req.body.modules) {
      try {
        const parsed = JSON.parse(req.body.modules as string);
        const validModuleList = ["quality", "editing", "publish", "shortClips"];
        validatedModules = Array.isArray(parsed) ? parsed.filter((m: string) => validModuleList.includes(m)) : ["quality", "editing"];
      } catch {
        validatedModules = ["quality", "editing"];
      }
    }

    const rawPlan = req.auth?.plan ?? "free";
    const normalizedPlan = normalizePlan(rawPlan);
    const userId = req.auth?.user_id ?? null;
    const planLimits = getLimits(rawPlan);

    // Server-side plan size enforcement (client validated first, but server is authoritative)
    if (req.file.size > planLimits.max_video_size_bytes) {
      await fs.unlink(req.file.path).catch(() => {});
      res.status(413).json(buildFileTooLargeError(normalizedPlan, req.file.size));
      return;
    }

    // Check analysis limit (does NOT increment — counter only moves on successful pipeline completion)
    if (userId) {
      const limitCheck = await checkVideoAnalysisLimit(userId, rawPlan);
      if (!limitCheck.allowed) {
        await fs.unlink(req.file.path).catch(() => {});
        res.status(429).json(limitCheck.error);
        return;
      }
    }

    const maxDurationSeconds = planLimits.max_video_duration_seconds;
    const jobId = uuidv4();
    const translateSubtitles = req.body.translateSubtitles === "true" || req.body.translateSubtitles === true;
    const audioLanguage = req.body.audioLanguage || null;
    const audioVoice = req.body.audioVoice || "alloy";

    await db.insert(analysisJobsTable).values({
      id: jobId,
      userId: userId ?? undefined,
      status: "queued",
      progress: 2,
      currentStep: "Preparing analysis",
      mode: validatedMode,
      platform: validatedPlatforms[0] ?? "youtube_long",
      translateSubtitles: translateSubtitles ? 1 : 0,
      subtitleLanguage: req.body.subtitleLanguage || null,
      replaceAudio: 0,
      audioLanguage,
      videoPath: req.file.path,
    });

    // Respond immediately — pipeline runs in background
    res.json({ jobId, message: "Video uploaded. Analysis started." });

    setImmediate(() => {
      runAnalysisPipeline(jobId, req.file!.path, {
        mode: validatedMode,
        platform: validatedPlatforms[0] ?? "youtube_long",
        platforms: validatedPlatforms,
        modules: validatedModules,
        translateSubtitles,
        subtitleLanguage: req.body.subtitleLanguage || undefined,
        audioLanguage: audioLanguage || undefined,
        audioVoice,
        plan: rawPlan,
        maxDurationSeconds,
      }).then(async () => {
        // Only count analyses that produced a successful report
        if (userId) await incrementVideoAnalysis(userId);
      }).catch((err) => {
        req.log.error({ err, jobId }, "Pipeline error");
        // Counter is NOT incremented on failure — no rollback needed
      });
    });
  } catch (err) {
    req.log.error({ err }, "Upload handler error");
    if (req.file?.path) await fs.unlink(req.file.path).catch(() => {});
    res.status(500).json({ error: "Upload failed", details: err instanceof Error ? err.message : String(err) });
  }
});

// ── Job status polling ────────────────────────────────────────────────────────
router.get("/:jobId/status", async (req, res) => {
  try {
    const params = GetAnalysisStatusParams.parse(req.params);
    const job = await db.select().from(analysisJobsTable).where(eq(analysisJobsTable.id, params.jobId)).limit(1);
    if (!job.length) { res.status(404).json({ error: "Job not found" }); return; }
    const j = job[0];
    res.json({ jobId: j.id, status: j.status, progress: j.progress, currentStep: j.currentStep, error: j.error || undefined });
  } catch (err) {
    req.log.error({ err }, "Status error");
    res.status(500).json({ error: "Failed to get status" });
  }
});

// ── Analysis results ──────────────────────────────────────────────────────────
router.get("/:jobId/result", async (req, res) => {
  try {
    const params = GetAnalysisResultParams.parse(req.params);
    const job = await db.select().from(analysisJobsTable).where(eq(analysisJobsTable.id, params.jobId)).limit(1);
    if (!job.length) { res.status(404).json({ error: "Job not found" }); return; }
    const j = job[0];
    if (j.status !== "complete") { res.status(425).json({ error: "Analysis not yet complete", details: j.status }); return; }
    res.json(j.result);
  } catch (err) {
    req.log.error({ err }, "Result error");
    res.status(500).json({ error: "Failed to get result" });
  }
});

// ── Video export (re-encode + optional audio dub) ─────────────────────────────
router.post("/:jobId/export", async (req, res) => {
  try {
    const params = ExportVideoParams.parse(req.params);
    const body = ExportVideoBody.parse(req.body);

    const job = await db.select().from(analysisJobsTable).where(eq(analysisJobsTable.id, params.jobId)).limit(1);
    if (!job.length) { res.status(404).json({ error: "Job not found" }); return; }

    const j = job[0];
    if (j.status !== "complete") { res.status(425).json({ error: "Analysis not yet complete" }); return; }

    const resolutionMap: Record<string, string> = {
      "240p": "426:240", "480p": "854:480", "720p": "1280:720", "1080p": "1920:1080", "4k": "3840:2160",
    };
    const scale = resolutionMap[body.resolution] || "1280:720";

    const exportId = uuidv4();
    const exportDir = path.join(os.tmpdir(), "daytabs-exports");
    await fs.mkdir(exportDir, { recursive: true });
    const outputFilename = `daytabs_export_${body.resolution}_${exportId}.mp4`;
    const outputPath = path.join(exportDir, outputFilename);

    const originalVideoPath = j.videoPath;
    if (!originalVideoPath) { res.status(409).json({ error: "Original video is no longer available. Please re-upload to export." }); return; }

    try { await fs.access(originalVideoPath); } catch {
      res.status(409).json({ error: "Original video file has been cleaned up. Please re-upload to export." }); return;
    }

    const shouldReplaceAudio = j.replaceAudio === 1 && j.audioLanguage;

    if (shouldReplaceAudio) {
      const result = j.result as Record<string, unknown> | null;
      const subtitles = result?.subtitles as { transcript?: Array<{ start: number; end: number; text: string }>; fullText?: string } | undefined;
      const segments = subtitles?.transcript || [];
      const fullScript = (subtitles?.fullText || segments.map((s) => s.text).join(" ")).trim();

      if (fullScript) {
        const targetLanguage = j.audioLanguage!;
        const chosenVoice = (body.audioVoice as "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer") || "alloy";
        const chunkFiles: string[] = [];
        try {
          let translatedScript = fullScript;
          try {
            const transResp = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              messages: [
                { role: "system", content: `You are a professional translator. Translate the following text to ${targetLanguage}. Return only the translated text.` },
                { role: "user", content: fullScript },
              ],
              max_completion_tokens: 4000,
            });
            translatedScript = transResp.choices[0]?.message?.content?.trim() || fullScript;
          } catch (err) { req.log.warn({ err }, "Translation failed, using original text"); }

          const MAX_CHUNK = 4000;
          const chunks: string[] = [];
          if (translatedScript.length <= MAX_CHUNK) {
            chunks.push(translatedScript);
          } else {
            let remaining = translatedScript;
            while (remaining.length > MAX_CHUNK) {
              const slice = remaining.slice(0, MAX_CHUNK);
              const lastBreak = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "), slice.lastIndexOf("\n"));
              const cutAt = lastBreak > MAX_CHUNK / 2 ? lastBreak + 1 : MAX_CHUNK;
              chunks.push(remaining.slice(0, cutAt).trim());
              remaining = remaining.slice(cutAt).trim();
            }
            if (remaining) chunks.push(remaining);
          }

          const chunkBuffers = await Promise.all(chunks.map(async (chunk) => {
            const speech = await openai.audio.speech.create({ model: "tts-1", voice: chosenVoice, input: chunk, response_format: "mp3" } as Parameters<typeof openai.audio.speech.create>[0]);
            return Buffer.from(await speech.arrayBuffer());
          }));

          let ttsPath: string;
          if (chunkBuffers.length === 1) {
            ttsPath = path.join(exportDir, `tts_${exportId}.mp3`);
            await fs.writeFile(ttsPath, chunkBuffers[0]);
            chunkFiles.push(ttsPath);
          } else {
            for (let ci = 0; ci < chunkBuffers.length; ci++) {
              const p = path.join(exportDir, `tts_chunk_${exportId}_${ci}.mp3`);
              await fs.writeFile(p, chunkBuffers[ci]);
              chunkFiles.push(p);
            }
            const concatList = path.join(exportDir, `concat_${exportId}.txt`);
            await fs.writeFile(concatList, chunkFiles.map((f) => `file '${f}'`).join("\n"));
            ttsPath = path.join(exportDir, `tts_${exportId}.mp3`);
            await execAsync(`ffmpeg -f concat -safe 0 -i "${concatList}" -c copy "${ttsPath}" -y`);
            await fs.unlink(concatList).catch(() => {});
            for (const f of chunkFiles) await fs.unlink(f).catch(() => {});
          }

          await execAsync(
            `ffmpeg -i "${originalVideoPath}" -i "${ttsPath}" -filter_complex "[0:v]scale=${scale}[vout]" -map "[vout]" -map 1:a -c:v libx264 -preset ultrafast -crf 23 -threads 0 -c:a aac -b:a 192k -shortest "${outputPath}" -y`
          );
          await fs.unlink(ttsPath).catch(() => {});

          res.json({ downloadUrl: `/api/analysis/download/${outputFilename}`, filename: outputFilename });
          return;
        } catch (err) {
          req.log.warn({ err }, "Audio replacement failed, falling back to standard export");
          for (const f of chunkFiles) await fs.unlink(f).catch(() => {});
        }
      }
    }

    await execAsync(`ffmpeg -i "${originalVideoPath}" -vf "scale=${scale}" -c:v libx264 -preset ultrafast -crf 23 -c:a aac -threads 0 "${outputPath}" -y`);
    res.json({ downloadUrl: `/api/analysis/download/${outputFilename}`, filename: outputFilename });
  } catch (err) {
    req.log.error({ err }, "Export error");
    res.status(500).json({ error: "Export failed", details: err instanceof Error ? err.message : String(err) });
  }
});

// ── Exported video download ───────────────────────────────────────────────────
router.get("/download/:filename", async (req, res) => {
  try {
    const { filename } = req.params;
    if (!filename || filename.includes("..") || filename.includes("/")) { res.status(400).json({ error: "Invalid filename" }); return; }
    const exportDir = path.join(os.tmpdir(), "daytabs-exports");
    const filePath = path.join(exportDir, filename);
    try { await fs.access(filePath); } catch { res.status(404).json({ error: "File not found or has expired" }); return; }
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "video/mp4");
    const { createReadStream } = await import("fs");
    const stream = createReadStream(filePath);
    stream.pipe(res as unknown as NodeJS.WritableStream);
    stream.on("end", () => { fs.unlink(filePath).catch(() => {}); });
  } catch (err) {
    req.log.error({ err }, "Download error");
    res.status(500).json({ error: "Download failed" });
  }
});

export default router;
