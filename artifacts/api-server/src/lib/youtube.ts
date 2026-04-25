import crypto from "crypto";
import jwt from "jsonwebtoken";
import { toFile } from "openai";
import { OAuth2Client } from "google-auth-library";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import {
  db,
  youtubeApiCacheTable,
  youtubeChannelProfilesTable,
  youtubeCompetitorsTable,
  youtubeConnectionsTable,
  youtubePlanResultsTable,
  youtubeWeeklyPlansTable,
  type YoutubeConnection,
} from "@workspace/db";
import { openai } from "./openai";
import { logTokenUsage, usageTokens } from "./logTokens";
import { analyzeVisuals, generateSeo } from "../routes/analysis/services";

const JWT_SECRET = process.env.JWT_SECRET!;
const YOUTUBE_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "";
const YOUTUBE_CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || "";
const CORE_APP_URL = process.env.CORE_APP_URL || "/panel/";
const CANONICAL_APP_ORIGIN = (
  process.env.APP_URL ||
  process.env.BASE_URL ||
  process.env.NEXT_PUBLIC_URL ||
  "https://daytabs.com"
).replace(/\/$/, "");
const YOUTUBE_CALLBACK_PATH = "/api/youtube/callback";
const YOUTUBE_DAILY_QUOTA_LIMIT = Number(process.env.YOUTUBE_DAILY_QUOTA_LIMIT || 10000);
const YOUTUBE_QUOTA_CACHE_THRESHOLD = Number(process.env.YOUTUBE_QUOTA_CACHE_THRESHOLD || 0.9);
const YOUTUBE_THUMBNAIL_WIDTH = 1280;
const YOUTUBE_THUMBNAIL_HEIGHT = 720;
const YOUTUBE_THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;

export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
];

type JsonRecord = Record<string, unknown>;

export interface YoutubeRecentVideo {
  id: string;
  title: string;
  description: string;
  tags: string[];
  publishedAt: string | null;
  visibility?: string | null;
  duration: string | null;
  viewCount: string | null;
  likeCount: string | null;
  commentCount: string | null;
  thumbnailUrl?: string | null;
  channelId?: string | null;
  channelTitle?: string | null;
  url: string;
}

export interface YoutubeNicheProfile {
  niche: string;
  contentStyle: string;
  tone: string;
  targetAudience: string;
  keywords: string[];
  summary: string;
}

export interface YoutubeVideoAuditReport {
  summary: string;
  video: {
    id: string;
    title: string;
    channelName: string;
    channelId: string | null;
    publishedAt: string | null;
    duration: string | null;
    viewCount: number;
    likeCount: number;
    commentCount: number;
    tags: string[];
    description: string;
    thumbnailUrl: string | null;
    niche: string;
    contentStyle: string;
    targetAudience: string;
    likelyFormat: string;
  };
  performanceContext: {
    ageDays: number | null;
    viewsPerDay: number | null;
    channelMedianViews: number | null;
    competitorMedianViews: number | null;
  };
  topCreators: Array<{
    channelName: string;
    subscriberCount: number;
    averageViews: number;
    whyTheyMatter: string;
  }>;
  competitorExamples: Array<{
    title: string;
    channelName: string;
    url: string;
    viewCount: number;
    whyItWins: string;
  }>;
  visualAudit: {
    overallScore: number;
    topFix: string;
    lighting: string;
    framing: string;
    sharpness: string;
  } | null;
  diagnosis: Array<{
    area: string;
    issue: string;
    whyItHurts: string;
    confidence: "high" | "medium" | "low";
  }>;
  fixes: {
    titles: string[];
    description: string;
    tags: string[];
    thumbnailIdea: string;
    hookRewrite: string;
    scriptDirection: string;
    qualityFixes: string[];
    packagingStrategy: string;
  };
  limitations: string[];
}

interface YoutubeSettings {
  preferredPostsPerWeek: number;
  connectedAt: string | null;
  needsPostingPreference: boolean;
}

type CompetitorSource = "manual" | "discovered";

interface StoredCompetitorMeta {
  source: CompetitorSource;
  nicheLabel?: string;
  reportSummary?: string;
  addedFromUrl?: string | null;
}

type IdeaOrigin = "ai" | "manual";
type IdeaFeedback = "liked" | "disliked" | null;
type SignalSource = "performance" | "feedback" | "competitor" | "trend" | "channel_gap" | "low_signal";
type PlanDayPatch = Partial<{
  date: string;
  stage: string;
  contentIdea: string;
  hook: string;
  outline: string[];
  bestPostingTime: string;
  rationale: string;
  tags: string[];
  soundSuggestion: string;
  competitorReference: string;
  descriptionSuggestion: string;
  thumbnailConcept: string;
  ideaOrigin: IdeaOrigin;
  aiFeedback: IdeaFeedback;
  isDeleted: boolean;
  deletedAt: string | null;
  generatedThumbnail: JsonRecord | null;
}>;

interface GeneratedThumbnailRecord {
  imageDataUrl: string;
  prompt: string;
  requestedText: string | null;
  preserveUploadedImage?: boolean;
  createdAt: string;
}

interface StoredLikedIdeaFeedback {
  topic: string;
  format: string;
  signalSource: string;
}

interface StoredDislikedIdeaFeedback {
  titleConcept: string;
  format: string;
}

interface StoredDeletedIdeaFeedback {
  concept: string;
  reason: string;
}

interface StoredIdeaFeedbackSummary {
  liked: StoredLikedIdeaFeedback[];
  disliked: StoredDislikedIdeaFeedback[];
  deleted: StoredDeletedIdeaFeedback[];
}

interface PreviousPerformanceResultPayload {
  plannedTitle: string;
  videoUrl: string;
  videoId: string;
  fetchedAt: string | null;
  publishedAt: string | null;
  publishedDay: string | null;
  metrics: JsonRecord;
  channelAverages: {
    ctr: number | null;
    views: number | null;
    watchTime: number | null;
  };
  linkedIdeaFeedback: {
    aiFeedback: IdeaFeedback;
    wasDeleted: boolean;
  };
  ideaFeedbackSummary: StoredIdeaFeedbackSummary;
}

interface YoutubeAnalyticsPoint {
  date: string;
  views: number;
  subscribersGained: number;
  subscribersLost: number;
  subscribersNet: number;
  estimatedMinutesWatched: number;
  averageViewDuration: number;
}

interface PerformanceSignalSummary {
  bestPostingTime: {
    label: string;
    averageViews: number;
    percentAboveChannelAverage: number;
    sampleVideos: Array<{ title: string; viewCount: number; publishedAt: string | null }>;
  } | null;
  bestPostingTimeByDay: Array<{
    day: string;
    slotLabel: string;
    suggestedTime: string;
    averageViews: number;
  }>;
  hookInsight: {
    bestType: string;
    averageViews: number;
    evidenceVideos: Array<{ title: string; viewCount: number }>;
    analysis: string;
    nextHookSuggestions: string[];
  } | null;
  titleLengthInsight: {
    winningBucket: string;
    min: number;
    max: number;
    averageViews: number;
    percentAboveChannelAverage: number;
    topPerformers: Array<{ title: string; views: number; titleLength: number }>;
    bottomPerformers: Array<{ title: string; views: number; titleLength: number }>;
  } | null;
  tagInsight: {
    topPerformingTags: Array<{ tag: string; averageViews: number; relativeToMedian: "above" | "neutral" | "below" }>;
    trendingTags: Array<{ tag: string; signal: number; why: string }>;
  };
  subscriberSpike: {
    date: string;
    subscribersNet: number;
    videoTitle: string;
    contentType: string;
    hookStyle: string;
    implication: string;
  } | null;
  competitorGap: {
    channelName: string;
    averageViews: number;
    videosPerWeek: string;
    contentDriver: string;
    hookStyle: string;
    recommendation: string;
  } | null;
  tier1CompetitorPatterns: Array<{
    channelName: string;
    subscriberCount: number;
    averageViews: number;
    contentType: string;
    hookStyle: string;
    exampleTitles: string[];
  }>;
  linkedVideoPerformance: Array<{
    plannedTitle: string;
    videoUrl: string;
    metrics: JsonRecord;
  }>;
}

function getCoreAppPath(): string {
  try {
    const url = new URL(CORE_APP_URL);
    return `${url.pathname}${url.search}${url.hash}` || "/panel/";
  } catch {
    return CORE_APP_URL || "/panel/";
  }
}

function appendRedirectParam(path: string, key: string, value: string): string {
  const url = new URL(path, "https://daytabs.local");
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function getYoutubeRedirectUri(req: import("express").Request): string {
  const configured = process.env.YOUTUBE_REDIRECT_URI?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") return `${CANONICAL_APP_ORIGIN}${YOUTUBE_CALLBACK_PATH}`;
  const forwarded = req.get("x-forwarded-host");
  const base = forwarded
    ? `${req.get("x-forwarded-proto") || "https"}://${forwarded}`
    : `${req.protocol}://${req.get("host")}`;
  return `${base}${YOUTUBE_CALLBACK_PATH}`;
}

export function getYoutubeAppRedirect(value: "connected" | "error", detail?: string) {
  let path = appendRedirectParam(getCoreAppPath(), "youtube", value);
  if (detail) path = appendRedirectParam(path, value === "error" ? "error" : "detail", detail);
  return path;
}

export function createYoutubeAuthUrl(req: import("express").Request, userId: number) {
  if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET) {
    throw new Error("Google OAuth is not configured");
  }
  const client = new OAuth2Client(YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, getYoutubeRedirectUri(req));
  const state = jwt.sign({ user_id: userId, purpose: "youtube_connect" }, JWT_SECRET, { expiresIn: "15m" });
  return client.generateAuthUrl({
    access_type: "offline",
    include_granted_scopes: true,
    prompt: "consent",
    scope: YOUTUBE_SCOPES,
    state,
  });
}

function encryptionKey() {
  return crypto.createHash("sha256").update(process.env.TOKEN_ENCRYPTION_KEY || JWT_SECRET).digest();
}

