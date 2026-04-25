import { Router } from "express";
import multer from "multer";
import jwt from "jsonwebtoken";
import { toFile } from "openai";
import { OAuth2Client } from "google-auth-library";
import { and, eq, lte } from "drizzle-orm";
import { spawn } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { db, youtubeApiCacheTable, youtubeChannelProfilesTable } from "@workspace/db";
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
  extractYoutubeVideoId,
  generateYoutubeWeeklyPlan,
  generateYoutubeIdeaThumbnail,
  generateYoutubeAuditThumbnail,
  getYoutubeAppRedirect,
  getYoutubeRedirectUri,
  getYoutubeEditableTranscript,
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
import { getUiLocaleFromRequest } from "../../lib/uiLocale";

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
const avatarCacheDir = path.join(auditExportDir, "avatar-cache");
const MAX_AUDIT_TRANSCRIPT_DURATION_SEC = 2 * 60 * 60;
const MAX_YOUTUBE_AUTO_TRANSCRIBE_BYTES = 250 * 1024 * 1024;
const YOUTUBE_TRANSCRIPT_CACHE_TTL_DAYS = Number(process.env.YOUTUBE_TRANSCRIPT_CACHE_TTL_DAYS || 180);
const YOUTUBE_TRANSCRIPT_PROCESSING_TTL_MINUTES = Number(process.env.YOUTUBE_TRANSCRIPT_PROCESSING_TTL_MINUTES || 45);
const YOUTUBE_AUDIO_FALLBACK_SYNC_MAX_DURATION_SEC = Number(
  process.env.YOUTUBE_AUDIO_FALLBACK_SYNC_MAX_DURATION_SEC || 20 * 60,
);
const YOUTUBE_TRANSCRIPT_MAX_DURATION_SEC = Number(process.env.YOUTUBE_TRANSCRIPT_MAX_DURATION_SEC || MAX_AUDIT_TRANSCRIPT_DURATION_SEC);
const YOUTUBE_TRANSCRIPT_MAX_AUDIO_BYTES = Number(process.env.YOUTUBE_TRANSCRIPT_MAX_AUDIO_BYTES || MAX_YOUTUBE_AUTO_TRANSCRIBE_BYTES);
const YOUTUBE_TRANSCRIPT_RATE_LIMIT_WINDOW_MS = Number(process.env.YOUTUBE_TRANSCRIPT_RATE_LIMIT_WINDOW_MS || 60_000);
const YOUTUBE_TRANSCRIPT_RATE_LIMIT_MAX = Number(process.env.YOUTUBE_TRANSCRIPT_RATE_LIMIT_MAX || 8);
const VALID_TTS_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;
const TTS_VOICE_GENDER: Record<(typeof VALID_TTS_VOICES)[number], "male" | "female"> = {
  alloy: "male",
  echo: "male",
  onyx: "male",
  fable: "female",
  nova: "female",
  shimmer: "female",
};
const AVATAR_IMAGE_MODEL = process.env.YOUTUBE_THUMBNAIL_IMAGE_MODEL || "gpt-image-2";
const AVATAR_IMAGE_FALLBACK_MODEL = "gpt-image-1";
const MAX_TRANSLATION_VIDEO_DURATION_SEC = 15 * 60;

fs.mkdir(auditUploadDir, { recursive: true }).catch(() => {});
fs.mkdir(auditExportDir, { recursive: true }).catch(() => {});
fs.mkdir(avatarCacheDir, { recursive: true }).catch(() => {});

type TranscriptPipelineSource = "youtube_caption" | "audio_transcription";
type TranscriptCaptionType = "manual" | "auto" | "generated";

type CachedYoutubeTranscriptPayload =
  | {
      kind: "youtubeTranscriptV1";
      status: "processing";
      preferredLanguage: string | null;
      step: string;
      startedAt: string;
      updatedAt: string;
    }
  | {
      kind: "youtubeTranscriptV1";
      status: "complete";
      preferredLanguage: string | null;
      transcript: {
        source: TranscriptPipelineSource;
        captionType: TranscriptCaptionType;
        language: string | null;
        text: string;
        segments: YoutubeTranscriptSegment[];
      };
      createdAt: string;
      updatedAt: string;
    }
  | {
      kind: "youtubeTranscriptV1";
      status: "error";
      preferredLanguage: string | null;
      message: string;
      failedAt: string;
      updatedAt: string;
    };

const transcriptRequests = new Map<number, { count: number; resetAt: number }>();
const runningTranscriptTasks = new Map<string, Promise<void>>();

