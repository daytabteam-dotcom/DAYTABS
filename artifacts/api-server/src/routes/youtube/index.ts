import { Router } from "express";
import multer from "multer";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { eq } from "drizzle-orm";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { db, youtubeChannelProfilesTable } from "@workspace/db";
import { requireAuth } from "../../middlewares/auth";
import { extractAudio, execAsync, getMediaDuration, transcribeAudio } from "../analysis/services";
import { openai } from "../../lib/openai";
import {
  addYoutubeCompetitorByUrl,
  auditYoutubeVideo,
  createYoutubePlanDay,
  createYoutubeAuthUrl,
  deleteYoutubePlanDay,
  discoverCompetitors,
  generateYoutubeWeeklyPlan,
  generateYoutubeIdeaThumbnail,
  generateYoutubeAuditThumbnail,
  getYoutubeAppRedirect,
  getYoutubeRedirectUri,
  getYoutubeVideoAuditPreview,
  getYoutubeStatus,
  patchYoutubePlanDay,
  improveYoutubeIdea,
  regenerateYoutubePlanIdea,
  removeYoutubeCompetitor,
  savePlanResults,
  storeYoutubeTokens,
  syncYoutubeChannel,
  translateYoutubeAuditTranscript,
  type YoutubeTranscriptSegment,
  updateYoutubeIdeaFeedback,
  updateYoutubeSettings,
} from "../../lib/youtube";
import { normalizePlan } from "../../lib/planLimits";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET!;
const YOUTUBE_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "";
const YOUTUBE_CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || "";
const CANONICAL_APP_ORIGIN = (
  process.env.APP_URL ||
  process.env.BASE_URL ||
  process.env.NEXT_PUBLIC_URL ||
  "https://daytabs.com"
).replace(/\/$/, "");
const RENDER_HOST = "daytabs.onrender.com";
const auditUploadDir = path.join(os.tmpdir(), "daytabs-youtube-audit-uploads");
const auditExportDir = path.join(os.tmpdir(), "daytabs-youtube-audit-exports");
const MAX_AUDIT_TRANSCRIPT_DURATION_SEC = 2 * 60 * 60;
const VALID_TTS_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;

fs.mkdir(auditUploadDir, { recursive: true }).catch(() => {});
fs.mkdir(auditExportDir, { recursive: true }).catch(() => {});

function sanitizeAuditFilenamePart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "youtube-audit";
}

function normalizeAuditTranscriptSegments(value: unknown): YoutubeTranscriptSegment[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
      const start = Number(row.start ?? 0);
      const end = Number(row.end ?? 0);
      const text = typeof row.text === "string" ? row.text.trim() : "";
      return {
        start: Number.isFinite(start) ? Math.max(0, start) : 0,
        end: Number.isFinite(end) ? Math.max(0, end) : 0,
        text,
      };
    })
    .filter((item) => item.text)
    .map((item) => ({
      ...item,
      end: item.end > item.start ? item.end : item.start + 0.8,
    }));
}

function buildAtempoFilter(speedMultiplier: number) {
  const filters: string[] = [];
  let remaining = speedMultiplier;
  while (remaining > 2) {
    filters.push("atempo=2");
    remaining /= 2;
  }
  while (remaining < 0.5) {
    filters.push("atempo=0.5");
    remaining /= 0.5;
  }
  filters.push(`atempo=${remaining.toFixed(4)}`);
  return filters.join(",");
}

async function createSilentMp3(outputPath: string, durationSec: number) {
  await execAsync(`ffmpeg -f lavfi -i anullsrc=r=24000:cl=mono -t "${durationSec}" -q:a 9 -acodec libmp3lame "${outputPath}" -y`);
}

