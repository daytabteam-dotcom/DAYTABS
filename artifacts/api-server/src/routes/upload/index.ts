import { Router, type IRouter } from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs/promises";
import { db } from "@workspace/db";
import { analysisJobsTable } from "@workspace/db";
import { runAnalysisPipeline, type PipelineMode } from "../analysis/pipeline";
import { updateJob } from "../analysis/services";
import { optionalAuth } from "../../middlewares/auth";
import {
  normalizePlan,
  getLimits,
  buildFileTooLargeError,
} from "../../lib/planLimits";
import {
  checkVideoAnalysisLimit,
  incrementVideoAnalysis,
} from "../../lib/usageService";
import { logger } from "../../lib/logger";
import { analysisQueue } from "../../lib/analysisQueue";
import {
  buildR2ObjectKey,
  createR2UploadUrl,
  deleteFromB2,
  getR2ObjectMetadata,
} from "../../lib/b2";

const router: IRouter = Router();
router.use(optionalAuth);

const UPLOAD_BASE = "/tmp/uploads";

fs.mkdir(UPLOAD_BASE, { recursive: true }).catch(() => {});

interface UploadSession {
  uploadId: string;
  userId: number | null;
  rawPlan: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  totalChunks: number;
  chunksReceived: Set<number>;
  createdAt: number;
  mode: string;
  platforms: string[];
  modules: string[];
  translateSubtitles: boolean;
  subtitleLanguage: string | null;
  audioLanguage: string | null;
  audioVoice: string;
  r2Key: string;
}

const sessions = new Map<string, UploadSession>();

const CLEANUP_INTERVAL_MS = 30 * 60 * 1000;
const SESSION_MAX_AGE_MS = 2 * 60 * 60 * 1000;

setInterval(async () => {
  const now = Date.now();
  let cleaned = 0;
  for (const [id, session] of sessions) {
    if (now - session.createdAt > SESSION_MAX_AGE_MS) {
      sessions.delete(id);
      await deleteFromB2(session.r2Key).catch((err) => {
        logger.warn({ err, r2Key: session.r2Key }, "Failed to delete abandoned R2 upload");
      });
      const dir = path.join(UPLOAD_BASE, id);
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
      cleaned++;
    }
  }
  if (cleaned > 0) {
    logger.info(`Cleaned up ${cleaned} abandoned upload sessions`);
  }
}, CLEANUP_INTERVAL_MS);