function encryptToken(token: string | null | undefined) {
  if (!token) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${encrypted.toString("base64")}`;
}

function decryptToken(value: string | null | undefined) {
  if (!value) return null;
  if (!value.startsWith("v1:")) return value;
  const [, iv, tag, encrypted] = value.split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : value == null ? null : String(value);
}

function readCompetitorMeta(value: unknown): StoredCompetitorMeta {
  const raw = asString(value);
  if (!raw) return { source: "discovered" };
  try {
    const parsed = JSON.parse(raw) as StoredCompetitorMeta;
    return {
      source: parsed.source === "manual" ? "manual" : "discovered",
      nicheLabel: asString(parsed.nicheLabel) || undefined,
      reportSummary: asString(parsed.reportSummary) || undefined,
      addedFromUrl: asString(parsed.addedFromUrl),
    };
  } catch {
    return {
      source: "discovered",
      nicheLabel: raw,
    };
  }
}

function serializeCompetitorMeta(meta: StoredCompetitorMeta) {
  return JSON.stringify({
    source: meta.source === "manual" ? "manual" : "discovered",
    nicheLabel: meta.nicheLabel || "",
    reportSummary: meta.reportSummary || "",
    addedFromUrl: meta.addedFromUrl || null,
  });
}

function extractJSON(raw: string): string {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON found in response");
  return raw.slice(start, end + 1);
}

function parseNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseYoutubeIsoDuration(value?: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const match = raw.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (!match) return 0;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  return (hours * 3600) + (minutes * 60) + seconds;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR_BUCKETS = [
  { label: "00:00-06:00", start: 0, end: 6 },
  { label: "06:00-12:00", start: 6, end: 12 },
  { label: "12:00-18:00", start: 12, end: 18 },
  { label: "18:00-24:00", start: 18, end: 24 },
] as const;

function hookType(title: string) {
  const trimmed = title.trim();
  const lower = trimmed.toLowerCase();
  if (trimmed.endsWith("?")) return "Question";
  if (/^(will|can|what|why|how)\b/i.test(trimmed)) return "Curiosity";
  if (/\b(lowest|anxiety|feel|story|struggle|fear|confession|healing|burnout|overwhelmed)\b/i.test(lower)) return "Emotional";
  return "Descriptive";
}

function contentTypeFromText(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes("tutorial") || lower.includes("step") || lower.includes("how to")) return "tutorial";
  if (lower.includes("process") || lower.includes("paint") || lower.includes("draw with me")) return "process";
  if (lower.includes("?") || lower.includes("what if") || lower.includes("will ") || lower.includes("can ")) return "curiosity-led";
  return "emotional storytelling";
}

function parseVideosPerWeekLabel(label?: string | null) {
  const value = Number(label?.match(/([\d.]+)\s+videos\/week/i)?.[1] ?? 0);
  if (!value) return "n/a";
  const rounded = Math.round(value * 2) / 2;
  if (Number.isInteger(rounded)) return `${rounded} videos/week`;
  return `${rounded} videos/week`;
}

function safePercent(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

function bucketTimeLabel(label: string) {
  if (label === "00:00-06:00") return { slotLabel: "00:00-06:00", suggestedTime: "03:00" };
  if (label === "06:00-12:00") return { slotLabel: "06:00-12:00", suggestedTime: "09:00" };
  if (label === "12:00-18:00") return { slotLabel: "12:00-18:00", suggestedTime: "15:00" };
  return { slotLabel: "18:00-24:00", suggestedTime: "20:00" };
}

function normalizeTitleToRange(title: string, min: number, max: number) {
  const trimmed = title.trim();
  if (!trimmed) return trimmed;
  if (trimmed.length > max) {
    const sliced = trimmed.slice(0, max + 1);
    const withoutPartial = sliced.includes(" ") ? sliced.slice(0, sliced.lastIndexOf(" ")) : sliced.slice(0, max);
    return withoutPartial.trim().replace(/[.,:;!?-]+$/, "");
  }
  if (trimmed.length >= min) return trimmed;
  if (trimmed.length < min && trimmed.length <= max - 10) {
    const extended = `${trimmed} tutorial`;
    return extended.length <= max ? extended : trimmed;
  }
  return trimmed;
}

function getDayNameForIso(iso: string) {
  const date = new Date(`${iso}T00:00:00Z`);
  return DAYS_OF_WEEK[date.getUTCDay()] ?? "Mon";
}

function median(numbers: number[]) {
  const valid = numbers.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!valid.length) return null;
  const middle = Math.floor(valid.length / 2);
  if (valid.length % 2 === 1) return valid[middle] ?? null;
  return Math.round(((valid[middle - 1] ?? 0) + (valid[middle] ?? 0)) / 2);
}

function daysSince(iso?: string | null) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const diff = Date.now() - date.getTime();
  return Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24)));
}

function selectBestPostingSlotByDay(videos: YoutubeRecentVideo[]) {
  const byDay = new Map<string, Array<{ label: string; avg: number }>>();
  for (const day of DAYS_OF_WEEK) {
    byDay.set(day, HOUR_BUCKETS.map((bucket) => ({ label: bucket.label, avg: 0 })));
  }
  const matrix = new Map<string, { totalViews: number; count: number }>();
  for (const day of DAYS_OF_WEEK) {
    for (const bucket of HOUR_BUCKETS) {
      matrix.set(`${day}-${bucket.label}`, { totalViews: 0, count: 0 });
    }
  }
  for (const video of videos) {
    if (!video.publishedAt) continue;
    const published = new Date(video.publishedAt);
    if (Number.isNaN(published.getTime())) continue;
    const day = DAYS_OF_WEEK[published.getUTCDay()];
    const bucket = HOUR_BUCKETS.find((item) => published.getUTCHours() >= item.start && published.getUTCHours() < item.end);
    if (!bucket) continue;
    const key = `${day}-${bucket.label}`;
    const cell = matrix.get(key);
    if (!cell) continue;
    cell.totalViews += parseNumber(video.viewCount);
    cell.count += 1;
  }
  return DAYS_OF_WEEK.map((day) => {
    const options = HOUR_BUCKETS.map((bucket) => {
      const stats = matrix.get(`${day}-${bucket.label}`);
      const averageViews = stats?.count ? Math.round(stats.totalViews / stats.count) : 0;
      const { slotLabel, suggestedTime } = bucketTimeLabel(bucket.label);
      return { day, slotLabel, suggestedTime, averageViews };
    });
    return options.sort((a, b) => b.averageViews - a.averageViews)[0] ?? { day, slotLabel: "18:00-24:00", suggestedTime: "20:00", averageViews: 0 };
  });
}

function parsePlanDayIndex(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeIdeaOrigin(value: unknown): IdeaOrigin {
  return value === "manual" ? "manual" : "ai";
}

function normalizeIdeaFeedback(value: unknown): IdeaFeedback {
  return value === "liked" || value === "disliked" ? value : null;
}

function asPlanDays(value: unknown[]) {
  return value.map((item) => asRecord(item));
}

function normalizePlanDayRecord(day: JsonRecord, fallbackIndex: number) {
  const generatedThumbnail = asRecord(day.generatedThumbnail);
  const imageDataUrl = asString(generatedThumbnail.imageDataUrl);
  return {
    ...day,
    day: parsePlanDayIndex(day.day, fallbackIndex),
    date: asString(day.date) || isoDate(new Date()),
    stage: asString(day.stage) || "idea",
    contentIdea: asString(day.contentIdea) || `Week ${fallbackIndex} YouTube idea`,
    hook: asString(day.hook) || asString(day.contentIdea) || `Week ${fallbackIndex} YouTube idea`,
    outline: asArray(day.outline).map((item) => String(item)).filter(Boolean).slice(0, 6),
    bestPostingTime: asString(day.bestPostingTime) || "",
    rationale: asString(day.rationale) || "",
    tags: asArray(day.tags).map((item) => String(item)).filter(Boolean).slice(0, 8),
    soundSuggestion: asString(day.soundSuggestion) || "",
    competitorReference: asString(day.competitorReference) || "",
    descriptionSuggestion: asString(day.descriptionSuggestion) || "",
    thumbnailConcept: asString(day.thumbnailConcept) || "",
    ideaOrigin: normalizeIdeaOrigin(day.ideaOrigin),
    aiFeedback: normalizeIdeaFeedback(day.aiFeedback),
    isDeleted: Boolean(day.isDeleted),
    deletedAt: asString(day.deletedAt),
    generatedThumbnail: imageDataUrl ? {
      imageDataUrl,
      prompt: asString(generatedThumbnail.prompt) || "",
      requestedText: asString(generatedThumbnail.requestedText),
      preserveUploadedImage: Boolean(generatedThumbnail.preserveUploadedImage),
      createdAt: asString(generatedThumbnail.createdAt) || new Date().toISOString(),
    } satisfies GeneratedThumbnailRecord : null,
  };
}

function sanitizeSourceImageDataUrls(value: unknown) {
  return asArray(value)
    .map((item) => asString(item)?.trim() || "")
    .filter((item) => {
      const match = item.match(/^data:image\/(?:jpeg|jpg);base64,(.+)$/i);
      if (!match) return false;
      return Buffer.from(match[1], "base64").byteLength <= YOUTUBE_THUMBNAIL_MAX_BYTES;
    })
    .slice(0, 4);
}

function dataUrlToImageFile(dataUrl: string, index: number) {
  const match = dataUrl.match(/^data:(image\/(?:jpeg|jpg));base64,(.+)$/i);
  if (!match) throw new Error("Source images must be JPG thumbnails under 2 MB");
  const mimeType = match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase();
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.byteLength > YOUTUBE_THUMBNAIL_MAX_BYTES) {
    throw new Error("Source images must be 2 MB or smaller");
  }
  return toFile(buffer, `source-${index + 1}.jpg`, { type: mimeType });
}

async function buildYoutubeThumbnailPrompt(
  userId: number,
  payload: {
    title: string;
    description: string;
    tags: string[];
    textPreference: string | null;
    sourceImages: string[];
    preserveUploadedImage: boolean;
  },
) {
  const hasSourceImages = payload.sourceImages.length > 0;
  const shouldPreserveImage = hasSourceImages && payload.preserveUploadedImage;
  const userContent: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [
    {
      type: "text",
      text: `Title: ${payload.title}
Description: ${payload.description}
Tags: ${payload.tags.join(", ")}
User Text Preference: ${payload.textPreference?.trim() || "auto-generate"}
Image Inputs: ${hasSourceImages ? `The attached ${payload.sourceImages.length} source image(s) are provided by the user.` : "No source images provided."}`,
    },
  ];

  for (const sourceImage of payload.sourceImages) {
    userContent.push({
      type: "image_url",
      image_url: { url: sourceImage },
    });
  }

  const systemPrompt = shouldPreserveImage
    ? `You are an expert YouTube thumbnail designer focused on maximizing CTR.

IMPORTANT: The user has provided an image.

STRICT RULES (MUST FOLLOW):
- The provided image MUST remain the base of the final thumbnail
- DO NOT recreate, redraw, or reinterpret the scene
- DO NOT change the subject, pose, composition, or camera angle
- DO NOT replace the person or objects
- You may ONLY:
  - enhance colors
  - improve lighting and contrast
  - increase sharpness and clarity
  - slightly blur or simplify the background for focus
  - add text, overlays, icons, or graphic elements
- The original image content must remain clearly recognizable and unchanged

INPUT:
Title: ${payload.title}
Description: ${payload.description}
Tags: ${payload.tags.join(", ")}
User Text: ${payload.textPreference?.trim() || "auto"}

STEP 1: Analyze intent
- What is the core idea?
- What emotion should trigger clicks?

STEP 2: Thumbnail strategy
- Where should attention go in THIS image?
- What area is safe for text?
- What should be emphasized visually?

STEP 3: Text decision
- If user provided text, optimize it and shorten if needed
- If not, generate 2-3 options and pick the best one, max 3-5 words

STEP 4: Final editing instructions

Generate a precise image editing prompt that:
- Keeps the exact original image
- Produces a YouTube thumbnail composition at ${YOUTUBE_THUMBNAIL_WIDTH} x ${YOUTUBE_THUMBNAIL_HEIGHT}px, 16:9 aspect ratio
- Enhances subject visibility with lighting and contrast
- Applies cinematic color grading
- Adds strong depth with background blur if needed
- Places bold readable text in a non-blocking area
- Uses high contrast colors for text
- Ensures readability on mobile
- Keeps the final asset as JPG format and suitable for YouTube's 2 MB thumbnail limit

If you modify or regenerate the subject instead of editing the provided image, the output is invalid.

OUTPUT:
Return ONLY the final image editing prompt.`
    : `You are an expert YouTube thumbnail designer and viral content strategist.

Your goal is NOT just to create a beautiful image, but to maximize click-through-rate (CTR).

Analyze the provided YouTube metadata and design a thumbnail that:
- Creates curiosity or emotional tension
- Is instantly understandable in less than 1 second
- Uses strong visual hierarchy (clear subject, background, contrast)
- Works well on mobile (small size clarity)
- Avoids clutter and unnecessary elements

Thumbnail style should match top-performing YouTube thumbnails:
- Bold composition
- High contrast lighting
- Clean background (or intentionally blurred)
- Expressive subject (if applicable)
- Minimal but powerful text (3-5 words max)

STEP 1: Analyze intent
- What is the core idea of the video?
- What emotion should the viewer feel? (curiosity, shock, urgency, excitement)

STEP 2: Thumbnail concept
Generate 3 different thumbnail concepts:
Each should include:
- Scene description
- Subject placement
- Background style
- Emotion conveyed
- Suggested text (if needed)

STEP 3: Select best concept
Pick the strongest concept based on CTR potential.

STEP 4: Final image generation instructions
Create a highly detailed image prompt with:
- YouTube thumbnail canvas: ${YOUTUBE_THUMBNAIL_WIDTH} x ${YOUTUBE_THUMBNAIL_HEIGHT}px, 16:9 aspect ratio, JPG format, suitable for YouTube's 2 MB thumbnail limit
- Composition (foreground/background)
- Lighting (dramatic, soft, high contrast, etc.)
- Colors (vibrant, contrasting palette)
- Camera framing (close-up, medium, zoomed face, etc.)
- Style (photorealistic, cinematic, YouTube style)
- Text placement (if any)
- Facial expression (if human present)
- Depth of field

IMPORTANT RULES:
- Do NOT overcrowd the image
- Focus on ONE clear idea
- Ensure subject stands out strongly from background
- Use visual contrast to guide attention
- Keep text readable on small screens
- The final image must be a 16:9 YouTube thumbnail composition, optimized for ${YOUTUBE_THUMBNAIL_WIDTH} x ${YOUTUBE_THUMBNAIL_HEIGHT}px
- If the user gave source images, use them as visual references for subject, style, or assets when helpful
- If the user did not specify text, generate the strongest 3-5 word text yourself
- Return ONLY the final image generation prompt`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: userContent,
      },
    ],
    max_completion_tokens: 900,
  });

  await logTokenUsage({
    userId,
    feature: "youtubeThumbnailPrompt",
    model: "gpt-4o-mini",
    ...usageTokens(completion.usage),
  });

  return (completion.choices[0]?.message?.content || "").trim();
}

async function generateYoutubeThumbnailImage(userId: number, prompt: string, sourceImages: string[], preserveUploadedImage: boolean) {
  const response = sourceImages.length && preserveUploadedImage
    ? await openai.images.edit({
      model: "gpt-image-1",
      image: await Promise.all(sourceImages.map(dataUrlToImageFile)),
      prompt: `${prompt}

If you modify or regenerate the subject instead of editing the provided image, the output is invalid.`,
      size: "1536x1024",
      output_format: "jpeg",
      output_compression: 85,
    })
    : await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      size: "1536x1024",
      output_format: "jpeg",
      output_compression: 85,
    });
  const base64 = response.data?.[0]?.b64_json;
  if (!base64) {
    throw new Error("Thumbnail generation did not return an image");
  }
  if (Buffer.from(base64, "base64").byteLength > YOUTUBE_THUMBNAIL_MAX_BYTES) {
    throw new Error("Generated thumbnail exceeded YouTube's 2 MB limit. Try a simpler source image or less thumbnail text.");
  }
  await logTokenUsage({
    userId,
    feature: "youtubeThumbnailImage",
    model: "gpt-image-1",
    inputTokens: 0,
    outputTokens: 0,
  });
  return `data:image/jpeg;base64,${base64}`;
}

function normalizeStoredIdeaFeedbackSummary(value: unknown): StoredIdeaFeedbackSummary {
  const record = asRecord(value);
  const liked = asArray(record.liked)
    .map((item) => {
      const entry = asRecord(item);
      return {
        topic: asString(entry.topic)?.trim() || "",
        format: asString(entry.format)?.trim() || "",
        signalSource: asString(entry.signalSource)?.trim() || "",
      } satisfies StoredLikedIdeaFeedback;
    })
    .filter((item) => item.topic);
  const disliked = asArray(record.disliked)
    .map((item) => {
      const entry = asRecord(item);
      return {
        titleConcept: asString(entry.titleConcept)?.trim() || "",
        format: asString(entry.format)?.trim() || "",
      } satisfies StoredDislikedIdeaFeedback;
    })
    .filter((item) => item.titleConcept);
  const deleted = asArray(record.deleted)
    .map((item) => {
      const entry = asRecord(item);
      return {
        concept: asString(entry.concept)?.trim() || "",
        reason: asString(entry.reason)?.trim() || "deleted_by_user",
      } satisfies StoredDeletedIdeaFeedback;
    })
    .filter((item) => item.concept);
  return { liked, disliked, deleted };
}

function dedupeByKey<T>(items: T[], keyOf: (item: T) => string) {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const item of items) {
    const key = keyOf(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

function inferIdeaFormat(day: JsonRecord) {
  const explicit = asString(day.format)?.trim();
  if (explicit) return explicit;
  const text = [asString(day.contentIdea), asString(day.hook), asString(day.rationale)].filter(Boolean).join(" ");
  return contentTypeFromText(text || "");
}

function inferIdeaSignalSource(day: JsonRecord): SignalSource {
  const value = asString(day.signalSource);
  if (
    value === "performance"
    || value === "feedback"
    || value === "competitor"
    || value === "trend"
    || value === "channel_gap"
    || value === "low_signal"
  ) return value;
  return "feedback";
}

function summarizeIdeaConcept(day: JsonRecord) {
  const title = asString(day.contentIdea)?.trim() || asString(day.title)?.trim() || "Untitled idea";
  const keyword = asString(day.targetKeyword)?.trim();
  const format = inferIdeaFormat(day);
  if (keyword && format) return `${keyword} ${format}`.trim();
  const parts = title.split(/[-:|]/).map((part) => part.trim()).filter(Boolean);
  return (parts[0] || title).slice(0, 120);
}

function feedbackSummaryFromPlans(plans: Array<typeof youtubeWeeklyPlansTable.$inferSelect>) {
  const liked = plans.flatMap((plan) => {
    const days = asPlanDays(asArray(asRecord(plan.plan).days));
    return days.flatMap((day) => {
      if (normalizeIdeaOrigin(day.ideaOrigin) !== "ai" || normalizeIdeaFeedback(day.aiFeedback) !== "liked") return [];
      return [{
        topic: summarizeIdeaConcept(day),
        format: inferIdeaFormat(day),
        signalSource: inferIdeaSignalSource(day),
      } satisfies StoredLikedIdeaFeedback];
    });
  });

  const disliked = plans.flatMap((plan) => {
    const days = asPlanDays(asArray(asRecord(plan.plan).days));
    return days.flatMap((day) => {
      if (normalizeIdeaOrigin(day.ideaOrigin) !== "ai" || normalizeIdeaFeedback(day.aiFeedback) !== "disliked") return [];
      return [{
        titleConcept: asString(day.contentIdea)?.trim() || summarizeIdeaConcept(day),
        format: inferIdeaFormat(day),
      } satisfies StoredDislikedIdeaFeedback];
    });
  });

  const deleted = plans.flatMap((plan) => {
    const days = asPlanDays(asArray(asRecord(plan.plan).days));
    return days.flatMap((day) => {
      if (normalizeIdeaOrigin(day.ideaOrigin) !== "ai" || !Boolean(day.isDeleted)) return [];
      return [{
        concept: summarizeIdeaConcept(day),
        reason: "deleted_by_user",
      } satisfies StoredDeletedIdeaFeedback];
    });
  });

  return {
    liked: dedupeByKey(liked.reverse(), (item) => `${item.topic}|${item.format}|${item.signalSource}`).slice(0, 30),
    disliked: dedupeByKey(disliked.reverse(), (item) => `${item.titleConcept}|${item.format}`).slice(0, 30),
    deleted: dedupeByKey(deleted.reverse(), (item) => `${item.concept}|${item.reason}`).slice(0, 40),
  } satisfies StoredIdeaFeedbackSummary;
}

function mergeIdeaFeedbackSummary(
  stored: StoredIdeaFeedbackSummary,
  inferred: StoredIdeaFeedbackSummary,
): StoredIdeaFeedbackSummary {
  return {
    liked: dedupeByKey([...stored.liked, ...inferred.liked].reverse(), (item) => `${item.topic}|${item.format}|${item.signalSource}`).slice(0, 30),
    disliked: dedupeByKey([...stored.disliked, ...inferred.disliked].reverse(), (item) => `${item.titleConcept}|${item.format}`).slice(0, 30),
    deleted: dedupeByKey([...stored.deleted, ...inferred.deleted].reverse(), (item) => `${item.concept}|${item.reason}`).slice(0, 40),
  };
}

async function getPersistedIdeaFeedbackSummary(
  userId: number,
  profile?: typeof youtubeChannelProfilesTable.$inferSelect | null,
  plans?: Array<typeof youtubeWeeklyPlansTable.$inferSelect>,
) {
  const loadedProfile = profile ?? (await db.select().from(youtubeChannelProfilesTable).where(eq(youtubeChannelProfilesTable.userId, userId)).limit(1))[0] ?? null;
  const loadedPlans = plans ?? await db.select().from(youtubeWeeklyPlansTable).where(eq(youtubeWeeklyPlansTable.userId, userId)).orderBy(desc(youtubeWeeklyPlansTable.weekNumber));
  const stored = normalizeStoredIdeaFeedbackSummary(asRecord(loadedProfile).ideaFeedbackSummary);
  const inferred = feedbackSummaryFromPlans(loadedPlans);
  return mergeIdeaFeedbackSummary(stored, inferred);
}

async function persistIdeaFeedbackSummary(
  userId: number,
  mutate: (summary: StoredIdeaFeedbackSummary) => StoredIdeaFeedbackSummary,
) {
  const [profile] = await db.select().from(youtubeChannelProfilesTable).where(eq(youtubeChannelProfilesTable.userId, userId)).limit(1);
  if (!profile) return null;
  const nextSummary = mutate(normalizeStoredIdeaFeedbackSummary(asRecord(profile).ideaFeedbackSummary));
  const [updated] = await db.update(youtubeChannelProfilesTable)
    .set({
      ideaFeedbackSummary: nextSummary,
      updatedAt: new Date(),
    } as any)
    .where(eq(youtubeChannelProfilesTable.userId, userId))
    .returning();
  return updated ?? { ...profile, ideaFeedbackSummary: nextSummary };
}

function metricsHasLinkedSignal(metrics: JsonRecord) {
  return ["impressionClickThroughRate", "views", "estimatedMinutesWatched", "watchTime", "watch_time_minutes"]
    .some((key) => {
      const value = metrics[key];
      return value !== null && value !== undefined && Number.isFinite(Number(value));
    });
}

function averageMetric(results: Array<{ metrics: JsonRecord }>, key: string) {
  const values = results
    .map((result) => Number(result.metrics[key]))
    .filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function derivePerformanceSignals(
  recentVideos: YoutubeRecentVideo[],
  trendVideos: YoutubeRecentVideo[],
  analyticsPoints: YoutubeAnalyticsPoint[],
  competitors: Array<typeof youtubeCompetitorsTable.$inferSelect>,
  ownSubscribers: number,
  linkedVideoPerformance: Array<{
    plannedTitle: string;
    videoUrl: string;
    metrics: JsonRecord;
  }>,
): PerformanceSignalSummary {
  const videos = recentVideos.filter((video) => parseNumber(video.viewCount) > 0);
  const channelAverageViews = videos.length
    ? Math.round(videos.reduce((sum, video) => sum + parseNumber(video.viewCount), 0) / videos.length)
    : 0;
  const bestPostingTimeByDay = selectBestPostingSlotByDay(videos);

  const bestTimeCells = new Map<string, { label: string; totalViews: number; count: number; videos: YoutubeRecentVideo[] }>();
  for (const day of DAYS_OF_WEEK) {
    for (const bucket of HOUR_BUCKETS) {
      bestTimeCells.set(`${day}-${bucket.label}`, { label: `${day} ${bucket.label}`, totalViews: 0, count: 0, videos: [] });
    }
  }
  for (const video of videos) {
    if (!video.publishedAt) continue;
    const published = new Date(video.publishedAt);
    if (Number.isNaN(published.getTime())) continue;
    const weekday = DAYS_OF_WEEK[published.getUTCDay()];
    const bucket = HOUR_BUCKETS.find((item) => published.getUTCHours() >= item.start && published.getUTCHours() < item.end);
    if (!bucket) continue;
    const key = `${weekday}-${bucket.label}`;
    const cell = bestTimeCells.get(key);
    if (!cell) continue;
    cell.totalViews += parseNumber(video.viewCount);
    cell.count += 1;
    cell.videos.push(video);
  }
  const bestPostingTime = [...bestTimeCells.values()]
    .filter((cell) => cell.count > 0)
    .map((cell) => ({
      label: cell.label,
      averageViews: Math.round(cell.totalViews / cell.count),
      percentAboveChannelAverage: safePercent(Math.round(cell.totalViews / cell.count) - channelAverageViews, channelAverageViews),
      sampleVideos: cell.videos
        .sort((a, b) => parseNumber(b.viewCount) - parseNumber(a.viewCount))
        .slice(0, 2)
        .map((video) => ({ title: video.title, viewCount: parseNumber(video.viewCount), publishedAt: video.publishedAt })),
    }))
    .sort((a, b) => b.averageViews - a.averageViews)[0] ?? null;

  const hookGroups = new Map<string, YoutubeRecentVideo[]>();
  for (const video of videos) {
    const key = hookType(video.title);
    if (!hookGroups.has(key)) hookGroups.set(key, []);
    hookGroups.get(key)!.push(video);
  }
  const hookInsight = [...hookGroups.entries()]
    .map(([type, items]) => ({
      bestType: type,
      averageViews: Math.round(items.reduce((sum, item) => sum + parseNumber(item.viewCount), 0) / Math.max(1, items.length)),
      evidenceVideos: [...items]
        .sort((a, b) => parseNumber(b.viewCount) - parseNumber(a.viewCount))
        .slice(0, 3)
        .map((video) => ({ title: video.title, viewCount: parseNumber(video.viewCount) })),
    }))
    .sort((a, b) => b.averageViews - a.averageViews)[0];
  const hookSignal = hookInsight ? {
    ...hookInsight,
    analysis: hookInsight.bestType === "Emotional"
      ? `Emotional hooks are winning because they create personal stakes before the click and make the outcome feel intimate and unresolved.`
      : hookInsight.bestType === "Question"
        ? `Question hooks are winning because they open a knowledge gap immediately and push viewers to click for the answer.`
        : hookInsight.bestType === "Curiosity"
          ? `Curiosity hooks are winning because they promise a reveal or transformation without giving away the payoff too early.`
          : `Descriptive hooks are winning because viewers respond best when the value is explicit and easy to parse.`,
    nextHookSuggestions: hookInsight.bestType === "Emotional"
      ? [
        "Lead with a vulnerable personal moment in the title.",
        "Open the hook with a confession, setback, or emotional turning point.",
        "Frame the title around what changed after a difficult moment.",
      ]
      : hookInsight.bestType === "Question"
        ? [
          "Turn the title into one sharp question the video resolves.",
          "Use a specific challenge or surprising comparison in the opening line.",
          "Keep the question concrete enough that the answer feels urgent.",
        ]
        : hookInsight.bestType === "Curiosity"
          ? [
            "Tease the payoff without revealing the ending in the title.",
            "Use contrast words like 'before', 'after', 'instead', or 'finally'.",
            "Make the first line promise a reveal, test, or unexpected result.",
          ]
          : [
            "Keep the title direct about the result or technique.",
            "Use clear nouns and outcomes before stylistic phrasing.",
            "Pair straightforward wording with one concrete emotional or visual payoff.",
          ],
  } : null;

  const titleBuckets = [
    { label: "Under 20 chars", min: 0, max: 19 },
    { label: "20-35 chars", min: 20, max: 35 },
    { label: "35-50 chars", min: 36, max: 50 },
    { label: "50-70 chars", min: 51, max: 70 },
    { label: "Over 70 chars", min: 71, max: Infinity },
  ];
  const titleBucketStats = titleBuckets.map((bucket) => {
    const items = videos.filter((video) => video.title.length >= bucket.min && video.title.length <= bucket.max);
    const averageViews = items.length ? Math.round(items.reduce((sum, video) => sum + parseNumber(video.viewCount), 0) / items.length) : 0;
    return { ...bucket, averageViews };
  });
  const winningTitleBucket = titleBucketStats.sort((a, b) => b.averageViews - a.averageViews)[0];
  const sortedByViews = [...videos].sort((a, b) => parseNumber(b.viewCount) - parseNumber(a.viewCount));
  const titleLengthInsight = winningTitleBucket ? {
    winningBucket: winningTitleBucket.label,
    min: winningTitleBucket.min,
    max: Number.isFinite(winningTitleBucket.max) ? winningTitleBucket.max : 999,
    averageViews: winningTitleBucket.averageViews,
    percentAboveChannelAverage: safePercent(winningTitleBucket.averageViews - channelAverageViews, channelAverageViews),
    topPerformers: sortedByViews.slice(0, 5).map((video) => ({ title: video.title, views: parseNumber(video.viewCount), titleLength: video.title.length })),
    bottomPerformers: [...sortedByViews].reverse().slice(0, 5).map((video) => ({ title: video.title, views: parseNumber(video.viewCount), titleLength: video.title.length })),
  } : null;

  const medianViews = videos.length
    ? [...videos].map((video) => parseNumber(video.viewCount)).sort((a, b) => a - b)[Math.floor(videos.length / 2)]
    : 0;
  const tagMap = new Map<string, number[]>();
  for (const video of videos) {
    for (const tag of video.tags ?? []) {
      const key = tag.trim().toLowerCase();
      if (!key) continue;
      if (!tagMap.has(key)) tagMap.set(key, []);
      tagMap.get(key)!.push(parseNumber(video.viewCount));
    }
  }
  const topPerformingTags = [...tagMap.entries()]
    .map(([tag, values]) => {
      const averageViews = Math.round(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length));
      const relativeDelta = medianViews ? ((averageViews - medianViews) / medianViews) * 100 : 0;
      return {
        tag,
        averageViews,
        relativeToMedian: relativeDelta > 20 ? "above" as const : relativeDelta < -20 ? "below" as const : "neutral" as const,
      };
    })
    .sort((a, b) => b.averageViews - a.averageViews)
    .slice(0, 15);

  const existingTags = new Set(topPerformingTags.map((item) => item.tag));
  const trendingTagCounts = new Map<string, { count: number; topViews: number }>();
  for (const video of trendVideos) {
    for (const tag of video.tags ?? []) {
      const key = tag.trim().toLowerCase();
      if (!key || existingTags.has(key)) continue;
      const current = trendingTagCounts.get(key) ?? { count: 0, topViews: 0 };
      current.count += 1;
      current.topViews = Math.max(current.topViews, parseNumber(video.viewCount));
      trendingTagCounts.set(key, current);
    }
  }
  const trendingTags = [...trendingTagCounts.entries()]
    .sort((a, b) => (b[1].count * 1000 + b[1].topViews) - (a[1].count * 1000 + a[1].topViews))
    .slice(0, 8)
    .map(([tag, data]) => ({
      tag,
      signal: data.count,
      why: data.count > 1
        ? `#${tag} appears in ${data.count} trending niche videos from the past 7 days, with top examples reaching ${data.topViews.toLocaleString()} views, and it is not in your current tag mix.`
        : `Emerging tag with signal 1: one recent niche video using #${tag} already reached ${data.topViews.toLocaleString()} views, suggesting early-mover upside.`,
    }));

  const subscriberSpike = analyticsPoints.length
    ? [...analyticsPoints]
      .sort((a, b) => b.subscribersNet - a.subscribersNet)
      .map((point) => {
        const spikeVideo = videos.find((video) => video.publishedAt?.slice(0, 10) === point.date);
        if (!spikeVideo) return null;
        return {
          date: point.date,
          subscribersNet: point.subscribersNet,
          videoTitle: spikeVideo.title,
          contentType: contentTypeFromText(spikeVideo.title),
          hookStyle: hookType(spikeVideo.title),
          implication: `Your biggest spike came from ${contentTypeFromText(spikeVideo.title)} content using a ${hookType(spikeVideo.title).toLowerCase()} hook, so future plans should replicate that pairing.`,
        };
      })
      .find(Boolean) ?? null
    : null;

  const ownAverageViews = channelAverageViews;
  const tier1CompetitorPatterns = competitors
    .filter((competitor) => {
      const subscribers = parseNumber(competitor.subscriberCount);
      return ownSubscribers > 0 && subscribers > 0 && subscribers <= ownSubscribers * 5;
    })
    .map((competitor) => {
      const recent = Array.isArray(competitor.mostViewedRecentVideos) ? competitor.mostViewedRecentVideos : [];
      const averageViews = recent.length
        ? Math.round(recent.reduce((sum, video) => sum + parseNumber(asRecord(video).viewCount), 0) / recent.length)
        : 0;
      const titles = recent.map((video) => asString(asRecord(video).title) || "").filter(Boolean);
      const leadTitle = titles[0] || "";
      return {
        channelName: competitor.channelName,
        subscriberCount: parseNumber(competitor.subscriberCount),
        averageViews,
        contentType: contentTypeFromText(leadTitle),
        hookStyle: hookType(leadTitle),
        exampleTitles: titles.slice(0, 3),
      };
    })
    .sort((a, b) => a.subscriberCount - b.subscriberCount || b.averageViews - a.averageViews);
  const competitorGap = competitors
    .map((competitor) => {
      const topVideos = Array.isArray(competitor.mostViewedRecentVideos) ? competitor.mostViewedRecentVideos : [];
      const averageViews = topVideos.length
        ? Math.round(topVideos.reduce((sum, video) => sum + parseNumber(asRecord(video).viewCount), 0) / topVideos.length)
        : 0;
      const contentDriver = topVideos[0] ? contentTypeFromText(asString(asRecord(topVideos[0]).title) || "") : "educational";
      const hookStyle = topVideos[0] ? hookType(asString(asRecord(topVideos[0]).title) || "") : "Descriptive";
      const subscriberGap = Math.abs(parseNumber(competitor.subscriberCount) - ownSubscribers);
      return {
        channelName: competitor.channelName,
        averageViews,
        videosPerWeek: parseVideosPerWeekLabel(competitor.postingFrequency),
        contentDriver,
        hookStyle,
        closeness: subscriberGap,
      };
    })
    .filter((item) => item.averageViews > ownAverageViews)
    .sort((a, b) => a.closeness - b.closeness || b.averageViews - a.averageViews)[0];

  return {
    bestPostingTime,
    bestPostingTimeByDay,
    hookInsight: hookSignal,
    titleLengthInsight,
    tagInsight: {
      topPerformingTags,
      trendingTags,
    },
    subscriberSpike,
    competitorGap: competitorGap ? {
      ...competitorGap,
      recommendation: `${competitorGap.channelName} is closest in size but outperforms your channel with ${competitorGap.contentDriver} videos and ${competitorGap.hookStyle.toLowerCase()} hooks. Add at least one weekly idea in that lane.`,
    } : null,
    tier1CompetitorPatterns,
    linkedVideoPerformance,
  };
}