async function createAlignedTranslationAudio(
  segments: YoutubeTranscriptSegment[],
  voice: (typeof VALID_TTS_VOICES)[number],
  baseName: string,
) {
  const exportId = uuidv4();
  const tempDir = path.join(auditExportDir, `tts_${exportId}`);
  await fs.mkdir(tempDir, { recursive: true });
  const concatEntries: string[] = [];
  const tempFiles: string[] = [];
  let cursor = 0;

  try {
    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index]!;
      const gap = Math.max(0, segment.start - cursor);
      if (gap > 0.02) {
        const silencePath = path.join(tempDir, `silence_${index}.mp3`);
        await createSilentMp3(silencePath, gap);
        concatEntries.push(`file '${silencePath.replace(/'/g, "'\\''")}'`);
        tempFiles.push(silencePath);
        cursor += gap;
      }

      const slotDuration = Math.max(0.35, segment.end - segment.start);
      const speechResponse = await openai.audio.speech.create({
        model: "tts-1",
        voice,
        input: segment.text,
        response_format: "mp3",
      } as Parameters<typeof openai.audio.speech.create>[0]);
      const rawPath = path.join(tempDir, `speech_raw_${index}.mp3`);
      await fs.writeFile(rawPath, Buffer.from(await speechResponse.arrayBuffer()));
      tempFiles.push(rawPath);

      let speechPath = rawPath;
      const speechDuration = await getMediaDuration(rawPath).catch(() => 0);
      if (speechDuration > slotDuration + 0.05) {
        const adjustedPath = path.join(tempDir, `speech_adjusted_${index}.mp3`);
        const speedMultiplier = Math.min(6, Math.max(1.02, speechDuration / slotDuration));
        await execAsync(`ffmpeg -i "${rawPath}" -filter:a "${buildAtempoFilter(speedMultiplier)}" -q:a 2 "${adjustedPath}" -y`);
        tempFiles.push(adjustedPath);
        speechPath = adjustedPath;
      }

      concatEntries.push(`file '${speechPath.replace(/'/g, "'\\''")}'`);
      const finalSpeechDuration = await getMediaDuration(speechPath).catch(() => slotDuration);
      cursor = segment.start + Math.min(slotDuration, finalSpeechDuration);

      const trailingGap = Math.max(0, segment.end - cursor);
      if (trailingGap > 0.02) {
        const trailingSilencePath = path.join(tempDir, `silence_tail_${index}.mp3`);
        await createSilentMp3(trailingSilencePath, trailingGap);
        concatEntries.push(`file '${trailingSilencePath.replace(/'/g, "'\\''")}'`);
        tempFiles.push(trailingSilencePath);
      }
      cursor = segment.end;
    }

    const concatList = path.join(tempDir, "concat.txt");
    await fs.writeFile(concatList, concatEntries.join("\n"));
    tempFiles.push(concatList);
    const outputFilename = `${sanitizeAuditFilenamePart(baseName)}-${voice}-${exportId}.mp3`;
    const outputPath = path.join(auditExportDir, outputFilename);
    await execAsync(`ffmpeg -f concat -safe 0 -i "${concatList}" -c copy "${outputPath}" -y`);
    return { outputFilename, outputPath };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