// ── POST /api/upload/init ──────────────────────────────────────────────────────
router.post("/init", async (req, res) => {
  try {
    const {
      filename,
      fileSize,
      mimeType,
      totalChunks,
      mode,
      platforms,
      modules,
      translateSubtitles,
      subtitleLanguage,
      audioLanguage,
      audioVoice,
    } = req.body;

    const rawPlan = (req as any).auth?.plan ?? "free";
    const normalizedPlan = normalizePlan(rawPlan);
    const userId: number | null = (req as any).auth?.user_id != null ? Number((req as any).auth.user_id) : null;
    const planLimits = getLimits(rawPlan);

    const allowedTypes = [
      "video/mp4",
      "video/quicktime",
      "video/x-msvideo",
      "video/webm",
      "video/x-matroska",
      "video/mpeg",
      "video/mov",
    ];
    const allowedExts = /\.(mp4|mov|avi|webm|mkv|mpeg)$/i;
    if (
      !allowedTypes.includes(mimeType) &&
      !allowedExts.test(filename ?? "")
    ) {
      res.status(400).json({
        code: "INVALID_FILE_TYPE",
        title: "Invalid file type",
        message: "Please upload a video file (MP4, MOV, AVI, WebM, MKV)",
        action: null,
      });
      return;
    }

    const size = Number(fileSize);
    if (size > planLimits.max_video_size_bytes) {
      res.status(413).json(buildFileTooLargeError(normalizedPlan, size));
      return;
    }

    if (userId) {
      const limitCheck = await checkVideoAnalysisLimit(userId, rawPlan);
      if (!limitCheck.allowed) {
        res.status(429).json(limitCheck.error);
        return;
      }
    }

    const uploadId = uuidv4();
    const r2Key = buildR2ObjectKey(uploadId, filename ?? "upload.mp4", userId);
    const uploadTarget = await createR2UploadUrl(r2Key, mimeType || "video/mp4");

    const validPlatforms = [
      "youtube_long",
      "youtube_shorts",
      "tiktok",
      "instagram",
      "linkedin",
      "x",
    ];
    let validatedPlatforms: string[] = [];
    try {
      const parsed =
        typeof platforms === "string"
          ? JSON.parse(platforms)
          : Array.isArray(platforms)
          ? platforms
          : [];
      validatedPlatforms = parsed.filter((p: string) =>
        validPlatforms.includes(p)
      );
    } catch {}
    if (validatedPlatforms.length === 0) validatedPlatforms = ["youtube_long"];

    const validModuleList = ["quality", "editing", "publish", "shortClips"];
    let validatedModules: string[] = ["quality", "editing"];
    try {
      const parsed =
        typeof modules === "string"
          ? JSON.parse(modules)
          : Array.isArray(modules)
          ? modules
          : [];
      const filtered = parsed.filter((m: string) =>
        validModuleList.includes(m)
      );
      if (filtered.length > 0) validatedModules = filtered;
    } catch {}

    sessions.set(uploadId, {
      uploadId,
      userId,
      rawPlan,
      filename: filename ?? "upload.mp4",
      fileSize: size,
      mimeType,
      totalChunks: Number(totalChunks),
      chunksReceived: new Set(),
      createdAt: Date.now(),
      mode: mode ?? "video-analyzer",
      platforms: validatedPlatforms,
      modules: validatedModules,
      translateSubtitles:
        translateSubtitles === true || translateSubtitles === "true",
      subtitleLanguage: subtitleLanguage ?? null,
      audioLanguage: audioLanguage ?? null,
      audioVoice: audioVoice ?? "alloy",
      r2Key,
    });

    res.json({ uploadId, ...uploadTarget });
  } catch (err) {
    logger.error({ err }, "Upload init error");
    res.status(500).json({ error: "Failed to initialize upload" });
  }
});

// ── POST /api/upload/chunk ─────────────────────────────────────────────────────
const chunkStorage = multer.diskStorage({
  destination: async (req, _file, cb) => {
    const { uploadId } = req.body;
    if (!uploadId) {
      cb(new Error("Missing uploadId"), "");
      return;
    }
    const dir = path.join(UPLOAD_BASE, uploadId);
    await fs.mkdir(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, _file, cb) => {
    const idx = Number(req.body.chunkIndex ?? 0);
    cb(null, `chunk_${idx}`);
  },
});

const chunkUpload = multer({
  storage: chunkStorage,
  limits: { fileSize: 6 * 1024 * 1024 },
});

router.post(
  "/chunk",
  (req, res, next) => {
    req.setTimeout(60_000);
    chunkUpload.single("chunk")(req, res, (err: any) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res
            .status(413)
            .json({ error: "Chunk too large. Maximum chunk size is 6 MB." });
        } else {
          res
            .status(400)
            .json({ error: err.message ?? "Chunk upload error" });
        }
        return;
      }
      next();
    });
  },
  async (req, res) => {
    try {
      const { uploadId, chunkIndex } = req.body;
      if (!uploadId || chunkIndex === undefined) {
        res.status(400).json({ error: "Missing uploadId or chunkIndex" });
        return;
      }

      const session = sessions.get(uploadId);
      if (!session) {
        res.status(404).json({
          error: "Upload session not found or expired. Please restart the upload.",
        });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: "No chunk data received" });
        return;
      }

      const idx = Number(chunkIndex);
      session.chunksReceived.add(idx);

      res.json({ received: idx, total: session.totalChunks });
    } catch (err) {
      logger.error({ err }, "Chunk upload error");
      res.status(500).json({ error: "Failed to store chunk" });
    }
  }
);