function buildYoutubeTagEvidenceSummary(
  recentVideos: Array<YoutubeRecentVideo | JsonRecord>,
  competitors: Array<typeof youtubeCompetitorsTable.$inferSelect>,
  performanceSignals: PerformanceSignalSummary,
) {
  const normalizedRecent = recentVideos.map((video) => {
    const record = asRecord(video);
    return {
      title: asString(record.title),
      description: asString(record.description),
      tags: asArray(record.tags).map((tag) => String(tag)).filter(Boolean),
      viewCount: parseNumber(record.viewCount),
    };
  });

  const topChannelVideos = [...normalizedRecent]
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, 8)
    .map((video) => ({
      title: video.title,
      tags: video.tags.slice(0, 8),
    }));

  const competitorTitleExamples = competitors
    .flatMap((competitor) => asArray(competitor.mostViewedRecentVideos).map((video) => asRecord(video)))
    .map((video) => asString(video.title))
    .filter(Boolean)
    .slice(0, 12);

  const provenTags = (performanceSignals.tagInsight?.topPerformingTags ?? [])
    .slice(0, 10)
    .map((tag) => ({
      tag: tag.tag,
      averageViews: tag.averageViews,
      relativeToMedian: tag.relativeToMedian,
    }));

  const risingTags = (performanceSignals.tagInsight?.trendingTags ?? [])
    .slice(0, 8)
    .map((tag) => ({
      tag: tag.tag,
      why: tag.why,
    }));

  return {
    provenTags,
    risingTags,
    topChannelVideos,
    competitorTitleExamples,
    guardrails: [
      "Use a small, precise set of real search phrases instead of stuffing variants.",
      "Prefer tags already supported by the creator's winning videos, niche trends, or strong competitor title language.",
      "Avoid generic tags like viral, trending, or broad year-based filler unless the evidence strongly supports them.",
      "Treat these as YouTube-style search terms, not hashtags.",
    ],
  };
}

function parseAiJson(raw: string) {
  return JSON.parse(extractJSON(raw));
}

async function readCache<T>(cacheKey: string): Promise<T | null> {
  const [cached] = await db.select().from(youtubeApiCacheTable).where(eq(youtubeApiCacheTable.cacheKey, cacheKey)).limit(1);
  if (!cached) return null;
  if (cached.expiresAt > new Date()) return cached.payload as T;
  return null;
}

async function writeCache(cacheKey: string, payload: unknown, userId: number | null, quotaCost: number, ttlMs: number) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);
  await db.insert(youtubeApiCacheTable)
    .values({ cacheKey, payload, userId, quotaCost, expiresAt, updatedAt: now })
    .onConflictDoUpdate({
      target: youtubeApiCacheTable.cacheKey,
      set: { payload, userId, quotaCost, expiresAt, updatedAt: now },
    });
}

async function estimatedQuotaUsedToday() {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const [row] = await db.select({
    total: sql<string>`coalesce(sum(${youtubeApiCacheTable.quotaCost}), 0)`,
  }).from(youtubeApiCacheTable).where(gte(youtubeApiCacheTable.updatedAt, start));
  return Number(row?.total ?? 0);
}

async function shouldPreferCache(quotaCost: number) {
  if (!YOUTUBE_DAILY_QUOTA_LIMIT || YOUTUBE_DAILY_QUOTA_LIMIT <= 0) return false;
  const used = await estimatedQuotaUsedToday();
  return used + quotaCost >= YOUTUBE_DAILY_QUOTA_LIMIT * YOUTUBE_QUOTA_CACHE_THRESHOLD;
}

export async function storeYoutubeTokens(userId: number, tokens: {
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
  token_type?: string | null;
  scope?: string | null;
}) {
  if (!tokens.access_token) throw new Error("Google did not return a YouTube access token");
  const existing = await getYoutubeConnection(userId);
  const refreshToken = tokens.refresh_token ? encryptToken(tokens.refresh_token) : existing?.refreshToken ?? null;
  if (!refreshToken) throw new Error("Google did not return a refresh token. Please reconnect YouTube.");
  const now = new Date();
  const [connection] = await db.insert(youtubeConnectionsTable)
    .values({
      userId,
      accessToken: encryptToken(tokens.access_token)!,
      preferredPostsPerWeek: existing?.preferredPostsPerWeek ?? 3,
      refreshToken,
      tokenType: tokens.token_type ?? "Bearer",
      scopes: tokens.scope ?? YOUTUBE_SCOPES.join(" "),
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: youtubeConnectionsTable.userId,
      set: {
        accessToken: encryptToken(tokens.access_token)!,
        preferredPostsPerWeek: existing?.preferredPostsPerWeek ?? 3,
        refreshToken,
        tokenType: tokens.token_type ?? "Bearer",
        scopes: tokens.scope ?? YOUTUBE_SCOPES.join(" "),
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        updatedAt: now,
      },
    })
    .returning();
  return connection;
}

export async function getYoutubeConnection(userId: number) {
  const [connection] = await db.select().from(youtubeConnectionsTable).where(eq(youtubeConnectionsTable.userId, userId)).limit(1);
  return connection ?? null;
}