const auditMediaUpload = multer({
  storage: multer.diskStorage({
    destination: async (_req, _file, cb) => {
      try {
        await fs.mkdir(auditUploadDir, { recursive: true });
        cb(null, auditUploadDir);
      } catch (err) {
        cb(err as Error, "");
      }
    },
    filename: (_req, file, cb) => {
      cb(null, `${uuidv4()}${path.extname(file.originalname) || ".mp4"}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "audio/mpeg",
      "audio/mp3",
      "audio/mp4",
      "audio/wav",
      "audio/x-wav",
      "audio/webm",
      "video/mp4",
      "video/quicktime",
      "video/x-msvideo",
      "video/webm",
      "video/mpeg",
    ];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(mp3|m4a|wav|webm|mp4|mov|avi|mpeg|mkv)$/i)) {
      cb(null, true);
    } else {
      cb(new Error("Upload an audio or video file to generate a transcript."));
    }
  },
});

function redirectForHost(req: import("express").Request, path: string) {
  const host = (req.get("x-forwarded-host") || req.get("host") || "").split(",")[0].trim();
  if (host === RENDER_HOST) return `${CANONICAL_APP_ORIGIN}${path}`;
  return path;
}

router.get("/connect", requireAuth, (req, res) => {
  try {
    res.redirect(createYoutubeAuthUrl(req, req.auth!.user_id));
  } catch (err) {
    req.log.error({ err }, "YouTube connect URL error");
    res.status(503).json({ error: err instanceof Error ? err.message : "YouTube OAuth is not configured" });
  }
});

router.get("/connect-url", requireAuth, (req, res) => {
  try {
    res.json({ url: createYoutubeAuthUrl(req, req.auth!.user_id) });
  } catch (err) {
    req.log.error({ err }, "YouTube connect URL error");
    res.status(503).json({ error: err instanceof Error ? err.message : "YouTube OAuth is not configured" });
  }
});

router.get("/callback", async (req, res) => {
  try {
    const { code, state } = req.query as { code?: string; state?: string };
    if (!code || !state) {
      res.redirect(redirectForHost(req, getYoutubeAppRedirect("error", "missing_code")));
      return;
    }

    const decoded = jwt.verify(state, JWT_SECRET) as { user_id?: number; purpose?: string };
    if (decoded.purpose !== "youtube_connect" || !decoded.user_id) {
      res.redirect(redirectForHost(req, getYoutubeAppRedirect("error", "invalid_state")));
      return;
    }

    const client = new OAuth2Client(YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, getYoutubeRedirectUri(req));
    const { tokens } = await client.getToken({ code, redirect_uri: getYoutubeRedirectUri(req) });
    await storeYoutubeTokens(decoded.user_id, tokens);
    await syncYoutubeChannel(decoded.user_id);
    res.redirect(redirectForHost(req, getYoutubeAppRedirect("connected")));
  } catch (err) {
    req.log.error({ err }, "YouTube OAuth callback error");
    res.redirect(redirectForHost(req, getYoutubeAppRedirect("error", "oauth_failed")));
  }
});

router.get("/status", requireAuth, async (req, res) => {
  try {
    res.json(await getYoutubeStatus(req.auth!.user_id));
  } catch (err) {
    req.log.error({ err }, "YouTube status error");
    res.status(500).json({ error: "Failed to load YouTube status" });
  }
});

router.post("/sync", requireAuth, async (req, res) => {
  try {
    const channel = await syncYoutubeChannel(req.auth!.user_id);
    res.json({ channel });
  } catch (err) {
    req.log.error({ err }, "YouTube sync error");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to sync YouTube channel" });
  }
});

router.post("/settings", requireAuth, async (req, res) => {
  try {
    const preferredPostsPerWeek = Number(req.body?.preferredPostsPerWeek);
    if (!Number.isFinite(preferredPostsPerWeek) || preferredPostsPerWeek < 1) {
      res.status(400).json({ error: "preferredPostsPerWeek must be a positive number" });
      return;
    }
    const settings = await updateYoutubeSettings(req.auth!.user_id, { preferredPostsPerWeek });
    res.json({ settings });
  } catch (err) {
    req.log.error({ err }, "YouTube settings update error");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to update YouTube settings" });
  }
});

router.post("/competitors/discover", requireAuth, async (req, res) => {
  try {
    const [profile] = await db.select().from(youtubeChannelProfilesTable).where(eq(youtubeChannelProfilesTable.userId, req.auth!.user_id)).limit(1);
    if (!profile) {
      res.status(400).json({ error: "Connect YouTube before discovering competitors" });
      return;
    }
    const competitors = await discoverCompetitors(req.auth!.user_id, profile);
    res.json({ competitors });
  } catch (err) {
    req.log.error({ err }, "YouTube competitor discovery error");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to discover competitors" });
  }
});

router.post("/audit", requireAuth, async (req, res) => {
  try {
    const plan = normalizePlan(req.auth?.plan ?? "free");
    if (plan !== "studio") {
      res.status(403).json({
        code: "STUDIO_REQUIRED",
        error: "YouTube video audit is available on the Studio plan.",
      });
      return;
    }
    const videoUrl = typeof req.body?.videoUrl === "string" ? req.body.videoUrl.trim() : "";
    if (!videoUrl) {
      res.status(400).json({ error: "A YouTube video URL is required" });
      return;
    }
    const report = await auditYoutubeVideo(req.auth!.user_id, videoUrl);
    res.json({ report });
  } catch (err) {
    req.log.error({ err }, "YouTube video audit error");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to audit YouTube video" });
  }
});

router.post("/audit-preview", requireAuth, async (req, res) => {
  try {
    const plan = normalizePlan(req.auth?.plan ?? "free");
    if (plan !== "studio") {
      res.status(403).json({
        code: "STUDIO_REQUIRED",
        error: "YouTube video audit is available on the Studio plan.",
      });
      return;
    }
    const videoUrl = typeof req.body?.videoUrl === "string" ? req.body.videoUrl.trim() : "";
    if (!videoUrl) {
      res.status(400).json({ error: "A YouTube video URL is required" });
      return;
    }
    const preview = await getYoutubeVideoAuditPreview(req.auth!.user_id, videoUrl);
    res.json({ preview });
  } catch (err) {
    req.log.error({ err }, "YouTube video audit preview error");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to prepare YouTube video audit" });
  }
});

router.post("/audit-transcribe", requireAuth, (req, res) => {
  auditMediaUpload.single("media")(req, res, async (multerErr) => {
    let uploadedPath: string | null = null;
    let audioPath: string | null = null;
    try {
      const plan = normalizePlan(req.auth?.plan ?? "free");
      if (plan !== "studio") {
        res.status(403).json({
          code: "STUDIO_REQUIRED",
          error: "YouTube audit transcript generation is available on the Studio plan.",
        });
        return;
      }
      if (multerErr) {
        res.status(400).json({ error: multerErr.message ?? "File upload error" });
        return;
      }
      const file = req.file;
      uploadedPath = file?.path ?? null;
      const videoUrl = typeof req.body?.videoUrl === "string" ? req.body.videoUrl.trim() : "";
      if (!videoUrl) {
        res.status(400).json({ error: "A YouTube video URL is required" });
        return;
      }
      if (!file?.path) {
        res.status(400).json({ error: "Upload an audio or video file to generate a transcript" });
        return;
      }

      const durationSec = await getMediaDuration(file.path);
      if (durationSec > MAX_AUDIT_TRANSCRIPT_DURATION_SEC) {
        res.status(400).json({ error: "Uploaded media must be 2 hours or shorter for transcript generation." });
        return;
      }

      audioPath = path.join(auditUploadDir, `${uuidv4()}.mp3`);
      await extractAudio(file.path, audioPath);
      const transcript = await transcribeAudio(audioPath);
      const text = transcript.text.trim();
      if (!text) {
        res.status(422).json({ error: "Could not detect speech in the uploaded media." });
        return;
      }

      const report = await auditYoutubeVideo(req.auth!.user_id, videoUrl, {
        transcriptOverride: {
          text,
          source: "uploaded",
          language: null,
          segments: transcript.segments,
        },
      });
      res.json({
        report,
        transcript: {
          available: true,
          source: "uploaded",
          language: null,
          text,
          segments: transcript.segments,
        },
      });
    } catch (err) {
      req.log.error({ err }, "YouTube audit uploaded transcript error");
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed to generate transcript from upload" });
    } finally {
      if (uploadedPath) await fs.unlink(uploadedPath).catch(() => {});
      if (audioPath) await fs.unlink(audioPath).catch(() => {});
    }
  });
});

router.post("/audit-translate", requireAuth, async (req, res) => {
  try {
    const plan = normalizePlan(req.auth?.plan ?? "free");
    if (plan !== "studio") {
      res.status(403).json({
        code: "STUDIO_REQUIRED",
        error: "YouTube audit transcript translation is available on the Studio plan.",
      });
      return;
    }
    const targetLanguage = typeof req.body?.targetLanguage === "string" ? req.body.targetLanguage.trim() : "";
    const sourceLanguage = typeof req.body?.sourceLanguage === "string" ? req.body.sourceLanguage.trim() : null;
    const segments = normalizeAuditTranscriptSegments(req.body?.segments);
    if (!targetLanguage) {
      res.status(400).json({ error: "Choose a target language." });
      return;
    }
    if (!segments.length) {
      res.status(400).json({ error: "A timestamped transcript is required before translation." });
      return;
    }
    const translation = await translateYoutubeAuditTranscript(req.auth!.user_id, segments, targetLanguage, sourceLanguage);
    res.json({ translation });
  } catch (err) {
    req.log.error({ err }, "YouTube audit transcript translation error");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to translate transcript" });
  }
});

router.post("/audit-translation-audio", requireAuth, async (req, res) => {
  try {
    const plan = normalizePlan(req.auth?.plan ?? "free");
    if (plan !== "studio") {
      res.status(403).json({
        code: "STUDIO_REQUIRED",
        error: "YouTube audit translation audio is available on the Studio plan.",
      });
      return;
    }
    const voice = typeof req.body?.voice === "string" ? req.body.voice.trim() : "";
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "youtube-audit";
    const targetLanguage = typeof req.body?.targetLanguage === "string" ? req.body.targetLanguage.trim() : "translated";
    const segments = normalizeAuditTranscriptSegments(req.body?.segments);
    if (!VALID_TTS_VOICES.includes(voice as (typeof VALID_TTS_VOICES)[number])) {
      res.status(400).json({ error: "Choose a valid OpenAI voice." });
      return;
    }
    if (!segments.length) {
      res.status(400).json({ error: "A translated timestamped transcript is required before generating audio." });
      return;
    }
    const baseName = `${title}-${targetLanguage}`;
    const { outputFilename } = await createAlignedTranslationAudio(
      segments,
      voice as (typeof VALID_TTS_VOICES)[number],
      baseName,
    );
    res.json({
      filename: outputFilename,
      downloadUrl: `/api/youtube/audit-download/${encodeURIComponent(outputFilename)}`,
      voice,
    });
  } catch (err) {
    req.log.error({ err }, "YouTube audit translation audio error");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to generate translation audio" });
  }
});

router.post("/audit-thumbnail", requireAuth, async (req, res) => {
  try {
    const plan = normalizePlan(req.auth?.plan ?? "free");
    if (plan !== "studio") {
      res.status(403).json({
        code: "STUDIO_REQUIRED",
        error: "YouTube audit thumbnail generation is available on the Studio plan.",
      });
      return;
    }
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
    if (!title) {
      res.status(400).json({ error: "A video title is required for thumbnail generation" });
      return;
    }
    const thumbnail = await generateYoutubeAuditThumbnail(req.auth!.user_id, {
      title,
      description,
      tags: Array.isArray(req.body?.tags) ? req.body.tags : [],
      textPreference: typeof req.body?.textPreference === "string" ? req.body.textPreference : null,
      sourceImages: req.body?.sourceImages,
      fallbackSourceImageUrl: typeof req.body?.fallbackSourceImageUrl === "string" ? req.body.fallbackSourceImageUrl : null,
      preserveUploadedImage: req.body?.preserveUploadedImage,
      stylePreference: typeof req.body?.stylePreference === "string" ? req.body.stylePreference : null,
      analysisNotes: typeof req.body?.analysisNotes === "string" ? req.body.analysisNotes : null,
    });
    res.json({ thumbnail });
  } catch (err) {
    req.log.error({ err }, "YouTube audit thumbnail generation error");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to generate audit thumbnail" });
  }
});

router.get("/audit-download/:filename", requireAuth, async (req, res) => {
  try {
    const filename = req.params.filename || "";
    if (!filename || filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
      res.status(400).json({ error: "Invalid filename" });
      return;
    }
    const filePath = path.join(auditExportDir, filename);
    try {
      await fs.access(filePath);
    } catch {
      res.status(404).json({ error: "File not found or has expired" });
      return;
    }
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", filename.endsWith(".mp3") ? "audio/mpeg" : "application/octet-stream");
    const { createReadStream } = await import("fs");
    const stream = createReadStream(filePath);
    stream.pipe(res as unknown as NodeJS.WritableStream);
    stream.on("end", () => { fs.unlink(filePath).catch(() => {}); });
  } catch (err) {
    req.log.error({ err }, "YouTube audit download error");
    res.status(500).json({ error: "Download failed" });
  }
});

router.post("/competitors", requireAuth, async (req, res) => {
  try {
    const channelUrl = typeof req.body?.channelUrl === "string" ? req.body.channelUrl.trim() : "";
    if (!channelUrl) {
      res.status(400).json({ error: "A YouTube channel URL is required" });
      return;
    }
    const competitor = await addYoutubeCompetitorByUrl(req.auth!.user_id, channelUrl);
    res.json({ competitor });
  } catch (err) {
    req.log.error({ err }, "YouTube competitor add error");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to add competitor" });
  }
});

router.delete("/competitors/:competitorId", requireAuth, async (req, res) => {
  try {
    const competitorId = Number(req.params.competitorId);
    if (!Number.isInteger(competitorId) || competitorId <= 0) {
      res.status(400).json({ error: "A valid competitor ID is required" });
      return;
    }
    const removed = await removeYoutubeCompetitor(req.auth!.user_id, competitorId);
    res.json(removed);
  } catch (err) {
    req.log.error({ err }, "YouTube competitor remove error");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to remove competitor" });
  }
});

router.post("/plans/generate", requireAuth, async (req, res) => {
  try {
    const plan = await generateYoutubeWeeklyPlan(req.auth!.user_id);
    res.json({ plan });
  } catch (err) {
    req.log.error({ err }, "YouTube plan generation error");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to generate YouTube plan" });
  }
});

router.post("/plans/:planId/results", requireAuth, async (req, res) => {
  try {
    const planId = Number(req.params.planId);
    const results = (Array.isArray(req.body?.results) ? req.body.results : []) as Array<{ dayIndex: number; plannedTitle: string; videoId?: string; videoUrl?: string }>;
    if (!Number.isInteger(planId) || planId <= 0) {
      res.status(400).json({ error: "Valid plan ID is required" });
      return;
    }
    if (!results.length) {
      res.status(400).json({ error: "At least one video URL is required" });
      return;
    }
    const videoIds = results.map((result) => result?.videoId || result?.videoUrl).filter(Boolean);
    if (new Set(videoIds).size !== videoIds.length) {
      res.status(400).json({ error: "One YouTube video cannot be linked to more than one content idea" });
      return;
    }
    const saved = await savePlanResults(req.auth!.user_id, planId, results);
    res.json({ results: saved });
  } catch (err) {
    req.log.error({ err }, "YouTube plan result collection error");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to collect YouTube results" });
  }
});

router.post("/plans/:planId/days", requireAuth, async (req, res) => {
  try {
    const planId = Number(req.params.planId);
    const day = req.body?.day && typeof req.body.day === "object" ? req.body.day : null;
    if (!Number.isInteger(planId) || planId <= 0 || !day) {
      res.status(400).json({ error: "Valid plan ID and day payload are required" });
      return;
    }
    const created = await createYoutubePlanDay(req.auth!.user_id, planId, day);
    res.json(created);
  } catch (err) {
    req.log.error({ err }, "YouTube day create error");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create plan day" });
  }
});

router.patch("/plans/:planId/days/:dayIndex", requireAuth, async (req, res) => {
  try {
    const planId = Number(req.params.planId);
    const dayIndex = Number(req.params.dayIndex);
    const patch = req.body?.patch && typeof req.body.patch === "object" ? req.body.patch : {};
    if (!Number.isInteger(planId) || planId <= 0 || !Number.isInteger(dayIndex) || dayIndex <= 0) {
      res.status(400).json({ error: "Valid plan ID and day index are required" });
      return;
    }
    const updated = await patchYoutubePlanDay(req.auth!.user_id, planId, dayIndex, patch);
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "YouTube day patch error");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to update plan day" });
  }
});

router.delete("/plans/:planId/days/:dayIndex", requireAuth, async (req, res) => {
  try {
    const planId = Number(req.params.planId);
    const dayIndex = Number(req.params.dayIndex);
    if (!Number.isInteger(planId) || planId <= 0 || !Number.isInteger(dayIndex) || dayIndex <= 0) {
      res.status(400).json({ error: "Valid plan ID and day index are required" });
      return;
    }
    const updated = await deleteYoutubePlanDay(req.auth!.user_id, planId, dayIndex);
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "YouTube day delete error");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to delete plan day" });
  }
});

router.post("/ideas/improve", requireAuth, async (req, res) => {
  try {
    const idea = req.body?.idea && typeof req.body.idea === "object" ? req.body.idea : {};
    const improved = await improveYoutubeIdea(req.auth!.user_id, idea);
    res.json({ idea: improved });
  } catch (err) {
    req.log.error({ err }, "YouTube idea improvement error");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to improve idea" });
  }
});

router.post("/plans/:planId/days/:dayIndex/feedback", requireAuth, async (req, res) => {
  try {
    const planId = Number(req.params.planId);
    const dayIndex = Number(req.params.dayIndex);
    const feedback = req.body?.feedback;
    if (!Number.isInteger(planId) || planId <= 0 || !Number.isInteger(dayIndex) || dayIndex <= 0) {
      res.status(400).json({ error: "Valid plan ID and day index are required" });
      return;
    }
    if (![null, "liked", "disliked"].includes(feedback ?? null)) {
      res.status(400).json({ error: "feedback must be liked, disliked, or null" });
      return;
    }
    const updated = await updateYoutubeIdeaFeedback(req.auth!.user_id, planId, dayIndex, feedback ?? null);
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "YouTube idea feedback error");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to save idea feedback" });
  }
});

router.post("/plans/:planId/days/:dayIndex/regenerate", requireAuth, async (req, res) => {
  try {
    const planId = Number(req.params.planId);
    const dayIndex = Number(req.params.dayIndex);
    if (!Number.isInteger(planId) || planId <= 0 || !Number.isInteger(dayIndex) || dayIndex <= 0) {
      res.status(400).json({ error: "Valid plan ID and day index are required" });
      return;
    }
    const updated = await regenerateYoutubePlanIdea(req.auth!.user_id, planId, dayIndex);
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "YouTube idea regenerate error");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to regenerate idea" });
  }
});

router.post("/plans/:planId/days/:dayIndex/thumbnail", requireAuth, async (req, res) => {
  try {
    const planId = Number(req.params.planId);
    const dayIndex = Number(req.params.dayIndex);
    if (!Number.isInteger(planId) || planId <= 0 || !Number.isInteger(dayIndex) || dayIndex <= 0) {
      res.status(400).json({ error: "Valid plan ID and day index are required" });
      return;
    }
    const result = await generateYoutubeIdeaThumbnail(req.auth!.user_id, planId, dayIndex, {
      textPreference: typeof req.body?.textPreference === "string" ? req.body.textPreference : null,
      sourceImages: req.body?.sourceImages,
      preserveUploadedImage: req.body?.preserveUploadedImage,
    });
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "YouTube thumbnail generation error");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to generate thumbnail" });
  }
});

export default router;
