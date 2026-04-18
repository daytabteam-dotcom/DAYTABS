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
  duration: string | null;
  viewCount: string | null;
  likeCount: string | null;
  commentCount: string | null;
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

function parseAiJson(raw: string) {
  return JSON.parse(raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, ""));
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
  const id = asString(record.id) || asString(asRecord(record.id).videoId) || "";
  return {
    id,
    title: asString(snippet.title) || "Untitled video",
    description: asString(snippet.description) || "",
    tags: asArray(snippet.tags).map((tag) => String(tag)),
    publishedAt: asString(snippet.publishedAt),
    duration: asString(details.duration),
    viewCount: asString(stats.viewCount),
    likeCount: asString(stats.likeCount),
    commentCount: asString(stats.commentCount),
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
    part: "snippet,statistics,contentDetails",
    id: ids.join(","),
    maxResults: String(limit),
  }), { cacheKey: `videos:${ids.join(",")}`, quotaCost: 1, ttlMs: 60 * 60 * 1000 });
  return asArray(videos.items).map(normalizeVideo);
}

async function analyzeNiche(channel: JsonRecord, recentVideos: YoutubeRecentVideo[]): Promise<YoutubeNicheProfile> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "Analyze a YouTube channel from real channel/video data. Return JSON only with niche, contentStyle, tone, targetAudience, keywords, and summary. Do not invent metrics.",
      },
      {
        role: "user",
        content: JSON.stringify({ channel, recentVideos }),
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 1200,
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
  };
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
  const recentVideos = await fetchRecentVideos(userId, channelId, 20);
  const nicheProfile = await analyzeNiche({
    id: channelId,
    title: asString(snippet.title),
    description: asString(snippet.description),
    subscriberCount: asString(statistics.subscriberCount),
    totalViewCount: asString(statistics.viewCount),
    videoCount: asString(statistics.videoCount),
  }, recentVideos);
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
  const [connection] = await db.select().from(youtubeConnectionsTable).where(eq(youtubeConnectionsTable.userId, userId)).limit(1);
  const [profile] = await db.select().from(youtubeChannelProfilesTable).where(eq(youtubeChannelProfilesTable.userId, userId)).limit(1);
  const plans = await db.select().from(youtubeWeeklyPlansTable).where(eq(youtubeWeeklyPlansTable.userId, userId)).orderBy(desc(youtubeWeeklyPlansTable.weekNumber));
  const latestPlan = plans[0] ?? null;
  const latestResults = latestPlan
    ? await db.select().from(youtubePlanResultsTable).where(eq(youtubePlanResultsTable.planId, latestPlan.id))
    : [];
  const competitors = await db.select().from(youtubeCompetitorsTable).where(eq(youtubeCompetitorsTable.userId, userId)).orderBy(desc(youtubeCompetitorsTable.fetchedAt));
  return {
    connected: Boolean(connection),
    channel: profile,
    competitors,
    latestPlan,
    plans,
    latestResults,
  };
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
  const search = await youtubeJson<{ items?: unknown[] }>(userId, dataApiUrl("search", {
    part: "snippet",
    type: "channel",
    q: query,
    maxResults: "25",
    regionCode: "US",
  }), { cacheKey: `competitor-search:${query}`, quotaCost: 100, ttlMs: 24 * 60 * 60 * 1000 });
  const ids = asArray(search.items)
    .map((item) => asString(asRecord(asRecord(item).id).channelId))
    .filter((id): id is string => Boolean(id && id !== profile.channelId));
  if (!ids.length) return [];

  const channels = await youtubeJson<{ items?: unknown[] }>(userId, dataApiUrl("channels", {
    part: "snippet,statistics",
    id: ids.join(","),
    maxResults: "25",
  }), { cacheKey: `competitor-channels:${ids.join(",")}`, quotaCost: 1, ttlMs: 24 * 60 * 60 * 1000 });

  const channelItems = asArray(channels.items);
  let comparable = channelItems.filter((item) => {
    const stats = asRecord(asRecord(item).statistics);
    const subscribers = parseNumber(stats.subscriberCount);
    if (!userSubscribers || !subscribers) return true;
    return subscribers >= userSubscribers / 10 && subscribers <= userSubscribers * 10;
  }).slice(0, 5);
  if (!comparable.length) comparable = channelItems.slice(0, 5);

  await db.delete(youtubeCompetitorsTable).where(eq(youtubeCompetitorsTable.userId, userId));

  const saved = [];
  for (const item of comparable) {
    const channel = asRecord(item);
    const channelId = asString(channel.id);
    if (!channelId) continue;
    const snippet = asRecord(channel.snippet);
    const stats = asRecord(channel.statistics);
    const recent = await fetchRecentVideos(userId, channelId, 10);
    const topVideos = [...recent]
      .sort((a, b) => parseNumber(b.viewCount) - parseNumber(a.viewCount))
      .slice(0, 3)
      .map((video) => ({ title: video.title, viewCount: video.viewCount, url: video.url }));
    const [competitor] = await db.insert(youtubeCompetitorsTable).values({
      userId,
      channelId,
      channelName: asString(snippet.title) || "YouTube competitor",
      subscriberCount: asString(stats.subscriberCount),
      mostViewedRecentVideos: topVideos,
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

async function previousPerformanceSummary(userId: number) {
  const results = await db.select().from(youtubePlanResultsTable).where(eq(youtubePlanResultsTable.userId, userId)).orderBy(desc(youtubePlanResultsTable.fetchedAt));
  if (!results.length) return null;
  const compact = results.map((result) => ({
    plannedTitle: result.plannedTitle,
    videoUrl: result.videoUrl,
    metrics: result.metrics,
  }));
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: "Summarize YouTube plan results. Return JSON with highestCtrTypes, watchTimeTopics, bestPostingDays, flops, and shortSummary." },
      { role: "user", content: JSON.stringify(compact.slice(0, 50)) },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 1200,
  });
  return parseAiJson(completion.choices[0]?.message?.content ?? "{}");
}