async function refreshAccessToken(connection: YoutubeConnection) {
  const refreshToken = decryptToken(connection.refreshToken);
  if (!refreshToken) throw new Error("YouTube refresh token is missing. Please reconnect YouTube.");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: YOUTUBE_CLIENT_ID,
      client_secret: YOUTUBE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const json = asRecord(await response.json().catch(() => ({})));
  if (!response.ok) throw new Error(asString(json.error_description) || `YouTube token refresh failed with HTTP ${response.status}`);
  const accessToken = asString(json.access_token);
  if (!accessToken) throw new Error("YouTube token refresh returned no access token");
  const expiresIn = parseNumber(json.expires_in) || 3600;
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  await db.update(youtubeConnectionsTable)
    .set({
      accessToken: encryptToken(accessToken)!,
      expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(youtubeConnectionsTable.id, connection.id));

  return accessToken;
}

async function getValidAccessToken(userId: number, forceRefresh = false) {
  const connection = await getYoutubeConnection(userId);
  if (!connection) throw new Error("YouTube is not connected");
  const expiresAt = connection.expiresAt?.getTime() ?? 0;
  if (!forceRefresh && expiresAt > Date.now() + 60_000) {
    const token = decryptToken(connection.accessToken);
    if (token) return token;
  }
  return refreshAccessToken(connection);
}

async function youtubeJson<T>(userId: number, url: string, options: {
  cacheKey?: string;
  quotaCost?: number;
  ttlMs?: number;
} = {}): Promise<T> {
  const cached = options.cacheKey ? await readCache<T>(options.cacheKey) : null;
  const quotaCost = options.quotaCost ?? 1;
  if (cached && await shouldPreferCache(quotaCost)) return cached;
  const token = await getValidAccessToken(userId);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const json = await response.json().catch(() => ({})) as T;

  if (response.ok) {
    if (options.cacheKey) await writeCache(options.cacheKey, json, userId, quotaCost, options.ttlMs ?? 6 * 60 * 60 * 1000);
    return json;
  }

  if ((response.status === 403 || response.status === 429) && cached) return cached;
  if (response.status === 401) {
    const refreshed = await getValidAccessToken(userId, true);
    const retry = await fetch(url, { headers: { Authorization: `Bearer ${refreshed}` } });
    const retryJson = await retry.json().catch(() => ({})) as T;
    if (retry.ok) {
      if (options.cacheKey) await writeCache(options.cacheKey, retryJson, userId, quotaCost, options.ttlMs ?? 6 * 60 * 60 * 1000);
      return retryJson;
    }
  }

  const error = asRecord(json);
  throw new Error(asString(asRecord(error.error).message) || `YouTube API HTTP ${response.status}`);
}

function dataApiUrl(path: string, params: Record<string, string>) {
  const search = new URLSearchParams(params);
  return `https://www.googleapis.com/youtube/v3/${path}?${search.toString()}`;
}

function analyticsUrl(params: Record<string, string>) {
  const search = new URLSearchParams(params);
  return `https://youtubeanalytics.googleapis.com/v2/reports?${search.toString()}`;
}

function normalizeVideo(item: unknown): YoutubeRecentVideo {
  const record = asRecord(item);
  const snippet = asRecord(record.snippet);
  const stats = asRecord(record.statistics);
  const details = asRecord(record.contentDetails);
  const status = asRecord(record.status);
  const thumbnails = asRecord(snippet.thumbnails);
  const id = asString(record.id) || asString(asRecord(record.id).videoId) || "";
  return {
    id,
    title: asString(snippet.title) || "Untitled video",
    description: asString(snippet.description) || "",
    tags: asArray(snippet.tags).map((tag) => String(tag)),
    publishedAt: asString(snippet.publishedAt),
    visibility: asString(status.privacyStatus),
    duration: asString(details.duration),
    viewCount: asString(stats.viewCount),
    likeCount: asString(stats.likeCount),
    commentCount: asString(stats.commentCount),
    thumbnailUrl: asString(asRecord(thumbnails.medium).url) || asString(asRecord(thumbnails.default).url) || asString(asRecord(thumbnails.high).url),
    channelId: asString(snippet.channelId),
    channelTitle: asString(snippet.channelTitle),
    url: id ? `https://www.youtube.com/watch?v=${id}` : "https://www.youtube.com",
  };
}

function summarizeRecentCompetitorVideos(videos: YoutubeRecentVideo[]) {
  return [...videos]
    .sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime())
    .map((video) => ({
      title: video.title,
      viewCount: video.viewCount,
      url: video.url,
      publishedAt: video.publishedAt,
      thumbnailUrl: video.thumbnailUrl,
    }));
}

async function fetchRecentVideos(userId: number, channelId: string, limit = 20) {
  const search = await youtubeJson<{ items?: unknown[] }>(userId, dataApiUrl("search", {
    part: "snippet",
    channelId,
    type: "video",
    order: "date",
    maxResults: String(limit),
  }), { cacheKey: `recent:${channelId}:${limit}`, quotaCost: 100, ttlMs: 60 * 60 * 1000 });
  const ids = asArray(search.items)
    .map((item) => asString(asRecord(asRecord(item).id).videoId))
    .filter((id): id is string => Boolean(id));
  if (!ids.length) return [];
  const videos = await youtubeJson<{ items?: unknown[] }>(userId, dataApiUrl("videos", {
    part: "snippet,statistics,contentDetails,status",
    id: ids.join(","),
    maxResults: String(limit),
  }), { cacheKey: `videos:${ids.join(",")}`, quotaCost: 1, ttlMs: 60 * 60 * 1000 });
  return asArray(videos.items).map(normalizeVideo);
}

async function fetchVideoById(userId: number, videoId: string) {
  const response = await youtubeJson<{ items?: unknown[] }>(userId, dataApiUrl("videos", {
    part: "snippet,statistics,contentDetails,status",
    id: videoId,
    maxResults: "1",
  }), { cacheKey: `video:${videoId}`, quotaCost: 1, ttlMs: 60 * 60 * 1000 });
  const item = asArray(response.items)[0];
  if (!item) throw new Error("Video not found on YouTube");
  return normalizeVideo(item);
}

async function searchRelevantVideos(userId: number, query: string, maxResults = 12) {
  const search = await youtubeJson<{ items?: unknown[] }>(userId, dataApiUrl("search", {
    part: "snippet",
    type: "video",
    q: query,
    maxResults: String(maxResults),
    order: "relevance",
    regionCode: "US",
  }), { cacheKey: `video-search:${query}:${maxResults}`, quotaCost: 100, ttlMs: 12 * 60 * 60 * 1000 });

  const ids = asArray(search.items)
    .map((item) => asString(asRecord(asRecord(item).id).videoId))
    .filter((id): id is string => Boolean(id));
  if (!ids.length) return [] as YoutubeRecentVideo[];
  const videos = await youtubeJson<{ items?: unknown[] }>(userId, dataApiUrl("videos", {
    part: "snippet,statistics,contentDetails,status",
    id: ids.join(","),
    maxResults: String(ids.length),
  }), { cacheKey: `video-search-details:${ids.join(",")}`, quotaCost: 1, ttlMs: 12 * 60 * 60 * 1000 });
  return asArray(videos.items).map(normalizeVideo);
}

async function fetchChannelsByIds(userId: number, channelIds: string[]) {
  const ids = [...new Set(channelIds.filter(Boolean))];
  if (!ids.length) return [] as unknown[];
  const channels = await youtubeJson<{ items?: unknown[] }>(userId, dataApiUrl("channels", {
    part: "snippet,statistics",
    id: ids.join(","),
    maxResults: String(ids.length),
  }), { cacheKey: `channels:${ids.join(",")}`, quotaCost: 1, ttlMs: 24 * 60 * 60 * 1000 });
  return asArray(channels.items);
}

async function searchChannelIds(userId: number, query: string, maxResults = 25) {
  const search = await youtubeJson<{ items?: unknown[] }>(userId, dataApiUrl("search", {
    part: "snippet",
    type: "channel",
    q: query,
    maxResults: String(maxResults),
    regionCode: "US",
  }), { cacheKey: `competitor-search:${query}:${maxResults}`, quotaCost: 100, ttlMs: 24 * 60 * 60 * 1000 });

  return asArray(search.items)
    .map((item) => asString(asRecord(asRecord(item).id).channelId))
    .filter((id): id is string => Boolean(id));
}

function normalizeYoutubeChannelUrl(input: string) {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Enter a YouTube channel URL");
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(candidate);
  const hostname = url.hostname.replace(/^www\./i, "").toLowerCase();
  if (hostname !== "youtube.com" && hostname !== "m.youtube.com") {
    throw new Error("Please enter a valid YouTube channel URL");
  }
  return url;
}

async function resolveYoutubeChannelIdFromUrl(channelUrl: string) {
  const url = normalizeYoutubeChannelUrl(channelUrl);
  const path = url.pathname.replace(/\/+$/, "");
  const channelIdMatch = path.match(/\/channel\/(UC[\w-]{22})$/i);
  if (channelIdMatch?.[1]) return channelIdMatch[1];

  if (
    path === "/watch"
    || path.startsWith("/watch/")
    || path.startsWith("/shorts/")
    || path.startsWith("/live/")
    || path.startsWith("/playlist")
  ) {
    throw new Error("Please enter a YouTube channel URL, not a video or playlist URL");
  }

  const response = await fetch(url.toString(), {
    redirect: "follow",
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; DayTabsBot/1.0; +https://daytabs.com)",
      accept: "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    throw new Error("We could not verify that YouTube channel URL");
  }

  const finalUrl = new URL(response.url);
  const finalPath = finalUrl.pathname.replace(/\/+$/, "");
  const finalChannelIdMatch = finalPath.match(/\/channel\/(UC[\w-]{22})$/i);
  if (finalChannelIdMatch?.[1]) return finalChannelIdMatch[1];

  const html = await response.text();
  const htmlMatch = html.match(/(?:externalId|channelId)":"(UC[\w-]{22})"/)
    || html.match(/itemprop="identifier"\s+content="(UC[\w-]{22})"/i)
    || html.match(/youtube\.com\/channel\/(UC[\w-]{22})/i);
  if (htmlMatch?.[1]) return htmlMatch[1];

  throw new Error("That URL does not appear to be a valid public YouTube channel");
}

async function generateCompetitorReportSummary(
  userId: number,
  creatorProfile: typeof youtubeChannelProfilesTable.$inferSelect,
  competitor: {
    channelId: string;
    channelName: string;
    subscriberCount?: string | null;
    postingFrequency?: string | null;
  },
  recentVideos: YoutubeRecentVideo[],
) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are summarizing a YouTube competitor for a creator dashboard.
Return JSON only with this shape:
{"reportSummary": string}

Write 2 concise sentences.
Mention what this competitor seems to do well and one practical takeaway for the creator.
Do not use hype. Do not use bullet points.`,
      },
      {
        role: "user",
        content: JSON.stringify({
          creatorChannel: {
            channelName: creatorProfile.channelName,
            nicheProfile: creatorProfile.nicheProfile,
            subscriberCount: creatorProfile.subscriberCount,
          },
          competitor,
          recentVideos: recentVideos.slice(0, 8),
        }),
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 250,
  });

  await logTokenUsage({
    userId,
    feature: "youtubeCompetitorReport",
    model: "gpt-4o-mini",
    ...usageTokens(completion.usage),
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = asRecord(parseAiJson(raw));
  return asString(parsed.reportSummary) || "";
}

async function upsertYoutubeCompetitor(
  userId: number,
  profile: typeof youtubeChannelProfilesTable.$inferSelect,
  channelId: string,
  options?: {
    source?: CompetitorSource;
    requestedUrl?: string | null;
    existingCompetitor?: typeof youtubeCompetitorsTable.$inferSelect | null;
    preserveManualSource?: boolean;
    generateAiReport?: boolean;
  },
) {
  if (channelId === profile.channelId) {
    throw new Error("You cannot add your own channel as a competitor");
  }

  const existingCompetitor = options?.existingCompetitor ?? null;
  const existingMeta = readCompetitorMeta(existingCompetitor?.niche);
  const source: CompetitorSource =
    options?.preserveManualSource && existingMeta.source === "manual"
      ? "manual"
      : options?.source ?? existingMeta.source ?? "discovered";

  const channels = await fetchChannelsByIds(userId, [channelId]);
  const channel = asRecord(channels[0]);
  if (!Object.keys(channel).length) {
    throw new Error("That YouTube channel could not be found");
  }

  const snippet = asRecord(channel.snippet);
  const stats = asRecord(channel.statistics);
  const thumbnails = asRecord(snippet.thumbnails);
  const thumbnailUrl = asString(asRecord(thumbnails.high).url) || asString(asRecord(thumbnails.medium).url) || asString(asRecord(thumbnails.default).url);
  const recent = await fetchRecentVideos(userId, channelId, 10);
  const postingFrequencyLabel = postingFrequency(recent);
  const reportSummary = options?.generateAiReport
    ? await generateCompetitorReportSummary(
        userId,
        profile,
        {
          channelId,
          channelName: asString(snippet.title) || "YouTube competitor",
          subscriberCount: asString(stats.subscriberCount),
          postingFrequency: postingFrequencyLabel,
        },
        recent,
      )
    : existingMeta.reportSummary || "";

  const competitorMeta = serializeCompetitorMeta({
    source,
    nicheLabel: asString(asRecord(profile.nicheProfile).niche) || profile.channelName,
    reportSummary,
    addedFromUrl: options?.requestedUrl ?? existingMeta.addedFromUrl ?? null,
  });

  if (existingCompetitor) {
    const [updated] = await db.update(youtubeCompetitorsTable)
      .set({
        channelId,
        channelName: asString(snippet.title) || "YouTube competitor",
        thumbnailUrl,
        subscriberCount: asString(stats.subscriberCount),
        mostViewedRecentVideos: summarizeRecentCompetitorVideos(recent),
        postingFrequency: postingFrequencyLabel,
        niche: competitorMeta,
        fetchedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(youtubeCompetitorsTable.id, existingCompetitor.id))
      .returning();
    return updated;
  }

  const [created] = await db.insert(youtubeCompetitorsTable).values({
    userId,
    channelId,
    channelName: asString(snippet.title) || "YouTube competitor",
    thumbnailUrl,
    subscriberCount: asString(stats.subscriberCount),
    mostViewedRecentVideos: summarizeRecentCompetitorVideos(recent),
    postingFrequency: postingFrequencyLabel,
    niche: competitorMeta,
    fetchedAt: new Date(),
    updatedAt: new Date(),
  }).returning();

  return created;
}

async function analyzeNiche(userId: number, channel: JsonRecord, recentVideos: YoutubeRecentVideo[]): Promise<YoutubeNicheProfile> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are a YouTube channel analyst. Your job is to extract an accurate, evidence-based profile of a channel from real data — not to flatter or describe it generically.
Analyze the channel data and recent videos provided. Return a JSON object only — no preamble, no explanation, no markdown.
Rules:

Base every field strictly on what the data shows. If a field cannot be determined from the data, use null.
Do not use generic phrases like "engaging content" or "quality videos."
keywords must be actual words/phrases from real video titles and descriptions — not invented.
contentStyle must describe what the creator actually does (e.g. "talking-head tutorials under 10 minutes", "vlog-style product reviews", "faceless screencast walkthroughs") — not what they claim to do.
tone must be inferred from titles and descriptions — look for patterns like humor markers, urgency words, personal pronouns, or instructional language.
uploadCadence: calculate average days between the last 10 uploads. Express as a number.
topFormats: look at the 5 highest-view videos. What do they have in common structurally? (e.g. listicles, tutorials, challenges, reaction, story-time)
If the channel has fewer than 5 videos, set dataConfidence to "low".

Return shape:
{
"niche": string,
"contentStyle": string,
"tone": string,
"targetAudience": string,
"keywords": string[],
"topFormats": string[],
"uploadCadence": number | null,
"summary": string,
"dataConfidence": "low" | "medium" | "high"
}`,
      },
      {
        role: "user",
        content: JSON.stringify({ channel, recentVideos }),
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 1200,
  });
  await logTokenUsage({
    userId,
    feature: "channelSync",
    model: "gpt-4o-mini",
    ...usageTokens(completion.usage),
  });
  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = asRecord(parseAiJson(raw));
  return {
    niche: asString(parsed.niche) || "creator education",
    contentStyle: asString(parsed.contentStyle) || "educational",
    tone: asString(parsed.tone) || "clear and helpful",
    targetAudience: asString(parsed.targetAudience) || "YouTube viewers interested in this topic",
    keywords: asArray(parsed.keywords).map((item) => String(item)).filter(Boolean).slice(0, 8),
    summary: asString(parsed.summary) || "Niche analysis generated from connected YouTube data.",
    topFormats: asArray(parsed.topFormats).map((item) => String(item)).filter(Boolean).slice(0, 5),
    uploadCadence: parsed.uploadCadence == null ? null : parseNumber(parsed.uploadCadence),
    dataConfidence: asString(parsed.dataConfidence) || "medium",
  } as YoutubeNicheProfile;
}

export async function syncYoutubeChannel(userId: number) {
  const channels = await youtubeJson<{ items?: unknown[] }>(userId, dataApiUrl("channels", {
    part: "snippet,statistics,contentDetails",
    mine: "true",
    maxResults: "1",
  }), { cacheKey: `mine:${userId}`, quotaCost: 1, ttlMs: 15 * 60 * 1000 });

  const channel = asRecord(asArray(channels.items)[0]);
  if (!Object.keys(channel).length) throw new Error("No YouTube channel found for the connected Google account");
  const channelId = asString(channel.id);
  if (!channelId) throw new Error("Connected YouTube channel has no channel ID");

  const snippet = asRecord(channel.snippet);
  const statistics = asRecord(channel.statistics);
  const thumbnails = asRecord(snippet.thumbnails);
  const channelThumbnailUrl = asString(asRecord(thumbnails.high).url) || asString(asRecord(thumbnails.medium).url) || asString(asRecord(thumbnails.default).url);
  const recentVideos = await fetchRecentVideos(userId, channelId, 20);
  const analyzedNicheProfile = await analyzeNiche(userId, {
    id: channelId,
    title: asString(snippet.title),
    description: asString(snippet.description),
    subscriberCount: asString(statistics.subscriberCount),
    totalViewCount: asString(statistics.viewCount),
    videoCount: asString(statistics.videoCount),
  }, recentVideos);
  const nicheProfile = {
    ...analyzedNicheProfile,
    channelDescription: asString(snippet.description),
  };
  const now = new Date();

  await db.update(youtubeConnectionsTable)
    .set({
      channelId,
      channelTitle: asString(snippet.title),
      lastSyncedAt: now,
      updatedAt: now,
    })
    .where(eq(youtubeConnectionsTable.userId, userId));

  const [profile] = await db.insert(youtubeChannelProfilesTable)
    .values({
      userId,
      channelId,
      channelName: asString(snippet.title) || "YouTube channel",
      channelThumbnailUrl,
      subscriberCount: asString(statistics.subscriberCount),
      totalViewCount: asString(statistics.viewCount),
      videoCount: asString(statistics.videoCount),
      recentVideos,
      nicheProfile,
      fetchedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: youtubeChannelProfilesTable.userId,
      set: {
        channelId,
        channelName: asString(snippet.title) || "YouTube channel",
        channelThumbnailUrl,
        subscriberCount: asString(statistics.subscriberCount),
        totalViewCount: asString(statistics.viewCount),
        videoCount: asString(statistics.videoCount),
        recentVideos,
        nicheProfile,
        fetchedAt: now,
        updatedAt: now,
      },
    })
    .returning();

  return profile;
}

