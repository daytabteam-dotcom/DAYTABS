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
import { eq, and, gte, count } from "drizzle-orm";
import { runAnalysisPipeline, type PipelineMode } from "./pipeline";
import { updateJob } from "./services";
import { openai } from "@workspace/integrations-openai-ai-server";
import { textToSpeech } from "@workspace/integrations-openai-ai-server/audio";
import {
  GetAnalysisStatusParams,
  GetAnalysisResultParams,
  ExportVideoParams,
  ExportVideoBody,
} from "@workspace/api-zod";
import { isR2Configured, generatePresignedPutUrl, downloadFromR2, deleteFromR2 } from "../../lib/r2";
import { optionalAuth } from "../../middlewares/auth";

const execAsync = promisify(exec);

const router: IRouter = Router();

// Apply optional auth to all analysis routes so we can read plan + userId
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

// ── Plan limits ───────────────────────────────────────────────────────────────
const PLAN_UPLOAD_LIMITS: Record<string, Record<string, number>> = {
  free:         { "pre-edit": 3, editing: 5, publish: 3 },
  premium:      { "pre-edit": 30, editing: 50, publish: 30 },
  professional: { "pre-edit": Infinity, editing: Infinity, publish: Infinity },
};

const PLAN_SIZE_LIMITS: Record<string, number> = {
  free:         500 * 1024 * 1024,   // 500 MB
  premium:      2 * 1024 * 1024 * 1024,  // 2 GB
  professional: 2 * 1024 * 1024 * 1024,  // 2 GB
};

async function checkUploadLimit(userId: number, plan: string, mode: string): Promise<{ allowed: boolean; used: number; limit: number }> {
  const limits = PLAN_UPLOAD_LIMITS[plan] ?? PLAN_UPLOAD_LIMITS.free;
  const limit = limits[mode] ?? 3;

  if (limit === Infinity) return { allowed: true, used: 0, limit: -1 };

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [row] = await db
    .select({ cnt: count() })
    .from(analysisJobsTable)
    .where(
      and(
        eq(analysisJobsTable.userId, userId),
        eq(analysisJobsTable.mode, mode),
        gte(analysisJobsTable.createdAt, startOfMonth)
      )
    );

  const used = Number(row?.cnt ?? 0);
  return { allowed: used < limit, used, limit };
}