function checkTranscriptRateLimit(userId: number) {
  const now = Date.now();
  const entry = transcriptRequests.get(userId);
  if (!entry || now > entry.resetAt) {
    transcriptRequests.set(userId, { count: 1, resetAt: now + YOUTUBE_TRANSCRIPT_RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= YOUTUBE_TRANSCRIPT_RATE_LIMIT_MAX) return false;
  entry.count += 1;
  return true;
}

function transcriptCacheKey(videoId: string, preferredLanguage: string | null) {
  const lang = (preferredLanguage || "auto").trim().toLowerCase();
  return `youtube-transcript:${videoId}:${lang}`;
}

function safeYoutubeTempBase(videoId: string) {
  return `daytabs-youtube-${videoId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "video"}`;
}

function isAllowedYoutubeUrl(videoUrl: string): boolean {
  try {
    const parsed = new URL(videoUrl);
    const host = parsed.hostname.toLowerCase();
    return host === "youtube.com" || host === "www.youtube.com" || host === "m.youtube.com" || host === "youtu.be";
  } catch {
    return false;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function readCachedYoutubeTranscript(cacheKey: string): Promise<CachedYoutubeTranscriptPayload | null> {
  const now = new Date();
  const [row] = await db
    .select({ payload: youtubeApiCacheTable.payload, expiresAt: youtubeApiCacheTable.expiresAt })
    .from(youtubeApiCacheTable)
    .where(eq(youtubeApiCacheTable.cacheKey, cacheKey))
    .limit(1);
  if (!row) return null;
  if (row.expiresAt <= now) return null;
  const payload = row.payload as CachedYoutubeTranscriptPayload;
  if (!payload || payload.kind !== "youtubeTranscriptV1") return null;
  return payload;
}

async function writeCachedYoutubeTranscript(
  cacheKey: string,
  payload: CachedYoutubeTranscriptPayload,
  ttlMs: number,
) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);
  await db
    .insert(youtubeApiCacheTable)
    .values({
      cacheKey,
      payload,
      userId: null,
      quotaCost: 0,
      expiresAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: youtubeApiCacheTable.cacheKey,
      set: { payload, userId: null, quotaCost: 0, expiresAt, updatedAt: now },
    });
}

async function tryAcquireTranscriptProcessingLock(cacheKey: string, preferredLanguage: string | null, step: string) {
  const now = new Date();
  const ttlMs = Math.max(1, YOUTUBE_TRANSCRIPT_PROCESSING_TTL_MINUTES) * 60_000;
  const expiresAt = new Date(now.getTime() + ttlMs);
  const processingPayload: CachedYoutubeTranscriptPayload = {
    kind: "youtubeTranscriptV1",
    status: "processing",
    preferredLanguage,
    step,
    startedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  const updatedRows = await db
    .update(youtubeApiCacheTable)
    .set({ payload: processingPayload, userId: null, quotaCost: 0, expiresAt, updatedAt: now })
    .where(and(eq(youtubeApiCacheTable.cacheKey, cacheKey), lte(youtubeApiCacheTable.expiresAt, now)))
    .returning({ cacheKey: youtubeApiCacheTable.cacheKey });

  if (updatedRows.length) return true;

  const insertedRows = await db
    .insert(youtubeApiCacheTable)
    .values({ cacheKey, payload: processingPayload, userId: null, quotaCost: 0, expiresAt, updatedAt: now })
    .onConflictDoNothing({ target: youtubeApiCacheTable.cacheKey })
    .returning({ cacheKey: youtubeApiCacheTable.cacheKey });

  return insertedRows.length > 0;
}

async function updateTranscriptProcessingStep(cacheKey: string, preferredLanguage: string | null, step: string) {
  const now = new Date();
  const ttlMs = Math.max(1, YOUTUBE_TRANSCRIPT_PROCESSING_TTL_MINUTES) * 60_000;
  const expiresAt = new Date(now.getTime() + ttlMs);
  const processingPayload: CachedYoutubeTranscriptPayload = {
    kind: "youtubeTranscriptV1",
    status: "processing",
    preferredLanguage,
    step,
    startedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  await db
    .update(youtubeApiCacheTable)
    .set({ payload: processingPayload, expiresAt, updatedAt: now })
    .where(eq(youtubeApiCacheTable.cacheKey, cacheKey));
}

async function runCommandCaptureStdout(
  command: string,
  args: string[],
  timeoutMs: number,
  logger: { info: (...args: any[]) => void; warn: (...args: any[]) => void },
) {
  return await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const startedAt = Date.now();
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`${command} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
      stdoutBytes += chunk.length;
      while (stdoutBytes > 256 * 1024 && stdoutChunks.length > 1) {
        const removed = stdoutChunks.shift();
        stdoutBytes -= removed?.length ?? 0;
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
      stderrBytes += chunk.length;
      while (stderrBytes > 256 * 1024 && stderrChunks.length > 1) {
        const removed = stderrChunks.shift();
        stderrBytes -= removed?.length ?? 0;
      }
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err.code === "ENOENT") {
        reject(new Error(`${command} is not installed on this server. Please install ${command}.`));
        return;
      }
      reject(err);
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      logger.info({ command, code, durationMs: Date.now() - startedAt }, "External command finished");
      resolve({ code, stdout, stderr });
    });
  });
}

async function getYtDlpInfo(
  videoUrl: string,
  logger: { info: (...args: any[]) => void; warn: (...args: any[]) => void },
): Promise<{ durationSec: number; isLive: boolean }> {
  const result = await runCommandCaptureStdout(
    "yt-dlp",
    ["--no-playlist", "--skip-download", "--no-warnings", "-J", videoUrl],
    30_000,
    logger,
  );
  if (result.code !== 0) {
    logger.warn({ stderr: result.stderr.trim() }, "yt-dlp info probe failed");
    throw new Error("yt-dlp failed");
  }
  const parsed = JSON.parse(result.stdout || "{}") as { duration?: unknown; is_live?: unknown; live_status?: unknown };
  const durationSec = Number(parsed.duration ?? 0);
  const isLive =
    Boolean(parsed.is_live) ||
    String(parsed.live_status ?? "").toLowerCase().includes("is_live") ||
    String(parsed.live_status ?? "").toLowerCase() === "live";
  return { durationSec: Number.isFinite(durationSec) ? durationSec : 0, isLive };
}

async function downloadYoutubeAudioMp3WithYtDlp(
  videoUrl: string,
  videoId: string,
  maxBytes: number,
  logger: { info: (...args: any[]) => void; warn: (...args: any[]) => void },
) {
  const base = safeYoutubeTempBase(videoId);
  const exportId = uuidv4();
  const outputTemplate = path.join(os.tmpdir(), `${base}-${exportId}.%(ext)s`);
  const args = [
    "-f",
    "bestaudio/best",
    "--extract-audio",
    "--audio-format",
    "mp3",
    "--audio-quality",
    "5",
    "--no-playlist",
    "--no-warnings",
    "--no-progress",
    "--socket-timeout",
    "20",
    "--retries",
    "2",
    "--fragment-retries",
    "2",
    "--concurrent-fragments",
    "1",
    ...(Number.isFinite(maxBytes) && maxBytes > 0 ? ["--max-filesize", String(Math.floor(maxBytes))] : []),
    "--print",
    "after_move:filepath",
    "-o",
    outputTemplate,
    videoUrl,
  ];
  logger.info({ videoId }, "Starting yt-dlp audio extraction");
  const result = await runCommandCaptureStdout("yt-dlp", args, 12 * 60_000, logger);
  if (result.code !== 0) {
    logger.warn({ stderr: result.stderr.trim(), stdout: result.stdout.trim() }, "yt-dlp audio extraction failed");
    throw new Error("yt-dlp failed");
  }
  const printed = result.stdout
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);
  const audioPath = printed[printed.length - 1] || outputTemplate.replace("%(ext)s", "mp3");
  const stat = await fs.stat(audioPath).catch(() => null);
  if (!stat || stat.size <= 0) throw new Error("yt-dlp did not produce an audio file");
  if (Number.isFinite(maxBytes) && maxBytes > 0 && stat.size > maxBytes) {
    throw new Error("Audio file too large");
  }
  return { audioPath, bytes: stat.size };
}

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

async function transcribeYoutubeAudioFallback(
  videoUrl: string,
  logger: { info: (...args: any[]) => void; warn: (...args: any[]) => void },
) {
  if (!isAllowedYoutubeUrl(videoUrl)) throw new Error("Enter a valid YouTube video URL");
  const videoId = extractYoutubeVideoId(videoUrl);
  if (!videoId) throw new Error("Enter a valid YouTube video URL");

  const info = await withTimeout(getYtDlpInfo(videoUrl, logger), 35_000, "YouTube metadata probe");
  if (info.isLive) throw new Error("Live streams cannot be auto-transcribed. Upload an audio/video file instead.");
  if (info.durationSec > 0 && info.durationSec > YOUTUBE_TRANSCRIPT_MAX_DURATION_SEC) {
    throw new Error("This video is too long to auto-transcribe. Upload a shorter audio/video file instead.");
  }

  let audioPath: string | null = null;
  try {
    const downloaded = await withTimeout(
      downloadYoutubeAudioMp3WithYtDlp(videoUrl, videoId, YOUTUBE_TRANSCRIPT_MAX_AUDIO_BYTES, logger),
      15 * 60_000,
      "YouTube audio download",
    );
    audioPath = downloaded.audioPath;
    const transcript = await withTimeout(transcribeAudio(audioPath), 25 * 60_000, "Audio transcription");
    return { ...transcript, segments: normalizeAuditTranscriptSegments(transcript.segments) };
  } finally {
    if (audioPath) await fs.unlink(audioPath).catch(() => {});
  }
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
  const totalDuration = Math.max(0.1, segments[segments.length - 1]?.end ?? 0);

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
      const exactPath = path.join(tempDir, `speech_exact_${index}.mp3`);
      if (speechDuration > 0) {
        const speedMultiplier = speechDuration > slotDuration
          ? Math.min(12, Math.max(1.02, speechDuration / slotDuration))
          : 1;
        const filters = [
          speedMultiplier > 1 ? buildAtempoFilter(speedMultiplier) : null,
          `apad=pad_dur=${slotDuration.toFixed(3)}`,
          `atrim=0:${slotDuration.toFixed(3)}`,
        ].filter(Boolean).join(",");
        await execAsync(`ffmpeg -i "${rawPath}" -filter:a "${filters}" -ar 24000 -ac 1 -c:a libmp3lame -q:a 2 "${exactPath}" -y`);
        tempFiles.push(exactPath);
        speechPath = exactPath;
      }

      concatEntries.push(`file '${speechPath.replace(/'/g, "'\\''")}'`);
      cursor = segment.end;
    }

    const concatList = path.join(tempDir, "concat.txt");
    await fs.writeFile(concatList, concatEntries.join("\n"));
    tempFiles.push(concatList);
    const outputFilename = `${sanitizeAuditFilenamePart(baseName)}-${voice}-${exportId}.mp3`;
    const outputPath = path.join(auditExportDir, outputFilename);
    await execAsync(`ffmpeg -f concat -safe 0 -i "${concatList}" -af "apad=pad_dur=${totalDuration.toFixed(3)},atrim=0:${totalDuration.toFixed(3)}" -ar 24000 -ac 1 -c:a libmp3lame -q:a 2 "${outputPath}" -y`);
    return { outputFilename, outputPath };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

function extractGeneratedImageBase64(response: unknown) {
  const record = response && typeof response === "object" ? response as Record<string, unknown> : {};
  const data = Array.isArray(record.data) ? record.data : [];
  for (const item of data) {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const base64 = typeof row.b64_json === "string" ? row.b64_json.trim() : "";
    if (base64) return base64;
  }
  return null;
}

async function generateImageWithFallback(params: Parameters<typeof openai.images.generate>[0]) {
  try {
    return await openai.images.generate(params);
  } catch (err) {
    if (params.model === AVATAR_IMAGE_FALLBACK_MODEL) throw err;
    return await openai.images.generate({ ...params, model: AVATAR_IMAGE_FALLBACK_MODEL });
  }
}

async function editImageWithFallback(params: Parameters<typeof openai.images.edit>[0]) {
  try {
    return await openai.images.edit(params);
  } catch (err) {
    if (params.model === AVATAR_IMAGE_FALLBACK_MODEL) throw err;
    return await openai.images.edit({ ...params, model: AVATAR_IMAGE_FALLBACK_MODEL });
  }
}

async function createAvatarBaseImage(tempDir: string, gender: "male" | "female") {
  const cachedPath = path.join(avatarCacheDir, `avatar_${gender}_base.png`);
  try {
    await fs.access(cachedPath);
    return cachedPath;
  } catch {
    // Generate below.
  }
  const prompt = [
    "A fictional AI character face, head-and-shoulders talking-head portrait.",
    "Stylized 3D animated look (not photorealistic), clean studio lighting, crisp details.",
    "Centered front-facing head, neutral friendly expression, mouth closed, eyes open.",
    "Simple soft gradient background, high contrast separation.",
    gender === "female" ? "Feminine-presenting character." : "Masculine-presenting character.",
    "No text, no logos, no watermark.",
    "Do not resemble any real person or public figure.",
  ].join(" ");
  const response = await generateImageWithFallback({
    model: AVATAR_IMAGE_MODEL,
    prompt,
    size: "1024x1024",
    quality: "high",
    output_format: "png",
  } as Parameters<typeof openai.images.generate>[0]);
  const base64 = extractGeneratedImageBase64(response);
  if (!base64) throw new Error("Avatar generation did not return an image");
  const buffer = Buffer.from(base64, "base64");
  const outputPath = path.join(tempDir, "avatar_base.png");
  await fs.writeFile(outputPath, buffer);
  await fs.writeFile(cachedPath, buffer).catch(() => {});
  return cachedPath;
}

async function createAvatarMouthVariant(
  tempDir: string,
  gender: "male" | "female",
  basePngPath: string,
  variant: "mid" | "open",
) {
  const cachedPath = path.join(avatarCacheDir, `avatar_${gender}_${variant}.png`);
  try {
    await fs.access(cachedPath);
    return cachedPath;
  } catch {
    // Generate below.
  }
  const baseBuffer = await fs.readFile(basePngPath);
  const prompt = variant === "open"
    ? "Keep the exact same fictional character, pose, and style. Edit only the mouth to be clearly open as if speaking a vowel sound. Do not change identity, hairstyle, eyes, face shape, or lighting. No text."
    : "Keep the exact same fictional character, pose, and style. Edit only the mouth to be slightly open as if speaking softly. Do not change identity, hairstyle, eyes, face shape, or lighting. No text.";
  const response = await editImageWithFallback({
    model: AVATAR_IMAGE_MODEL,
    image: [await toFile(baseBuffer, "avatar_base.png", { type: "image/png" })],
    prompt,
    size: "1024x1024",
    quality: "high",
    output_format: "png",
  } as Parameters<typeof openai.images.edit>[0]);
  const base64 = extractGeneratedImageBase64(response);
  if (!base64) throw new Error("Avatar mouth edit did not return an image");
  const buffer = Buffer.from(base64, "base64");
  const outputPath = path.join(tempDir, `avatar_${variant}.png`);
  await fs.writeFile(outputPath, buffer);
  await fs.writeFile(cachedPath, buffer).catch(() => {});
  return cachedPath;
}

async function linkOrCopyFile(source: string, dest: string) {
  try {
    await fs.link(source, dest);
  } catch {
    await fs.copyFile(source, dest);
  }
}

async function createTalkingAvatarVideoFromAudio(options: {
  audioPath: string;
  voice: (typeof VALID_TTS_VOICES)[number];
  gender: "male" | "female";
  baseName: string;
}) {
  const exportId = uuidv4();
  const tempDir = path.join(auditExportDir, `talk_${exportId}`);
  await fs.mkdir(tempDir, { recursive: true });

  try {
    const durationSec = await getMediaDuration(options.audioPath).catch(() => 0);
    if (!durationSec || durationSec <= 0.05) throw new Error("Translated audio duration is unavailable");
    if (durationSec > MAX_TRANSLATION_VIDEO_DURATION_SEC) {
      throw new Error(`Translation video generation currently supports up to ${Math.round(MAX_TRANSLATION_VIDEO_DURATION_SEC / 60)} minutes of audio. Shorten the transcript or download the audio only.`);
    }

    const avatarBase = await createAvatarBaseImage(tempDir, options.gender);
    const avatarMid = await createAvatarMouthVariant(tempDir, options.gender, avatarBase, "mid");
    const avatarOpen = await createAvatarMouthVariant(tempDir, options.gender, avatarBase, "open");

    // Build a tiny looping animation clip (4 frames) and loop it for the full audio duration.
    const fps = 10;
    const cycleFrames = [
      { source: avatarBase, name: "cycle_00.png" },
      { source: avatarMid, name: "cycle_01.png" },
      { source: avatarOpen, name: "cycle_02.png" },
      { source: avatarMid, name: "cycle_03.png" },
    ];
    for (const frame of cycleFrames) {
      await linkOrCopyFile(frame.source, path.join(tempDir, frame.name));
    }

    const outputFilename = `${sanitizeAuditFilenamePart(options.baseName)}-${options.voice}-${options.gender}-${exportId}.mp4`;
    const outputPath = path.join(auditExportDir, outputFilename);
    const inputPattern = path.join(tempDir, "cycle_%02d.png");
    const videoFilters = [
      "scale=1280:720:force_original_aspect_ratio=increase",
      "crop=1280:720",
      "format=yuv420p",
    ].join(",");

    const cyclePath = path.join(tempDir, "cycle.mp4");
    await execAsync(
      `ffmpeg -hide_banner -loglevel error -framerate ${fps} -start_number 0 -i "${inputPattern}" -t 1 ` +
      `-vf "${videoFilters}" -c:v libx264 -preset veryfast -crf 22 -pix_fmt yuv420p "${cyclePath}" -y`,
    );
    await execAsync(
      `ffmpeg -hide_banner -loglevel error -stream_loop -1 -i "${cyclePath}" -i "${options.audioPath}" ` +
      `-c:v libx264 -preset veryfast -crf 22 -pix_fmt yuv420p -c:a aac -b:a 128k -shortest -movflags +faststart "${outputPath}" -y`,
    );
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
    const uiLocale = getUiLocaleFromRequest(req);
    const report = await auditYoutubeVideo(req.auth!.user_id, videoUrl, { uiLocale });
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

router.post("/transcript", requireAuth, async (req, res) => {
  try {
    const plan = normalizePlan(req.auth?.plan ?? "free");
    if (plan !== "studio") {
      res.status(403).json({
        code: "STUDIO_REQUIRED",
        error: "YouTube transcript editing is available on the Studio plan.",
      });
      return;
    }
    const rateLimitOk = checkTranscriptRateLimit(req.auth!.user_id);
    if (!rateLimitOk) {
      res.status(429).json({ error: "Too many transcript requests. Please wait a moment and try again." });
      return;
    }
    const videoUrl = typeof req.body?.videoUrl === "string" ? req.body.videoUrl.trim() : "";
    if (!videoUrl) {
      res.status(400).json({ error: "A YouTube video URL is required" });
      return;
    }
    if (!isAllowedYoutubeUrl(videoUrl)) {
      res.status(400).json({ error: "Enter a valid YouTube video URL (youtube.com or youtu.be)" });
      return;
    }
    const videoId = extractYoutubeVideoId(videoUrl);
    if (!videoId) {
      res.status(400).json({ error: "Enter a valid YouTube video URL" });
      return;
    }

    const preferredLanguage = getUiLocaleFromRequest(req);
    const cacheKey = transcriptCacheKey(videoId, preferredLanguage);
    type EditableTranscript = Awaited<ReturnType<typeof getYoutubeEditableTranscript>>;
    const emptyEditableTranscript = (): EditableTranscript => ({
      videoId,
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
      captions: {
        available: false,
        downloadable: false,
        source: null,
        language: null,
        languages: [],
      },
      transcript: {
        available: false,
        source: null,
        language: null,
        text: null,
        segments: [],
      },
      needsUploadFallback: false,
    });

    const cached = await readCachedYoutubeTranscript(cacheKey);
    if (cached?.status === "complete") {
      const transcript = cached.transcript;
      const isCaption = transcript.source === "youtube_caption";
      const editableTranscript = {
        videoId,
        canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
        captions: {
          available: isCaption,
          downloadable: isCaption,
          source: transcript.captionType === "manual" ? "manual" : transcript.captionType === "auto" ? "auto" : null,
          language: transcript.language,
          languages: transcript.language ? [transcript.language] : [],
        },
        transcript: {
          available: true,
          source:
            transcript.captionType === "manual"
              ? "manual"
              : transcript.captionType === "auto"
                ? "auto"
                : "transcribed_audio",
          language: transcript.language,
          text: transcript.text,
          segments: transcript.segments,
        },
        needsUploadFallback: false,
      };
      res.json({ editableTranscript, transcriptResult: transcript, status: { state: "complete", message: "Transcript ready." } });
      return;
    }

    if (cached?.status === "processing") {
      let editableTranscript = emptyEditableTranscript();
      try {
        editableTranscript = await withTimeout(
          getYoutubeEditableTranscript(videoUrl, { preferredLanguages: [preferredLanguage, "en"] }),
          20_000,
          "Checking YouTube captions",
        );
      } catch (err) {
        req.log.warn({ err, videoId }, "YouTube caption check failed while transcript job is processing");
      }
      editableTranscript.needsUploadFallback = false;
      res.json({ editableTranscript, status: { state: "processing", message: cached.step } });
      return;
    }

    if (cached?.status === "error") {
      let editableTranscript = emptyEditableTranscript();
      try {
        editableTranscript = await withTimeout(
          getYoutubeEditableTranscript(videoUrl, { preferredLanguages: [preferredLanguage, "en"] }),
          20_000,
          "Checking YouTube captions",
        );
      } catch (err) {
        req.log.warn({ err, videoId }, "YouTube caption check failed while returning transcript job error");
      }
      editableTranscript.needsUploadFallback = false;
      res.json({ editableTranscript, status: { state: "error", message: cached.message } });
      return;
    }

    // 1) Try YouTube captions first (manual or auto), with language preference.
    let editableTranscript = emptyEditableTranscript();
    try {
      editableTranscript = await withTimeout(
        getYoutubeEditableTranscript(videoUrl, { preferredLanguages: [preferredLanguage, "en"] }),
        20_000,
        "Checking YouTube captions",
      );
    } catch (err) {
      req.log.warn({ err, videoId }, "YouTube caption extraction failed; falling back to audio transcription");
    }

    if (editableTranscript.transcript.available && editableTranscript.transcript.text) {
      const now = new Date();
      const ttlMs = Math.max(1, YOUTUBE_TRANSCRIPT_CACHE_TTL_DAYS) * 24 * 60 * 60_000;
      const transcriptResult = {
        source: "youtube_caption" as const,
        captionType: editableTranscript.transcript.source === "auto" ? "auto" as const : "manual" as const,
        language: editableTranscript.transcript.language,
        text: editableTranscript.transcript.text,
        segments: editableTranscript.transcript.segments,
      };
      const payload: CachedYoutubeTranscriptPayload = {
        kind: "youtubeTranscriptV1",
        status: "complete",
        preferredLanguage,
        transcript: {
          ...transcriptResult,
        },
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
      await writeCachedYoutubeTranscript(cacheKey, payload, ttlMs).catch(() => {});
      res.json({ editableTranscript, transcriptResult, status: { state: "complete", message: "Transcript ready." } });
      return;
    }

    const shouldAutoTranscribe = req.body?.autoTranscribe !== false;
    if (!shouldAutoTranscribe) {
      res.json({ editableTranscript, status: { state: "complete", message: "Checking YouTube captions..." } });
      return;
    }

    // 2) Captions missing/restricted: fall back to audio transcription automatically.
    const info = await getYtDlpInfo(editableTranscript.canonicalUrl, req.log).catch((err) => {
      req.log.warn({ err, videoId, canonicalUrl: editableTranscript.canonicalUrl }, "yt-dlp probe failed");
      return null;
    });
    const durationSec = info?.durationSec ?? 0;
    const isLive = Boolean(info?.isLive);

    if (isLive) {
      res.status(422).json({ error: "We couldn’t access captions or audio for this video. This can happen with live streams. Please upload the video/audio file to generate a transcript." });
      return;
    }
    if (durationSec > 0 && durationSec > YOUTUBE_TRANSCRIPT_MAX_DURATION_SEC) {
      res.status(422).json({ error: "This video is too long to auto-transcribe. Please upload a shorter audio/video file to generate a transcript." });
      return;
    }

    const initialStep = editableTranscript.captions.available && !editableTranscript.captions.downloadable
      ? "Captions are restricted, generating transcript from audio..."
      : "Generating transcript from audio...";

    if (durationSec > 0 && durationSec > YOUTUBE_AUDIO_FALLBACK_SYNC_MAX_DURATION_SEC) {
      const acquired = await tryAcquireTranscriptProcessingLock(cacheKey, preferredLanguage, initialStep);
      if (acquired && !runningTranscriptTasks.has(cacheKey)) {
        const task = (async () => {
          try {
            await updateTranscriptProcessingStep(cacheKey, preferredLanguage, initialStep);
            await updateTranscriptProcessingStep(cacheKey, preferredLanguage, "Transcribing audio...");
            const fallback = await transcribeYoutubeAudioFallback(editableTranscript.canonicalUrl, req.log);
            const text = (fallback.text || "").trim();
            if (!text) throw new Error("Empty transcript");
            const now = new Date();
            const ttlMs = Math.max(1, YOUTUBE_TRANSCRIPT_CACHE_TTL_DAYS) * 24 * 60 * 60_000;
            const payload: CachedYoutubeTranscriptPayload = {
              kind: "youtubeTranscriptV1",
              status: "complete",
              preferredLanguage,
              transcript: {
                source: "audio_transcription",
                captionType: "generated",
                language: null,
                text,
                segments: normalizeAuditTranscriptSegments(fallback.segments),
              },
              createdAt: now.toISOString(),
              updatedAt: now.toISOString(),
            };
            await writeCachedYoutubeTranscript(cacheKey, payload, ttlMs);
          } catch (err) {
            req.log.warn({ err, videoId, cacheKey }, "Background YouTube audio transcription failed");
            const now = new Date();
            const payload: CachedYoutubeTranscriptPayload = {
              kind: "youtubeTranscriptV1",
              status: "error",
              preferredLanguage,
              message:
                "We couldn’t access captions or audio for this video. This can happen with private, age-restricted, region-locked, or protected videos. Please upload the video/audio file to generate a transcript.",
              failedAt: now.toISOString(),
              updatedAt: now.toISOString(),
            };
            await writeCachedYoutubeTranscript(cacheKey, payload, 10 * 60_000).catch(() => {});
          } finally {
            runningTranscriptTasks.delete(cacheKey);
          }
        })();
        runningTranscriptTasks.set(cacheKey, task);
      }

      editableTranscript.needsUploadFallback = false;
      res.json({ editableTranscript, status: { state: "processing", message: initialStep } });
      return;
    }

    try {
      const fallback = await transcribeYoutubeAudioFallback(editableTranscript.canonicalUrl, req.log);
      const text = (fallback.text || "").trim();
      if (!text) {
        res.status(422).json({ error: "Could not detect speech in this video’s audio. Please upload the video/audio file to generate a transcript." });
        return;
      }
      editableTranscript.transcript = {
        available: true,
        source: "transcribed_audio",
        language: null,
        text,
        segments: normalizeAuditTranscriptSegments(fallback.segments),
      };
      editableTranscript.needsUploadFallback = false;

      const now = new Date();
      const ttlMs = Math.max(1, YOUTUBE_TRANSCRIPT_CACHE_TTL_DAYS) * 24 * 60 * 60_000;
      const transcriptResult = {
        source: "audio_transcription" as const,
        captionType: "generated" as const,
        language: null,
        text,
        segments: editableTranscript.transcript.segments,
      };
      const payload: CachedYoutubeTranscriptPayload = {
        kind: "youtubeTranscriptV1",
        status: "complete",
        preferredLanguage,
        transcript: {
          ...transcriptResult,
        },
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
      await writeCachedYoutubeTranscript(cacheKey, payload, ttlMs).catch(() => {});
      res.json({ editableTranscript, transcriptResult, status: { state: "complete", message: "Transcript ready." } });
      return;
    } catch (err) {
      req.log.warn({ err, videoId }, "YouTube transcript audio fallback failed");
      res.status(422).json({
        error:
          "We couldn’t access captions or audio for this video. This can happen with private, age-restricted, region-locked, or protected videos. Please upload the video/audio file to generate a transcript.",
      });
      return;
    }
  } catch (err) {
    req.log.error({ err }, "YouTube transcript fetch error");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch YouTube transcript" });
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
          source: "transcribed_audio",
          language: null,
          segments: transcript.segments,
        },
      });
      res.json({
        report,
        transcript: {
          available: true,
          source: "transcribed_audio",
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

router.post("/transcript-transcribe", requireAuth, (req, res) => {
  auditMediaUpload.single("media")(req, res, async (multerErr) => {
    let uploadedPath: string | null = null;
    let audioPath: string | null = null;
    try {
      const plan = normalizePlan(req.auth?.plan ?? "free");
      if (plan !== "studio") {
        res.status(403).json({
          code: "STUDIO_REQUIRED",
          error: "YouTube transcript editing is available on the Studio plan.",
        });
        return;
      }
      if (multerErr) {
        res.status(400).json({ error: multerErr.message ?? "File upload error" });
        return;
      }
      const file = req.file;
      uploadedPath = file?.path ?? null;
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

      res.json({
        transcript: {
          available: true,
          source: "transcribed_audio",
          language: null,
          text,
          segments: transcript.segments,
        },
      });
    } catch (err) {
      req.log.error({ err }, "YouTube transcript transcribe error");
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed to generate transcript" });
    } finally {
      if (uploadedPath) await fs.unlink(uploadedPath).catch(() => {});
      if (audioPath) await fs.unlink(audioPath).catch(() => {});
    }
  });
});

router.post("/transcript-translate", requireAuth, async (req, res) => {
  try {
    const plan = normalizePlan(req.auth?.plan ?? "free");
    if (plan !== "studio") {
      res.status(403).json({
        code: "STUDIO_REQUIRED",
        error: "YouTube transcript translation is available on the Studio plan.",
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
    req.log.error({ err }, "YouTube transcript translation error");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to translate transcript" });
  }
});

router.post("/transcript-translation-audio", requireAuth, async (req, res) => {
  try {
    const plan = normalizePlan(req.auth?.plan ?? "free");
    if (plan !== "studio") {
      res.status(403).json({
        code: "STUDIO_REQUIRED",
        error: "YouTube transcript translation audio is available on the Studio plan.",
      });
      return;
    }
    const voice = typeof req.body?.voice === "string" ? req.body.voice.trim() : "";
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "youtube-transcript";
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
    req.log.error({ err }, "YouTube transcript translation audio error");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to generate translation audio" });
  }
});

router.post("/transcript-translation-video", requireAuth, async (req, res) => {
  try {
    const plan = normalizePlan(req.auth?.plan ?? "free");
    if (plan !== "studio") {
      res.status(403).json({
        code: "STUDIO_REQUIRED",
        error: "YouTube transcript translation video is available on the Studio plan.",
      });
      return;
    }
    const voice = typeof req.body?.voice === "string" ? req.body.voice.trim() : "";
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "youtube-transcript";
    const targetLanguage = typeof req.body?.targetLanguage === "string" ? req.body.targetLanguage.trim() : "translated";
    const audioFilename = typeof req.body?.audioFilename === "string" ? req.body.audioFilename.trim() : "";
    const requestedGender = typeof req.body?.gender === "string" ? req.body.gender.trim().toLowerCase() : "";
    if (!VALID_TTS_VOICES.includes(voice as (typeof VALID_TTS_VOICES)[number])) {
      res.status(400).json({ error: "Choose a valid OpenAI voice." });
      return;
    }
    if (!audioFilename || audioFilename.includes("..") || audioFilename.includes("/") || audioFilename.includes("\\")) {
      res.status(400).json({ error: "A valid translation audio file is required before generating video." });
      return;
    }
    const audioPath = path.join(auditExportDir, audioFilename);
    try {
      await fs.access(audioPath);
    } catch {
      res.status(404).json({ error: "Translation audio file not found or has expired. Generate audio again." });
      return;
    }
    const gender: "male" | "female" =
      requestedGender === "female" || requestedGender === "male"
        ? (requestedGender as "male" | "female")
        : (TTS_VOICE_GENDER[voice as (typeof VALID_TTS_VOICES)[number]] ?? "male");

    const baseName = `${title}-${targetLanguage}`;
    const { outputFilename } = await createTalkingAvatarVideoFromAudio({
      audioPath,
      voice: voice as (typeof VALID_TTS_VOICES)[number],
      gender,
      baseName,
    });
    res.json({
      filename: outputFilename,
      downloadUrl: `/api/youtube/audit-download/${encodeURIComponent(outputFilename)}`,
      voice,
      gender,
    });
  } catch (err) {
    req.log.error({ err }, "YouTube transcript translation video error");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to generate translation video" });
  }
});

router.post("/transcript-translation-video-direct", requireAuth, async (req, res) => {
  try {
    const plan = normalizePlan(req.auth?.plan ?? "free");
    if (plan !== "studio") {
      res.status(403).json({
        code: "STUDIO_REQUIRED",
        error: "YouTube transcript translation video is available on the Studio plan.",
      });
      return;
    }
    const voice = typeof req.body?.voice === "string" ? req.body.voice.trim() : "";
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "youtube-transcript";
    const targetLanguage = typeof req.body?.targetLanguage === "string" ? req.body.targetLanguage.trim() : "translated";
    const requestedGender = typeof req.body?.gender === "string" ? req.body.gender.trim().toLowerCase() : "";
    const segments = normalizeAuditTranscriptSegments(req.body?.segments);
    if (!VALID_TTS_VOICES.includes(voice as (typeof VALID_TTS_VOICES)[number])) {
      res.status(400).json({ error: "Choose a valid OpenAI voice." });
      return;
    }
    if (!segments.length) {
      res.status(400).json({ error: "A translated timestamped transcript is required before generating video." });
      return;
    }
    const gender: "male" | "female" =
      requestedGender === "female" || requestedGender === "male"
        ? (requestedGender as "male" | "female")
        : (TTS_VOICE_GENDER[voice as (typeof VALID_TTS_VOICES)[number]] ?? "male");

    const baseName = `${title}-${targetLanguage}`;
    const { outputFilename: audioFilename, outputPath: audioPath } = await createAlignedTranslationAudio(
      segments,
      voice as (typeof VALID_TTS_VOICES)[number],
      baseName,
    );
    const { outputFilename: videoFilename } = await createTalkingAvatarVideoFromAudio({
      audioPath,
      voice: voice as (typeof VALID_TTS_VOICES)[number],
      gender,
      baseName,
    });

    res.json({
      audio: {
        filename: audioFilename,
        downloadUrl: `/api/youtube/audit-download/${encodeURIComponent(audioFilename)}`,
      },
      video: {
        filename: videoFilename,
        downloadUrl: `/api/youtube/audit-download/${encodeURIComponent(videoFilename)}`,
      },
      voice,
      gender,
    });
  } catch (err) {
    req.log.error({ err }, "YouTube transcript direct translation video error");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to generate translation video" });
  }
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

router.post("/audit-translation-video", requireAuth, async (req, res) => {
  try {
    const plan = normalizePlan(req.auth?.plan ?? "free");
    if (plan !== "studio") {
      res.status(403).json({
        code: "STUDIO_REQUIRED",
        error: "YouTube audit translation video is available on the Studio plan.",
      });
      return;
    }
    const voice = typeof req.body?.voice === "string" ? req.body.voice.trim() : "";
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "youtube-audit";
    const targetLanguage = typeof req.body?.targetLanguage === "string" ? req.body.targetLanguage.trim() : "translated";
    const audioFilename = typeof req.body?.audioFilename === "string" ? req.body.audioFilename.trim() : "";
    const requestedGender = typeof req.body?.gender === "string" ? req.body.gender.trim().toLowerCase() : "";
    if (!VALID_TTS_VOICES.includes(voice as (typeof VALID_TTS_VOICES)[number])) {
      res.status(400).json({ error: "Choose a valid OpenAI voice." });
      return;
    }
    if (!audioFilename || audioFilename.includes("..") || audioFilename.includes("/") || audioFilename.includes("\\")) {
      res.status(400).json({ error: "A valid translation audio file is required before generating video." });
      return;
    }
    const audioPath = path.join(auditExportDir, audioFilename);
    try {
      await fs.access(audioPath);
    } catch {
      res.status(404).json({ error: "Translation audio file not found or has expired. Generate audio again." });
      return;
    }
    const gender: "male" | "female" =
      requestedGender === "female" || requestedGender === "male"
        ? (requestedGender as "male" | "female")
        : (TTS_VOICE_GENDER[voice as (typeof VALID_TTS_VOICES)[number]] ?? "male");

    const baseName = `${title}-${targetLanguage}`;
    const { outputFilename } = await createTalkingAvatarVideoFromAudio({
      audioPath,
      voice: voice as (typeof VALID_TTS_VOICES)[number],
      gender,
      baseName,
    });
    res.json({
      filename: outputFilename,
      downloadUrl: `/api/youtube/audit-download/${encodeURIComponent(outputFilename)}`,
      voice,
      gender,
    });
  } catch (err) {
    req.log.error({ err }, "YouTube audit translation video error");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to generate translation video" });
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
    const filenameParam = req.params.filename;
    const filename = Array.isArray(filenameParam) ? (filenameParam[0] ?? "") : (filenameParam ?? "");
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
    res.setHeader("Content-Type", filename.endsWith(".mp3")
      ? "audio/mpeg"
      : filename.endsWith(".mp4")
        ? "video/mp4"
        : "application/octet-stream");
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
    const uiLocale = getUiLocaleFromRequest(req);
    const plan = await generateYoutubeWeeklyPlan(req.auth!.user_id, { uiLocale });
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
    const uiLocale = getUiLocaleFromRequest(req);
    const improved = await improveYoutubeIdea(req.auth!.user_id, idea, { uiLocale });
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