export async function getYoutubeStatus(userId: number) {
  let [connection] = await db.select().from(youtubeConnectionsTable).where(eq(youtubeConnectionsTable.userId, userId)).limit(1);
  let [profile] = await db.select().from(youtubeChannelProfilesTable).where(eq(youtubeChannelProfilesTable.userId, userId)).limit(1);
  const plans = await db.select().from(youtubeWeeklyPlansTable).where(eq(youtubeWeeklyPlansTable.userId, userId)).orderBy(desc(youtubeWeeklyPlansTable.weekNumber));
  const latestPlan = plans[0] ?? null;
  const latestResults = latestPlan
    ? await db.select().from(youtubePlanResultsTable).where(eq(youtubePlanResultsTable.planId, latestPlan.id))
    : [];
  let competitors = await db.select().from(youtubeCompetitorsTable).where(eq(youtubeCompetitorsTable.userId, userId)).orderBy(desc(youtubeCompetitorsTable.fetchedAt));

  const shouldAutoSync = Boolean(
    connection && (
      !profile
      || !Array.isArray(profile.recentVideos)
      || profile.recentVideos.length === 0
      || !connection.lastSyncedAt
      || (Date.now() - connection.lastSyncedAt.getTime()) > (15 * 60 * 1000)
    ),
  );

  if (shouldAutoSync) {
    try {
      profile = await syncYoutubeChannel(userId);
      [connection] = await db.select().from(youtubeConnectionsTable).where(eq(youtubeConnectionsTable.userId, userId)).limit(1);
    } catch {
      // Fall back to the last saved channel snapshot if live sync fails.
    }
  }

  if (connection && profile && !profile.channelThumbnailUrl) {
    try {
      profile = await syncYoutubeChannel(userId);
    } catch {
      // Keep returning the saved profile even if YouTube refresh fails.
    }
  }

  const competitorsMissingImages = competitors.filter((competitor) => competitor.channelId && !competitor.thumbnailUrl);
  if (connection && competitorsMissingImages.length) {
    try {
      const fetchedChannels = await fetchChannelsByIds(userId, competitorsMissingImages.map((competitor) => competitor.channelId || ""));
      const thumbnailEntries: Array<[string, string]> = fetchedChannels.flatMap((item) => {
          const channel = asRecord(item);
          const snippet = asRecord(channel.snippet);
          const thumbnails = asRecord(snippet.thumbnails);
          const thumbnailUrl = asString(asRecord(thumbnails.high).url) || asString(asRecord(thumbnails.medium).url) || asString(asRecord(thumbnails.default).url);
          const channelId = asString(channel.id);
          return channelId && thumbnailUrl ? [[channelId, thumbnailUrl]] : [];
        });
      const thumbnailByChannelId = new Map<string, string>(thumbnailEntries);

      for (const competitor of competitorsMissingImages) {
        const thumbnailUrl = thumbnailByChannelId.get(competitor.channelId || "");
        if (!thumbnailUrl) continue;
        await db.update(youtubeCompetitorsTable)
          .set({ thumbnailUrl, updatedAt: new Date() })
          .where(eq(youtubeCompetitorsTable.id, competitor.id));
      }

      competitors = competitors.map((competitor) => ({
        ...competitor,
        thumbnailUrl: competitor.thumbnailUrl || thumbnailByChannelId.get(competitor.channelId || "") || null,
      }));
    } catch {
      // Keep returning the saved competitors even if thumbnail refresh fails.
    }
  }

  const channelAnalytics = connection && profile ? await channelAnalyticsTimeline(userId) : null;
  const settings: YoutubeSettings = {
    preferredPostsPerWeek: Math.max(1, parseNumber(connection?.preferredPostsPerWeek) || 3),
    connectedAt: connection?.createdAt?.toISOString?.() ?? null,
    needsPostingPreference: !connection?.preferredPostsPerWeek,
  };
  return {
    connected: Boolean(connection),
    channel: profile,
    channelAnalytics,
    competitors,
    latestPlan,
    plans,
    latestResults,
    settings,
  };
}

async function fetchImageAsBase64(url?: string | null) {
  const target = asString(url);
  if (!target) return null;
  const response = await fetch(target);
  if (!response.ok) throw new Error(`Image fetch failed with ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer.toString("base64");
}

function likelyYoutubeFormatFromVideo(video: YoutubeRecentVideo) {
  const durationSec = parseYoutubeIsoDuration(video.duration);
  if (video.url.includes("/shorts/") || durationSec <= 180) return "youtube_shorts";
  return "youtube_long";
}

function buildAuditSearchQuery(video: YoutubeRecentVideo, nicheProfile: YoutubeNicheProfile) {
  const titleWords = video.title
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3)
    .slice(0, 6);
  const nicheWords = nicheProfile.keywords.slice(0, 3);
  return [...titleWords, ...nicheWords].join(" ").trim() || video.title;
}

export async function auditYoutubeVideo(userId: number, videoUrl: string): Promise<YoutubeVideoAuditReport> {
  const videoId = extractYoutubeVideoId(videoUrl);
  if (!videoId) throw new Error("Enter a valid YouTube video URL");

  const video = await fetchVideoById(userId, videoId);
  const channelId = video.channelId ?? null;
  const recentVideos = channelId ? await fetchRecentVideos(userId, channelId, 12) : [];
  const nicheProfile = await analyzeNiche(userId, {
    id: channelId ?? "",
    title: video.channelTitle,
    description: video.description,
    subscriberCount: null,
    totalViewCount: null,
    videoCount: null,
  }, recentVideos.length ? recentVideos : [video]);

  const searchQuery = buildAuditSearchQuery(video, nicheProfile);
  const comparableVideos = (await searchRelevantVideos(userId, searchQuery, 14))
    .filter((item) => item.id !== video.id && item.channelId !== video.channelId)
    .slice(0, 10);

  const comparableByChannel = new Map<string, YoutubeRecentVideo[]>();
  for (const item of comparableVideos) {
    const key = item.channelId || item.channelTitle || item.id;
    if (!comparableByChannel.has(key)) comparableByChannel.set(key, []);
    comparableByChannel.get(key)!.push(item);
  }

  const topCreators = [...comparableByChannel.values()]
    .map((videos) => {
      const first = videos[0]!;
      const averageViews = Math.round(videos.reduce((sum, current) => sum + parseNumber(current.viewCount), 0) / videos.length);
      return {
        channelName: first.channelTitle || "YouTube creator",
        subscriberCount: 0,
        averageViews,
        whyTheyMatter: `${first.channelTitle || "This creator"} is ranking around the same topic with clearer packaging or stronger audience pull.`,
      };
    })
    .sort((a, b) => b.averageViews - a.averageViews)
    .slice(0, 5);

  const thumbnailBase64 = await fetchImageAsBase64(video.thumbnailUrl).catch(() => null);
  const visualAuditRaw = thumbnailBase64
    ? await analyzeVisuals([thumbnailBase64], likelyYoutubeFormatFromVideo(video), "pro", `${video.title}\n\n${video.description}`, userId).catch(() => null)
    : null;
  const visualAuditRecord = visualAuditRaw ? asRecord(visualAuditRaw) : null;

  const pseudoTranscript = [
    `Video title: ${video.title}`,
    `Description: ${video.description}`,
    video.tags.length ? `Tags: ${video.tags.join(", ")}` : "",
  ].filter(Boolean).join("\n\n");

  const seoDraft = await generateSeo(
    pseudoTranscript,
    likelyYoutubeFormatFromVideo(video),
    [],
    "pro",
    undefined,
    video.title,
    undefined,
    userId,
  ).catch(() => ({ titles: [], description: "", hashtags: [], packagingStrategy: "", algorithmFit: "" } as any));

  const ageDays = daysSince(video.publishedAt);
  const viewsPerDay = ageDays ? Math.round(parseNumber(video.viewCount) / ageDays) : null;
  const channelMedianViews = median(recentVideos.map((item) => parseNumber(item.viewCount)));
  const competitorMedianViews = median(comparableVideos.map((item) => parseNumber(item.viewCount)));

  const auditPrompt = `You are a YouTube growth strategist producing a forensic audit for one existing video.
Your job is to explain why the video likely underperformed compared to stronger competitors in the same niche and format.

Rules:
- Be direct and evidence-based.
- Separate what is likely weak in packaging, topic choice, hook, thumbnail, tags, script clarity, and production quality.
- If transcript is unavailable, say so and base script diagnosis on title, description, niche, and visible packaging limitations only.
- Do not say "improve the title" without giving better title options.
- Do not say "fix the thumbnail" without giving a better thumbnail idea.
- Do not say "make the hook stronger" without giving an exact better opening line.
- Do not hallucinate private metrics. Use only the supplied public data and comparisons.

Return JSON only:
{
  "summary": "",
  "diagnosis": [
    { "area": "title|thumbnail|description|tags|hook|script|topic|quality", "issue": "", "whyItHurts": "", "confidence": "high|medium|low" }
  ],
  "competitorExamples": [
    { "title": "", "channelName": "", "url": "", "viewCount": 0, "whyItWins": "" }
  ],
  "fixes": {
    "titles": ["", "", ""],
    "description": "",
    "tags": ["", "", "", "", "", "", "", ""],
    "thumbnailIdea": "",
    "hookRewrite": "",
    "scriptDirection": "",
    "qualityFixes": ["", "", ""],
    "packagingStrategy": ""
  },
  "limitations": ["", ""]
}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: auditPrompt },
      {
        role: "user",
        content: JSON.stringify({
          video,
          nicheProfile,
          recentVideos: recentVideos.slice(0, 8),
          comparableVideos: comparableVideos.slice(0, 8),
          topCreators,
          visualAudit: visualAuditRecord ? {
            overallScore: Number(visualAuditRecord.overallVisualScore ?? 0),
            topFix: asString(visualAuditRecord.topFix) || "",
            lighting: asString(asRecord(visualAuditRecord.lighting).assessment) || "",
            framing: asString(asRecord(visualAuditRecord.framing).assessment) || "",
            sharpness: asString(asRecord(visualAuditRecord.sharpness).assessment) || "",
          } : null,
          seoDraft,
          performanceContext: {
            ageDays,
            viewsPerDay,
            channelMedianViews,
            competitorMedianViews,
          },
          transcriptAvailable: false,
        }),
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 2600,
  });

  await logTokenUsage({
    userId,
    feature: "youtubeVideoAudit",
    model: "gpt-4o",
    ...usageTokens(completion.usage),
  });

  const parsed = asRecord(parseAiJson(completion.choices[0]?.message?.content ?? "{}"));
  const diagnosis = asArray(parsed.diagnosis).map((item) => {
    const record = asRecord(item);
    return {
      area: asString(record.area) || "topic",
      issue: asString(record.issue) || "",
      whyItHurts: asString(record.whyItHurts) || "",
      confidence: (asString(record.confidence) as "high" | "medium" | "low") || "medium",
    };
  }).filter((item) => item.issue);
  const competitorExamples = asArray(parsed.competitorExamples).map((item) => {
    const record = asRecord(item);
    return {
      title: asString(record.title) || "",
      channelName: asString(record.channelName) || "",
      url: asString(record.url) || "",
      viewCount: parseNumber(record.viewCount),
      whyItWins: asString(record.whyItWins) || "",
    };
  }).filter((item) => item.title);
  const fixes = asRecord(parsed.fixes);

  return {
    summary: asString(parsed.summary) || "Audit generated from public YouTube data, thumbnail analysis, and competitor comparison.",
    video: {
      id: video.id,
      title: video.title,
      channelName: video.channelTitle || "YouTube channel",
      channelId,
      publishedAt: video.publishedAt,
      duration: video.duration,
      viewCount: parseNumber(video.viewCount),
      likeCount: parseNumber(video.likeCount),
      commentCount: parseNumber(video.commentCount),
      tags: video.tags,
      description: video.description,
      thumbnailUrl: video.thumbnailUrl ?? null,
      niche: nicheProfile.niche,
      contentStyle: nicheProfile.contentStyle,
      targetAudience: nicheProfile.targetAudience,
      likelyFormat: likelyYoutubeFormatFromVideo(video),
    },
    performanceContext: {
      ageDays,
      viewsPerDay,
      channelMedianViews,
      competitorMedianViews,
    },
    topCreators,
    competitorExamples: competitorExamples.length ? competitorExamples : comparableVideos.slice(0, 3).map((item) => ({
      title: item.title,
      channelName: item.channelTitle || "YouTube creator",
      url: item.url,
      viewCount: parseNumber(item.viewCount),
      whyItWins: "This video is pulling stronger public engagement around a similar topic or intent.",
    })),
    visualAudit: visualAuditRecord ? {
      overallScore: Number(visualAuditRecord.overallVisualScore ?? 0),
      topFix: asString(visualAuditRecord.topFix) || "",
      lighting: asString(asRecord(visualAuditRecord.lighting).assessment) || "",
      framing: asString(asRecord(visualAuditRecord.framing).assessment) || "",
      sharpness: asString(asRecord(visualAuditRecord.sharpness).assessment) || "",
    } : null,
    diagnosis,
    fixes: {
      titles: asArray(fixes.titles).map((item) => String(item)).filter(Boolean).slice(0, 5),
      description: asString(fixes.description) || asString(asRecord(seoDraft).description) || "",
      tags: asArray(fixes.tags).map((item) => String(item)).filter(Boolean).slice(0, 12),
      thumbnailIdea: asString(fixes.thumbnailIdea) || "",
      hookRewrite: asString(fixes.hookRewrite) || "",
      scriptDirection: asString(fixes.scriptDirection) || "",
      qualityFixes: asArray(fixes.qualityFixes).map((item) => String(item)).filter(Boolean).slice(0, 5),
      packagingStrategy: asString(fixes.packagingStrategy) || asString(asRecord(seoDraft).packagingStrategy) || "",
    },
    limitations: asArray(parsed.limitations).map((item) => String(item)).filter(Boolean).slice(0, 6).concat([
      "Transcript-level script analysis is not available yet for pasted public YouTube URLs in this first version.",
      "Frame-level visual analysis currently uses the public thumbnail as a visual proxy unless deeper video access is added later.",
    ]).filter((value, index, array) => array.indexOf(value) === index),
  };
}

export async function updateYoutubeSettings(userId: number, settings: { preferredPostsPerWeek: number }) {
  const preferredPostsPerWeek = Math.max(1, Math.min(30, Math.round(settings.preferredPostsPerWeek || 0)));
  const [connection] = await db.select().from(youtubeConnectionsTable).where(eq(youtubeConnectionsTable.userId, userId)).limit(1);
  if (!connection) throw new Error("Connect YouTube before saving posting settings");
  const [updated] = await db.update(youtubeConnectionsTable)
    .set({
      preferredPostsPerWeek,
      updatedAt: new Date(),
    })
    .where(eq(youtubeConnectionsTable.userId, userId))
    .returning();
  return {
    preferredPostsPerWeek: updated?.preferredPostsPerWeek ?? preferredPostsPerWeek,
    connectedAt: updated?.createdAt?.toISOString?.() ?? connection.createdAt?.toISOString?.() ?? null,
    needsPostingPreference: false,
  } satisfies YoutubeSettings;
}

export async function fetchTrendingVideos(userId: number, nicheProfile: YoutubeNicheProfile) {
  const query = (nicheProfile.keywords?.length ? nicheProfile.keywords.slice(0, 3).join(" ") : nicheProfile.niche) || "creator growth";
  const publishedAfter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const cacheKey = `trends:${query}:${publishedAfter.slice(0, 10)}`;
  const search = await youtubeJson<{ items?: unknown[] }>(userId, dataApiUrl("search", {
    part: "snippet",
    type: "video",
    q: query,
    order: "viewCount",
    publishedAfter,
    maxResults: "20",
    regionCode: "US",
  }), { cacheKey, quotaCost: 100, ttlMs: 6 * 60 * 60 * 1000 });
  const ids = asArray(search.items)
    .map((item) => asString(asRecord(asRecord(item).id).videoId))
    .filter((id): id is string => Boolean(id));
  if (!ids.length) return [];
  const videos = await youtubeJson<{ items?: unknown[] }>(userId, dataApiUrl("videos", {
    part: "snippet,statistics,contentDetails",
    id: ids.join(","),
    maxResults: "20",
  }), { cacheKey: `trend-videos:${ids.join(",")}`, quotaCost: 1, ttlMs: 6 * 60 * 60 * 1000 });
  return asArray(videos.items).map(normalizeVideo);
}

function postingFrequency(videos: YoutubeRecentVideo[]) {
  const dates = videos.map((video) => video.publishedAt ? new Date(video.publishedAt).getTime() : 0).filter(Boolean);
  if (dates.length < 2) return "Not enough recent videos to estimate";
  const min = Math.min(...dates);
  const max = Math.max(...dates);
  const weeks = Math.max(1, (max - min) / (7 * 24 * 60 * 60 * 1000));
  return `${(dates.length / weeks).toFixed(1)} videos/week across recent uploads`;
}