// ── POST /api/upload/complete ──────────────────────────────────────────────────
router.post("/complete", async (req, res) => {
  req.setTimeout(120_000);
  try {
    const { uploadId } = req.body;
    if (!uploadId) {
      res.status(400).json({ error: "Missing uploadId" });
      return;
    }

    const session = sessions.get(uploadId);
    if (!session) {
      res
        .status(404)
        .json({ error: "Upload session not found or expired" });
      return;
    }

    const dir = path.join(UPLOAD_BASE, uploadId);

    const rawPlan = session.rawPlan;
    const planLimits = getLimits(rawPlan);
    const maxDurationSeconds = planLimits.max_video_duration_seconds;
    const b2Key = session.r2Key;
    let metadata: Awaited<ReturnType<typeof getR2ObjectMetadata>>;
    try {
      metadata = await getR2ObjectMetadata(b2Key);
    } catch (err) {
      logger.error({ err, uploadId, b2Key }, "Uploaded R2 object was not found");
      res.status(400).json({ error: "Upload did not complete. Please try again." });
      return;
    }

    if (metadata.contentLength !== session.fileSize) {
      await deleteFromB2(b2Key).catch(() => {});
      sessions.delete(uploadId);
      res.status(400).json({ error: "Uploaded file size does not match. Please try again." });
      return;
    }

    const jobId = uuidv4();
    const userId = session.userId;
    const validatedMode: PipelineMode = "video-analyzer";

    await db.insert(analysisJobsTable).values({
      id: jobId,
      userId: userId ?? undefined,
      status: "queued",
      progress: 2,
      currentStep: "Waiting for analysis slot",
      mode: validatedMode,
      platform: session.platforms[0] ?? "youtube_long",
      translateSubtitles: session.translateSubtitles ? 1 : 0,
      subtitleLanguage: session.subtitleLanguage ?? null,
      replaceAudio: 0,
      audioLanguage: session.audioLanguage ?? null,
      videoPath: null,
      b2Key: b2Key,
      result: {
        analysisOptions: {
          mode: validatedMode,
          platform: session.platforms[0] ?? "youtube_long",
          platforms: session.platforms,
          modules: session.modules,
          translateSubtitles: session.translateSubtitles,
          subtitleLanguage: session.subtitleLanguage ?? undefined,
          audioLanguage: session.audioLanguage ?? undefined,
          audioVoice: session.audioVoice,
          plan: rawPlan,
          maxDurationSeconds,
        },
      },
    });

    sessions.delete(uploadId);

    res.json({ jobId, filePath: b2Key });

    analysisQueue
      .add(async () => {
        try {
          await updateJob(jobId, { status: "queued", progress: 5, currentStep: "Starting analysis" });
          const completed = await runAnalysisPipeline(jobId, b2Key, {
            mode: validatedMode,
            platform: session.platforms[0] ?? "youtube_long",
            platforms: session.platforms,
            modules: session.modules,
            translateSubtitles: session.translateSubtitles,
            subtitleLanguage: session.subtitleLanguage ?? undefined,
            audioLanguage: session.audioLanguage ?? undefined,
            audioVoice: session.audioVoice,
            plan: rawPlan,
            maxDurationSeconds,
          });
          if (completed && userId) await incrementVideoAnalysis(userId);
        } finally {
          await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
        }
      })
      .catch(async (err) => {
        logger.error({ err, jobId }, "Queued pipeline error after chunked upload");
        await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
      });
  } catch (err) {
    logger.error({ err }, "Upload complete error");
    res.status(500).json({ error: "Failed to assemble upload" });
  }
});

// ── DELETE /api/upload/:uploadId ───────────────────────────────────────────────
router.delete("/:uploadId", async (req, res) => {
  try {
    const { uploadId } = req.params;
    const session = sessions.get(uploadId);
    if (session) {
      sessions.delete(uploadId);
      await deleteFromB2(session.r2Key).catch((err) => {
        logger.warn({ err, r2Key: session.r2Key }, "Failed to delete cancelled R2 upload");
      });
      const dir = path.join(UPLOAD_BASE, uploadId);
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
    res.json({ cancelled: true });
  } catch (err) {
    logger.error({ err }, "Upload cancel error");
    res.status(500).json({ error: "Failed to cancel upload" });
  }
});

export default router;