export async function generateYoutubeWeeklyPlan(userId: number) {
  const [profile] = await db.select().from(youtubeChannelProfilesTable).where(eq(youtubeChannelProfilesTable.userId, userId)).limit(1);
  if (!profile) throw new Error("Connect YouTube before generating a plan");
  const nicheProfile = asRecord(profile.nicheProfile) as unknown as YoutubeNicheProfile;
  const trends = await fetchTrendingVideos(userId, nicheProfile);
  const competitors = await discoverCompetitors(userId, profile);
  const analytics = await analyticsSummary(userId);
  const pastPerformance = await previousPerformanceSummary(userId);
  const [lastPlan] = await db.select().from(youtubeWeeklyPlansTable).where(eq(youtubeWeeklyPlansTable.userId, userId)).orderBy(desc(youtubeWeeklyPlansTable.weekNumber)).limit(1);
  const lastPlanResults = lastPlan
    ? await db.select().from(youtubePlanResultsTable).where(eq(youtubePlanResultsTable.planId, lastPlan.id)).limit(1)
    : [];
  const shouldReplaceDraftPlan = Boolean(lastPlan && lastPlanResults.length === 0);
  const weekNumber = shouldReplaceDraftPlan ? lastPlan!.weekNumber : (lastPlan?.weekNumber ?? 0) + 1;
  const startDate = isoDate(new Date());
  const endDate = isoDate(addDays(new Date(), 6));
  const recentVideos = Array.isArray(profile.recentVideos) ? profile.recentVideos : [];
  const context = { profile, nicheProfile, recentVideos, trends, competitors, analytics, pastPerformance, weekNumber, startDate, endDate };

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "Generate a YouTube-only growth plan from real channel, video, trend, competitor, analytics, and past-result data. Return JSON only. Never invent metrics; say unavailable when source data is missing.",
      },
      {
        role: "user",
        content: `Return this exact shape:
{
  "weekNumber": ${weekNumber},
  "summary": "",
  "accountAnalysis": {
    "whatWorked": [],
    "whyItWorked": [],
    "underperformers": [],
    "recommendations": []
  },
  "competitorInsights": [
    {
      "channelName": "",
      "channelUrl": "",
      "whatIsWorking": [],
      "whyVideosGoViral": [],
      "ideasToAdapt": []
    }
  ],
  "viralTags": [
    { "tag": "", "why": "", "bestUse": "" }
  ],
  "viralSounds": [
    { "soundOrSong": "", "sourceVideoOrTrend": "", "whyItIsWorking": "", "howToUse": "" }
  ],
  "days": [
    {
      "day": 1,
      "date": "${startDate}",
      "stage": "idea",
      "contentIdea": "",
      "hook": "",
      "outline": [],
      "bestPostingTime": "",
      "rationale": "",
      "tags": [],
      "soundSuggestion": "",
      "competitorReference": ""
    }
  ]
}

Rules:
- Generate exactly 7 day objects and every day must include a concrete bestPostingTime in HH:MM format.
- Rationale must reference actual trend, competitor, analytics, or past performance data from the context.
- If this is week 2 or later, explicitly reference past performance in each rationale.
- Analyze the user's own recent videos using their titles, descriptions, tags, durations, and metrics. If script/transcript data is absent, say title/description/tags were used instead.
- Identify repeatable channel DNA from the user's real titles, hooks, topics, emotional tone, and formats. The 7 ideas must sound like this creator, not generic niche tutorials.
- For accountAnalysis, compare multiple videos and name specific titles and metrics. Underperformers must list more than one weak pattern when source data supports it.
- competitorInsights must only use channels in the competitors context.
- viralTags should include 5-8 niche-specific tags when source data allows it; avoid generic one-word tags unless paired with a clear reason.
- viralSounds should be based on trend titles/source videos when available, and should avoid claiming private audio metrics.
- Do not invent metrics or competitor names.`,
      },
      { role: "user", content: JSON.stringify(context) },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 5000,
  });

  const plan = parseAiJson(completion.choices[0]?.message?.content ?? "{}");
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
  const [lastPlan] = await db.select().from(youtubeWeeklyPlansTable).where(eq(youtubeWeeklyPlansTable.userId, userId)).orderBy(desc(youtubeWeeklyPlansTable.weekNumber)).limit(1);
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "Improve a YouTube content idea using the creator's channel profile and current plan context. Return JSON only with contentIdea, hook, outline, bestPostingTime, rationale, tags, soundSuggestion, and competitorReference.",
      },
      {
        role: "user",
        content: JSON.stringify({
          idea,
          channelProfile: profile,
          latestPlan: lastPlan?.plan ?? null,
        }),
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 1400,
  });
  return parseAiJson(completion.choices[0]?.message?.content ?? "{}");
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
  const analytics = await youtubeJson<{ columnHeaders?: unknown[]; rows?: unknown[] }>(userId, analyticsUrl({
    ids: "channel==MINE",
    startDate,
    endDate,
    metrics: "views,estimatedMinutesWatched,impressions,impressionClickThroughRate,averageViewDuration,likes,comments",
    filters: `video==${videoId}`,
  }), { cacheKey: `video-analytics:${videoId}:${startDate}:${endDate}`, quotaCost: 1, ttlMs: 60 * 60 * 1000 });
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
  const seenVideoIds = new Set<string>();
  for (const result of results) {
    const videoId = result.videoId || (result.videoUrl ? extractYoutubeVideoId(result.videoUrl) : null);
    if (!videoId) throw new Error(`Invalid YouTube URL for day ${result.dayIndex}`);
    if (seenVideoIds.has(videoId)) throw new Error("One YouTube video cannot be linked to more than one content idea");
    seenVideoIds.add(videoId);
    const metrics = await fetchVideoAnalytics(userId, videoId);
    const videoUrl = result.videoUrl || `https://www.youtube.com/watch?v=${videoId}`;
    const [row] = await db.insert(youtubePlanResultsTable).values({
      userId,
      planId,
      dayIndex: result.dayIndex,
      plannedTitle: result.plannedTitle,
      videoUrl,
      videoId,
      metrics,
      updatedAt: new Date(),
    }).returning();
    saved.push(row);
  }
  return saved;
}