export async function discoverCompetitors(userId: number, profile: typeof youtubeChannelProfilesTable.$inferSelect) {
  const userSubscribers = parseNumber(profile.subscriberCount);
  const fallbackToSavedCompetitors = async () => {
    const existingCompetitors = await db
      .select()
      .from(youtubeCompetitorsTable)
      .where(eq(youtubeCompetitorsTable.userId, userId))
      .orderBy(desc(youtubeCompetitorsTable.fetchedAt));
    if (userSubscribers <= 0) return existingCompetitors.slice(0, 6);
    const filtered = existingCompetitors.filter((competitor) => {
      const subscribers = parseNumber(competitor.subscriberCount);
      return subscribers > 0 && subscribers <= userSubscribers * 5;
    });
    return filtered.length ? filtered : existingCompetitors.slice(0, 6);
  };

  try {
    const niche = asRecord(profile.nicheProfile) as Partial<YoutubeNicheProfile>;
    const query = (Array.isArray(niche.keywords) && niche.keywords.length ? niche.keywords.slice(0, 3).join(" ") : niche.niche) || profile.channelName;
    const searchQueries = [
      query,
      `${query} tutorial`,
      `${query} process`,
    ];
    const searchResults = await Promise.allSettled(searchQueries.map((item) => searchChannelIds(userId, item, 25)));
    const ids = [...new Set(
      searchResults
        .filter((result): result is PromiseFulfilledResult<string[]> => result.status === "fulfilled")
        .flatMap((result) => result.value),
    )]
      .filter((id) => id !== profile.channelId);
    if (!ids.length) {
      return fallbackToSavedCompetitors();
    }

    let channelItems: unknown[] = [];
    try {
      const channels = await youtubeJson<{ items?: unknown[] }>(userId, dataApiUrl("channels", {
        part: "snippet,statistics",
        id: ids.join(","),
        maxResults: String(Math.min(ids.length, 50)),
      }), { cacheKey: `competitor-channels:${ids.join(",")}`, quotaCost: 1, ttlMs: 24 * 60 * 60 * 1000 });
      channelItems = asArray(channels.items);
    } catch {
      return fallbackToSavedCompetitors();
    }

    const withTiers = channelItems.map((item) => {
      const channel = asRecord(item);
      const stats = asRecord(channel.statistics);
      const subscribers = parseNumber(stats.subscriberCount);
      const ratio = userSubscribers > 0 && subscribers > 0 ? subscribers / userSubscribers : Infinity;
      const tier = ratio <= 5 ? 1 : ratio <= 30 ? 2 : 3;
      return { item: channel, subscribers, ratio, tier };
    });

    let tier1 = withTiers.filter((item) => item.tier === 1);
    if (!tier1.length) {
      const fallbackSearchResults = await Promise.allSettled([
        searchChannelIds(userId, `${query} beginner`, 25),
        searchChannelIds(userId, `${query} small channel`, 25),
      ]);
      const fallbackIds = [...new Set(
        fallbackSearchResults
          .filter((result): result is PromiseFulfilledResult<string[]> => result.status === "fulfilled")
          .flatMap((result) => result.value),
      )]
        .filter((id) => id !== profile.channelId && !ids.includes(id));
      if (fallbackIds.length) {
        try {
          const fallbackChannels = await youtubeJson<{ items?: unknown[] }>(userId, dataApiUrl("channels", {
            part: "snippet,statistics",
            id: fallbackIds.join(","),
            maxResults: String(Math.min(fallbackIds.length, 50)),
          }), { cacheKey: `competitor-fallback:${fallbackIds.join(",")}`, quotaCost: 1, ttlMs: 24 * 60 * 60 * 1000 });
          const fallbackTiered = asArray(fallbackChannels.items).map((item) => {
            const channel = asRecord(item);
            const stats = asRecord(channel.statistics);
            const subscribers = parseNumber(stats.subscriberCount);
            const ratio = userSubscribers > 0 && subscribers > 0 ? subscribers / userSubscribers : Infinity;
            const tier = ratio <= 5 ? 1 : ratio <= 30 ? 2 : 3;
            return { item: channel, subscribers, ratio, tier };
          });
          tier1 = fallbackTiered.filter((item) => item.tier === 1);
          withTiers.push(...fallbackTiered);
        } catch {
          // Fallback discovery is optional; keep going with what we already found.
        }
      }
    }

    const candidatePool = tier1.length
      ? tier1
      : withTiers
        .filter((item) => item.subscribers > 0)
        .sort((a, b) => Math.abs(a.ratio - 1) - Math.abs(b.ratio - 1));

    const selected = candidatePool
      .sort((a, b) => a.subscribers - b.subscribers)
      .slice(0, 6)
      .filter((item, index, list) => list.findIndex((candidate) => asString(candidate.item.id) === asString(item.item.id)) === index);

    const existingCompetitors = await db
      .select()
      .from(youtubeCompetitorsTable)
      .where(eq(youtubeCompetitorsTable.userId, userId));
    const existingByChannelId = new Map(
      existingCompetitors
        .filter((competitor) => competitor.channelId)
        .map((competitor) => [competitor.channelId, competitor] as const),
    );
    const selectedChannelIds = new Set(
      selected
        .map((item) => asString(asRecord(item.item).id))
        .filter((id): id is string => Boolean(id)),
    );
    const staleDiscoveredIds = existingCompetitors
      .filter((competitor) => {
        const meta = readCompetitorMeta(competitor.niche);
        return meta.source !== "manual" && !selectedChannelIds.has(competitor.channelId);
      })
      .map((competitor) => competitor.id);

    for (const competitorId of staleDiscoveredIds) {
      await db.delete(youtubeCompetitorsTable).where(eq(youtubeCompetitorsTable.id, competitorId));
    }

    const saved = [];
    for (const entry of selected) {
      const channel = asRecord(entry.item);
      const channelId = asString(channel.id);
      if (!channelId) continue;
      try {
        const competitor = await upsertYoutubeCompetitor(userId, profile, channelId, {
          source: "discovered",
          existingCompetitor: existingByChannelId.get(channelId) ?? null,
          preserveManualSource: true,
          generateAiReport: false,
        });
        saved.push(competitor);
      } catch {
        // Skip one broken competitor rather than failing the whole discovery request.
      }
    }

    const savedCompetitors = await db
      .select()
      .from(youtubeCompetitorsTable)
      .where(eq(youtubeCompetitorsTable.userId, userId))
      .orderBy(desc(youtubeCompetitorsTable.fetchedAt));

    if (userSubscribers <= 0) return savedCompetitors.slice(0, 6);
    const filtered = savedCompetitors.filter((competitor) => {
      const subscribers = parseNumber(competitor.subscriberCount);
      return subscribers > 0 && subscribers <= userSubscribers * 5;
    });
    return filtered.length ? filtered : savedCompetitors.slice(0, 6);
  } catch {
    return fallbackToSavedCompetitors();
  }
}

export async function addYoutubeCompetitorByUrl(userId: number, channelUrl: string) {
  const [profile] = await db
    .select()
    .from(youtubeChannelProfilesTable)
    .where(eq(youtubeChannelProfilesTable.userId, userId))
    .limit(1);
  if (!profile) throw new Error("Connect YouTube before adding competitors");

  const channelId = await resolveYoutubeChannelIdFromUrl(channelUrl);
  const existingCompetitors = await db
    .select()
    .from(youtubeCompetitorsTable)
    .where(eq(youtubeCompetitorsTable.userId, userId));
  const existing = existingCompetitors.find((competitor) => competitor.channelId === channelId) ?? null;
  return await upsertYoutubeCompetitor(userId, profile, channelId, {
    source: "manual",
    requestedUrl: channelUrl.trim(),
    existingCompetitor: existing,
    preserveManualSource: true,
    generateAiReport: true,
  });
}

export async function removeYoutubeCompetitor(userId: number, competitorId: number) {
  const [competitor] = await db
    .select()
    .from(youtubeCompetitorsTable)
    .where(and(eq(youtubeCompetitorsTable.id, competitorId), eq(youtubeCompetitorsTable.userId, userId)))
    .limit(1);
  if (!competitor) throw new Error("Competitor not found");
  await db.delete(youtubeCompetitorsTable).where(eq(youtubeCompetitorsTable.id, competitorId));
  return { removed: true, id: competitorId };
}

async function analyticsSummary(userId: number) {
  const endDate = isoDate(new Date());
  const startDate = isoDate(addDays(new Date(), -90));
  try {
    const data = await youtubeJson<{ columnHeaders?: unknown[]; rows?: unknown[] }>(userId, analyticsUrl({
      ids: "channel==MINE",
      startDate,
      endDate,
      metrics: "views,estimatedMinutesWatched,averageViewDuration",
      dimensions: "day",
      sort: "day",
    }), { cacheKey: `analytics-summary:${userId}:${startDate}:${endDate}`, quotaCost: 1, ttlMs: 24 * 60 * 60 * 1000 });
    return data;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "YouTube Analytics summary unavailable" };
  }
}

async function channelAnalyticsTimeline(userId: number) {
  const endDate = isoDate(new Date());
  const startDate = isoDate(addDays(new Date(), -84));
  try {
    const data = await youtubeJson<{ rows?: unknown[] }>(userId, analyticsUrl({
      ids: "channel==MINE",
      startDate,
      endDate,
      metrics: "views,subscribersGained,subscribersLost,estimatedMinutesWatched,averageViewDuration",
      dimensions: "day",
      sort: "day",
    }), { cacheKey: `analytics-timeline:${userId}:${startDate}:${endDate}`, quotaCost: 1, ttlMs: 6 * 60 * 60 * 1000 });

    const daily = asArray(data.rows).map((row) => {
      const values = Array.isArray(row) ? row : [];
      const date = asString(values[0]) || "";
      const views = parseNumber(values[1]);
      const subscribersGained = parseNumber(values[2]);
      const subscribersLost = parseNumber(values[3]);
      const estimatedMinutesWatched = parseNumber(values[4]);
      const averageViewDuration = parseNumber(values[5]);
      return {
        date,
        views,
        subscribersGained,
        subscribersLost,
        subscribersNet: subscribersGained - subscribersLost,
        estimatedMinutesWatched,
        averageViewDuration,
      } satisfies YoutubeAnalyticsPoint;
    }).filter((point) => point.date);

    return { daily };
  } catch (err) {
    return { daily: [], error: err instanceof Error ? err.message : "YouTube Analytics timeline unavailable" };
  }
}