router.get("/voice-preview/:voice", async (req, res) => {
  const { voice } = req.params;
  const validVoices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
  if (!validVoices.includes(voice)) { res.status(400).json({ error: "Invalid voice" }); return; }
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

// ── R2 Direct Upload — Step 1: Get a presigned PUT URL ───────────────────────
router.get("/presign-upload", async (req, res) => {
  if (!isR2Configured()) {
    res.status(503).json({ error: "R2 storage not configured — use the direct /upload endpoint instead" });
    return;
  }

  const ext = ((req.query.ext as string) || "mp4").replace(/^\./, "").toLowerCase();
  const validExts = ["mp4", "mov", "avi", "webm", "mpeg", "mkv"];
  if (!validExts.includes(ext)) { res.status(400).json({ error: "Invalid file extension" }); return; }

  // Check upload limit if user is authenticated
  const plan = req.auth?.plan ?? "free";
  const mode = ((req.query.mode as string) || "pre-edit");
  if (req.auth) {
    const { allowed, used, limit } = await checkUploadLimit(req.auth.user_id, plan, mode);
    if (!allowed) {
      res.status(429).json({ error: `Upload limit reached for this month (${used}/${limit}). Upgrade your plan to upload more.` });
      return;
    }
  }

  const contentTypeMap: Record<string, string> = {
    mp4: "video/mp4", mov: "video/quicktime", avi: "video/x-msvideo",
    webm: "video/webm", mpeg: "video/mpeg", mkv: "video/x-matroska",
  };

  const fileKey = `videos/${uuidv4()}.${ext}`;
  try {
    const uploadUrl = await generatePresignedPutUrl(fileKey, contentTypeMap[ext] ?? "video/mp4");
    res.json({ uploadUrl, fileKey });
  } catch (err) {
    req.log.error({ err }, "Failed to generate R2 presigned URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

// ── R2 Direct Upload — Step 2: Start analysis from an already-uploaded R2 key
router.post("/start", async (req, res) => {
  if (!isR2Configured()) { res.status(503).json({ error: "R2 storage not configured" }); return; }

  const { fileKey, mode, platform, translateSubtitles, subtitleLanguage, audioLanguage, audioVoice } = req.body as {
    fileKey: string; mode?: string; platform?: string; translateSubtitles?: boolean;
    subtitleLanguage?: string; audioLanguage?: string; audioVoice?: string;
  };

  if (!fileKey || typeof fileKey !== "string") { res.status(400).json({ error: "fileKey is required" }); return; }

  const validModes: PipelineMode[] = ["pre-edit", "editing", "publish"];
  const validatedMode: PipelineMode = validModes.includes(mode as PipelineMode) ? (mode as PipelineMode) : "pre-edit";

  // Dubbing is disabled for all users
  if (mode === "dubbing") {
    res.status(403).json({ error: "Dubbing is coming soon and not yet available." });
    return;
  }

  const validPlatforms = ["youtube_long", "youtube_shorts", "tiktok", "instagram", "linkedin", "x"];
  const validatedPlatform = validPlatforms.includes(platform ?? "") ? platform! : "youtube_long";

  // Plan-based checks
  const plan = req.auth?.plan ?? "free";
  const userId = req.auth?.user_id ?? null;

  if (userId) {
    const { allowed, used, limit } = await checkUploadLimit(userId, plan, validatedMode);
    if (!allowed) {
      res.status(429).json({ error: `Upload limit reached for this month (${used}/${limit}). Upgrade your plan to upload more.` });
      return;
    }
  }

  // Free users cannot use YouTube Long for publish
  if (validatedMode === "publish" && validatedPlatform === "youtube_long" && plan === "free") {
    res.status(403).json({ error: "YouTube Long format requires a Premium or Professional plan." });
    return;
  }

  const jobId = uuidv4();
  const ext = path.extname(fileKey).replace(".", "") || "mp4";
  const localPath = path.join(uploadDir, `${jobId}.${ext}`);

  await db.insert(analysisJobsTable).values({
    id: jobId,
    userId: userId ?? undefined,
    status: "queued",
    progress: 2,
    currentStep: "Downloading video",
    mode: validatedMode,
    platform: validatedPlatform,
    translateSubtitles: translateSubtitles ? 1 : 0,
    subtitleLanguage: subtitleLanguage || null,
    replaceAudio: 0,
    audioLanguage: audioLanguage || null,
    videoPath: localPath,
  });

  res.json({ jobId, message: "Analysis started." });

  setImmediate(async () => {
    try {
      await updateJob(jobId, { status: "queued", progress: 5, currentStep: "Downloading video from cloud storage" });
      await fs.mkdir(uploadDir, { recursive: true });
      await downloadFromR2(fileKey, localPath);
      deleteFromR2(fileKey).catch(() => {});
    } catch (err) {
      req.log.error({ err, jobId }, "Failed to download from R2");
      await updateJob(jobId, { status: "error", error: "Failed to download video from cloud storage. Please try uploading again." });
      return;
    }

    runAnalysisPipeline(jobId, localPath, {
      mode: validatedMode,
      platform: validatedPlatform,
      translateSubtitles: Boolean(translateSubtitles),
      subtitleLanguage: subtitleLanguage || undefined,
      audioLanguage: audioLanguage || undefined,
      audioVoice: (audioVoice as "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer") || "alloy",
      plan,
    }).catch((err) => {
      req.log.error({ err, jobId }, "Pipeline error (R2 start)");
    });
  });
});

router.post("/upload", upload.single("video"), async (req, res) => {
  try {
    if (!req.file) { res.status(400).json({ error: "No video file uploaded" }); return; }

    const mode = (req.body.mode as PipelineMode) || "pre-edit";
    const validModes: PipelineMode[] = ["pre-edit", "editing", "publish"];
    if (!validModes.includes(mode)) { res.status(400).json({ error: "Invalid mode" }); return; }

    // Dubbing disabled for all users
    if (req.body.mode === "dubbing") {
      await fs.unlink(req.file.path).catch(() => {});
      res.status(403).json({ error: "Dubbing is coming soon and not yet available." });
      return;
    }

    const platform = (req.body.platform as string) || "youtube_long";
    const validPlatforms = ["youtube_long", "youtube_shorts", "tiktok", "instagram", "linkedin", "x"];
    if (!validPlatforms.includes(platform)) { res.status(400).json({ error: "Invalid platform" }); return; }

    const plan = req.auth?.plan ?? "free";
    const userId = req.auth?.user_id ?? null;

    // Check plan file size limit
    const sizeLimit = PLAN_SIZE_LIMITS[plan] ?? PLAN_SIZE_LIMITS.free;
    if (req.file.size > sizeLimit) {
      await fs.unlink(req.file.path).catch(() => {});
      const limitMB = Math.round(sizeLimit / 1024 / 1024);
      res.status(413).json({ error: `File exceeds the ${limitMB} MB limit for your plan. Upgrade to upload larger videos.` });
      return;
    }

    // Check upload count limit
    if (userId) {
      const { allowed, used, limit } = await checkUploadLimit(userId, plan, mode);
      if (!allowed) {
        await fs.unlink(req.file.path).catch(() => {});
        res.status(429).json({ error: `Upload limit reached for this month (${used}/${limit}). Upgrade your plan to upload more.` });
        return;
      }
    }

    // Free users cannot use YouTube Long for publish
    if (mode === "publish" && platform === "youtube_long" && plan === "free") {
      await fs.unlink(req.file.path).catch(() => {});
      res.status(403).json({ error: "YouTube Long format requires a Premium or Professional plan." });
      return;
    }

    const jobId = uuidv4();
    const translateSubtitles = req.body.translateSubtitles === "true" || req.body.translateSubtitles === true;
    const audioLanguage = req.body.audioLanguage || null;
    const audioVoice = req.body.audioVoice || "alloy";

    await db.insert(analysisJobsTable).values({
      id: jobId,
      userId: userId ?? undefined,
      status: "queued",
      progress: 2,
      currentStep: "Uploading",
      mode,
      platform,
      translateSubtitles: translateSubtitles ? 1 : 0,
      subtitleLanguage: req.body.subtitleLanguage || null,
      replaceAudio: 0,
      audioLanguage,
      videoPath: req.file.path,
    });

    setImmediate(() => {
      runAnalysisPipeline(jobId, req.file!.path, {
        mode,
        platform,
        translateSubtitles,
        subtitleLanguage: req.body.subtitleLanguage || undefined,
        audioLanguage: audioLanguage || undefined,
        audioVoice,
        plan,
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
    if (!job.length) { res.status(404).json({ error: "Job not found" }); return; }
    const j = job[0];
    res.json({ jobId: j.id, status: j.status, progress: j.progress, currentStep: j.currentStep, error: j.error || undefined });
  } catch (err) {
    req.log.error({ err }, "Status error");
    res.status(500).json({ error: "Failed to get status" });
  }
});

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
