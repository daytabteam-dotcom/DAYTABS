import { Router, type IRouter } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "@workspace/db";
import { analysisJobsTable } from "@workspace/db";
import { type PipelineMode } from "../analysis/pipeline";
import { optionalAuth } from "../../middlewares/auth";
import {
  normalizePlan,
  getLimits,
  buildFileTooLargeError,
  buildVideoTooLongError,
} from "../../lib/planLimits";
import {
  checkVideoAnalysisLimit,
} from "../../lib/usageService";
import { logger } from "../../lib/logger";
import {
  buildR2ObjectKey,
  createR2MultipartPartUploadUrl,
  createR2MultipartUpload,
  deleteFromB2,
  getR2ObjectMetadata,
  completeR2MultipartUpload,
  abortR2MultipartUpload,
} from "../../lib/b2";

const router: IRouter = Router();
router.use(optionalAuth);

interface UploadSession {
  uploadId: string;
  userId: number | null;
  rawPlan: string;
  recoveryId: string | null;
  filename: string;
  fileSize: number;
  mimeType: string;
  totalChunks: number;
  createdAt: number;
  mode: string;
  platforms: string[];
  modules: string[];
  translateSubtitles: boolean;
  subtitleLanguage: string | null;
  audioLanguage: string | null;
  audioVoice: string;
  r2Key: string;
  durationSeconds: number | null;
  multipartUploadId: string;
  uploadedParts: Map<number, string>;
}

const sessions = new Map<string, UploadSession>();

const CLEANUP_INTERVAL_MS = 30 * 60 * 1000;
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;

setInterval(async () => {
  const now = Date.now();
  let cleaned = 0;
  for (const [id, session] of sessions) {
    if (now - session.createdAt > SESSION_MAX_AGE_MS) {
      sessions.delete(id);
      await abortR2MultipartUpload(session.r2Key, session.multipartUploadId).catch((err) => {
        logger.warn({ err, r2Key: session.r2Key }, "Failed to abort abandoned multipart upload");
      });
      await deleteFromB2(session.r2Key).catch(() => {});
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
      recoveryId,
      platforms,
      modules,
      translateSubtitles,
      subtitleLanguage,
      audioLanguage,
      audioVoice,
      durationSeconds,
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

    const parsedDurationSeconds = Number(durationSeconds);
    const hasDuration = Number.isFinite(parsedDurationSeconds) && parsedDurationSeconds > 0;
    if (hasDuration && parsedDurationSeconds > planLimits.max_video_duration_seconds) {
      res.status(413).json(buildVideoTooLongError(normalizedPlan, parsedDurationSeconds));
      return;
    }

    if (userId) {
      const limitCheck = await checkVideoAnalysisLimit(userId, rawPlan, hasDuration ? parsedDurationSeconds : null);
      if (!limitCheck.allowed) {
        res.status(429).json(limitCheck.error);
        return;
      }
    }

    const uploadId = uuidv4();
    const r2Key = buildR2ObjectKey(uploadId, filename ?? "upload.mp4", userId);
    const uploadTarget = await createR2MultipartUpload(r2Key, mimeType || "video/mp4");

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

    const validModuleList = ["quality", "editing", "publish", "transcript"];
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
      recoveryId: typeof recoveryId === "string" && recoveryId.trim() ? recoveryId.trim() : null,
      filename: filename ?? "upload.mp4",
      fileSize: size,
      mimeType,
      totalChunks: Number(totalChunks),
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
      durationSeconds: hasDuration ? parsedDurationSeconds : null,
      multipartUploadId: uploadTarget.uploadId,
      uploadedParts: new Map(),
    });

    logger.info({
      uploadId,
      userId,
      recoveryId: typeof recoveryId === "string" ? recoveryId : null,
      filename: filename ?? "upload.mp4",
      fileSize: size,
      totalChunks: Number(totalChunks),
      mode: mode ?? "video-analyzer",
      platforms: validatedPlatforms,
      modules: validatedModules,
      activeUploadSessions: sessions.size,
    }, "Upload session initialized");

    res.json({ uploadId, fileKey: uploadTarget.fileKey, fileUrl: uploadTarget.fileUrl });
  } catch (err) {
    logger.error({ err }, "Upload init error");
    res.status(500).json({ error: "Failed to initialize upload" });
  }
});