async function previousPerformanceSummary(userId: number) {
  const results = await db.select().from(youtubePlanResultsTable).where(eq(youtubePlanResultsTable.userId, userId)).orderBy(desc(youtubePlanResultsTable.fetchedAt));
  if (!results.length) return null;
  const [profile] = await db.select().from(youtubeChannelProfilesTable).where(eq(youtubeChannelProfilesTable.userId, userId)).limit(1);
  const plans = await db.select().from(youtubeWeeklyPlansTable).where(eq(youtubeWeeklyPlansTable.userId, userId)).orderBy(desc(youtubeWeeklyPlansTable.weekNumber));
  const recentVideos = Array.isArray(profile?.recentVideos) ? profile.recentVideos.map((video) => asRecord(video)) : [];
  const publishedByVideoId = new Map<string, { publishedAt: string | null; publishedDay: string | null }>(
    recentVideos.flatMap((video) => {
      const id = asString(video.id);
      const publishedAt = asString(video.publishedAt);
      if (!id) return [];
      return [[id, {
        publishedAt,
        publishedDay: publishedAt ? getDayNameForIso(publishedAt.slice(0, 10)) : null,
      }] as const];
    }),
  );
  const ideaFeedbackSummary = await getPersistedIdeaFeedbackSummary(userId, profile, plans);
  const filteredResults: PreviousPerformanceResultPayload[] = results
    .map((result) => {
      const metrics = asRecord(result.metrics);
      const linkedPublish = publishedByVideoId.get(result.videoId);
      const plan = plans.find((item) => item.id === result.planId);
      const matchingDay = plan
        ? asPlanDays(asArray(asRecord(plan.plan).days)).find((day) => parsePlanDayIndex(day.day, -1) === result.dayIndex)
        : null;
      return {
        plannedTitle: result.plannedTitle,
        videoUrl: result.videoUrl,
        videoId: result.videoId,
        fetchedAt: result.fetchedAt?.toISOString?.() ?? null,
        publishedAt: linkedPublish?.publishedAt ?? null,
        publishedDay: linkedPublish?.publishedDay ?? null,
        metrics,
        channelAverages: {
          ctr: null,
          views: null,
          watchTime: null,
        },
        linkedIdeaFeedback: {
          aiFeedback: normalizeIdeaFeedback(matchingDay?.aiFeedback),
          wasDeleted: Boolean(matchingDay?.isDeleted),
        },
        ideaFeedbackSummary,
      } satisfies PreviousPerformanceResultPayload;
    })
    .filter((result) => metricsHasLinkedSignal(result.metrics))
    .sort((a, b) => (b.publishedAt || b.fetchedAt || "").localeCompare(a.publishedAt || a.fetchedAt || ""))
    .slice(0, 30);
  if (!filteredResults.length) return null;
  const ctrAverage = averageMetric(filteredResults, "impressionClickThroughRate");
  const viewsAverage = averageMetric(filteredResults, "views");
  const watchTimeAverage = averageMetric(filteredResults, "estimatedMinutesWatched");
  for (const result of filteredResults) {
    result.channelAverages = {
      ctr: ctrAverage,
      views: viewsAverage,
      watchTime: watchTimeAverage,
    };
  }
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are a YouTube performance analyst reviewing a creator's past weekly content plans and their real results.
Your job is to extract honest patterns — what worked, what flopped, and what the data suggests for next week. Return JSON only.
Rules:

Only draw conclusions that are supported by the data. If sample size is too small (fewer than 5 results with metrics), say so in lowConfidenceNote.
Do not invent correlations. If CTR data is missing, omit CTR conclusions.
"Worked" means: CTR above channel average, OR views above channel average, OR watch time above channel average — at least one signal.
"Flopped" means: performed below all three of the above benchmarks where data exists.
bestPostingDays: based on actual publish dates of top performers, not assumptions.
Identify topic clusters in the top performers — not just individual video titles.
ideaFeedbackPatterns: summarize what the user liked, disliked, and deleted from AI suggestions (separate from actual video performance).

Return shape:
{
"topPerformingTopics": string[],
"topPerformingFormats": string[],
"highestCtrTypes": string[],
"watchTimeTopics": string[],
"bestPostingDays": string[],
"flops": string[],
"flopReasons": string,
"ideaFeedbackPatterns": {
"liked": string[],
"disliked": string[],
"deleted": string[]
},
"lowConfidenceNote": string | null,
"shortSummary": string
}`,
      },
      { role: "user", content: JSON.stringify(filteredResults) },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 1200,
  });
  await logTokenUsage({
    userId,
    feature: "perfSummary",
    model: "gpt-4o-mini",
    ...usageTokens(completion.usage),
  });
  return parseAiJson(completion.choices[0]?.message?.content ?? "{}");
}

async function hydrateStoredResultMetrics(userId: number) {
  const results = await db.select().from(youtubePlanResultsTable).where(eq(youtubePlanResultsTable.userId, userId)).orderBy(desc(youtubePlanResultsTable.fetchedAt));
  const hydrated = [];
  for (const result of results) {
    const hasMetrics = result.metrics && typeof result.metrics === "object" && Object.keys(result.metrics as Record<string, unknown>).length > 0;
    if (hasMetrics) {
      hydrated.push(result);
      continue;
    }
    const metrics = await fetchVideoAnalytics(userId, result.videoId).catch(() => ({}));
    const [updated] = await db.update(youtubePlanResultsTable)
      .set({ metrics, fetchedAt: new Date(), updatedAt: new Date() })
      .where(eq(youtubePlanResultsTable.id, result.id))
      .returning();
    hydrated.push(updated ?? { ...result, metrics });
  }
  return hydrated;
}

function normalizeGeneratedYoutubePlan(
  rawPlan: JsonRecord,
  startDate: string,
  performanceSignals: PerformanceSignalSummary,
  preferredPostsPerWeek: number,
) {
  const rangeMin = performanceSignals.titleLengthInsight?.min ?? 35;
  const rangeMax = performanceSignals.titleLengthInsight?.max && performanceSignals.titleLengthInsight.max < 999
    ? performanceSignals.titleLengthInsight.max
    : 55;
  const selectedDates = Array.from({ length: 7 }).map((_, index) => {
    const date = isoDate(addDays(new Date(`${startDate}T00:00:00Z`), index));
    const weekday = getDayNameForIso(date);
    const slot = performanceSignals.bestPostingTimeByDay.find((item) => item.day === weekday) ?? {
      day: weekday,
      slotLabel: "18:00-24:00",
      suggestedTime: "20:00",
      averageViews: 0,
    };
    return { date, weekday, slot };
  })
    .sort((a, b) => b.slot.averageViews - a.slot.averageViews || a.date.localeCompare(b.date))
    .slice(0, preferredPostsPerWeek)
    .sort((a, b) => a.date.localeCompare(b.date));
  const rawDays = asArray(rawPlan.days);
  const normalizedDays = selectedDates.map((selected, index) => {
    const source = asRecord(rawDays[index]);
    const contentIdea = normalizeTitleToRange(asString(source.title) || asString(source.contentIdea) || `Week ${index + 1} YouTube idea`, rangeMin, rangeMax);
    const whyThisIdea = asString(source.whyThisIdea)?.trim();
    const lowSignalNote = asString(source.lowSignalNote)?.trim();
    return {
      day: parsePlanDayIndex(source.day, index + 1),
      date: asString(source.date) || selected.date,
      bestDay: asString(source.bestDay) || (selected.slot.averageViews > 0 ? selected.weekday : null),
      stage: asString(source.stage) || "idea",
      contentIdea,
      hook: asString(source.hook) || contentIdea,
      outline: [],
      bestPostingTime: selected.slot.suggestedTime || (asString(source.bestPostingTime) || "20:00"),
      rationale: whyThisIdea || asString(source.rationale) || `${selected.weekday} ${selected.slot.slotLabel} is one of your strongest available windows from the heatmap, so this idea is scheduled to ride that signal.`,
      tags: asArray(source.tags).map((item) => String(item)).filter(Boolean).slice(0, 12),
      soundSuggestion: asString(source.estimatedLength) || asString(source.soundSuggestion) || "",
      competitorReference: asString(source.signalSource) || asString(source.competitorReference) || "",
      descriptionSuggestion: asString(source.videoDescription) || asString(source.descriptionSuggestion) || asString(source.targetKeyword) || "",
      thumbnailConcept: asString(source.thumbnailIdea) || asString(source.thumbnailConcept) || "",
      format: asString(source.format) || "",
      targetKeyword: asString(source.targetKeyword) || "",
      estimatedLength: asString(source.estimatedLength) || "",
      whyThisIdea: whyThisIdea || "",
      signalSource: asString(source.signalSource) || "low_signal",
      confidence: asString(source.confidence) || "medium",
      lowSignalNote: lowSignalNote || null,
      ideaOrigin: "ai" as const,
      aiFeedback: null,
      feedbackUpdatedAt: null,
      regeneratedAt: null,
      isDeleted: false,
      deletedAt: null,
    };
  });

  return {
    ...rawPlan,
    summary: asString(rawPlan.weekSummary) || asString(rawPlan.summary) || "",
    performanceInsight: asString(rawPlan.performanceInsight) || "",
    competitorInsight: asString(rawPlan.competitorInsight) || "",
    days: normalizedDays,
  };
}

async function loadPlanForUpdate(userId: number, planId: number) {
  const [plan] = await db.select().from(youtubeWeeklyPlansTable).where(and(eq(youtubeWeeklyPlansTable.id, planId), eq(youtubeWeeklyPlansTable.userId, userId))).limit(1);
  if (!plan) throw new Error("Plan not found");
  return plan;
}

async function savePlanDays(plan: typeof youtubeWeeklyPlansTable.$inferSelect, nextDays: JsonRecord[]) {
  const planRecord = asRecord(plan.plan);
  const nextPlan = { ...planRecord, days: nextDays };
  const [saved] = await db.update(youtubeWeeklyPlansTable)
    .set({
      plan: nextPlan,
      updatedAt: new Date(),
    })
    .where(eq(youtubeWeeklyPlansTable.id, plan.id))
    .returning();
  return saved ?? { ...plan, plan: nextPlan };
}

async function updatePlanDay(
  userId: number,
  planId: number,
  dayIndex: number,
  mutate: (day: JsonRecord) => JsonRecord,
) {
  const plan = await loadPlanForUpdate(userId, planId);
  const rawDays = asPlanDays(asArray(asRecord(plan.plan).days));
  const dayPosition = rawDays.findIndex((day) => parsePlanDayIndex(day.day, -1) === dayIndex);
  if (dayPosition === -1) throw new Error("Idea not found");

  const updatedDay = normalizePlanDayRecord(mutate(rawDays[dayPosition]), dayIndex);
  const nextDays = [...rawDays];
  nextDays[dayPosition] = updatedDay;
  const saved = await savePlanDays(plan, nextDays);
  return { plan: saved, day: updatedDay };
}

export async function generateYoutubeWeeklyPlan(userId: number) {
  const [profile] = await db.select().from(youtubeChannelProfilesTable).where(eq(youtubeChannelProfilesTable.userId, userId)).limit(1);
  if (!profile) throw new Error("Connect YouTube before generating a plan");
  const connection = await getYoutubeConnection(userId);
  const plans = await db.select().from(youtubeWeeklyPlansTable).where(eq(youtubeWeeklyPlansTable.userId, userId)).orderBy(desc(youtubeWeeklyPlansTable.weekNumber));
  const nicheProfile = asRecord(profile.nicheProfile) as unknown as YoutubeNicheProfile;
  const preferredPostsPerWeek = Math.max(1, parseNumber(connection?.preferredPostsPerWeek) || 3);
  const [
    trendsResult,
    competitorsResult,
    analyticsResult,
    analyticsTimelineResult,
    hydratedResultsResult,
    pastPerformanceResult,
  ] = await Promise.allSettled([
    fetchTrendingVideos(userId, nicheProfile),
    discoverCompetitors(userId, profile),
    analyticsSummary(userId),
    channelAnalyticsTimeline(userId),
    hydrateStoredResultMetrics(userId),
    previousPerformanceSummary(userId),
  ]);
  const trends = trendsResult.status === "fulfilled" ? trendsResult.value : [];
  const competitors = competitorsResult.status === "fulfilled" ? competitorsResult.value : [];
  const analytics = analyticsResult.status === "fulfilled" ? analyticsResult.value : {};
  const analyticsTimeline = analyticsTimelineResult.status === "fulfilled"
    ? analyticsTimelineResult.value
    : { daily: [], byWeekday: [], bestPostingTimeByDay: [], topWindows: [] };
  const hydratedResults = hydratedResultsResult.status === "fulfilled" ? hydratedResultsResult.value : [];
  const pastPerformance = pastPerformanceResult.status === "fulfilled"
    ? pastPerformanceResult.value
    : {
        summary: "Limited historical performance data was available during this run.",
        whatWorked: [],
        whatMissed: [],
        recommendations: [],
      };
  const [lastPlan] = plans;
  const lastPlanResults = lastPlan
    ? await db.select().from(youtubePlanResultsTable).where(eq(youtubePlanResultsTable.planId, lastPlan.id)).limit(1)
    : [];
  const shouldReplaceDraftPlan = Boolean(lastPlan && lastPlanResults.length === 0);
  const weekNumber = shouldReplaceDraftPlan ? lastPlan!.weekNumber : (lastPlan?.weekNumber ?? 0) + 1;
  const startDate = isoDate(new Date());
  const endDate = isoDate(addDays(new Date(), 6));
  const recentVideos = Array.isArray(profile.recentVideos) ? profile.recentVideos : [];
  const performanceSignals = derivePerformanceSignals(
    recentVideos,
    trends,
    analyticsTimeline.daily ?? [],
    competitors,
    parseNumber(profile.subscriberCount),
    hydratedResults.slice(0, 20).map((result) => ({
      plannedTitle: result.plannedTitle,
      videoUrl: result.videoUrl,
      metrics: asRecord(result.metrics),
    })),
  );
  const ideaFeedbackSummary = await getPersistedIdeaFeedbackSummary(userId, profile, plans);
  const topVideos = [...recentVideos]
    .sort((a, b) => parseNumber(asRecord(b).viewCount) - parseNumber(asRecord(a).viewCount))
    .slice(0, 10)
    .map((video) => {
      const item = asRecord(video);
      return {
        id: asString(item.id),
        title: asString(item.title),
        description: asString(item.description)?.slice(0, 900),
        publishedAt: asString(item.publishedAt),
        viewCount: parseNumber(item.viewCount),
        tags: asArray(item.tags).map((tag) => String(tag)).filter(Boolean),
        duration: asString(item.duration),
      };
    });
  const analyticsRows = asArray(asRecord(analytics).rows)
    .map((row) => Array.isArray(row) ? row : [])
    .filter((row) => row.length >= 4);
  const avgViewDuration = analyticsRows.length
    ? Math.round(analyticsRows.reduce((sum, row) => sum + parseNumber(row[3]), 0) / analyticsRows.length)
    : null;
  const avgCTR = averageMetric(hydratedResults.map((result) => ({ metrics: asRecord(result.metrics) })), "impressionClickThroughRate");
  const bestPostingDays = performanceSignals.bestPostingTimeByDay
    .filter((item) => item.averageViews > 0)
    .sort((a, b) => b.averageViews - a.averageViews)
    .slice(0, Math.max(1, preferredPostsPerWeek))
    .map((item) => item.day);
  const tagEvidence = buildYoutubeTagEvidenceSummary(recentVideos, competitors, performanceSignals);
  const context = {
    profile,
    channelProfile: profile,
    nicheProfile,
    recentVideos,
    trends,
    competitors,
    analytics: {
      ...asRecord(analytics),
      topVideos,
      avgCTR,
      avgViewDuration,
      bestPostingDays,
    },
    analyticsTimeline,
    performanceSignals,
    tagEvidence,
    performanceSummary: pastPerformance,
    ideaFeedbackSummary,
    pastPerformance,
    lastWeekPlan: lastPlan?.plan ?? null,
    weekNumber,
    startDate,
    endDate,
    preferredPostsPerWeek,
  };

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are a YouTube growth strategist who thinks like a top creator, not a content agency.
Your job is to generate a weekly content plan for one specific creator based on their real channel data, past performance, competitor landscape, current trends, and their feedback on previous AI suggestions.
HOW TO REASON (follow this order before writing anything):

Read the performanceSummary. What actually worked last week? Start from there.
Check ideaFeedbackSummary. What did the user explicitly like, dislike, or delete? Never repeat a deleted idea concept. Avoid patterns from disliked ideas. Build on patterns from liked ideas.
Look at the analytics. What topics have the highest CTR? What watch time signals exist? What is the best posting day pattern?
Check competitors. What are they covering that this channel hasn't? What formats are performing for them?
Check trends. Which of the trending topics are actually relevant to this channel's niche? Ignore trends that are a stretch.
Now generate. Every idea must trace to at least one of the above signals. If you can't justify an idea with data, don't include it.

IDEA QUALITY RULES:

Titles, descriptions, tags, and thumbnail ideas must sound like this creator wrote them. Infer their language from recent video titles/descriptions/tags: repeated phrases, tone, word choice, audience address, punctuation, and how they frame value.
Use the nicheProfile and competitor/top-performer examples to make the package feel native to this content category, not generic YouTube advice.
Titles must be specific, direct, with a clear payoff implied. Never use hollow phrases like "the ultimate guide", "you need to know this", or "game changer."
Hook must name a specific tension or question the video answers in the first 10 seconds. Not a vague teaser.
Thumbnail concept must be visually distinct from competitors. Describe the specific visual — not "bold text + face."
Tags must be actual search terms a real viewer would type — not keyword-stuffed variations of the title.
Build tags from evidence in this order: proven tags from the creator's better-performing videos, exact-topic phrases visible in strong titles/descriptions, rising niche tags from trend data, then only a few long-tail search phrases that fit the same topic. Do not invent unsupported tags.
Descriptions must be ready-to-paste YouTube descriptions in the creator's own voice: 2-4 sentences, clear promise, niche keywords woven naturally, no fake stats.
Every card needs all four publish assets: title, videoDescription, tags, thumbnailIdea.
Study which previous videos earned the most views/CTR/subscriber lift. Reuse their winning title structure, topic framing, tag clusters, and thumbnail logic where it honestly fits.
If the channel's data is thin on a given day, set confidence to "low" and explain why in lowSignalNote.
Never suggest a topic concept the user deleted in the past. Flag it if you're unsure whether a concept is too similar.
If a day uses a short-form or vertical format like YouTube Shorts, the hook must be the exact first spoken line or first on-screen phrase, not a generic summary.
For short-form or vertical ideas, describe the first visual beat too: what the viewer sees in the opening frame and what changes in the next second or two.
For short-form or vertical ideas, thumbnailIdea should behave like cover-direction or opening-frame direction: specific composition, subject action, text if any, and why it stops the scroll.
For short-form or vertical ideas, avoid vague notes like "make it punchier" or "show value fast." Say what the creator should literally say or show.
If a day uses a long-form YouTube format, treat it like promise fulfillment over time: the hook should validate the click in the first 15-30 seconds, the thumbnailIdea should behave like a true thumbnail concept, and the title should balance search clarity with curiosity honestly.
For long-form ideas, structure whyThisIdea around packaging quality, retention structure, and watch-time payoff, not just raw trend novelty.

POSTING STRATEGY:

Use the channel's actual best posting days from analytics. Do not default to "Tuesday and Thursday."
If posting day data is unavailable, leave bestDay as null and note it.

OUTPUT RULES:

Return JSON only. No explanation, no preamble, no markdown fences.
Every day object must match the exact shape below.
Generate exactly as many day objects as the channel's upload cadence calls for this week — do not pad with filler days.

Return this exact shape:
{
"weekSummary": string,
"performanceInsight": string,
"competitorInsight": string,
"days": [
{
"date": string,
"bestDay": string | null,
"title": string,
"videoDescription": string,
"hook": string,
"thumbnailIdea": string,
"format": string,
"targetKeyword": string,
"tags": string[],
"estimatedLength": string,
"whyThisIdea": string,
"signalSource": "performance" | "feedback" | "competitor" | "trend" | "channel_gap" | "low_signal",
"confidence": "high" | "medium" | "low",
"lowSignalNote": string | null
}
]
}`,
      },
      { role: "user", content: JSON.stringify(context) },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 5000,
  });
  await logTokenUsage({
    userId,
    feature: "ytPlanGenerate",
    model: "gpt-4o",
    ...usageTokens(completion.usage),
  });

  const plan = normalizeGeneratedYoutubePlan(asRecord(parseAiJson(completion.choices[0]?.message?.content ?? "{}")), startDate, performanceSignals, preferredPostsPerWeek);
  if (shouldReplaceDraftPlan && lastPlan) {
    const [saved] = await db.update(youtubeWeeklyPlansTable)
      .set({
        startDate,
        endDate,
        plan,
        contextSnapshot: context,
        updatedAt: new Date(),
      })
      .where(eq(youtubeWeeklyPlansTable.id, lastPlan.id))
      .returning();
    return saved;
  }

  const [saved] = await db.insert(youtubeWeeklyPlansTable).values({
    userId,
    weekNumber,
    startDate,
    endDate,
    plan,
    contextSnapshot: context,
    updatedAt: new Date(),
  }).returning();
  return saved;
}

