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
import { textToSpeech, textToSpeechFast } from "@workspace/integrations-openai-ai-server/audio";
import {
  GetAnalysisStatusParams,
  GetAnalysisResultParams,
  ExportVideoParams,
  ExportVideoBody,
} from "@workspace/api-zod";

const execAsync = promisify(exec);

const router: IRouter = Router();

const voiceSampleCache = new Map<string, Buffer>();

const VOICE_SAMPLE_TEXT: Record<string, string> = {
  alloy:   "Hi there! I'm Alloy — balanced, neutral, and versatile. I'm great for narration, explainers, and professional content.",
  echo:    "Hello, I'm Echo. I have a soft, measured delivery that works beautifully for intimate storytelling and documentary-style content.",
  fable:   "Hey! I'm Fable. I bring warmth and expressiveness to every word — perfect for bringing characters and stories to life.",
  onyx:    "I'm Onyx. Deep, rich, and authoritative. I command attention and lend credibility to serious, impactful content.",
  nova:    "Hi! I'm Nova! Bright, energetic, and full of enthusiasm. I'll make your content pop and keep audiences engaged!",
  shimmer: "Hello! I'm Shimmer — clear, friendly, and approachable. I'm ideal for tutorials, how-tos, and educational content.",
};

router.get("/voice-preview/:voice", async (req, res) => {
  const { voice } = req.params;
  const validVoices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
  if (!validVoices.includes(voice)) {
    res.status(400).json({ error: "Invalid voice" });
    return;
  }
  try {
    if (!voiceSampleCache.has(voice)) {
      const sampleText = VOICE_SAMPLE_TEXT[voice];
      const buffer = await textToSpeech(sampleText, voice as "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer", "mp3");
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
      const subtitles = result?.subtitles as {
        transcript?: Array<{ start: number; end: number; text: string }>;
        fullText?: string;
      } | undefined;
      const segments = subtitles?.transcript || [];

      if (!segments.length && !subtitles?.fullText) {
        req.log.warn({ jobId: params.jobId }, "No transcript available for audio replacement — skipping");
      } else {
        const targetLanguage = j.audioLanguage!;
        const chosenVoice = (body.audioVoice as "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer") || "alloy";

        const sp = (result?.speakerProfile ?? null) as {
          personality?: string; tone?: string; speed?: string; speechRateWpm?: number;
          vocabularyStyle?: string; catchphrases?: string[]; emotionalRange?: string;
        } | null;

        const styleSystemPrompt = [
          "You are a professional voice actor performing text-to-speech. Read the given text verbatim — do not add or omit words.",
          sp?.personality ? `Speak with a ${sp.personality} personality.` : "",
          sp?.tone ? `Use a ${sp.tone} tone throughout.` : "",
          sp?.vocabularyStyle ? `Mirror this register in your delivery: ${sp.vocabularyStyle}.` : "",
          sp?.emotionalRange && sp.emotionalRange !== "balanced"
            ? `Vary your emotional delivery to match: ${sp.emotionalRange}.` : "",
        ].filter(Boolean).join(" ");

        const segmentFiles: string[] = [];

        try {
          if (segments.length > 0) {
            // ── Per-segment timestamp-aware dubbing ─────────────────────────

            // 1. Batch-translate all segments in one API call
            let translatedTexts: string[] = segments.map((s) => s.text);
            try {
              const batchPrompt = segments.map((s, i) => `[${i}] ${s.text}`).join("\n");
              const transResp = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                  {
                    role: "system",
                    content: `You are a professional translator. Translate each numbered segment to ${targetLanguage}. Return ONLY the translations in the exact same [N] format, one per line, with no extra text.`,
                  },
                  { role: "user", content: batchPrompt },
                ],
                max_completion_tokens: 4000,
              });
              const transText = transResp.choices[0]?.message?.content || "";
              const parsed: Record<number, string> = {};
              for (const line of transText.split("\n")) {
                const m = line.match(/^\[(\d+)\]\s*(.+)/);
                if (m) parsed[parseInt(m[1])] = m[2].trim();
              }
              translatedTexts = segments.map((s, i) => parsed[i] || s.text);
            } catch (err) {
              req.log.warn({ err }, "Batch translation failed, using original text");
            }

            req.log.info({ jobId: params.jobId, segmentCount: segments.length }, "Generating per-segment TTS (parallel)");

            interface SegmentAudio { filePath: string; startMs: number; targetDurS: number; actualDurS: number; }
            const segmentAudios: (SegmentAudio | null)[] = new Array(segments.length).fill(null);

            // 2. Generate TTS in parallel batches of 5
            const BATCH = 5;
            for (let b = 0; b < segments.length; b += BATCH) {
              const batch = segments.slice(b, b + BATCH);
              await Promise.all(batch.map(async (seg, batchIdx) => {
                const i = b + batchIdx;
                const text = translatedTexts[i]?.trim() || seg.text.trim();
                if (!text) return;

                const startMs = Math.round(seg.start * 1000);
                const targetDurS = Math.max(seg.end - seg.start, 0.1);

                const ttsBuffer = await textToSpeechFast(text, chosenVoice);

                const segPath = path.join(exportDir, `seg_${exportId}_${i}.mp3`);
                await fs.writeFile(segPath, ttsBuffer);
                segmentFiles.push(segPath);

                const { stdout: probOut } = await execAsync(
                  `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${segPath}"`
                );
                const actualDurS = parseFloat(probOut.trim()) || targetDurS;

                segmentAudios[i] = { filePath: segPath, startMs, targetDurS, actualDurS };
              }));
            }

            const validSegments = segmentAudios.filter((s): s is SegmentAudio => s !== null);

            // 3. Build ffmpeg filter_complex: atempo + adelay + amix
            const buildAtempoChain = (ratio: number): string => {
              const capped = Math.min(Math.max(ratio, 0.5), 4.0);
              if (capped <= 2.0 && capped >= 0.5) return `atempo=${capped.toFixed(4)},`;
              // chain two filters for ratios > 2.0 or < 0.5
              const half = Math.sqrt(capped);
              return `atempo=${half.toFixed(4)},atempo=${half.toFixed(4)},`;
            };

            const inputArgs = validSegments.map((s) => `-i "${s.filePath}"`).join(" ");
            const filterParts = validSegments.map((s, i) => {
              const ratio = s.actualDurS / s.targetDurS;
              const atempoChain = ratio > 1.05 ? buildAtempoChain(ratio) : "";
              return `[${i}:a]${atempoChain}adelay=${s.startMs}|${s.startMs}[a${i}]`;
            });
            const mixIn = validSegments.map((_, i) => `[a${i}]`).join("");
            const filterComplex = `${filterParts.join(";")};${mixIn}amix=inputs=${validSegments.length}:duration=longest:normalize=0[out]`;

            const dubbedPath = path.join(exportDir, `dubbed_${exportId}.mp3`);
            await execAsync(`ffmpeg ${inputArgs} -filter_complex "${filterComplex}" -map "[out]" "${dubbedPath}" -y`);

            // Cleanup segment files
            for (const f of segmentFiles) await fs.unlink(f).catch(() => {});

            // 4. Scale video (ultrafast) then merge dubbed audio
            const scaledPath = path.join(exportDir, `scaled_${exportId}.mp4`);
            await execAsync(`ffmpeg -i "${originalVideoPath}" -vf "scale=${scale}" -c:v libx264 -preset ultrafast -crf 23 -threads 0 -an "${scaledPath}" -y`);
            await execAsync(`ffmpeg -i "${scaledPath}" -i "${dubbedPath}" -map 0:v -map 1:a -c:v copy -c:a aac -threads 0 -shortest "${outputPath}" -y`);
            await fs.unlink(scaledPath).catch(() => {});
            await fs.unlink(dubbedPath).catch(() => {});

            res.json({ downloadUrl: `/api/analysis/download/${outputFilename}`, filename: outputFilename });
            return;

          } else {
            // ── Fallback: no segments, dub as single block ──────────────────
            const originalText = subtitles?.fullText || "";
            let textForTts = originalText;
            try {
              const transResp = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                  { role: "system", content: `Translate to ${targetLanguage}. Output only the translated text.` },
                  { role: "user", content: originalText.slice(0, 4000) },
                ],
                max_completion_tokens: 2000,
              });
              textForTts = transResp.choices[0]?.message?.content || originalText;
            } catch {}

            const ttsBuffer = await textToSpeech(textForTts, chosenVoice, "mp3");
            const ttsPath = path.join(exportDir, `tts_${exportId}.mp3`);
            await fs.writeFile(ttsPath, ttsBuffer);

            const scaledPath = path.join(exportDir, `scaled_${exportId}.mp4`);
            await execAsync(`ffmpeg -i "${originalVideoPath}" -vf "scale=${scale}" -c:v libx264 -an "${scaledPath}" -y`);
            await execAsync(`ffmpeg -i "${scaledPath}" -i "${ttsPath}" -map 0:v -map 1:a -c:v copy -c:a aac -shortest "${outputPath}" -y`);
            await fs.unlink(scaledPath).catch(() => {});
            await fs.unlink(ttsPath).catch(() => {});

            res.json({ downloadUrl: `/api/analysis/download/${outputFilename}`, filename: outputFilename });
            return;
          }
        } catch (err) {
          req.log.warn({ err }, "Audio replacement failed, falling back to standard export");
          for (const f of segmentFiles) await fs.unlink(f).catch(() => {});
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
