import crypto from "crypto";
import jwt from "jsonwebtoken";
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

interface YoutubeSettings {
  preferredPostsPerWeek: number;
  connectedAt: string | null;
  needsPostingPreference: boolean;
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
}>;

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
  };
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
  const niche = asRecord(profile.nicheProfile) as Partial<YoutubeNicheProfile>;
  const query = (Array.isArray(niche.keywords) && niche.keywords.length ? niche.keywords.slice(0, 3).join(" ") : niche.niche) || profile.channelName;
  const userSubscribers = parseNumber(profile.subscriberCount);
  const searchQueries = [
    query,
    `${query} tutorial`,
    `${query} process`,
  ];
  const ids = [...new Set((await Promise.all(searchQueries.map((item) => searchChannelIds(userId, item, 25)))).flat())]
    .filter((id) => id !== profile.channelId);
  if (!ids.length) return [];

  const channels = await youtubeJson<{ items?: unknown[] }>(userId, dataApiUrl("channels", {
    part: "snippet,statistics",
    id: ids.join(","),
    maxResults: String(Math.min(ids.length, 50)),
  }), { cacheKey: `competitor-channels:${ids.join(",")}`, quotaCost: 1, ttlMs: 24 * 60 * 60 * 1000 });

  const channelItems = asArray(channels.items);
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
    const fallbackIds = [...new Set((await Promise.all([
      searchChannelIds(userId, `${query} beginner`, 25),
      searchChannelIds(userId, `${query} small channel`, 25),
    ])).flat())]
      .filter((id) => id !== profile.channelId && !ids.includes(id));
    if (fallbackIds.length) {
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
    }
  }

  const selected = [
    ...withTiers.filter((item) => item.tier === 1).sort((a, b) => a.subscribers - b.subscribers).slice(0, 6),
    ...withTiers.filter((item) => item.tier === 2).sort((a, b) => a.subscribers - b.subscribers).slice(0, 6),
    ...withTiers.filter((item) => item.tier === 3).sort((a, b) => a.subscribers - b.subscribers).slice(0, 6),
  ].filter((item, index, list) => list.findIndex((candidate) => asString(candidate.item.id) === asString(item.item.id)) === index);

  await db.delete(youtubeCompetitorsTable).where(eq(youtubeCompetitorsTable.userId, userId));

  const saved = [];
  for (const entry of selected) {
    const channel = asRecord(entry.item);
    const channelId = asString(channel.id);
    if (!channelId) continue;
    const snippet = asRecord(channel.snippet);
    const stats = asRecord(channel.statistics);
    const thumbnails = asRecord(snippet.thumbnails);
    const thumbnailUrl = asString(asRecord(thumbnails.high).url) || asString(asRecord(thumbnails.medium).url) || asString(asRecord(thumbnails.default).url);
    const recent = await fetchRecentVideos(userId, channelId, 10);
    const recentVideoSummary = [...recent]
      .sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime())
      .map((video) => ({
        title: video.title,
        viewCount: video.viewCount,
        url: video.url,
        publishedAt: video.publishedAt,
        thumbnailUrl: video.thumbnailUrl,
      }));
    const [competitor] = await db.insert(youtubeCompetitorsTable).values({
      userId,
      channelId,
      channelName: asString(snippet.title) || "YouTube competitor",
      thumbnailUrl,
      subscriberCount: asString(stats.subscriberCount),
      mostViewedRecentVideos: recentVideoSummary,
      postingFrequency: postingFrequency(recent),
      niche: asString(niche.niche) || query,
      updatedAt: new Date(),
    }).returning();
    saved.push(competitor);
  }
  return saved;
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
      tags: asArray(source.tags).map((item) => String(item)).filter(Boolean).slice(0, 8),
      soundSuggestion: asString(source.estimatedLength) || asString(source.soundSuggestion) || "",
      competitorReference: asString(source.signalSource) || asString(source.competitorReference) || "",
      descriptionSuggestion: asString(source.targetKeyword) || asString(source.descriptionSuggestion) || "",
      thumbnailConcept: asString(source.thumbnailConcept) || "",
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
  const trends = await fetchTrendingVideos(userId, nicheProfile);
  const competitors = await discoverCompetitors(userId, profile);
  const analytics = await analyticsSummary(userId);
  const analyticsTimeline = await channelAnalyticsTimeline(userId);
  const hydratedResults = await hydrateStoredResultMetrics(userId);
  const pastPerformance = await previousPerformanceSummary(userId);
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

Titles must sound like a real creator wrote them — specific, direct, with a clear payoff implied. Never use hollow phrases like "the ultimate guide", "you need to know this", or "game changer."
Hook must name a specific tension or question the video answers in the first 10 seconds. Not a vague teaser.
Thumbnail concept must be visually distinct from competitors. Describe the specific visual — not "bold text + face."
Tags must be actual search terms a real viewer would type — not keyword-stuffed variations of the title.
If the channel's data is thin on a given day, set confidence to "low" and explain why in lowSignalNote.
Never suggest a topic concept the user deleted in the past. Flag it if you're unsure whether a concept is too similar.

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
"hook": string,
"thumbnailConcept": string,
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
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are a YouTube content strategist helping a creator sharpen one specific idea they came up with.
Your job is NOT to replace their idea with something generic. Your job is to make their specific idea stronger — better title, clearer hook, more search-targeted, more thumbnail-friendly — while staying true to what they were going for.
Rules:

Read their feedback history. If this idea direction was previously disliked or deleted, flag it honestly rather than silently improving it.
Improve the title: make it more specific, cut filler words, front-load the payoff.
Sharpen the hook: name the exact tension or question the viewer will care about in the first 10 seconds.
Suggest a thumbnail concept that is visually distinct — describe the actual image, not just "bold text."
Suggest 1 alternative angle on the same topic if the original framing has weak search volume potential.
Do not pad the response with explanations. Return JSON only.

Return shape:
{
"improvedTitle": string,
"improvedHook": string,
"thumbnailConcept": string,
"targetKeyword": string,
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
    thumbnailConcept: asString(improved.thumbnailConcept)?.trim() || "",
    descriptionSuggestion: asString(improved.targetKeyword)?.trim() || "",
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
Title must be specific and creator-voiced. No hollow clickbait phrases.
Explain in whyDifferent how this idea is distinct from the one it replaces.
Return JSON only.

Return shape:
{
"title": string,
"hook": string,
"thumbnailConcept": string,
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
          ideaFeedbackSummary: {
            liked: ideaFeedbackSummary.liked,
            disliked: ideaFeedbackSummary.disliked,
            deleted: ideaFeedbackSummary.deleted,
          },
          performanceSignals: latestSignals,
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
    tags: asArray(raw.tags).map((item) => String(item)).filter(Boolean).slice(0, 8),
    soundSuggestion: asString(raw.format) || "",
    competitorReference: asString(raw.signalSource) || "",
    descriptionSuggestion: asString(raw.targetKeyword) || "",
    thumbnailConcept: asString(raw.thumbnailConcept) || "",
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
