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

        const segmentFiles: string[] = [];

        try {
          if (segments.length > 0) {
            // ── Per-segment timestamp-aware dubbing ─────────────────────────

            // ── Helper: duration-adaptive translation for a single segment ──
            const adaptForDuration = async (
              originalText: string,
              targetDurS: number,
              hint?: "shorter" | "longer"
            ): Promise<string> => {
              const hintLine = hint === "shorter"
                ? "The previous attempt was too long. Use shorter, simpler phrasing — fewer words."
                : hint === "longer"
                ? "The previous attempt was too short. Expand slightly with natural phrasing."
                : "";
              const resp = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                  {
                    role: "system",
                    content: `You are a professional dubbing adapter. Translate the given text to ${targetLanguage}, then adapt it so it can be spoken naturally in approximately ${targetDurS.toFixed(1)} seconds at a comfortable pace.
Rules:
- Preserve meaning, not exact wording
- SHORT slot (≤2s): use brief, punchy phrasing
- LONG slot (≥5s): allow fuller, more descriptive phrasing
- Keep it conversational, as a human would naturally say it
${hintLine}
Return ONLY the adapted translation, nothing else.`,
                  },
                  { role: "user", content: originalText },
                ],
                max_completion_tokens: 200,
              });
              return resp.choices[0]?.message?.content?.trim() || originalText;
            };

            // ── Helper: generate TTS and measure duration ───────────────────
            const generateSegmentTts = async (
              text: string,
              outPath: string
            ): Promise<number> => {
              const buf = await textToSpeechFast(text, chosenVoice);
              await fs.writeFile(outPath, buf);
              const { stdout } = await execAsync(
                `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${outPath}"`
              );
              return parseFloat(stdout.trim()) || 0;
            };

            // ── Helper: add 150ms natural trailing silence ──────────────────
            const addTrailingSilence = async (filePath: string, exportId: string, i: number): Promise<string> => {
              const silentPath = path.join(exportDir, `seg_sil_${exportId}_${i}.mp3`);
              await execAsync(
                `ffmpeg -i "${filePath}" -af "apad=pad_dur=0.15" "${silentPath}" -y`
              );
              await fs.unlink(filePath).catch(() => {});
              return silentPath;
            };

            req.log.info({ jobId: params.jobId, segmentCount: segments.length }, "Generating per-segment TTS (parallel)");

            interface SegmentAudio { filePath: string; startMs: number; targetDurS: number; actualDurS: number; }
            const segmentAudios: (SegmentAudio | null)[] = new Array(segments.length).fill(null);

            // 1. Duration-adaptive translation (batch, with per-segment duration hints)
            let adaptedTexts: string[] = segments.map((s) => s.text);
            try {
              const batchPrompt = segments
                .map((s, i) => `[${i}] (${(s.end - s.start).toFixed(1)}s) ${s.text}`)
                .join("\n");
              const transResp = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                  {
                    role: "system",
                    content: `You are a professional dubbing adapter. For each numbered segment, translate to ${targetLanguage} and adapt the phrasing so it fits naturally within the duration shown in parentheses.
Rules:
- Preserve meaning, not exact words
- SHORT slot (≤2s): use brief, punchy phrasing
- LONG slot (≥5s): allow fuller, more descriptive phrasing
- Keep it conversational and human-sounding
- Return ONLY the adapted translations in [N] format, one per line, no extra text`,
                  },
                  { role: "user", content: batchPrompt },
                ],
                max_completion_tokens: 4000,
              });
              const parsed: Record<number, string> = {};
              for (const line of (transResp.choices[0]?.message?.content || "").split("\n")) {
                const m = line.match(/^\[(\d+)\]\s*(.+)/);
                if (m) parsed[parseInt(m[1])] = m[2].trim();
              }
              adaptedTexts = segments.map((s, i) => parsed[i] || s.text);
            } catch (err) {
              req.log.warn({ err }, "Batch translation failed, using original text");
            }

            // 2. Generate TTS per segment (parallel batches of 5) + validate + 1 retry
            const BATCH = 5;
            const TOLERANCE = 0.10; // ±10% is acceptable
            for (let b = 0; b < segments.length; b += BATCH) {
              const batch = segments.slice(b, b + BATCH);
              await Promise.all(batch.map(async (seg, batchIdx) => {
                const i = b + batchIdx;
                let text = adaptedTexts[i]?.trim() || seg.text.trim();
                if (!text) return;

                const startMs = Math.round(seg.start * 1000);
                const targetDurS = Math.max(seg.end - seg.start, 0.3);
                const segPath = path.join(exportDir, `seg_${exportId}_${i}.mp3`);
                segmentFiles.push(segPath);

                let actualDurS = await generateSegmentTts(text, segPath);

                // Validate: if off by more than 10%, re-adapt text once and regenerate
                if (actualDurS > 0) {
                  const ratio = actualDurS / targetDurS;
                  if (ratio > 1 + TOLERANCE || ratio < 1 - TOLERANCE) {
                    const hint = ratio > 1 ? "shorter" : "longer";
                    req.log.info({ i, targetDurS, actualDurS, hint }, "Segment duration off — re-adapting");
                    try {
                      text = await adaptForDuration(seg.text, targetDurS, hint);
                      actualDurS = await generateSegmentTts(text, segPath);
                    } catch (retryErr) {
                      req.log.warn({ retryErr, i }, "Retry adaptation failed, keeping original");
                    }
                  }
                }

                // Add 150ms natural trailing silence (prevents abrupt cutoff)
                const finalPath = await addTrailingSilence(segPath, exportId, i);
                // Update segmentFiles to the new path so cleanup works
                const origIdx = segmentFiles.indexOf(segPath);
                if (origIdx !== -1) segmentFiles[origIdx] = finalPath;

                segmentAudios[i] = { filePath: finalPath, startMs, targetDurS, actualDurS };
                req.log.info({ i, startMs, targetDurS, actualDurS: actualDurS.toFixed(2) }, "Segment ready");
              }));
            }

            const validSegments = segmentAudios.filter((s): s is SegmentAudio => s !== null);

            // 3. Build timeline: place each segment at its EXACT original start time
            //    No atempo, no speed modification — pure timeline placement
            const inputArgs = validSegments.map((s) => `-i "${s.filePath}"`).join(" ");
            const filterParts = validSegments.map((s, i) =>
              `[${i}:a]adelay=${s.startMs}|${s.startMs}[a${i}]`
            );
            const mixIn = validSegments.map((_, i) => `[a${i}]`).join("");
            const filterComplex = `${filterParts.join(";")};${mixIn}amix=inputs=${validSegments.length}:duration=longest:normalize=0[out]`;

            const dubbedPath = path.join(exportDir, `dubbed_${exportId}.mp3`);
            await execAsync(`ffmpeg ${inputArgs} -filter_complex "${filterComplex}" -map "[out]" "${dubbedPath}" -y`);

            // Cleanup all segment files (original + any adjusted/padded versions)
            for (const s of validSegments) await fs.unlink(s.filePath).catch(() => {});

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