export async function improveYoutubeIdea(userId: number, idea: { title?: string; angle?: string; date?: string }) {
  const [profile] = await db.select().from(youtubeChannelProfilesTable).where(eq(youtubeChannelProfilesTable.userId, userId)).limit(1);
  if (!profile) throw new Error("Connect YouTube before improving ideas");
  const plans = await db.select().from(youtubeWeeklyPlansTable).where(eq(youtubeWeeklyPlansTable.userId, userId)).orderBy(desc(youtubeWeeklyPlansTable.weekNumber));
  const ideaFeedbackSummary = await getPersistedIdeaFeedbackSummary(userId, profile, plans);
  const recentVideos = Array.isArray(profile.recentVideos) ? profile.recentVideos.map((video) => asRecord(video)) : [];
  const topVideos = [...recentVideos]
    .sort((a, b) => parseNumber(asRecord(b).viewCount) - parseNumber(asRecord(a).viewCount))
    .slice(0, 10)
    .map((video) => ({
      title: asString(video.title),
      description: asString(video.description)?.slice(0, 900),
      tags: asArray(video.tags).map((tag) => String(tag)).filter(Boolean).slice(0, 12),
      viewCount: parseNumber(video.viewCount),
      publishedAt: asString(video.publishedAt),
    }));
  const recentLanguageSamples = recentVideos.slice(0, 12).map((video) => ({
    title: asString(video.title),
    description: asString(video.description)?.slice(0, 500),
    tags: asArray(video.tags).map((tag) => String(tag)).filter(Boolean).slice(0, 10),
  }));
  const competitors = await db
    .select()
    .from(youtubeCompetitorsTable)
    .where(eq(youtubeCompetitorsTable.userId, userId))
    .limit(8);
  const competitorExamples = competitors.map((competitor) => ({
    channelName: competitor.channelName,
    mostViewedRecentVideos: asArray(competitor.mostViewedRecentVideos).map((video) => {
      const item = asRecord(video);
      return {
        title: asString(item.title),
        viewCount: asString(item.viewCount),
      };
    }).filter((video) => video.title).slice(0, 5),
  }));
  const performanceSignals = derivePerformanceSignals(
    recentVideos.map((video) => normalizeVideo(video)),
    [],
    [],
    competitors,
    parseNumber(profile.subscriberCount),
    [],
  );
  const tagEvidence = buildYoutubeTagEvidenceSummary(recentVideos, competitors, performanceSignals);
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are a YouTube content strategist helping a creator sharpen one specific idea they came up with.
Your job is NOT to replace their idea with something generic. Your job is to make their specific idea stronger — better title, clearer hook, more search-targeted, more thumbnail-friendly — while staying true to what they were going for.
Rules:

Use the creator's own language. Infer it from their previous published video titles, descriptions, and tags: tone, recurring words, audience address, pacing, punctuation, and promise style.
Use the niche profile and competitor/top-performer examples to make the idea likely to perform in this content category.
Output a complete publish package: Video Title, Video Description, Tags, Thumbnail Idea.
Look for the algorithm/pattern behind successful previous videos: winning title structure, topic framing, tag clusters, and thumbnail logic. Reuse those patterns when they fit this idea.
Read their feedback history. If this idea direction was previously disliked or deleted, flag it honestly rather than silently improving it.
Improve the title: make it more specific, cut filler words, front-load the payoff.
Sharpen the hook: name the exact tension or question the viewer will care about in the first 10 seconds.
Write a ready-to-paste description in the creator's voice: 2-4 sentences, natural niche keywords, clear promise, no fake claims.
Suggest 8-12 tags that come from evidence in this order: proven tags from the creator's strong videos, exact-topic phrases visible in strong titles/descriptions, rising niche tags when they honestly fit, then a few long-tail search phrases. Do not pad the list with generic filler.
Suggest a thumbnail concept that is visually distinct — describe the actual image, not just "bold text."
Suggest 1 alternative angle on the same topic if the original framing has weak search volume potential.
If this idea would work best as a Short or other vertical video, make the hook the exact first spoken line and make the thumbnailIdea describe the opening frame or cover direction in concrete terms.
For short-form ideas, never give vague advice. Say exactly what to open on, what to say first, and what visual change creates the scroll-stop.
If this idea would work best as a long-form YouTube video, make the hook validate the click within the first 15-30 seconds and make the thumbnailIdea describe a real thumbnail concept, not a cover frame.
Do not pad the response with explanations. Return JSON only.

Return shape:
{
"improvedTitle": string,
"videoDescription": string,
"improvedHook": string,
"thumbnailIdea": string,
"targetKeyword": string,
"tags": string[],
"alternativeAngle": string | null,
"feedbackWarning": string | null
}`,
      },
      {
        role: "user",
        content: JSON.stringify({
          idea,
          channelProfile: profile,
          ideaFeedbackSummary: {
            liked: ideaFeedbackSummary.liked,
            disliked: ideaFeedbackSummary.disliked,
            deleted: ideaFeedbackSummary.deleted,
          },
          nicheProfile: asRecord(profile.nicheProfile),
          recentLanguageSamples,
          topVideos,
          competitorExamples,
          tagEvidence,
        }),
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 1400,
  });
  await logTokenUsage({
    userId,
    feature: "improveIdea",
    model: "gpt-4o-mini",
    ...usageTokens(completion.usage),
  });
  const improved = asRecord(parseAiJson(completion.choices[0]?.message?.content ?? "{}"));
  const improvedTitle = asString(improved.improvedTitle)?.trim() || idea.title?.trim() || "YouTube idea";
  const improvedHook = asString(improved.improvedHook)?.trim() || idea.angle?.trim() || improvedTitle;
  const alternativeAngle = asString(improved.alternativeAngle)?.trim();
  const feedbackWarning = asString(improved.feedbackWarning)?.trim();
  const rationaleParts = [feedbackWarning, alternativeAngle ? `Alternative angle: ${alternativeAngle}` : null].filter(Boolean);
  return {
    ...improved,
    contentIdea: improvedTitle,
    hook: improvedHook,
    outline: alternativeAngle ? [alternativeAngle] : [],
    rationale: rationaleParts.join(" "),
    tags: asArray(improved.tags).map((item) => String(item)).filter(Boolean).slice(0, 12),
    thumbnailConcept: asString(improved.thumbnailIdea)?.trim() || asString(improved.thumbnailConcept)?.trim() || "",
    descriptionSuggestion: asString(improved.videoDescription)?.trim() || asString(improved.descriptionSuggestion)?.trim() || asString(improved.targetKeyword)?.trim() || "",
  };
}

export async function updateYoutubeIdeaFeedback(userId: number, planId: number, dayIndex: number, feedback: IdeaFeedback) {
  const normalizedFeedback = normalizeIdeaFeedback(feedback);
  const result = await updatePlanDay(userId, planId, dayIndex, (day) => ({
    ...day,
    ideaOrigin: normalizeIdeaOrigin(day.ideaOrigin),
    aiFeedback: normalizedFeedback,
    feedbackUpdatedAt: new Date().toISOString(),
  }));
  const day = asRecord(result.day);
  if (normalizeIdeaOrigin(day.ideaOrigin) === "ai") {
    if (normalizedFeedback === "liked") {
      await persistIdeaFeedbackSummary(userId, (summary) => ({
        ...summary,
        liked: dedupeByKey([
          ...summary.liked,
          {
            topic: summarizeIdeaConcept(day),
            format: inferIdeaFormat(day),
            signalSource: inferIdeaSignalSource(day),
          },
        ].reverse(), (item) => `${item.topic}|${item.format}|${item.signalSource}`).slice(0, 30),
      }));
    }
    if (normalizedFeedback === "disliked") {
      await persistIdeaFeedbackSummary(userId, (summary) => ({
        ...summary,
        disliked: dedupeByKey([
          ...summary.disliked,
          {
            titleConcept: asString(day.contentIdea)?.trim() || summarizeIdeaConcept(day),
            format: inferIdeaFormat(day),
          },
        ].reverse(), (item) => `${item.titleConcept}|${item.format}`).slice(0, 30),
      }));
    }
  }
  return result;
}

export async function createYoutubePlanDay(userId: number, planId: number, dayInput: JsonRecord) {
  const plan = await loadPlanForUpdate(userId, planId);
  const rawDays = asPlanDays(asArray(asRecord(plan.plan).days));
  const highestDay = rawDays.reduce((max, day) => Math.max(max, parsePlanDayIndex(day.day, 0)), 0);
  const nextDay = normalizePlanDayRecord({
    ...dayInput,
    day: parsePlanDayIndex(dayInput.day, highestDay + 1),
    ideaOrigin: normalizeIdeaOrigin(dayInput.ideaOrigin),
    isDeleted: false,
    deletedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }, highestDay + 1);
  const saved = await savePlanDays(plan, [...rawDays, nextDay]);
  return { plan: saved, day: nextDay };
}

export async function patchYoutubePlanDay(userId: number, planId: number, dayIndex: number, patch: PlanDayPatch) {
  return updatePlanDay(userId, planId, dayIndex, (day) => ({
    ...day,
    ...patch,
    ideaOrigin: patch.ideaOrigin ? normalizeIdeaOrigin(patch.ideaOrigin) : normalizeIdeaOrigin(day.ideaOrigin),
    aiFeedback: patch.aiFeedback === undefined ? normalizeIdeaFeedback(day.aiFeedback) : normalizeIdeaFeedback(patch.aiFeedback),
    isDeleted: patch.isDeleted === undefined ? Boolean(day.isDeleted) : Boolean(patch.isDeleted),
    deletedAt: patch.deletedAt === undefined ? asString(day.deletedAt) : patch.deletedAt,
    updatedAt: new Date().toISOString(),
  }));
}

export async function generateYoutubeIdeaThumbnail(
  userId: number,
  planId: number,
  dayIndex: number,
  input: { textPreference?: string | null; sourceImages?: unknown; preserveUploadedImage?: unknown },
) {
  const plan = await loadPlanForUpdate(userId, planId);
  const rawDays = asPlanDays(asArray(asRecord(plan.plan).days));
  const existingDay = rawDays.find((day) => parsePlanDayIndex(day.day, -1) === dayIndex);
  if (!existingDay) throw new Error("Idea not found");

  const normalizedDay = normalizePlanDayRecord(existingDay, dayIndex);
  const sourceImages = sanitizeSourceImageDataUrls(input.sourceImages);
  const preserveUploadedImage = sourceImages.length > 0 && input.preserveUploadedImage !== false;
  const prompt = await buildYoutubeThumbnailPrompt(userId, {
    title: normalizedDay.contentIdea,
    description: normalizedDay.descriptionSuggestion,
    tags: asArray(normalizedDay.tags).map((item) => String(item)).filter(Boolean),
    textPreference: asString(input.textPreference)?.trim() || null,
    sourceImages,
    preserveUploadedImage,
  });
  if (!prompt) throw new Error("Thumbnail prompt generation failed");

  const imageDataUrl = await generateYoutubeThumbnailImage(userId, prompt, sourceImages, preserveUploadedImage);
  const generatedThumbnail: GeneratedThumbnailRecord = {
    imageDataUrl,
    prompt,
    requestedText: asString(input.textPreference)?.trim() || null,
    preserveUploadedImage,
    createdAt: new Date().toISOString(),
  };

  return updatePlanDay(userId, planId, dayIndex, (day) => ({
    ...day,
    generatedThumbnail,
    updatedAt: new Date().toISOString(),
  }));
}

export async function deleteYoutubePlanDay(userId: number, planId: number, dayIndex: number) {
  const result = await updatePlanDay(userId, planId, dayIndex, (day) => ({
    ...day,
    isDeleted: true,
    deletedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
  const day = asRecord(result.day);
  if (normalizeIdeaOrigin(day.ideaOrigin) === "ai") {
    await persistIdeaFeedbackSummary(userId, (summary) => ({
      ...summary,
      deleted: dedupeByKey([
        ...summary.deleted,
        {
          concept: summarizeIdeaConcept(day),
          reason: "deleted_by_user",
        },
      ].reverse(), (item) => `${item.concept}|${item.reason}`).slice(0, 40),
    }));
  }
  return result;
}

export async function regenerateYoutubePlanIdea(userId: number, planId: number, dayIndex: number) {
  const [profile] = await db.select().from(youtubeChannelProfilesTable).where(eq(youtubeChannelProfilesTable.userId, userId)).limit(1);
  if (!profile) throw new Error("Connect YouTube before regenerating ideas");

  const plans = await db.select().from(youtubeWeeklyPlansTable).where(eq(youtubeWeeklyPlansTable.userId, userId)).orderBy(desc(youtubeWeeklyPlansTable.weekNumber));
  const { plan, day } = await updatePlanDay(userId, planId, dayIndex, (existingDay) => existingDay);
  const latestSignals = asRecord(asRecord(plan.contextSnapshot).performanceSignals);
  const ideaFeedbackSummary = await getPersistedIdeaFeedbackSummary(userId, profile, plans);
  const siblingIdeas = asPlanDays(asArray(asRecord(plan.plan).days))
    .filter((item) => parsePlanDayIndex(item.day, -1) !== dayIndex)
    .map((item) => ({
      title: asString(item.contentIdea),
      format: inferIdeaFormat(item),
      targetKeyword: asString(item.targetKeyword),
    }))
    .filter((item) => item.title || item.targetKeyword);

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are a YouTube content strategist replacing one planned video idea with something better.
The creator rejected the previous idea for this slot. Your job is to generate a genuinely different concept — not a rephrased version of the same idea.
Rules:

Check the ideaFeedbackSummary. If the rejected idea matches a pattern of previously disliked or deleted ideas, explicitly steer away from that direction.
Look at siblingIdeas (other videos planned this week). The new idea must not overlap in topic or format with any sibling.
The new idea must trace to a real signal: past performance, a competitor gap, a trend, or an underexplored keyword in the channel's niche.
Title, description, tags, and thumbnail idea must match the creator's own language from previous uploads and the channel niche.
Title must be specific and creator-voiced. No hollow clickbait phrases.
Description must be ready-to-paste: 2-4 sentences in the creator's voice, with niche keywords naturally included.
Tags must include 8-12 real search phrases that fit this category and come from evidence: winning tags already on the channel, exact-topic phrases from strong titles, rising trend tags if they honestly match, and a few long-tail searches a viewer would really type.
Thumbnail idea must describe the actual image composition and emotional contrast.
If the regenerated idea is short-form or vertical, the hook must be the literal first line or first on-screen phrase, and thumbnailIdea must describe the opening frame or cover in exact visual terms.
For short-form ideas, avoid generic notes like "make it more punchy." Specify what the creator should show first and what they should say first.
If the regenerated idea is long-form, the hook should validate the click early and thumbnailIdea should describe a true thumbnail layout with one focal promise.
Explain in whyDifferent how this idea is distinct from the one it replaces.
Return JSON only.

Return shape:
{
"title": string,
"videoDescription": string,
"hook": string,
"thumbnailIdea": string,
"format": string,
"targetKeyword": string,
"tags": string[],
"whyThisIdea": string,
"whyDifferent": string,
"signalSource": "performance" | "feedback" | "competitor" | "trend" | "channel_gap",
"confidence": "high" | "medium" | "low"
}`,
      },
      {
        role: "user",
        content: JSON.stringify({
          rejectedIdea: day,
          date: asString(day.date),
          dayIndex,
          channelProfile: profile,
          siblingIdeas,
          nicheProfile: asRecord(profile.nicheProfile),
          recentVideos: Array.isArray(profile.recentVideos) ? profile.recentVideos : [],
          ideaFeedbackSummary: {
            liked: ideaFeedbackSummary.liked,
            disliked: ideaFeedbackSummary.disliked,
            deleted: ideaFeedbackSummary.deleted,
          },
          performanceSignals: latestSignals,
          tagEvidence: buildYoutubeTagEvidenceSummary(Array.isArray(profile.recentVideos) ? profile.recentVideos : [], [], latestSignals),
        }),
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 1600,
  });
  await logTokenUsage({
    userId,
    feature: "ytPlanRegenerate",
    model: "gpt-4o-mini",
    ...usageTokens(completion.usage),
  });

  const raw = asRecord(parseAiJson(completion.choices[0]?.message?.content ?? "{}"));
  const currentTitle = asString(day.contentIdea) || `Week ${dayIndex} YouTube idea`;
  const nextDay = {
    ...day,
    contentIdea: asString(raw.title)?.trim() || currentTitle,
    hook: asString(raw.hook)?.trim() || asString(day.hook) || currentTitle,
    outline: [],
    bestPostingTime: asString(day.bestPostingTime) || "",
    rationale: [asString(raw.whyThisIdea)?.trim(), asString(raw.whyDifferent)?.trim()].filter(Boolean).join(" ").trim() || asString(day.rationale) || "",
    tags: asArray(raw.tags).map((item) => String(item)).filter(Boolean).slice(0, 12),
    soundSuggestion: asString(raw.format) || "",
    competitorReference: asString(raw.signalSource) || "",
    descriptionSuggestion: asString(raw.videoDescription) || asString(raw.descriptionSuggestion) || asString(raw.targetKeyword) || "",
    thumbnailConcept: asString(raw.thumbnailIdea) || asString(raw.thumbnailConcept) || "",
    format: asString(raw.format) || "",
    targetKeyword: asString(raw.targetKeyword) || "",
    whyThisIdea: asString(raw.whyThisIdea) || "",
    whyDifferent: asString(raw.whyDifferent) || "",
    signalSource: asString(raw.signalSource) || "",
    confidence: asString(raw.confidence) || "medium",
    ideaOrigin: "ai",
    aiFeedback: null,
    feedbackUpdatedAt: new Date().toISOString(),
    regeneratedAt: new Date().toISOString(),
  };

  return updatePlanDay(userId, planId, dayIndex, () => nextDay);
}

export function extractYoutubeVideoId(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) return parsed.pathname.split("/").filter(Boolean)[0] ?? null;
    if (parsed.searchParams.get("v")) return parsed.searchParams.get("v");
    const shorts = parsed.pathname.match(/\/shorts\/([^/?]+)/);
    if (shorts) return shorts[1];
    const videos = parsed.pathname.match(/\/video\/([^/?]+)/);
    if (videos) return videos[1];
  } catch {
    return null;
  }
  return null;
}

async function fetchVideoAnalytics(userId: number, videoId: string) {
  const endDate = isoDate(new Date());
  const startDate = isoDate(addDays(new Date(), -30));
  const baseParams = {
    ids: "channel==MINE",
    startDate,
    endDate,
    filters: `video==${videoId}`,
  };
  const options = { quotaCost: 1, ttlMs: 60 * 60 * 1000 };
  let analytics: { columnHeaders?: unknown[]; rows?: unknown[] };
  try {
    analytics = await youtubeJson<{ columnHeaders?: unknown[]; rows?: unknown[] }>(userId, analyticsUrl({
      ...baseParams,
      metrics: "views,estimatedMinutesWatched,impressionClickThroughRate,averageViewDuration,likes,comments",
    }), { ...options, cacheKey: `video-analytics:${videoId}:${startDate}:${endDate}:engagement` });
  } catch {
    analytics = await youtubeJson<{ columnHeaders?: unknown[]; rows?: unknown[] }>(userId, analyticsUrl({
      ...baseParams,
      metrics: "views,estimatedMinutesWatched,averageViewDuration",
    }), { ...options, cacheKey: `video-analytics:${videoId}:${startDate}:${endDate}:basic` });
  }
  const row = asArray(analytics.rows)[0] as unknown[] | undefined;
  const headers = asArray(analytics.columnHeaders).map((header) => asString(asRecord(header).name));
  const metrics: JsonRecord = {};
  headers.forEach((header, index) => {
    if (header) metrics[header] = row?.[index] ?? null;
  });
  return metrics;
}

export async function savePlanResults(userId: number, planId: number, results: Array<{ dayIndex: number; plannedTitle: string; videoUrl?: string; videoId?: string }>) {
  const [plan] = await db.select().from(youtubeWeeklyPlansTable).where(and(eq(youtubeWeeklyPlansTable.id, planId), eq(youtubeWeeklyPlansTable.userId, userId))).limit(1);
  if (!plan) throw new Error("Plan not found");
  const saved = [];
  const existing = await db.select().from(youtubePlanResultsTable).where(eq(youtubePlanResultsTable.planId, planId));
  const seenVideoIds = new Set<string>();
  for (const result of results) {
    const videoId = result.videoId || (result.videoUrl ? extractYoutubeVideoId(result.videoUrl) : null);
    if (!videoId) throw new Error(`Invalid YouTube URL for day ${result.dayIndex}`);
    if (seenVideoIds.has(videoId)) throw new Error("One YouTube video cannot be linked to more than one content idea");
    seenVideoIds.add(videoId);
    const videoUrl = result.videoUrl || `https://www.youtube.com/watch?v=${videoId}`;
    const conflicting = existing.find((row) => row.videoId === videoId && row.dayIndex !== result.dayIndex);
    if (conflicting) throw new Error("One YouTube video cannot be linked to more than one content idea");
    const match = existing.find((row) => row.dayIndex === result.dayIndex);
    const now = new Date();
    let row;
    if (match) {
      [row] = await db.update(youtubePlanResultsTable)
        .set({
          plannedTitle: result.plannedTitle,
          videoUrl,
          videoId,
          metrics: {},
          updatedAt: now,
        })
        .where(eq(youtubePlanResultsTable.id, match.id))
        .returning();
    } else {
      [row] = await db.insert(youtubePlanResultsTable).values({
        userId,
        planId,
        dayIndex: result.dayIndex,
        plannedTitle: result.plannedTitle,
        videoUrl,
        videoId,
        metrics: {},
        updatedAt: now,
      }).returning();
    }
    saved.push(row);
  }
  return saved;
}