// ── POST /api/upload/part-url ──────────────────────────────────────────────────
router.post("/part-url", async (req, res) => {
  try {
    const { uploadId, partNumber } = req.body as { uploadId?: string; partNumber?: number };
    if (!uploadId || !partNumber || !Number.isInteger(Number(partNumber)) || Number(partNumber) < 1) {
      res.status(400).json({ error: "Missing or invalid uploadId or partNumber" });
      return;
    }

    const session = sessions.get(uploadId);
    if (!session) {
      res.status(404).json({ error: "Upload session not found or expired. Please restart the upload." });
      return;
    }

    const payload = await createR2MultipartPartUploadUrl(session.r2Key, session.multipartUploadId, Number(partNumber));
    res.json(payload);
  } catch (err) {
    logger.error({ err }, "Multipart part URL init error");
    res.status(500).json({ error: "Failed to initialize multipart upload part" });
  }
});

// ── POST /api/upload/complete ──────────────────────────────────────────────────
router.post("/complete", async (req, res) => {
  req.setTimeout(120_000);
  try {
    const { uploadId, parts } = req.body as {
      uploadId?: string;
      parts?: Array<{ partNumber?: number; etag?: string }>;
    };
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

    const uploadedParts = Array.isArray(parts)
      ? parts
          .map((part) => ({
            partNumber: Number(part.partNumber),
            etag: typeof part.etag === "string" ? part.etag.trim() : "",
          }))
          .filter((part) => Number.isInteger(part.partNumber) && part.partNumber > 0 && part.etag)
      : [];

    if (uploadedParts.length === 0) {
      res.status(400).json({ error: "No uploaded parts were provided" });
      return;
    }

    for (const part of uploadedParts) {
      session.uploadedParts.set(part.partNumber, part.etag);
    }

    await completeR2MultipartUpload(
      session.r2Key,
      session.multipartUploadId,
      Array.from(session.uploadedParts.entries()).map(([partNumber, etag]) => ({ partNumber, etag })),
    );

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

    logger.info({
      uploadId,
      jobId,
      userId,
      recoveryId: session.recoveryId,
      fileSize: session.fileSize,
      uploadedSize: metadata.contentLength,
      mode: validatedMode,
      platforms: session.platforms,
      modules: session.modules,
    }, "Upload complete confirmed; creating queued analysis job");

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
          uploadRecoveryId: session.recoveryId ?? undefined,
          translateSubtitles: session.translateSubtitles,
          subtitleLanguage: session.subtitleLanguage ?? undefined,
          audioLanguage: session.audioLanguage ?? undefined,
          audioVoice: session.audioVoice,
          originalFileName: session.filename,
          plan: rawPlan,
          maxDurationSeconds,
          durationSeconds: session.durationSeconds ?? undefined,
        },
      },
    });

    sessions.delete(uploadId);

    logger.info({
      uploadId,
      jobId,
      userId,
      activeUploadSessions: sessions.size,
    }, "Queued analysis job created from upload session");

    res.json({ jobId, filePath: b2Key });
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
      logger.info({
        uploadId,
        userId: session.userId,
        recoveryId: session.recoveryId,
        r2Key: session.r2Key,
      }, "Cancelling upload session");
      sessions.delete(uploadId);
      await deleteFromB2(session.r2Key).catch((err) => {
        logger.warn({ err, r2Key: session.r2Key }, "Failed to delete cancelled R2 upload");
      });
      await abortR2MultipartUpload(session.r2Key, session.multipartUploadId).catch(() => {});
    }
    logger.info({
      uploadId,
      hadSession: Boolean(session),
      activeUploadSessions: sessions.size,
    }, "Upload session cancellation finished");
    res.json({ cancelled: true });
  } catch (err) {
    logger.error({ err }, "Upload cancel error");
    res.status(500).json({ error: "Failed to cancel upload" });
  }
});

export default router;
