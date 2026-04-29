import crypto from "crypto";
import jwt from "jsonwebtoken";
import { toFile } from "openai";
import { OAuth2Client } from "google-auth-library";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { fetchTranscript as fetchYoutubeTranscriptPackage } from "youtube-transcript/dist/youtube-transcript.esm.js";
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
const YOUTUBE_THUMBNAIL_IMAGE_MODEL = process.env.YOUTUBE_THUMBNAIL_IMAGE_MODEL || "gpt-image-2";
const YOUTUBE_THUMBNAIL_FALLBACK_IMAGE_MODEL = "gpt-image-1";
const YOUTUBE_CREATOR_GROWTH_PLAYBOOK_RULES = `Creator Growth Playbook for YouTube and TikTok in 2026:
- Treat every upload as a system: one core idea, one packaging promise, one opening payoff, and one next step.
- Do not imply there is a guaranteed viral formula. Optimize for clearer distribution odds through packaging quality, retention structure, and audience fit.
- Tags are secondary metadata. Use them narrowly for exact topic phrases, close variants, named entities, tools, products, and obvious misspellings. Never treat tags as the main growth lever.
- Search optimization starts with exact search intent in the title and the first description lines, not with keyword stuffing.
- Recommendation optimization starts with viewer satisfaction: accurate packaging, strong opening payoff, clean structure, and watch-worthy follow-through.
- Short-form strategy: first frame and first seconds must establish what the video is about, why it matters, and what payoff is coming. Design for sound-on delight and sound-off comprehension.
- Strong short-form hooks should open with a result, problem, tension, transformation, disagreement, or proof. Avoid greetings, throat-clearing, logos, and slow setup first.
- Short-form editing should improve rewatchability. Every 1-3 seconds, the visual, idea, angle, or energy should advance.
- Long-form strategy: packaging wins the click, the first 15-30 seconds validates the click, and the structure keeps paying off curiosity over time.
- Longer videos are only better when they stay easy to enter, navigate, and continue watching. Recommend chapters, section transitions, proof beats, and one clear next-watch path when helpful.
- Thumbnail rule: communicate one clear idea fast. Use one dominant subject, one emotional or informational idea, strong mobile readability, and title-thumbnail alignment.
- For Shorts/TikTok covers, think in opening-frame and selected-frame terms. For long-form YouTube, think in true thumbnail terms.
- Use category logic when evidence supports it: podcasts need tension or a quotable turn, demos show result first, cooking shows sensory payoff first, art shows transformation or texture, gaming leads with the outcome, ads lead with pain/result/proof.
- If giving feedback or generated ideas, be concrete. Say exactly what should be shown first, said first, cut, moved earlier, or emphasized instead of using generic advice.`;
export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
];

type JsonRecord = Record<string, unknown>;

function languageNameFromCode(input?: string | null) {
  if (!input) return null;
  const normalized = input.trim().toLowerCase();
  if (!normalized) return null;
  const base = normalized.split(/[-_]/)[0] || normalized;
  try {
    const displayNames = new Intl.DisplayNames(["en"], { type: "language" });
    const displayName = displayNames.of(base);
    return displayName && displayName.toLowerCase() !== base ? displayName : base;
  } catch {
    return base;
  }
}

function detectLanguageNameFromText(sample: string) {
  const text = sample.trim();
  if (!text) return null;
  if (/[\u3040-\u30ff]/.test(text)) return "Japanese";
  if (/[\uac00-\ud7af]/.test(text)) return "Korean";
  if (/[\u0600-\u06ff]/.test(text)) return "Arabic";
  if (/[\u0900-\u097f]/.test(text)) return "Hindi";
  if (/[\u4e00-\u9fff]/.test(text)) return "Simplified Chinese";
  if (/[А-Яа-яЁёІіЇїЄє]/.test(text)) return "a Cyrillic-script language";
  if (/[\u0590-\u05ff]/.test(text)) return "Hebrew";
  if (/[\u0e00-\u0e7f]/.test(text)) return "Thai";
  if (/[\u0980-\u09ff]/.test(text)) return "Bengali";
  if (/[\u0a00-\u0a7f]/.test(text)) return "Punjabi";
  if (/[\u0b80-\u0bff]/.test(text)) return "Tamil";
  if (/[\u0c00-\u0c7f]/.test(text)) return "Telugu";
  if (/[\u0c80-\u0cff]/.test(text)) return "Kannada";
  if (/[\u0d00-\u0d7f]/.test(text)) return "Malayalam";
  const normalized = ` ${text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
  if (!normalized.trim()) return null;

  const latinLanguageSignals = [
    {
      name: "English",
      patterns: [" the ", " and ", " you ", " your ", " this ", " with ", " how ", " what ", " why ", " video "],
    },
    {
      name: "Spanish",
      patterns: [" el ", " la ", " de ", " que ", " en ", " para ", " como ", " con ", " video ", " canal "],
    },
    {
      name: "Portuguese",
      patterns: [" o ", " a ", " de ", " que ", " para ", " com ", " como ", " voce ", " video ", " canal "],
    },
    {
      name: "French",
      patterns: [" le ", " la ", " les ", " des ", " pour ", " avec ", " comment ", " video ", " chaine "],
    },
    {
      name: "German",
      patterns: [" der ", " die ", " das ", " und ", " mit ", " nicht ", " wie ", " video ", " kanal "],
    },
    {
      name: "Italian",
      patterns: [" il ", " la ", " che ", " per ", " con ", " come ", " video ", " canale "],
    },
    {
      name: "Turkish",
      patterns: [" ve ", " bir ", " icin ", " bu ", " nasil ", " video ", " kanal ", " daha "],
    },
    {
      name: "Dutch",
      patterns: [" de ", " het ", " een ", " voor ", " met ", " hoe ", " video ", " kanaal "],
    },
  ] as const;

  let bestMatch: { name: string; score: number } | null = null;
  for (const language of latinLanguageSignals) {
    const score = language.patterns.reduce((sum, pattern) => sum + (normalized.includes(pattern) ? 1 : 0), 0);
    if (!bestMatch || score > bestMatch.score) bestMatch = { name: language.name, score };
  }
  if (bestMatch && bestMatch.score >= 2) return bestMatch.name;
  return null;
}

function inferOutputLanguage(options: {
  forceLanguage?: string | null;
  explicitLanguage?: string | null;
  transcriptText?: string | null;
  title?: string | null;
  description?: string | null;
  tags?: string[];
  recentVideos?: Array<{ title?: string | null; description?: string | null; tags?: string[] }>;
}) {
  const forced = languageNameFromCode(options.forceLanguage);
  if (forced) {
    return {
      label: forced,
      instruction: `Write every user-facing output in ${forced}. Do not translate the response to English. Keep summaries, explanations, titles, descriptions, hooks, tags, thumbnail ideas, and recommendations in ${forced}.`,
    };
  }
  const primarySample = [
    options.transcriptText || "",
    options.title || "",
    options.description || "",
    ...(options.tags ?? []),
  ].filter(Boolean).join(" ").slice(0, 6000);
  const primaryDetected = detectLanguageNameFromText(primarySample);
  const explicit = languageNameFromCode(options.explicitLanguage);
  if (primaryDetected) {
    return {
      label: primaryDetected,
      instruction: `Write every user-facing output in ${primaryDetected}. Do not translate the response to English. Keep summaries, explanations, titles, descriptions, hooks, tags, thumbnail ideas, and recommendations in the same language used by the source video evidence.`,
    };
  }
  if (explicit) {
    return {
      label: explicit,
      instruction: `Write every user-facing output in ${explicit}. Do not translate the response to English. Keep summaries, explanations, titles, descriptions, hooks, tags, thumbnail ideas, and recommendations in ${explicit}. If the source evidence contains mixed languages, follow the main transcript/caption language.`,
    };
  }

  const secondarySample = [
    ...((options.recentVideos ?? []).flatMap((video) => [
      video.title || "",
      video.description || "",
      ...(video.tags ?? []),
    ])),
  ].filter(Boolean);
  const detected = detectLanguageNameFromText(secondarySample.join(" ").slice(0, 6000));
  if (detected) {
    return {
      label: detected,
      instruction: `Write every user-facing output in ${detected}. Do not translate the response to English. Keep summaries, explanations, titles, descriptions, hooks, tags, thumbnail ideas, and recommendations in the creator's dominant language unless the source video evidence clearly uses a different language.`,
    };
  }
  return {
    label: "same-as-source",
    instruction: "Write every user-facing output in the same language used by the source transcript, captions, titles, descriptions, and tags. Do not translate the response to English. Mirror the language that dominates the supplied evidence, even if it is not English or not named explicitly.",
  };
}

function getChannelDescriptionFromProfile(profile: { nicheProfile?: unknown }) {
  const nicheProfile = asRecord(profile.nicheProfile);
  return asString(nicheProfile.channelDescription) || asString(nicheProfile.summary) || "";
}

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

export interface YoutubeTranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface YoutubeAuditTranscriptTranslation {
  targetLanguage: string;
  sourceLanguage: string | null;
  fullText: string;
  segments: YoutubeTranscriptSegment[];
  createdAt: string;
}

export interface YoutubeEditableTranscript {
  videoId: string;
  canonicalUrl: string;
  captions: {
    available: boolean;
    downloadable: boolean;
    source: "manual" | "auto" | null;
    language: string | null;
    languages: string[];
  };
  transcript: {
    available: boolean;
    source: "manual" | "auto" | "transcribed_audio" | null;
    language: string | null;
    text: string | null;
    segments: YoutubeTranscriptSegment[];
  };
  needsUploadFallback: boolean;
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
  nicheInference: {
    label: string;
    confidence: "high" | "medium" | "low";
    basis: string;
  };
  captions: {
    available: boolean;
    source: "manual" | "auto" | "uploaded" | "transcribed_audio" | null;
    language: string | null;
    languages: string[];
  };
  transcript: {
    available: boolean;
    source: "manual" | "auto" | "uploaded" | "transcribed_audio" | null;
    language: string | null;
    text: string | null;
    segments: YoutubeTranscriptSegment[];
    translations: YoutubeAuditTranscriptTranslation[];
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
    basis: "thumbnail_only";
    topFix: string;
    lighting: string;
    framing: string;
    sharpness: string;
  } | null;
  diagnosis: Array<{
    area: string;
    issue: string;
    whyItHurts: string;
    evidence: string;
    recommendedChange: string;
    confidence: "high" | "medium" | "low";
    sourceLabel: string;
    priority: 1 | 2 | 3;
  }>;
  fixes: {
    titles: string[];
    description: string;
    tags: string[];
    thumbnailIdea: string;
    recommendedThumbnailStyle: string;
    hookRewrite: string;
    scriptDirection: string;
    qualityFixes: string[];
    packagingStrategy: string;
  };
  limitations: string[];
}

export interface YoutubeVideoAuditPreview {
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
    likelyFormat: string;
  };
  nicheInference: {
    label: string;
    confidence: "high" | "medium" | "low";
    basis: string;
  };
  recommendedThumbnailStyle: string;
  captions: {
    available: boolean;
    source: "manual" | "auto" | null;
    language: string | null;
    languages: string[];
    downloadable?: boolean;
  };
  transcript: {
    available: boolean;
    source: "manual" | "auto" | null;
    language: string | null;
  };
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

function normalizePerformanceSignalSummary(value: unknown): PerformanceSignalSummary {
  const record = asRecord(value);
  const bestPostingTimeRecord = asRecord(record.bestPostingTime);
  const bestPostingTime = bestPostingTimeRecord.label
    ? {
        label: asString(bestPostingTimeRecord.label) || "",
        averageViews: parseNumber(bestPostingTimeRecord.averageViews),
        percentAboveChannelAverage: parseNumber(bestPostingTimeRecord.percentAboveChannelAverage),
        sampleVideos: asArray(bestPostingTimeRecord.sampleVideos).map((item) => {
          const video = asRecord(item);
          return {
            title: asString(video.title) || "",
            viewCount: parseNumber(video.viewCount),
            publishedAt: asString(video.publishedAt),
          };
        }).filter((item) => item.title),
      }
    : null;
  const bestPostingTimeByDay = asArray(record.bestPostingTimeByDay).map((item) => {
    const row = asRecord(item);
    return {
      day: asString(row.day) || "",
      slotLabel: asString(row.slotLabel) || "",
      suggestedTime: asString(row.suggestedTime) || "",
      averageViews: parseNumber(row.averageViews),
    };
  }).filter((item) => item.day && item.suggestedTime);
  const hookInsightRecord = asRecord(record.hookInsight);
  const hookInsight = hookInsightRecord.bestType
    ? {
        bestType: asString(hookInsightRecord.bestType) || "",
        averageViews: parseNumber(hookInsightRecord.averageViews),
        evidenceVideos: asArray(hookInsightRecord.evidenceVideos).map((item) => {
          const video = asRecord(item);
          return {
            title: asString(video.title) || "",
            viewCount: parseNumber(video.viewCount),
          };
        }).filter((item) => item.title),
        analysis: asString(hookInsightRecord.analysis) || "",
        nextHookSuggestions: asArray(hookInsightRecord.nextHookSuggestions).map((item) => String(item)).filter(Boolean),
      }
    : null;
  const titleLengthInsightRecord = asRecord(record.titleLengthInsight);
  const titleLengthInsight = titleLengthInsightRecord.winningBucket
    ? {
        winningBucket: asString(titleLengthInsightRecord.winningBucket) || "",
        min: parseNumber(titleLengthInsightRecord.min),
        max: parseNumber(titleLengthInsightRecord.max),
        averageViews: parseNumber(titleLengthInsightRecord.averageViews),
        percentAboveChannelAverage: parseNumber(titleLengthInsightRecord.percentAboveChannelAverage),
        topPerformers: asArray(titleLengthInsightRecord.topPerformers).map((item) => {
          const video = asRecord(item);
          return {
            title: asString(video.title) || "",
            views: parseNumber(video.views),
            titleLength: parseNumber(video.titleLength),
          };
        }).filter((item) => item.title),
        bottomPerformers: asArray(titleLengthInsightRecord.bottomPerformers).map((item) => {
          const video = asRecord(item);
          return {
            title: asString(video.title) || "",
            views: parseNumber(video.views),
            titleLength: parseNumber(video.titleLength),
          };
        }).filter((item) => item.title),
      }
    : null;
  const tagInsightRecord = asRecord(record.tagInsight);
  const subscriberSpikeRecord = asRecord(record.subscriberSpike);
  const subscriberSpike = subscriberSpikeRecord.date
    ? {
        date: asString(subscriberSpikeRecord.date) || "",
        subscribersNet: parseNumber(subscriberSpikeRecord.subscribersNet),
        videoTitle: asString(subscriberSpikeRecord.videoTitle) || "",
        contentType: asString(subscriberSpikeRecord.contentType) || "",
        hookStyle: asString(subscriberSpikeRecord.hookStyle) || "",
        implication: asString(subscriberSpikeRecord.implication) || "",
      }
    : null;
  const competitorGapRecord = asRecord(record.competitorGap);
  const competitorGap = competitorGapRecord.channelName
    ? {
        channelName: asString(competitorGapRecord.channelName) || "",
        averageViews: parseNumber(competitorGapRecord.averageViews),
        videosPerWeek: asString(competitorGapRecord.videosPerWeek) || "",
        contentDriver: asString(competitorGapRecord.contentDriver) || "",
        hookStyle: asString(competitorGapRecord.hookStyle) || "",
        recommendation: asString(competitorGapRecord.recommendation) || "",
      }
    : null;
  return {
    bestPostingTime,
    bestPostingTimeByDay,
    hookInsight,
    titleLengthInsight,
    tagInsight: {
      topPerformingTags: asArray(tagInsightRecord.topPerformingTags).map((item) => {
        const tag = asRecord(item);
        const relativeToMedian = asString(tag.relativeToMedian);
        const normalizedRelativeToMedian: "above" | "neutral" | "below" =
          relativeToMedian === "above" || relativeToMedian === "below" ? relativeToMedian : "neutral";
        return {
          tag: asString(tag.tag) || "",
          averageViews: parseNumber(tag.averageViews),
          relativeToMedian: normalizedRelativeToMedian,
        };
      }).filter((item) => item.tag),
      trendingTags: asArray(tagInsightRecord.trendingTags).map((item) => {
        const tag = asRecord(item);
        return {
          tag: asString(tag.tag) || "",
          signal: parseNumber(tag.signal),
          why: asString(tag.why) || "",
        };
      }).filter((item) => item.tag),
    },
    subscriberSpike,
    competitorGap,
    tier1CompetitorPatterns: asArray(record.tier1CompetitorPatterns).map((item) => {
      const pattern = asRecord(item);
      return {
        channelName: asString(pattern.channelName) || "",
        subscriberCount: parseNumber(pattern.subscriberCount),
        averageViews: parseNumber(pattern.averageViews),
        contentType: asString(pattern.contentType) || "",
        hookStyle: asString(pattern.hookStyle) || "",
        exampleTitles: asArray(pattern.exampleTitles).map((title) => String(title)).filter(Boolean),
      };
    }).filter((item) => item.channelName),
    linkedVideoPerformance: asArray(record.linkedVideoPerformance).map((item) => {
      const row = asRecord(item);
      return {
        plannedTitle: asString(row.plannedTitle) || "",
        videoUrl: asString(row.videoUrl) || "",
        metrics: asRecord(row.metrics),
      };
    }).filter((item) => item.plannedTitle || item.videoUrl),
  };
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

function compactText(value: unknown, max = 240) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function compactTags(tags: unknown, max = 8) {
  return asArray(tags).map(String).filter(Boolean).slice(0, max);
}

function summarizeLastPlanBehavior(lastPlan: unknown, linkedResults: unknown[] = []) {
  const days = asArray(asRecord(lastPlan).days).map((item) => asRecord(item));
  const linkedByDayIndex = new Set(
    linkedResults
      .map((result) => Number(asRecord(result).dayIndex))
      .filter((value) => Number.isFinite(value)),
  );

  const wasLinked = (day: JsonRecord) => linkedByDayIndex.has(Number(day.day));

  return {
    usedOrLinked: days
      .filter((day) => wasLinked(day))
      .slice(0, 10)
      .map((day) => ({
        day: day.day,
        idea: compactText(day.contentIdea || day.title, 120),
        format: compactText(day.format, 60),
        origin: asString(day.ideaOrigin) || "ai",
        feedback: asString(day.aiFeedback),
      })),

    manualIdeas: days
      .filter((day) => day.ideaOrigin === "manual")
      .slice(0, 10)
      .map((day) => ({
        idea: compactText(day.contentIdea || day.title, 120),
        hook: compactText(day.hook, 120),
        format: compactText(day.format, 60),
      })),

    likedAiIdeas: days
      .filter((day) => day.ideaOrigin === "ai" && day.aiFeedback === "liked")
      .slice(0, 10)
      .map((day) => ({
        idea: compactText(day.contentIdea || day.title, 120),
        format: compactText(day.format, 60),
      })),

    dislikedAiIdeas: days
      .filter((day) => day.ideaOrigin === "ai" && day.aiFeedback === "disliked")
      .slice(0, 10)
      .map((day) => ({
        idea: compactText(day.contentIdea || day.title, 120),
        format: compactText(day.format, 60),
      })),

    deletedAiIdeas: days
      .filter((day) => day.ideaOrigin === "ai" && Boolean(day.isDeleted))
      .slice(0, 10)
      .map((day) => ({
        idea: compactText(day.contentIdea || day.title, 120),
        format: compactText(day.format, 60),
      })),

    unusedAiIdeas: days
      .filter((day) => day.ideaOrigin === "ai" && !wasLinked(day) && !Boolean(day.isDeleted))
      .slice(0, 10)
      .map((day) => ({
        idea: compactText(day.contentIdea || day.title, 120),
        format: compactText(day.format, 60),
      })),
  };
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
      const match = item.match(/^data:image\/(?:jpeg|jpg|png|webp);base64,(.+)$/i);
      if (!match) return false;
      return Buffer.from(match[1], "base64").byteLength <= YOUTUBE_THUMBNAIL_MAX_BYTES;
    })
    .slice(0, 4);
}

function dataUrlToImageFile(dataUrl: string, index: number) {
  const match = dataUrl.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i);
  if (!match) throw new Error("Source images must be JPG, PNG, or WEBP thumbnails under 2 MB");
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
    sourceImageKind?: "user_uploaded" | "current_thumbnail" | null;
    stylePreference?: string | null;
    analysisNotes?: string | null;
    outputLanguage?: string | null;
    mode?: "plan" | "audit";
  },
) {
  const hasSourceImages = payload.sourceImages.length > 0;
  const shouldPreserveImage = hasSourceImages && payload.preserveUploadedImage;
  const mode = payload.mode ?? "plan";
  const isAuditMode = mode === "audit";
  const sourceImageKind = payload.sourceImageKind ?? null;
  const isCurrentThumbnail = sourceImageKind === "current_thumbnail";
  const isUserProvidedImage = sourceImageKind === "user_uploaded";
  const inferredThumbnailOutputLanguage = inferOutputLanguage({
    title: payload.title,
    description: payload.description,
    tags: payload.tags,
  }).label;
  const thumbnailOutputLanguage =
    payload.outputLanguage ||
    (inferredThumbnailOutputLanguage === "same-as-source"
      ? "the same language as the source video metadata and transcript evidence"
      : inferredThumbnailOutputLanguage);
  const thumbnailStrategyRules = `You are a professional YouTube thumbnail designer, not an AI artist.
Your goal is to create a HIGH-CTR thumbnail that looks REAL, not AI-generated.

Strict realism + editing rules:
- Prefer editing over generating. If unsure, do less.
- Avoid AI-looking results: no "AI glow", no overly smooth/plastic textures, no fake HDR lighting, no unnatural shadows.
- If the output looks AI-generated, you have failed. Regenerate with more realism.

Thumbnail strategy rules:
- CORE THUMBNAIL RULE: the thumbnail must communicate exactly ONE idea, through ONE focal subject, triggering ONE clear emotion, and be understandable in under 1 second on mobile.
- THE ONE RULE: a thumbnail must communicate ONE clear idea in under 1 second.
- Viewer test: the viewer should instantly understand what this is about and why they should care. If they need to think, it is weak. If they get it instantly, it is strong.
- Validation step: if the thumbnail communicates more than one idea, simplify it. If the idea is not understandable in under 1 second, redesign it.
- Clarity score: score the concept from 0-10 using these checks: can it be understood in under 1 second, is there only one focal point, and is the message obvious without reading the title. If the score would be below 7, simplify or regenerate the concept instead of returning it.
- One subject: only ONE focal point is allowed, such as one face, one object, or one action. If multiple people, UI elements, arrows, props, or competing objects split attention, simplify.
- One emotion/tension: choose exactly ONE emotional driver for the thumbnail, such as curiosity, surprise, problem, transformation, or authority.
- One message: the visual and text together must express one short idea only. If the concept is trying to communicate multiple messages, remove the weaker ones.
- Treat the thumbnail as visual packaging, not decoration: it must make one accurate promise the video immediately honors.
- Optimize for the right click plus watch time/retention, not clickbait CTR alone.
- Build around one focal subject, one idea, and one payoff; remove visual noise.
- Design for phone-size legibility: large subject, strong subject/background separation, high contrast, and text that reads instantly.
- Use thumbnail text only when it adds value beyond the title; keep it bold, non-redundant, and 1–4 words max.
- Match the title, description, hook, and first 30 seconds so the thumbnail promise fits the actual video.
- For YouTube long-form, create a true 16:9 custom thumbnail concept that is accurate, uncluttered, high-resolution, and testable.
- For YouTube Shorts or vertical concepts, think in poster-frame terms: the first frame or selected frame should be a strong cover with centered subject, readable text, and no important detail near crop/UI edges.
- For TikTok-style covers, favor vertical-safe composition, UI safe-zone awareness, high resolution, and readable text for profile/search previews.
- Faces help only when the expression carries the idea; if a source image has a face, preserve identity, facial structure, expression, age, gaze direction, hair, and skin texture exactly.
- FACE PRESERVATION RULE: if a human face exists in the provided image(s), it MUST remain identical in the final output.
- Strict face requirements: do not change identity, facial structure, proportions, age, gender presentation, skin tone, or facial features; do not replace the face or generate a new person; do not stylize, cartoonize, beautify, or alter realism; do not rotate or re-angle the face in a way that changes the original pose; do not modify expression beyond natural enhancement.
- Allowed face-safe adjustments: color correction, exposure, contrast, sharpness, subtle lighting enhancements, background blur/separation, and cropping or zooming that keeps the face intact.
- If the system cannot preserve the face exactly, it must keep the original image unchanged or redesign the thumbnail without modifying the face.
- Any output that alters, replaces, or reinterprets a real face is invalid.
- Category defaults: podcasts/talks use expressive face plus quote/thesis; ads use product/result plus one benefit; demos use before/after or UI/result proof; art uses finished piece plus tool/process cue; cooking uses finished dish plus texture cue; gaming uses character/item/map/stat plus one performance claim; entertainment uses reaction or mystery object plus unresolved question.`;
  const userContent: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [
    {
      type: "text",
      text: `Title: ${payload.title}
Description: ${payload.description}
Tags: ${payload.tags.join(", ")}
User Text Preference: ${payload.textPreference?.trim() || "auto-generate"}
Style Preference: ${payload.stylePreference?.trim() || "auto-detect the best thumbnail style"}
${isAuditMode ? `Thumbnail + Video Improvement Notes: ${payload.analysisNotes?.trim() || "none"}` : `Notes: ${payload.analysisNotes?.trim() || "none"}`}
Image Inputs: ${hasSourceImages ? `The attached ${payload.sourceImages.length} source image(s) are ${payload.sourceImageKind === "current_thumbnail" ? "the video's current public thumbnail" : "provided by the user"}.` : "No source images provided."}

${thumbnailStrategyRules}`,
    },
  ];

  for (const sourceImage of payload.sourceImages) {
    userContent.push({
      type: "image_url",
      image_url: { url: sourceImage },
    });
  }

  const systemPrompt = hasSourceImages
    ? isAuditMode
      ? `You are an expert YouTube thumbnail designer and creative director.

${isCurrentThumbnail
  ? "Your job is NOT to recreate the current thumbnail."
  : "Your job is NOT to produce a cheap copy of the provided image(s)."}
Your job is to extract the core idea, then repackage it into a higher-performing thumbnail.

${thumbnailStrategyRules}

CORE DECISION LOGIC:
1) If the user provided images: you MUST use them as the base visual. Do not change identity, face, pose, or subject.
2) If no user images and this is the current thumbnail: if a face exists, reuse the EXACT same face/identity. Do NOT generate a new person. You are rebuilding a better thumbnail using the same person.
3) If no face exists: you are free to redesign more aggressively.

CREATIVE TRANSFORMATION RULE (KEY):
- Do NOT do a small tweak/copy. You MUST redesign the layout and visual storytelling.
- Use different composition, different framing, cleaner hierarchy, and stronger one-idea focus.

💣 CRITICAL LINE (MUST FOLLOW):
"Do NOT reuse the original thumbnail composition. You must redesign the layout and visual storytelling while preserving only necessary elements (like the face)."

STRICT FACE HANDLING:
- If a face exists, identity must remain EXACT (no swapping, no beautifying, no stylizing).
- Allowed: color correction, lighting enhancement, sharpening, slight crop/zoom.

TEXT RULES:
- If user provides text: refine it (shorter/stronger).
- If not: generate 2–3 options and pick the strongest.
- Max 3–5 words; must add curiosity (not repeat the title).

INTERNAL CHECK (DO NOT OUTPUT):
- Is this visually different from the original? YES required.
- Is the idea clearer in under 1 second? YES required.
- Is there only one focal point? YES required.
- If any answer is no, redesign before finalizing.

OUTPUT:
Return ONLY the final image editing prompt.

OUTPUT LANGUAGE RULE:
- Write the final image editing prompt in ${thumbnailOutputLanguage}.
- If the thumbnail includes text, write that thumbnail text in ${thumbnailOutputLanguage} unless the user explicitly requested another language.`
      : `You are an expert YouTube thumbnail designer focused on maximizing CTR.

IMPORTANT: ${payload.sourceImageKind === "current_thumbnail" ? "The provided image is the video's current thumbnail. Improve it." : "The user has provided an image."}

${thumbnailStrategyRules}

STRICT RULES (MUST FOLLOW):
- If a source image is provided, you MUST use it exactly as the base visual
- DO NOT recreate, redraw, or reinterpret the subject
- DO NOT change the face, hands, or main objects
- DO NOT replace the person or objects
- If there are any faces, preserve identity, facial structure, expression, skin texture, hair, age, gaze direction, and pose exactly
- Do not beautify, age, de-age, stylize, cartoon, or alter any face
- You may ONLY:
  - enhance colors, contrast, exposure, and local lighting
  - improve sharpness and clarity without changing facial features
  - add subtle depth/background separation (blur/simplify) without changing the subject
  - slightly blur, darken, or simplify the background for focus without changing the subject
  - add bold readable text, arrows, outlines, highlights, or graphic accents in empty/non-face areas
- The final result must look like a real photo edited by a human designer (Photoshop), not a new AI image
- Avoid overly smooth textures, artificial lighting, "AI glow", and unrealistic shadows

OUTPUT:
Return ONLY the final image editing prompt.

OUTPUT LANGUAGE RULE:
- Write the final image editing prompt in ${thumbnailOutputLanguage}.
- If the thumbnail includes text, write that thumbnail text in ${thumbnailOutputLanguage} unless the user explicitly requested another language.`
    : isAuditMode
      ? `You are an expert YouTube thumbnail designer and creative director.

Your job is NOT to recreate any existing thumbnail.
Your job is to extract the core idea, then repackage it into a higher-performing thumbnail concept.

${thumbnailStrategyRules}

CREATIVE TRANSFORMATION RULE (KEY):
- Do NOT be generic. Pick one strong visual promise and build the whole thumbnail around it.
- Different composition, different framing, stronger focus, cleaner hierarchy.

TEXT RULES:
- If user provides text: refine it (shorter/stronger).
- If not: generate 2–3 options and pick the strongest.
- Max 3–5 words; must add curiosity (not repeat the title).

INTERNAL CHECK (DO NOT OUTPUT):
- Is the idea understandable in under 1 second? YES required.
- Is there only one focal point and one emotion? YES required.
- If not, simplify and redesign.

OUTPUT:
Return ONLY the final image generation prompt.

OUTPUT LANGUAGE RULE:
- Write the final image generation prompt in ${thumbnailOutputLanguage}.
- If the thumbnail includes text, write that thumbnail text in ${thumbnailOutputLanguage} unless the user explicitly requested another language.`
      : `You are an expert YouTube thumbnail designer and viral content strategist.

Your goal is NOT just to create a beautiful image, but to maximize click-through-rate (CTR).
However, do not chase misleading CTR: the thumbnail must attract the right viewer and preserve watch time/retention.

${thumbnailStrategyRules}

Analyze the provided YouTube metadata and design a thumbnail that:
- Creates curiosity or emotional tension
- Is instantly understandable in less than 1 second
- Uses strong visual hierarchy (clear subject, background, contrast)
- Works well on mobile (small size clarity)
- Avoids clutter and unnecessary elements
- Matches this preferred style when provided: ${payload.stylePreference?.trim() || "best fit for the video"}
- Uses these audit notes when relevant: ${payload.analysisNotes?.trim() || "none"}

Thumbnail style should match top-performing YouTube thumbnails:
- Bold composition
- High contrast lighting
- Clean background (or intentionally blurred)
- Expressive subject (if applicable)
- Minimal but powerful text (3-5 words max)

STEP 1: Analyze intent
- What is the core idea of the video?
- What emotion should the viewer feel? (curiosity, shock, urgency, excitement)
- What is the single focal subject?
- What is the one message the viewer should understand in under 1 second?

STEP 2: Thumbnail concept
Generate 3 different thumbnail concepts:
Each should include:
- Scene description
- Subject placement
- Background style
- Emotion conveyed
- Suggested text (if needed)
- Clarity score out of 10 based on one-second understanding, single focal point, and obvious message without title

STEP 3: Select best concept
Pick the strongest concept based on CTR potential and clarity.
Reject any concept with a clarity score below 7.
Reject any concept with multiple focal points, multiple messages, or no clear emotional trigger.

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
- The final concept must pass the one-second clarity test: one idea, one focal subject, one emotion, one message
- If those rules are violated, simplify or redesign before returning the final prompt
- Return ONLY the final image generation prompt

OUTPUT LANGUAGE RULE:
- Write the final image generation prompt in ${thumbnailOutputLanguage}.
- If the thumbnail includes text, write that thumbnail text in ${thumbnailOutputLanguage} unless the user explicitly requested another language.`;

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

async function runYoutubeThumbnailImageRequest(
  model: string,
  prompt: string,
  sourceImages: string[],
  editPolicy: "user_image_base" | "reference_transform" | "current_thumbnail_repackage" | null,
) {
  const isGptImage2 = model === "gpt-image-2";
  const sharedOptions = {
    model,
    prompt,
    size: isGptImage2 ? "2048x1152" : "1536x1024",
    quality: "high",
    output_format: "jpeg",
    output_compression: isGptImage2 ? 82 : 85,
  } as const;

  const editGuardrails = (() => {
    if (!editPolicy) return "";
    if (editPolicy === "current_thumbnail_repackage") {
      return `The input image is the current public YouTube thumbnail.
Do NOT reuse the original thumbnail composition. You must redesign the layout and visual storytelling while preserving only necessary elements (like the same face/identity if present).
You may crop/zoom/reframe, reposition the subject, replace the background, add/remove supporting elements, and add strong readable text/graphics.
If a real face exists in the input image, do NOT generate a different person and do NOT change identity.
Avoid AI-looking results: no "AI glow", no overly smooth/plastic textures, no fake HDR lighting, no unrealistic shadows. Keep it like a real Photoshop edit.
If the result looks AI-generated, you have failed. Regenerate with more realism.
Keep one clear idea and one focal point.`;
    }
    if (editPolicy === "reference_transform") {
      return `Use the input image(s) as strong visual references and/or starting layers.
You may redesign the background and composition, but if any real faces exist, keep the same identity (do not generate a different person).
Avoid AI-looking results: no "AI glow", no overly smooth/plastic textures, no fake HDR lighting, no unrealistic shadows. Keep it like a real Photoshop edit.
If the result looks AI-generated, you have failed. Regenerate with more realism.
Keep one clear idea and one focal point.`;
    }
    return `Use the input image(s) as the base visuals.
Do NOT change identity, faces, pose, or the main subject.
You MAY improve lighting, contrast, sharpness, and color; you MAY replace/simplify the background; you MAY crop/zoom/reframe without distorting faces; you MAY add text, arrows, outlines, and tasteful graphic accents.
Avoid AI-looking results: no "AI glow", no overly smooth/plastic textures, no fake HDR lighting, no unrealistic shadows. Keep it like a real Photoshop edit.
If the result looks AI-generated, you have failed. Regenerate with more realism.
Keep one clear idea and one focal point.`;
  })();

  if (sourceImages.length) {
    return openai.images.edit({
      ...sharedOptions,
      image: await Promise.all(sourceImages.map(dataUrlToImageFile)),
      prompt: editGuardrails ? `${prompt}\n\n${editGuardrails}` : prompt,
      ...(!isGptImage2 ? { input_fidelity: "high" } : {}),
    } as Parameters<typeof openai.images.edit>[0]);
  }
  return openai.images.generate(sharedOptions as Parameters<typeof openai.images.generate>[0]);
}

function extractGeneratedThumbnailBase64(response: unknown) {
  const record = asRecord(response);
  const data = asArray(record.data);
  for (const item of data) {
    const base64 = asString(asRecord(item).b64_json)?.trim();
    if (base64) return base64;
  }
  return null;
}

async function generateYoutubeThumbnailImage(
  userId: number,
  prompt: string,
  sourceImages: string[],
  preserveUploadedImage: boolean,
  editPolicy: "user_image_base" | "reference_transform" | "current_thumbnail_repackage" | null,
) {
  let usedModel = YOUTUBE_THUMBNAIL_IMAGE_MODEL;
  let response: unknown;
  try {
    response = await runYoutubeThumbnailImageRequest(usedModel, prompt, sourceImages, editPolicy);
  } catch (err) {
    if (usedModel === YOUTUBE_THUMBNAIL_FALLBACK_IMAGE_MODEL) throw err;
    usedModel = YOUTUBE_THUMBNAIL_FALLBACK_IMAGE_MODEL;
    response = await runYoutubeThumbnailImageRequest(usedModel, prompt, sourceImages, editPolicy);
  }
  const base64 = extractGeneratedThumbnailBase64(response);
  if (!base64) {
    throw new Error("Thumbnail generation did not return an image");
  }
  if (Buffer.from(base64, "base64").byteLength > YOUTUBE_THUMBNAIL_MAX_BYTES) {
    throw new Error("Generated thumbnail exceeded YouTube's 2 MB limit. Try a simpler source image or less thumbnail text.");
  }
  await logTokenUsage({
    userId,
    feature: "youtubeThumbnailImage",
    model: usedModel,
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
    .filter((competitor: typeof youtubeCompetitorsTable.$inferSelect) => {
      const subscribers = parseNumber(competitor.subscriberCount);
      return ownSubscribers > 0 && subscribers > 0 && subscribers <= ownSubscribers * 5;
    })
    .map((competitor: typeof youtubeCompetitorsTable.$inferSelect) => {
      const recent = Array.isArray(competitor.mostViewedRecentVideos) ? competitor.mostViewedRecentVideos : [];
      const averageViews = recent.length
        ? Math.round(recent.reduce((sum: number, video: unknown) => sum + parseNumber(asRecord(video).viewCount), 0) / recent.length)
        : 0;
      const titles = recent.map((video: unknown) => asString(asRecord(video).title) || "").filter(Boolean);
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
    .map((competitor: typeof youtubeCompetitorsTable.$inferSelect) => {
      const topVideos = Array.isArray(competitor.mostViewedRecentVideos) ? competitor.mostViewedRecentVideos : [];
      const averageViews = topVideos.length
        ? Math.round(topVideos.reduce((sum: number, video: unknown) => sum + parseNumber(asRecord(video).viewCount), 0) / topVideos.length)
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

function looksLikeYoutubeChannelId(input: string) {
  return /^UC[\w-]{22}$/.test(input.trim());
}

function normalizeYoutubeChannelReferenceToUrl(reference: string) {
  const trimmed = reference.trim();
  if (!trimmed) throw new Error("Enter a YouTube channel URL or @handle");
  if (looksLikeYoutubeChannelId(trimmed)) return `https://www.youtube.com/channel/${trimmed}`;
  if (trimmed.startsWith("@")) return `https://www.youtube.com/${trimmed}`;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^(?:www\.)?(?:m\.)?youtube\.com\//i.test(trimmed)) return `https://${trimmed.replace(/^https?:\/\//i, "")}`;
  return null;
}

async function resolveYoutubeChannelIdFromReference(userId: number, reference: string) {
  const url = normalizeYoutubeChannelReferenceToUrl(reference);
  if (url) return await resolveYoutubeChannelIdFromUrl(url);

  const query = reference.trim();
  const candidates = await searchChannelIds(userId, query, 8);
  if (!candidates.length) {
    throw new Error("No YouTube channels found for that search. Try pasting a channel URL or @handle instead.");
  }

  const channels = await fetchChannelsByIds(userId, candidates.slice(0, 8));
  const normalizedCandidates = channels
    .map((item) => {
      const channel = asRecord(item);
      const snippet = asRecord(channel.snippet);
      const stats = asRecord(channel.statistics);
      return {
        channelId: asString(channel.id),
        title: asString(snippet.title),
        description: asString(snippet.description),
        customUrl: asString(snippet.customUrl),
        subscriberCount: asString(stats.subscriberCount),
      };
    })
    .filter((item): item is {
      channelId: string;
      title: string | null;
      description: string | null;
      customUrl: string | null;
      subscriberCount: string | null;
    } => Boolean(item.channelId));

  if (normalizedCandidates.length === 1) return normalizedCandidates[0]!.channelId;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You select the best matching YouTube channel from candidates.
Return JSON only with shape: {"channelId": string}
Rules:
- Only pick a channelId present in candidates.
- Prefer an exact match on handle/name if obvious.
- If ambiguous, pick the most likely official/primary channel for the query.`,
      },
      {
        role: "user",
        content: JSON.stringify({ query, candidates: normalizedCandidates }),
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 220,
  });

  await logTokenUsage({
    userId,
    feature: "youtubeCompetitorResolve",
    model: "gpt-4o-mini",
    ...usageTokens(completion.usage),
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = asRecord(parseAiJson(raw));
  const selected = asString(parsed.channelId);
  const allowed = new Set(normalizedCandidates.map((item) => item.channelId));
  if (selected && allowed.has(selected)) return selected;

  return normalizedCandidates[0]!.channelId;
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

  const competitorRefreshCutoff = Date.now() - (6 * 60 * 60 * 1000);
  const staleCompetitors = connection && profile
    ? competitors
      .filter((competitor: typeof youtubeCompetitorsTable.$inferSelect) => {
        const fetchedAt = competitor.fetchedAt?.getTime?.() ?? 0;
        const recent = Array.isArray(competitor.mostViewedRecentVideos) ? competitor.mostViewedRecentVideos : [];
        return fetchedAt < competitorRefreshCutoff || recent.length === 0 || !competitor.subscriberCount;
      })
      .slice(0, 6)
    : [];

  if (staleCompetitors.length) {
    try {
      await Promise.all(staleCompetitors.map(async (competitor: typeof youtubeCompetitorsTable.$inferSelect) => {
        const channelId = asString(competitor.channelId);
        if (!channelId) return;
        await upsertYoutubeCompetitor(userId, profile!, channelId, {
          existingCompetitor: competitor,
          preserveManualSource: true,
          generateAiReport: false,
        });
      }));
      competitors = await db
        .select()
        .from(youtubeCompetitorsTable)
        .where(eq(youtubeCompetitorsTable.userId, userId))
        .orderBy(desc(youtubeCompetitorsTable.fetchedAt));
    } catch {
      // Keep returning the saved competitors even if refresh fails.
    }
  }

  const competitorsMissingImages = competitors.filter((competitor: typeof youtubeCompetitorsTable.$inferSelect) => competitor.channelId && !competitor.thumbnailUrl);
  if (connection && competitorsMissingImages.length) {
    try {
      const fetchedChannels = await fetchChannelsByIds(userId, competitorsMissingImages.map((competitor: typeof youtubeCompetitorsTable.$inferSelect) => competitor.channelId || ""));
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

      competitors = competitors.map((competitor: typeof youtubeCompetitorsTable.$inferSelect) => ({
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

async function fetchImageAsDataUrl(url?: string | null) {
  const target = asString(url);
  if (!target) return null;
  const response = await fetch(target);
  if (!response.ok) throw new Error(`Image fetch failed with ${response.status}`);
  const contentType = response.headers.get("content-type")?.split(";")[0]?.toLowerCase() || "";
  const inferredType = target.match(/\.(jpe?g|png|webp)(?:[?#]|$)/i)?.[1]?.toLowerCase();
  const mimeType =
    contentType.match(/^image\/(?:jpeg|jpg|png|webp)$/)
      ? contentType.replace("image/jpg", "image/jpeg")
      : inferredType === "jpg"
        ? "image/jpeg"
        : inferredType
          ? `image/${inferredType}`
          : "image/jpeg";
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > YOUTUBE_THUMBNAIL_MAX_BYTES) return null;
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
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

async function searchAuditComparableVideos(
  userId: number,
  video: YoutubeRecentVideo,
  nicheProfile: YoutubeNicheProfile,
) {
  const queries = [
    buildAuditSearchQuery(video, nicheProfile),
    video.title,
    [nicheProfile.niche, nicheProfile.keywords[0], nicheProfile.keywords[1]].filter(Boolean).join(" "),
    video.tags.slice(0, 3).join(" "),
  ]
    .map((value) => value.trim())
    .filter(Boolean);

  const seen = new Map<string, YoutubeRecentVideo>();
  for (const query of queries) {
    const results = await searchRelevantVideos(userId, query, 10).catch(() => [] as YoutubeRecentVideo[]);
    for (const item of results) {
      if (item.id === video.id || item.channelId === video.channelId) continue;
      if (!seen.has(item.id)) seen.set(item.id, item);
      if (seen.size >= 12) break;
    }
    if (seen.size >= 12) break;
  }

  return [...seen.values()].slice(0, 10);
}

function extractBalancedJson(source: string, marker: string) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) return null;
  const start = source.indexOf("{", markerIndex + marker.length);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return null;
}

function normalizeYoutubeTranscriptText(text: string) {
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function appendUrlParam(url: string, key: string, value: string | null) {
  const parsed = new URL(url);
  if (value == null) parsed.searchParams.delete(key);
  else parsed.searchParams.set(key, value);
  return parsed.toString();
}

function parseSetCookieHeader(value: string) {
  const firstPart = value.split(";", 1)[0] || "";
  const eqIndex = firstPart.indexOf("=");
  if (eqIndex <= 0) return null;
  const name = firstPart.slice(0, eqIndex).trim();
  const cookieValue = firstPart.slice(eqIndex + 1).trim();
  if (!name) return null;
  return { name, value: cookieValue };
}

function mergeCookies(jar: Map<string, string>, setCookieHeaders: string[]) {
  for (const header of setCookieHeaders) {
    const parsed = parseSetCookieHeader(header);
    if (!parsed) continue;
    jar.set(parsed.name, parsed.value);
  }
}

function safeGetSetCookieHeaders(headers: Headers) {
  const anyHeaders = headers as unknown as { getSetCookie?: () => string[] };
  try {
    if (typeof anyHeaders.getSetCookie === "function") {
      const values = anyHeaders.getSetCookie();
      return Array.isArray(values) ? values : [];
    }
  } catch {
    // Ignore and fall back to single-header extraction.
  }
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

function cookieHeaderFromJar(jar: Map<string, string>) {
  if (!jar.size) return "";
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

function captionTracksFromPlayerResponse(playerResponse: JsonRecord) {
  return asArray(asRecord(asRecord(playerResponse.captions).playerCaptionsTracklistRenderer).captionTracks)
    .map((item) => asRecord(item))
    .filter((item) => asString(item.baseUrl));
}

function extractBalancedArray(source: string, marker: string) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) return null;
  const start = source.indexOf("[", markerIndex + marker.length);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "[") depth += 1;
    if (char === "]") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return null;
}

function decodeJsonEscapedString(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  try {
    const parsed = JSON.parse(`"${trimmed.replace(/"/g, "\\\"")}"`) as string;
    return decodeHtmlEntities(
      parsed
        .replace(/\\u([0-9a-f]{4})/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
        .replace(/\\\//g, "/")
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t"),
    );
  } catch {
    return trimmed
      .replace(/\\u([0-9a-f]{4})/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
      .replace(/\\u0026/g, "&")
      .replace(/\\u003d/g, "=")
      .replace(/\\u003f/g, "?")
      .replace(/\\u002f/g, "/")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, "\"")
      .replace(/&apos;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/\\\//g, "/");
  }
}

function captionTracksFromWatchHtml(html: string) {
  const candidates = [
    extractBalancedArray(html, "\"captionTracks\":"),
    extractBalancedArray(html, "captionTracks\":"),
    extractBalancedArray(html, "\\\"captionTracks\\\":"),
  ].filter(Boolean) as string[];
  for (const arrayJson of candidates) {
    try {
      const parsed = JSON.parse(arrayJson);
      if (!Array.isArray(parsed)) continue;
      const tracks = parsed
        .map((item) => asRecord(item))
        .filter((item) => asString(item.baseUrl))
        .map((item) => ({
          baseUrl: asString(item.baseUrl),
          languageCode: asString(item.languageCode),
          kind: asString(item.kind),
          name: asString(asRecord(item.name).simpleText),
        }));
      if (tracks.length) return tracks;
    } catch {
      // Fall through to heuristic parsing below.
    }
  }

  const extracted: JsonRecord[] = [];
  const baseUrlMatches = [
    ...html.matchAll(/"baseUrl":"([^"]+)"/g),
    ...html.matchAll(/\\\"baseUrl\\\":\\\"([^"]+)\\\"/g),
  ];
  for (const match of baseUrlMatches) {
    const rawBaseUrl = match[1] || "";
    const baseUrl = decodeJsonEscapedString(rawBaseUrl);
    if (!baseUrl) continue;
    const start = match.index ?? 0;
    const snippet = html.slice(start, start + 900);
    const languageCode =
      snippet.match(/"languageCode":"([^"]+)"/)?.[1]
      ?? snippet.match(/\\\"languageCode\\\":\\\"([^"]+)\\\"/)?.[1]
      ?? null;
    const kind =
      snippet.match(/"kind":"([^"]+)"/)?.[1]
      ?? snippet.match(/\\\"kind\\\":\\\"([^"]+)\\\"/)?.[1]
      ?? null;
    const name =
      snippet.match(/"simpleText":"([^"]+)"/)?.[1]
      ?? snippet.match(/\\\"simpleText\\\":\\\"([^"]+)\\\"/)?.[1]
      ?? null;
    extracted.push({
      baseUrl,
      languageCode: languageCode ? decodeJsonEscapedString(languageCode) : null,
      kind: kind ? decodeJsonEscapedString(kind) : null,
      name: name ? decodeJsonEscapedString(name) : null,
    });
    if (extracted.length >= 60) break;
  }

  return extracted.filter((item) => asString(item.baseUrl));
}

function isYoutubeConsentInterstitial(html: string, finalUrl?: string | null) {
  const normalizedUrl = String(finalUrl || "").toLowerCase();
  if (normalizedUrl.includes("consent.youtube.com")) return true;
  const normalizedHtml = html.toLowerCase();
  return normalizedHtml.includes("consent.youtube.com")
    || normalizedHtml.includes("before you continue to youtube")
    || normalizedHtml.includes("consent.google.com");
}

function seedYoutubeConsentCookies(jar: Map<string, string>) {
  // Best-effort: helps avoid EU consent interstitials and bot-classified HTML variants.
  // Safe even when unnecessary.
  if (!jar.has("CONSENT")) jar.set("CONSENT", "YES+1");
  if (!jar.has("SOCS")) jar.set("SOCS", "CAI");
}

function baseLanguageCode(value: unknown) {
  const raw = asString(value)?.trim().toLowerCase() || "";
  if (!raw) return "";
  return raw.split(/[-_]/)[0] || raw;
}

function normalizePreferredLanguageCodes(preferredLanguages: Array<string | null | undefined>) {
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const lang of preferredLanguages) {
    const base = baseLanguageCode(lang);
    if (!base || seen.has(base)) continue;
    seen.add(base);
    normalized.push(base);
  }
  return normalized;
}

function orderCaptionTracks(tracks: JsonRecord[], preferredBaseCodes: string[]) {
  const unique: JsonRecord[] = [];
  const seenBaseUrl = new Set<string>();
  for (const track of tracks) {
    const baseUrl = asString(asRecord(track).baseUrl);
    if (!baseUrl || seenBaseUrl.has(baseUrl)) continue;
    seenBaseUrl.add(baseUrl);
    unique.push(track);
  }

  const manual: JsonRecord[] = [];
  const auto: JsonRecord[] = [];
  for (const track of unique) {
    (asString(asRecord(track).kind) === "asr" ? auto : manual).push(track);
  }

  const ordered: JsonRecord[] = [];
  const used = new Set<string>();
  const pushMatches = (pool: JsonRecord[], baseCode: string) => {
    for (const track of pool) {
      const lang = baseLanguageCode(asRecord(track).languageCode);
      const baseUrl = asString(asRecord(track).baseUrl);
      if (!baseUrl || used.has(baseUrl)) continue;
      if (lang !== baseCode) continue;
      used.add(baseUrl);
      ordered.push(track);
    }
  };

  for (const code of preferredBaseCodes) {
    pushMatches(manual, code);
    pushMatches(auto, code);
  }

  // Remaining tracks: manual first, then auto.
  for (const track of manual.concat(auto)) {
    const baseUrl = asString(asRecord(track).baseUrl);
    if (!baseUrl || used.has(baseUrl)) continue;
    used.add(baseUrl);
    ordered.push(track);
  }

  return ordered;
}

function parseTimedTextTrackList(videoId: string, xml: string) {
  const tracks: JsonRecord[] = [];
  for (const match of xml.matchAll(/<track\b([^>]*)\/?>/gi)) {
    const attrs: JsonRecord = {};
    for (const attr of (match[1] || "").matchAll(/([\w:-]+)="([^"]*)"/g)) {
      attrs[attr[1]] = decodeHtmlEntities(attr[2]);
    }
    const lang = asString(attrs.lang_code);
    if (!lang) continue;
    const params = new URLSearchParams({ v: videoId, lang, fmt: "json3" });
    const name = asString(attrs.name);
    const kind = asString(attrs.kind);
    if (name) params.set("name", name);
    if (kind) params.set("kind", kind);
    tracks.push({
      baseUrl: `https://www.youtube.com/api/timedtext?${params.toString()}`,
      languageCode: lang,
      kind: kind || null,
      name,
    });
  }
  return tracks;
}

function normalizeTranscriptSegments(segments: YoutubeTranscriptSegment[]) {
  return segments
    .map((segment) => ({
      start: Math.max(0, Number(segment.start) || 0),
      end: Math.max(0, Number(segment.end) || 0),
      text: normalizeYoutubeTranscriptText(segment.text || ""),
    }))
    .filter((segment) => segment.text)
    .map((segment) => ({
      ...segment,
      end: segment.end > segment.start ? segment.end : Math.max(segment.start + 0.8, segment.end),
    }));
}

function groupAuditTranscriptSegments(segments: YoutubeTranscriptSegment[]) {
  const normalized = normalizeTranscriptSegments(segments);
  if (!normalized.length) return [];
  const grouped: YoutubeTranscriptSegment[] = [];
  let current: YoutubeTranscriptSegment | null = null;
  const maxChunkSeconds = 10;
  const minChunkSeconds = 2.5;

  const shouldCloseChunk = (segment: YoutubeTranscriptSegment, nextSegment?: YoutubeTranscriptSegment | null) => {
    const duration = segment.end - segment.start;
    const endsSentence = /[.!?]["')\]]?$/.test(segment.text);
    const longEnough = duration >= minChunkSeconds;
    const gapToNext = nextSegment ? Math.max(0, nextSegment.start - segment.end) : 0;
    return duration >= maxChunkSeconds
      || (endsSentence && longEnough)
      || gapToNext >= 1.2
      || !nextSegment;
  };

  for (let index = 0; index < normalized.length; index++) {
    const segment = normalized[index]!;
    const nextSegment = normalized[index + 1] ?? null;
    if (!current) {
      current = { ...segment };
    } else {
      const mergedDuration = segment.end - current.start;
      const mergedText = `${current.text} ${segment.text}`.replace(/\s+/g, " ").trim();
      current = {
        start: current.start,
        end: segment.end,
        text: mergedText,
      };
      if (mergedDuration >= maxChunkSeconds + 1.5) {
        grouped.push(current);
        current = null;
        continue;
      }
    }

    if (current && shouldCloseChunk(current, nextSegment)) {
      grouped.push(current);
      current = null;
    }
  }

  if (current) grouped.push(current);
  return normalizeTranscriptSegments(grouped);
}

function transcriptSegmentsToText(segments: YoutubeTranscriptSegment[]) {
  return normalizeYoutubeTranscriptText(segments.map((segment) => segment.text).join("\n"));
}

function buildApproximateTranscriptSegmentsFromText(text: string): YoutubeTranscriptSegment[] {
  const cleaned = normalizeYoutubeTranscriptText(text);
  if (!cleaned) return [];
  const parts = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  let cursor = 0;
  return parts.map((part) => {
    const wordCount = part.split(/\s+/).filter(Boolean).length;
    const duration = Math.max(1.2, Math.min(7, wordCount / 2.7));
    const segment = {
      start: cursor,
      end: cursor + duration,
      text: part,
    };
    cursor += duration;
    return segment;
  });
}

function parseTranscriptXml(xml: string) {
  const segments = normalizeTranscriptSegments(
    [...xml.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/gi)].map((match) => {
      const attrs: JsonRecord = {};
      for (const attr of (match[1] || "").matchAll(/([\w:-]+)="([^"]*)"/g)) {
        attrs[attr[1]] = decodeHtmlEntities(attr[2]);
      }
      const text = normalizeYoutubeTranscriptText(decodeHtmlEntities(match[2]).replace(/\s+/g, " "));
      const start = Number(attrs.start ?? 0);
      const duration = Number(attrs.dur ?? 0);
      return {
        start,
        end: start + Math.max(0.1, duration || 0),
        text,
      };
    }),
  );
  return segments.length
    ? { text: transcriptSegmentsToText(segments), segments }
    : null;
}

async function fetchTranscriptFromTrack(track: JsonRecord, requestHeaders: Record<string, string>) {
  const baseUrl = asString(track.baseUrl);
  if (!baseUrl) return null;
  const urls = [
    appendUrlParam(baseUrl, "fmt", "json3"),
    appendUrlParam(baseUrl, "fmt", null),
  ];

  for (const url of urls) {
    const wantsJson = url.includes("fmt=json3");
    const response = await fetch(url, {
      headers: {
        ...requestHeaders,
        Accept: wantsJson ? "application/json,text/plain,*/*" : "*/*",
      },
    }).catch(() => null);

    if (!response?.ok) continue;
    const raw = await response.text().catch(() => "");
    const cleaned = raw.trim().replace(/^\)\]\}'\s*/, "");
    if (!cleaned) continue;

    if (wantsJson) {
      try {
        const transcriptJson = asRecord(JSON.parse(cleaned));
        const events = asArray(transcriptJson.events).map((item) => asRecord(item));
        const segments = normalizeTranscriptSegments(events.map((event) => {
          const text = asArray(event.segs)
            .map((seg) => asString(asRecord(seg).utf8) || "")
            .join("")
            .replace(/\s+/g, " ")
            .trim();
          const startMs = parseNumber(event.tStartMs);
          const durationMs = parseNumber(event.dDurationMs);
          return {
            start: startMs / 1000,
            end: (startMs + Math.max(100, durationMs || 0)) / 1000,
            text,
          };
        }));
        if (segments.length) return { text: transcriptSegmentsToText(segments), segments };
      } catch {
        // Fall through to XML attempt.
      }
      continue;
    }

    const parsed = parseTranscriptXml(cleaned);
    if (parsed) return parsed;
  }

  return null;
}

async function fetchYoutubeTranscriptPackageFallback(videoId: string, preferredLanguages: Array<string | null> = []) {
  const attempts = [...new Set(
    [
      ...preferredLanguages,
      null,
      "en",
    ]
      .map((value) => value?.trim() || null)
      .flatMap((value) => {
        if (!value) return [null];
        const base = value.toLowerCase().split(/[-_]/)[0] || value.toLowerCase();
        return base === value.toLowerCase() ? [value, null] : [value, base, null];
      }),
  )];

  for (const lang of attempts) {
    const rows = await fetchYoutubeTranscriptPackage(videoId, lang ? { lang } : {}).catch(() => null);
    if (!rows?.length) continue;
    const segments = normalizeTranscriptSegments(rows
      .map((row: { text?: string | null; lang?: string | null; offset?: number | null; duration?: number | null }) => {
        const text = normalizeYoutubeTranscriptText(String(row.text || ""));
        const start = Number(row.offset ?? 0) / 1000;
        const duration = Number(row.duration ?? 0) / 1000;
        return {
          start,
          end: start + Math.max(0.8, duration || 0),
          text,
        };
      }));
    const fallbackSegments = segments.length ? segments : buildApproximateTranscriptSegmentsFromText(rows
      .map((row: { text?: string | null }) => normalizeYoutubeTranscriptText(String(row.text || "")))
      .filter(Boolean)
      .join("\n"));
    if (!fallbackSegments.length) continue;
    return {
      source: "auto" as const,
      language: rows.find((row: { text?: string | null; lang?: string | null }) => row.lang)?.lang ?? lang ?? null,
      text: transcriptSegmentsToText(fallbackSegments),
      segments: fallbackSegments,
    };
  }
  return null;
}

function recommendThumbnailStyle(video: YoutubeRecentVideo, nicheProfile: YoutubeNicheProfile) {
  const format = likelyYoutubeFormatFromVideo(video);
  const text = `${video.title} ${video.description} ${nicheProfile.niche} ${nicheProfile.summary}`.toLowerCase();
  if (text.match(/\b(funny|comedy|cartoon|animation|meme|parody|storytime)\b/)) return "Cartoon";
  if (text.match(/\b(podcast|interview|discussion|saas|software|ai|developer|startup|business|finance|analysis)\b/)) return "Professional";
  if (format === "youtube_shorts") return "Bold";
  if (text.match(/\b(vlog|lifestyle|travel|cinematic|film|story)\b/)) return "Cinematic";
  if (text.match(/\b(tutorial|how to|guide|explained|minimal)\b/)) return "Minimal";
  return "Realistic";
}

async function probeYoutubeCaptionAvailability(videoId: string, preferredLanguages: Array<string | null> = []) {
  const cookieJar = new Map<string, string>();
  seedYoutubeConsentCookies(cookieJar);
  const baseHeaders: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
  };
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}&hl=en&gl=US`;

  const fetchWithCookies = async (url: string, init: RequestInit = {}, extraHeaders: Record<string, string> = {}) => {
    const cookieHeader = cookieHeaderFromJar(cookieJar);
    const headers = {
      ...baseHeaders,
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      ...(init.headers ? (init.headers as Record<string, string>) : {}),
      ...extraHeaders,
    };
    const response = await fetch(url, { ...init, headers }).catch(() => null);
    if (response) mergeCookies(cookieJar, safeGetSetCookieHeaders(response.headers));
    return response;
  };

  let watchHtml = "";
  let captionTracks: JsonRecord[] = [];

  const watchResponse = await fetchWithCookies(
    watchUrl,
    {},
    { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
  );
  if (watchResponse?.ok) {
    watchHtml = await watchResponse.text();
    if (isYoutubeConsentInterstitial(watchHtml, watchResponse.url)) {
      seedYoutubeConsentCookies(cookieJar);
      const retry = await fetchWithCookies(
        watchUrl,
        {},
        { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
      );
      if (retry?.ok) watchHtml = await retry.text();
    }
    try {
      const playerResponseJson =
        extractBalancedJson(watchHtml, "var ytInitialPlayerResponse = ") ||
        extractBalancedJson(watchHtml, "ytInitialPlayerResponse = ") ||
        extractBalancedJson(watchHtml, "window['ytInitialPlayerResponse'] = ") ||
        extractBalancedJson(watchHtml, "window[\"ytInitialPlayerResponse\"] = ");
      if (playerResponseJson) {
        const playerResponse = asRecord(JSON.parse(playerResponseJson));
        captionTracks = captionTracksFromPlayerResponse(playerResponse);
      }
    } catch {
      captionTracks = [];
    }

    if (!captionTracks.length && watchHtml) {
      captionTracks = captionTracksFromWatchHtml(watchHtml);
    }
  }

  if (!captionTracks.length && watchHtml) {
    const apiKey = watchHtml.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1];
    const clientVersion = watchHtml.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1] || "2.20240101.00.00";
    if (apiKey) {
      const playerResponse = await fetchWithCookies(
        `https://www.youtube.com/youtubei/v1/player?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            context: { client: { clientName: "WEB", clientVersion, hl: "en", gl: "US" } },
            videoId,
          }),
        },
        { Accept: "application/json", Referer: watchUrl, Origin: "https://www.youtube.com" },
      );
      if (playerResponse?.ok) {
        captionTracks = captionTracksFromPlayerResponse(asRecord(await playerResponse.json().catch(() => ({}))));
      }
    }
  }

  if (!captionTracks.length && watchHtml) {
    captionTracks = captionTracksFromWatchHtml(watchHtml);
  }

  if (!captionTracks.length) {
    const listResponse = await fetchWithCookies(
      `https://www.youtube.com/api/timedtext?type=list&v=${encodeURIComponent(videoId)}`,
      {},
      { Accept: "*/*", Referer: watchUrl, Origin: "https://www.youtube.com" },
    );
    if (listResponse?.ok) {
      captionTracks = parseTimedTextTrackList(videoId, await listResponse.text());
    }
  }

  const hasCaptions = captionTracks.length > 0;
  const preferredBaseCodes = normalizePreferredLanguageCodes(preferredLanguages);
  if (!preferredBaseCodes.includes("en")) preferredBaseCodes.push("en");
  const orderedTracks = orderCaptionTracks(captionTracks, preferredBaseCodes);

  const firstTrack = hasCaptions ? asRecord(orderedTracks[0] ?? captionTracks[0]) : null;
  const downloadableTranscript = firstTrack?.baseUrl
    ? await fetchTranscriptFromTrack(firstTrack, {
      ...baseHeaders,
      ...(cookieJar.size ? { Cookie: cookieHeaderFromJar(cookieJar) } : {}),
      Referer: watchUrl,
      Origin: "https://www.youtube.com",
    }).catch(() => null)
    : null;
  const downloadable = Boolean(downloadableTranscript?.text);
  const source = hasCaptions
    ? (asString(firstTrack?.kind) === "asr" ? "auto" as const : "manual" as const)
    : null;
  const language = hasCaptions ? (asString(firstTrack?.languageCode) || null) : null;
  const languageCandidates = (orderedTracks.length ? orderedTracks : captionTracks)
    .map((track) => asString(asRecord(track).languageCode))
    .filter(Boolean) as string[];
  const languages = [...new Set(languageCandidates)];

  return {
    available: hasCaptions,
    downloadable,
    source,
    language,
    languages,
  };
}

async function fetchPublicYoutubeTranscript(videoId: string, preferredLanguages: Array<string | null> = []) {
  // Use a real browser UA and persist cookies across requests.
  // YouTube will often classify custom UAs as bots/crawlers and omit/deny caption data.
  const cookieJar = new Map<string, string>();
  seedYoutubeConsentCookies(cookieJar);
  const baseHeaders: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
  };

  const watchUrl = `https://www.youtube.com/watch?v=${videoId}&hl=en&gl=US`;
  const fetchWithCookies = async (url: string, init: RequestInit = {}, extraHeaders: Record<string, string> = {}) => {
    const cookieHeader = cookieHeaderFromJar(cookieJar);
    const headers = {
      ...baseHeaders,
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      ...(init.headers ? (init.headers as Record<string, string>) : {}),
      ...extraHeaders,
    };
    const response = await fetch(url, { ...init, headers }).catch(() => null);
    if (response) mergeCookies(cookieJar, safeGetSetCookieHeaders(response.headers));
    return response;
  };

  let captionTracks: JsonRecord[] = [];
  let watchHtml = "";
  const discoveredLanguages = new Set<string>();

  const watchResponse = await fetchWithCookies(watchUrl, {}, { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" });
  if (watchResponse?.ok) {
    watchHtml = await watchResponse.text();
    if (isYoutubeConsentInterstitial(watchHtml, watchResponse.url)) {
      seedYoutubeConsentCookies(cookieJar);
      const retry = await fetchWithCookies(watchUrl, {}, { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" });
      if (retry?.ok) watchHtml = await retry.text();
    }
    try {
      const playerResponseJson =
        extractBalancedJson(watchHtml, "var ytInitialPlayerResponse = ") ||
        extractBalancedJson(watchHtml, "ytInitialPlayerResponse = ") ||
        extractBalancedJson(watchHtml, "window['ytInitialPlayerResponse'] = ") ||
        extractBalancedJson(watchHtml, "window[\"ytInitialPlayerResponse\"] = ");
      if (playerResponseJson) {
        const playerResponse = asRecord(JSON.parse(playerResponseJson));
        captionTracks = captionTracksFromPlayerResponse(playerResponse);
        for (const track of captionTracks) {
          const languageCode = asString(track.languageCode);
          if (languageCode) discoveredLanguages.add(languageCode);
        }
      }
    } catch {
      captionTracks = [];
    }

    if (!captionTracks.length && watchHtml) {
      captionTracks = captionTracksFromWatchHtml(watchHtml);
      for (const track of captionTracks) {
        const languageCode = asString(track.languageCode);
        if (languageCode) discoveredLanguages.add(languageCode);
      }
    }
  }

  if (!captionTracks.length) {
    const infoResponse = await fetchWithCookies(
      `https://www.youtube.com/get_video_info?video_id=${videoId}&el=detailpage&hl=en`,
      {},
      { Accept: "*/*", Referer: watchUrl, Origin: "https://www.youtube.com" },
    );
    if (infoResponse?.ok) {
      const raw = await infoResponse.text();
      const params = new URLSearchParams(raw);
      const playerResponseRaw = params.get("player_response");
      if (playerResponseRaw) {
        try {
          const playerResponse = asRecord(JSON.parse(playerResponseRaw));
          captionTracks = captionTracksFromPlayerResponse(playerResponse);
          for (const track of captionTracks) {
            const languageCode = asString(track.languageCode);
            if (languageCode) discoveredLanguages.add(languageCode);
          }
        } catch {
          captionTracks = [];
        }
      }
    }
  }

  if (!captionTracks.length && watchHtml) {
    const apiKey = watchHtml.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1];
    const clientVersion = watchHtml.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1] || "2.20240101.00.00";
    if (apiKey) {
      const playerResponse = await fetchWithCookies(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: { client: { clientName: "WEB", clientVersion, hl: "en", gl: "US" } },
          videoId,
        }),
      }, { Accept: "application/json", Referer: watchUrl, Origin: "https://www.youtube.com" });
      if (playerResponse?.ok) {
        captionTracks = captionTracksFromPlayerResponse(asRecord(await playerResponse.json().catch(() => ({}))));
        for (const track of captionTracks) {
          const languageCode = asString(track.languageCode);
          if (languageCode) discoveredLanguages.add(languageCode);
        }
      }
    }
  }

  if (!captionTracks.length && watchHtml) {
    captionTracks = captionTracksFromWatchHtml(watchHtml);
    for (const track of captionTracks) {
      const languageCode = asString(track.languageCode);
      if (languageCode) discoveredLanguages.add(languageCode);
    }
  }

  if (!captionTracks.length) {
    const listResponse = await fetchWithCookies(
      `https://www.youtube.com/api/timedtext?type=list&v=${encodeURIComponent(videoId)}`,
      {},
      { Accept: "*/*", Referer: watchUrl, Origin: "https://www.youtube.com" },
    );
    if (listResponse?.ok) {
      captionTracks = parseTimedTextTrackList(videoId, await listResponse.text());
      for (const track of captionTracks) {
        const languageCode = asString(track.languageCode);
        if (languageCode) discoveredLanguages.add(languageCode);
      }
    }
  }

  const preferredBaseCodes = normalizePreferredLanguageCodes(preferredLanguages);
  if (!preferredBaseCodes.includes("en")) preferredBaseCodes.push("en");

  if (!captionTracks.length) {
    const fallbackLanguages = [
      ...preferredLanguages.filter(Boolean),
      ...(!preferredLanguages.some((lang) => baseLanguageCode(lang) === "en") ? ["en"] : []),
      ...discoveredLanguages,
    ];
    return fetchYoutubeTranscriptPackageFallback(videoId, fallbackLanguages).catch(() => null);
  }

  const orderedTracks = orderCaptionTracks(captionTracks, preferredBaseCodes);

  for (const track of orderedTracks) {
    const transcript = await fetchTranscriptFromTrack(track, {
      ...baseHeaders,
      ...(cookieJar.size ? { Cookie: cookieHeaderFromJar(cookieJar) } : {}),
      Accept: "*/*",
      Referer: watchUrl,
      Origin: "https://www.youtube.com",
    });
    if (!transcript) continue;
    return {
      source: asString(track.kind) === "asr" ? "auto" as const : "manual" as const,
      language: asString(track.languageCode),
      text: transcript.text,
      segments: transcript.segments,
    };
  }

  const fallbackLanguages = [
    ...preferredLanguages.filter(Boolean),
    ...(!preferredLanguages.some((lang) => baseLanguageCode(lang) === "en") ? ["en"] : []),
    ...discoveredLanguages,
  ];
  return fetchYoutubeTranscriptPackageFallback(videoId, fallbackLanguages).catch(() => null);
}

export async function getYoutubeEditableTranscript(
  videoUrl: string,
  options: { preferredLanguages?: Array<string | null> } = {},
): Promise<YoutubeEditableTranscript> {
  const videoId = extractYoutubeVideoId(videoUrl);
  if (!videoId) throw new Error("Enter a valid YouTube video URL");

  const preferredLanguages = options.preferredLanguages ?? [];
  const transcript = await fetchPublicYoutubeTranscript(videoId, preferredLanguages).catch(() => null);
  const transcriptAvailable = Boolean(transcript?.text);
  const captionProbe = transcriptAvailable ? null : await probeYoutubeCaptionAvailability(videoId, preferredLanguages).catch(() => null);

  const captionsAvailable = transcriptAvailable || Boolean(captionProbe?.available);
  const captionsDownloadable = transcriptAvailable || Boolean(captionProbe?.downloadable);
  const captionsSource = transcript?.source ?? captionProbe?.source ?? null;
  const captionsLanguage = transcript?.language ?? captionProbe?.language ?? null;
  const captionsLanguages =
    transcript?.language
      ? [transcript.language]
      : captionProbe?.languages ?? (captionsLanguage ? [captionsLanguage] : []);

  return {
    videoId,
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    captions: {
      available: captionsAvailable,
      downloadable: captionsDownloadable,
      source: captionsSource,
      language: captionsLanguage,
      languages: captionsLanguages,
    },
    transcript: {
      available: transcriptAvailable,
      source: transcript?.source ?? null,
      language: transcript?.language ?? null,
      text: transcript?.text ?? null,
      segments: groupAuditTranscriptSegments(transcript?.segments ?? []),
    },
    needsUploadFallback: captionsAvailable && !captionsDownloadable,
  };
}

export async function getYoutubeVideoAuditPreview(userId: number, videoUrl: string): Promise<YoutubeVideoAuditPreview> {
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
  const transcript = await fetchPublicYoutubeTranscript(videoId, []).catch(() => null);
  const captionProbe = transcript?.text ? null : await probeYoutubeCaptionAvailability(videoId, []).catch(() => null);
  const captionsAvailable = Boolean(transcript?.text) || Boolean(captionProbe?.available);
  const captionsLanguage = transcript?.language ?? captionProbe?.language ?? null;

  return {
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
      likelyFormat: likelyYoutubeFormatFromVideo(video),
    },
    nicheInference: {
      label: nicheProfile.niche,
      confidence: "medium",
      basis: "Inferred from the title, description, tags, and recent channel uploads.",
    },
    recommendedThumbnailStyle: recommendThumbnailStyle(video, nicheProfile),
    captions: {
      available: captionsAvailable,
      source: transcript?.source ?? captionProbe?.source ?? null,
      language: captionsLanguage,
      languages: captionsLanguage ? [captionsLanguage] : (captionProbe?.languages ?? []),
      downloadable: Boolean(transcript?.text) || Boolean(captionProbe?.downloadable),
    },
    transcript: {
      available: Boolean(transcript?.text),
      source: transcript?.source ?? null,
      language: transcript?.language ?? null,
    },
  };
}

export async function auditYoutubeVideo(
  userId: number,
  videoUrl: string,
  options?: {
    uiLocale?: string | null;
    transcriptOverride?: {
      text: string;
      source: "uploaded" | "transcribed_audio";
      language: string | null;
      segments?: YoutubeTranscriptSegment[];
    } | null;
  },
): Promise<YoutubeVideoAuditReport> {
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

  const comparableVideos = await searchAuditComparableVideos(userId, video, nicheProfile);

  const comparableByChannel = new Map<string, YoutubeRecentVideo[]>();
  for (const item of comparableVideos) {
    const key = item.channelId || item.channelTitle || item.id;
    if (!comparableByChannel.has(key)) comparableByChannel.set(key, []);
    comparableByChannel.get(key)!.push(item);
  }

  const creatorChannelIds = [...new Set(comparableVideos.map((item) => item.channelId).filter(Boolean) as string[])];
  const creatorChannelRows = await fetchChannelsByIds(userId, creatorChannelIds).catch(() => []);
  const channelById = new Map(
    creatorChannelRows.map((item) => {
      const record = asRecord(item);
      return [
        asString(record.id) || "",
        parseNumber(asRecord(record.statistics).subscriberCount),
      ] as const;
    }),
  );

  const topCreators = [...comparableByChannel.values()]
    .map((videos) => {
      const first = videos[0]!;
      const averageViews = Math.round(videos.reduce((sum, current) => sum + parseNumber(current.viewCount), 0) / videos.length);
      return {
        channelName: first.channelTitle || "YouTube creator",
        subscriberCount: first.channelId ? (channelById.get(first.channelId) ?? 0) : 0,
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
  const transcript = options?.transcriptOverride?.text
    ? options.transcriptOverride
    : await fetchPublicYoutubeTranscript(videoId, []).catch(() => null);
  const transcriptTextAvailable = Boolean(transcript?.text);
  const captionProbe = transcriptTextAvailable ? null : await probeYoutubeCaptionAvailability(videoId, []).catch(() => null);
  const captionsAvailable = transcriptTextAvailable || Boolean(captionProbe?.available);
  const outputLanguage = inferOutputLanguage({
    forceLanguage: options?.uiLocale ?? null,
    explicitLanguage: transcript?.language ?? null,
    transcriptText: transcript?.text ?? null,
    title: video.title,
    description: video.description,
    tags: video.tags,
    recentVideos: recentVideos.map((item) => ({
      title: item.title,
      description: item.description,
      tags: item.tags,
    })),
  });

  const transcriptForAudit = transcript?.text || [
    `Video title: ${video.title}`,
    `Description: ${video.description}`,
    video.tags.length ? `Tags: ${video.tags.join(", ")}` : "",
  ].filter(Boolean).join("\n\n");

  const likelyFormat = likelyYoutubeFormatFromVideo(video);
  const isShortFormAudit = likelyFormat === "youtube_shorts";

  const seoDraft = await generateSeo(
    transcriptForAudit,
    likelyFormat,
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

  const auditPrompt = `You are a YouTube growth strategist producing a careful audit for one existing video.
Your job is to explain what can actually be assessed from the available evidence, what cannot be assessed, and what the creator should test first.

${YOUTUBE_CREATOR_GROWTH_PLAYBOOK_RULES}

OUTPUT LANGUAGE RULE:
- ${outputLanguage.instruction}

Hard rules:
- Never diagnose what is not supported by the supplied evidence.
- If transcript is unavailable, do not return any script finding and do not write a hook rewrite that implies you watched the spoken opening.
- If visual input is only a public thumbnail, do not call it a full video quality audit. Treat it as thumbnail/packaging evidence only.
- Do not hallucinate competitors, URLs, private metrics, transcript lines, or viewer-retention details.
- Competitor examples may explain why a supplied real video looks stronger, but they must not invent new videos.
- Niche should be treated as inferred unless the evidence is overwhelming.
- Be transparent about basis. Every finding must say what it was assessed from.
- Prioritize only the most actionable 1-3 problems. Do not pad with weak guesses.
- Tag suggestions must be specific to the topic and search intent in the supplied evidence. Avoid generic tags like "tech podcast" unless the evidence strongly supports them.
- Title, description, and tag suggestions must reuse real vocabulary patterns visible in the supplied video metadata, transcript excerpt, recent channel videos, and real comparable videos. Avoid generic AI-sounding filler.
- Every diagnosis item must be specific. Name the exact weak section, missing promise, repeated setup, unclear line, or delayed payoff instead of giving abstract advice.
- Every diagnosis item must include concrete evidence and a concrete fix. For script and hook findings, point to the opening line, section, or moment from the transcript excerpt and explain what should be cut, moved earlier, rewritten, or added.
- Do not say "improve the title" without giving better title options.
- Do not say "fix the thumbnail" without giving a better thumbnail idea.
- For any thumbnail finding, the recommendedChange must be visually specific: describe the focal subject, composition/layout, emotional trigger, background treatment, thumbnail style, and optional 3-5 word text if text would help.
- Thumbnail fixes should name exact text suggestions when useful, such as a 2-5 word overlay, and explain where that text should sit in the frame.
- If a thumbnail diagnosis says the packaging is unclear, explain exactly what visual promise should replace it and what should be removed from the current concept.
- If transcript is unavailable, leave hookRewrite empty.

Short-form and Shorts strategy rules:
- If the video is a Short, vertical, square, or 3 minutes or shorter, audit it as short-form. The first frame and first 1-2 seconds must establish topic, tension, and payoff.
- For short-form, prioritize hook continuation, stayed-to-watch potential, average view duration, average percentage viewed, caption clarity, phone readability, and one clear payoff.
- Strong Shorts/TikTok-style clips open with the result, problem, tension, transformation, or exact payoff. Never recommend greetings, logos, slow setup, or generic context first.
- For short-form fixes, write literal first-line or first-frame advice. Avoid vague notes like "make it punchier."
- If you call out a short-form script problem, identify the exact first line or first 1-2 beats that are wasting time and provide a better replacement opening structure.
- For short-form thumbnail or cover fixes, describe the opening frame/cover in exact visual terms: subject position, action, text, contrast treatment, and why it stops the scroll.
- Use category logic when evidence supports it: podcast/talk clips need one claim or emotional beat; demos show result first then steps; cooking shows finished dish first; art shows transformation/risk/texture; gaming leads with clutch/fail/tip; ads open with pain/result/proof.
- Shorts packaging should include a compact title, first-frame/cover direction, caption/on-screen keyword guidance, and a description opener that repeats the exact topic naturally.
- Tags are a small supporting signal. Recommend a tight set only: exact phrase, close variants, central entities/products/games, and obvious misspellings. Never tag-stuff or imply tags outweigh title, thumbnail, description, captions, or retention.
- Captions matter for muted viewing, accessibility, comprehension, and search relevance. If transcript is available, judge whether the first spoken line is strong enough for silent/fast comprehension too.

Long-form strategy rules:
- If the video is long-form, treat it as promise fulfillment over time: packaging wins the click, the first 15-30 seconds validates the click, and each section must keep paying off curiosity.
- For long-form fixes, prioritize title/thumbnail promise accuracy, description opener, chapter/navigability suggestions when relevant, retention drop risks, and one clear next-watch path.
- For long-form thumbnail direction, isolate one visual promise. Prefer problem/result, subject/object/tension, or mystery/proof layouts over crowded collages.
- For long-form thumbnail fixes, include at least one specific visual layout and, when text is useful, 2-5 exact words of suggested overlay text plus the recommended style direction.
- If you call out a long-form script problem, identify which setup, tangent, throat-clearing, or ordering choice is delaying the payoff and explain the stronger order in concrete terms.

Return JSON only:
{
  "summary": "",
  "nicheInference": {
    "label": "",
    "confidence": "high|medium|low",
    "basis": ""
  },
  "diagnosis": [
    {
      "area": "title|thumbnail|description|tags|hook|script|topic",
      "issue": "",
      "whyItHurts": "",
      "evidence": "",
      "recommendedChange": "",
      "confidence": "high|medium|low",
      "sourceLabel": "",
      "priority": 1
    }
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
	          strategyFramework: {
	            likelyFormat,
	            isShortFormAudit,
	            shortFormPrinciples: isShortFormAudit ? [
	              "first frame and first 1-2 seconds must establish topic, tension, and payoff",
	              "result/problem/tension first, context second",
	              "large captions and on-screen keywords for muted mobile viewing",
	              "title, description, and cover should match one exact topic phrase",
	              "tags are minimal support: exact phrase, variants, central entities, and misspellings",
	            ] : [],
	            longFormPrinciples: isShortFormAudit ? [] : [
	              "validate the click in the first 15-30 seconds",
	              "structure around recurring payoff beats",
	              "title, thumbnail, and description promise must align with the content",
	              "use chapters, captions, and next-watch paths when helpful",
	            ],
	          },
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
          transcriptAvailable: Boolean(transcript?.text),
          transcriptSource: transcript?.source ?? captionProbe?.source ?? null,
          transcriptLanguage: transcript?.language ?? captionProbe?.language ?? null,
          outputLanguage: outputLanguage.label,
          transcriptExcerpt: transcript?.text?.slice(0, 5000) ?? null,
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
  const transcriptAvailable = transcriptTextAvailable;
  const diagnosis = asArray(parsed.diagnosis).map((item) => {
    const record = asRecord(item);
    return {
      area: asString(record.area) || "topic",
      issue: asString(record.issue) || "",
      whyItHurts: asString(record.whyItHurts) || "",
      evidence: asString(record.evidence) || "",
      recommendedChange: asString(record.recommendedChange) || "",
      confidence: (asString(record.confidence) as "high" | "medium" | "low") || "medium",
      sourceLabel: asString(record.sourceLabel) || "Inferred from public metadata",
      priority: Math.min(3, Math.max(1, parseNumber(record.priority) || 3)) as 1 | 2 | 3,
    };
  }).filter((item) => item.issue)
    .filter((item) => transcriptTextAvailable || item.area !== "script")
    .filter((item) => item.area !== "quality")
    .sort((a, b) => a.priority - b.priority || (a.confidence === "high" ? -1 : a.confidence === "medium" ? 0 : 1) - (b.confidence === "high" ? -1 : b.confidence === "medium" ? 0 : 1))
    .slice(0, 3);
  const nicheInference = asRecord(parsed.nicheInference);
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
  const competitorExampleCards = comparableVideos.slice(0, 5).map((item) => {
    const matched =
      competitorExamples.find((example) => example.url && example.url === item.url) ||
      competitorExamples.find(
        (example) =>
          example.title.toLowerCase() === item.title.toLowerCase() &&
          example.channelName.toLowerCase() === (item.channelTitle || "").toLowerCase(),
      ) ||
      competitorExamples.find(
        (example) =>
          example.title.toLowerCase() === item.title.toLowerCase(),
      );
    return {
      title: item.title,
      channelName: item.channelTitle || "YouTube creator",
      url: item.url,
      viewCount: parseNumber(item.viewCount),
      whyItWins:
        matched?.whyItWins ||
        "This real competing video is pulling stronger public engagement around a similar topic or viewer intent.",
    };
  });
  const fixes = asRecord(parsed.fixes);
  const rawHookRewrite = asString(fixes.hookRewrite) || "";
  const qualityFixes = asArray(fixes.qualityFixes).map((item) => String(item)).filter(Boolean).slice(0, 5);

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
    nicheInference: {
      label: asString(nicheInference.label) || nicheProfile.niche,
      confidence: ((asString(nicheInference.confidence) as "high" | "medium" | "low") || "medium"),
      basis: asString(nicheInference.basis) || "Inferred from the video title, description, tags, and nearby comparable videos.",
    },
    captions: {
      available: captionsAvailable,
      source: transcript?.source ?? captionProbe?.source ?? null,
      language: transcript?.language ?? captionProbe?.language ?? null,
      languages: transcript?.language ? [transcript.language] : (captionProbe?.languages ?? []),
    },
    transcript: {
      available: transcriptAvailable,
      source: transcript?.source ?? null,
      language: transcript?.language ?? null,
      text: transcript?.text ?? null,
      segments: groupAuditTranscriptSegments(transcript?.segments ?? []),
      translations: [],
    },
    performanceContext: {
      ageDays,
      viewsPerDay,
      channelMedianViews,
      competitorMedianViews,
    },
    topCreators,
    competitorExamples: competitorExampleCards,
    visualAudit: visualAuditRecord ? {
      basis: "thumbnail_only",
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
      recommendedThumbnailStyle: recommendThumbnailStyle(video, nicheProfile),
      hookRewrite: transcriptTextAvailable ? rawHookRewrite : "",
      scriptDirection: transcriptTextAvailable ? (asString(fixes.scriptDirection) || "") : "",
      qualityFixes,
      packagingStrategy: asString(fixes.packagingStrategy) || asString(asRecord(seoDraft).packagingStrategy) || "",
    },
    limitations: asArray(parsed.limitations).map((item) => String(item)).filter(Boolean).slice(0, 6).concat([
      transcript?.text
        ? transcript.source === "uploaded"
          ? "Transcript was generated from the media file you uploaded for this audit."
          : transcript.source === "transcribed_audio"
            ? "Transcript was generated by transcribing the audio from an uploaded media file for this audit."
          : ""
        : captionProbe?.available
          ? "Captions were detected for this video, but the transcript text could not be retrieved from YouTube. Script analysis fell back to title, description, tags, and competitor context."
          : "Public transcript was not available for this video, so script analysis fell back to title, description, tags, and competitor context.",
      "Thumbnail notes are based on the public thumbnail only, not on full frame-by-frame video quality analysis.",
    ]).filter(Boolean).filter((value, index, array) => array.indexOf(value) === index),
  };
}

export async function translateYoutubeAuditTranscript(
  userId: number,
  segments: YoutubeTranscriptSegment[],
  targetLanguage: string,
  sourceLanguage?: string | null,
): Promise<YoutubeAuditTranscriptTranslation> {
  const normalizedSegments = normalizeTranscriptSegments(segments);
  if (!normalizedSegments.length) {
    throw new Error("A timestamped transcript is required for translation.");
  }
  const translatedSegments: YoutubeTranscriptSegment[] = [];
  const batchSize = 40;
  for (let index = 0; index < normalizedSegments.length; index += batchSize) {
    const batch = normalizedSegments.slice(index, index + batchSize);
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a professional audiovisual translator.
Translate subtitle segments into ${targetLanguage} in a way that preserves meaning, tone, and natural phrasing.
Do not translate word-for-word when that sounds unnatural.
Keep each output line aligned to its original segment index.
Each translated line must fit naturally inside the original segment timing when spoken aloud.
If the target language would run long, compress the phrasing while preserving the meaning and tone.
Prefer shorter, voice-friendly subtitle wording over literal completeness when timing is tight.
Do not add commentary. Return JSON only in the shape {"items":[{"index":0,"text":"..."}]}.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            sourceLanguage: sourceLanguage || "unknown",
            targetLanguage,
            items: batch.map((segment, batchIndex) => ({
              index: batchIndex,
              durationSec: Math.max(0.1, segment.end - segment.start),
              approxMaxWordsAtNaturalSpeech: Math.max(1, Math.round((segment.end - segment.start) * 2.6)),
              text: segment.text,
            })),
          }),
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 4000,
    });
    await logTokenUsage({
      userId,
      feature: "youtubeAuditTranscriptTranslate",
      model: "gpt-4o-mini",
      ...usageTokens(completion.usage),
    });
    const parsed = asRecord(parseAiJson(completion.choices[0]?.message?.content ?? "{}"));
    const items = asArray(parsed.items);
    const translatedByIndex = new Map<number, string>(
      items.map((item) => {
        const row = asRecord(item);
        return [parseNumber(row.index), asString(row.text)?.trim() || ""] as const;
      }),
    );
    translatedSegments.push(...batch.map((segment, batchIndex) => ({
      ...segment,
      text: translatedByIndex.get(batchIndex) || segment.text,
    })));
  }
  const normalizedTranslatedSegments = normalizeTranscriptSegments(translatedSegments);
  return {
    targetLanguage,
    sourceLanguage: sourceLanguage ?? null,
    fullText: transcriptSegmentsToText(normalizedTranslatedSegments),
    segments: normalizedTranslatedSegments,
    createdAt: new Date().toISOString(),
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
    const filtered = existingCompetitors.filter((competitor: typeof youtubeCompetitorsTable.$inferSelect) => {
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
        .filter((competitor: typeof youtubeCompetitorsTable.$inferSelect) => competitor.channelId)
        .map((competitor: typeof youtubeCompetitorsTable.$inferSelect) => [competitor.channelId, competitor] as const),
    );
    const selectedChannelIds = new Set(
      selected
        .map((item) => asString(asRecord(item.item).id))
        .filter((id): id is string => Boolean(id)),
    );
    const staleDiscoveredIds = existingCompetitors
      .filter((competitor: typeof youtubeCompetitorsTable.$inferSelect) => {
        const meta = readCompetitorMeta(competitor.niche);
        return meta.source !== "manual" && !selectedChannelIds.has(competitor.channelId);
      })
      .map((competitor: typeof youtubeCompetitorsTable.$inferSelect) => competitor.id);

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
    const filtered = savedCompetitors.filter((competitor: typeof youtubeCompetitorsTable.$inferSelect) => {
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
  const existing = existingCompetitors.find((competitor: typeof youtubeCompetitorsTable.$inferSelect) => competitor.channelId === channelId) ?? null;
  return await upsertYoutubeCompetitor(userId, profile, channelId, {
    source: "manual",
    requestedUrl: channelUrl.trim(),
    existingCompetitor: existing,
    preserveManualSource: true,
    generateAiReport: true,
  });
}

export async function addYoutubeCompetitorByReference(userId: number, reference: string) {
  const trimmed = reference.trim();
  if (!trimmed) throw new Error("A YouTube channel reference is required");

  const [profile] = await db
    .select()
    .from(youtubeChannelProfilesTable)
    .where(eq(youtubeChannelProfilesTable.userId, userId))
    .limit(1);
  if (!profile) throw new Error("Connect YouTube before adding competitors");

  const channelId = looksLikeYoutubeChannelId(trimmed)
    ? trimmed
    : await resolveYoutubeChannelIdFromReference(userId, trimmed);

  const existingCompetitors = await db
    .select()
    .from(youtubeCompetitorsTable)
    .where(eq(youtubeCompetitorsTable.userId, userId));
  const existing = existingCompetitors.find((competitor: typeof youtubeCompetitorsTable.$inferSelect) => competitor.channelId === channelId) ?? null;

  const requestedUrl = normalizeYoutubeChannelReferenceToUrl(trimmed);

  return await upsertYoutubeCompetitor(userId, profile, channelId, {
    source: "manual",
    requestedUrl,
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
  const recentVideos = Array.isArray(profile?.recentVideos) ? profile.recentVideos.map((video: unknown) => asRecord(video)) : [];
  const publishedByVideoId = new Map<string, { publishedAt: string | null; publishedDay: string | null }>(
    recentVideos.flatMap((video: JsonRecord) => {
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
    .map((result: typeof youtubePlanResultsTable.$inferSelect) => {
      const metrics = asRecord(result.metrics);
      const linkedPublish = publishedByVideoId.get(result.videoId);
      const plan = plans.find((item: typeof youtubeWeeklyPlansTable.$inferSelect) => item.id === result.planId);
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
    .filter((result: PreviousPerformanceResultPayload) => metricsHasLinkedSignal(result.metrics))
    .sort((a: PreviousPerformanceResultPayload, b: PreviousPerformanceResultPayload) => (b.publishedAt || b.fetchedAt || "").localeCompare(a.publishedAt || a.fetchedAt || ""))
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

export async function generateYoutubeWeeklyPlan(userId: number, options?: { uiLocale?: string | null }) {
  const [profile] = await db.select().from(youtubeChannelProfilesTable).where(eq(youtubeChannelProfilesTable.userId, userId)).limit(1);
  if (!profile) throw new Error("Connect YouTube before generating a plan");
  const connection = await getYoutubeConnection(userId);
  const plans = await db.select().from(youtubeWeeklyPlansTable).where(eq(youtubeWeeklyPlansTable.userId, userId)).orderBy(desc(youtubeWeeklyPlansTable.weekNumber));
  const nicheProfile = asRecord(profile.nicheProfile) as unknown as YoutubeNicheProfile;
  const preferredPostsPerWeek = Math.max(1, parseNumber(connection?.preferredPostsPerWeek) || 3);
  const shouldRegenerateCompetitors = false;
  const [
    trendsResult,
    analyticsResult,
    analyticsTimelineResult,
    hydratedResultsResult,
    pastPerformanceResult,
  ] = await Promise.allSettled([
    fetchTrendingVideos(userId, nicheProfile),
    analyticsSummary(userId),
    channelAnalyticsTimeline(userId),
    hydrateStoredResultMetrics(userId),
    previousPerformanceSummary(userId),
  ]);
  const trends = trendsResult.status === "fulfilled" ? trendsResult.value : [];
  const competitors = shouldRegenerateCompetitors
    ? await discoverCompetitors(userId, profile).catch(() => [])
    : await db
      .select()
      .from(youtubeCompetitorsTable)
      .where(eq(youtubeCompetitorsTable.userId, userId))
      .orderBy(desc(youtubeCompetitorsTable.fetchedAt))
      .limit(8)
      .catch(() => []);
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
    ? await db.select().from(youtubePlanResultsTable).where(eq(youtubePlanResultsTable.planId, lastPlan.id))
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
    .slice(0, 12)
    .map((video) => asRecord(video));
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
  const outputLanguage = inferOutputLanguage({
    forceLanguage: options?.uiLocale ?? null,
    title: asString(profile.channelName),
    description: getChannelDescriptionFromProfile(profile),
    recentVideos: recentVideos.slice(0, 12).map((video: JsonRecord) => ({
      title: asString(video.title),
      description: asString(video.description),
      tags: asArray(video.tags).map((tag) => String(tag)).filter(Boolean),
    })),
  });
  const compactContext = {
    channel: {
      name: asString(profile.channelName),
      niche: asString(nicheProfile.niche),
      contentStyle: asString(nicheProfile.contentStyle),
      tone: asString(nicheProfile.tone),
      targetAudience: asString(nicheProfile.targetAudience),
      keywords: asArray(nicheProfile.keywords).map(String).slice(0, 12),
    },
    nextWeek: {
      weekNumber,
      startDate,
      endDate,
      preferredPostsPerWeek,
      outputLanguage: outputLanguage.label,
    },
    regeneratedInsights: {
      pastPerformanceSummary: {
        summary: compactText(asRecord(pastPerformance).shortSummary || asRecord(pastPerformance).summary, 500),
        topPerformingTopics: asArray(asRecord(pastPerformance).topPerformingTopics).map(String).slice(0, 8),
        topPerformingFormats: asArray(asRecord(pastPerformance).topPerformingFormats).map(String).slice(0, 8),
        flops: asArray(asRecord(pastPerformance).flops).map(String).slice(0, 8),
        flopReasons: compactText(asRecord(pastPerformance).flopReasons, 500),
        bestPostingDays: asArray(asRecord(pastPerformance).bestPostingDays).map(String).slice(0, 7),
        lowConfidenceNote: asString(asRecord(pastPerformance).lowConfidenceNote),
      },
      performanceSignals: {
        bestPostingTime: performanceSignals.bestPostingTime,
        bestPostingTimeByDay: (performanceSignals.bestPostingTimeByDay ?? []).slice(0, 7),
        hookInsight: performanceSignals.hookInsight,
        titleLengthInsight: performanceSignals.titleLengthInsight,
        tagInsight: {
          topPerformingTags: (performanceSignals.tagInsight?.topPerformingTags ?? []).slice(0, 12),
          trendingTags: (performanceSignals.tagInsight?.trendingTags ?? []).slice(0, 12),
        },
        subscriberSpike: performanceSignals.subscriberSpike,
        competitorGap: performanceSignals.competitorGap,
      },
      userBehavior: {
        ideaFeedbackSummary: {
          liked: ideaFeedbackSummary.liked.slice(0, 12),
          disliked: ideaFeedbackSummary.disliked.slice(0, 12),
          deleted: ideaFeedbackSummary.deleted.slice(0, 12),
        },
        lastWeekBehavior: summarizeLastPlanBehavior(lastPlan?.plan, lastPlanResults),
      },
    },
    existingCompetitorContext: {
      competitorGap: performanceSignals.competitorGap,
      tier1CompetitorPatterns: (performanceSignals.tier1CompetitorPatterns ?? []).slice(0, 5),
    },
    evidenceSamples: {
      topRecentVideos: topVideos.slice(0, 8).map((video) => ({
        title: compactText(video.title, 120),
        views: video.viewCount,
        publishedAt: video.publishedAt,
        duration: video.duration,
        tags: compactTags(video.tags, 6),
      })),
      summarySignals: {
        avgCTR,
        avgViewDuration,
        bestPostingDays: bestPostingDays.slice(0, 7),
      },
    },
  };

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are a YouTube growth strategist who thinks like a top creator, not a content agency.
Your job is to generate a weekly content plan for one specific creator based on their real channel data, past performance, competitor landscape, current trends, and their feedback on previous AI suggestions.
HOW TO REASON (follow this order before writing anything):

Read regeneratedInsights.userBehavior.lastWeekBehavior. What did the creator actually use, link, like, dislike, or delete last week? Start from there.
Read regeneratedInsights.pastPerformanceSummary and regeneratedInsights.performanceSignals. What objectively worked, what flopped, and what timing/packaging patterns are emerging?
Use competitor/trend signals ONLY when they fit the creator's past behavior. Ignore anything that feels like a stretch.
Now generate. Every idea must trace to at least one of the above signals. If you can't justify an idea with data, don't include it.

IDEA QUALITY RULES:

${YOUTUBE_CREATOR_GROWTH_PLAYBOOK_RULES}

OUTPUT LANGUAGE RULE:
- ${outputLanguage.instruction}

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

STRONGEST SIGNAL RULE (CRITICAL):
Use regeneratedInsights.userBehavior as the strongest signal.

Priority order:
1) User behavior from last week:
   - manual ideas = strong positive preference
   - linked/used ideas = strong positive preference
   - liked AI ideas = positive preference
   - deleted/disliked AI ideas = negative preference
   - unused AI ideas = weak negative signal unless there was no result data
2) Real YouTube performance: repeat above-average patterns, avoid below-average patterns
3) Analytics: best posting days/times + hook/title/tag patterns
4) Competitor/trend signals only when they fit creator behavior

Return this exact shape:
{
"insights": {
"summary": string,
"whatWorkedLastWeek": string[],
"whatDidNotWork": string[],
"userBehaviorLearning": string[],
"nextWeekStrategy": string[],
"confidence": "high" | "medium" | "low"
},
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
      { role: "user", content: JSON.stringify(compactContext) },
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

  const aiPayload = asRecord(parseAiJson(completion.choices[0]?.message?.content ?? "{}"));
  const plan = normalizeGeneratedYoutubePlan(aiPayload, startDate, performanceSignals, preferredPostsPerWeek);
  if (shouldReplaceDraftPlan && lastPlan) {
    const [saved] = await db.update(youtubeWeeklyPlansTable)
      .set({
        startDate,
        endDate,
        plan,
        contextSnapshot: compactContext,
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
    contextSnapshot: compactContext,
    updatedAt: new Date(),
  }).returning();
  return saved;
}

export async function improveYoutubeIdea(userId: number, idea: { title?: string; angle?: string; date?: string }, options?: { uiLocale?: string | null }) {
  const [profile] = await db.select().from(youtubeChannelProfilesTable).where(eq(youtubeChannelProfilesTable.userId, userId)).limit(1);
  if (!profile) throw new Error("Connect YouTube before improving ideas");
  const plans = await db.select().from(youtubeWeeklyPlansTable).where(eq(youtubeWeeklyPlansTable.userId, userId)).orderBy(desc(youtubeWeeklyPlansTable.weekNumber));
  const ideaFeedbackSummary = await getPersistedIdeaFeedbackSummary(userId, profile, plans);
  const recentVideos = Array.isArray(profile.recentVideos) ? profile.recentVideos.map((video: unknown) => asRecord(video)) : [];
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
  const recentLanguageSamples = recentVideos.slice(0, 12).map((video: JsonRecord) => ({
    title: asString(video.title),
    description: asString(video.description)?.slice(0, 500),
    tags: asArray(video.tags).map((tag) => String(tag)).filter(Boolean).slice(0, 10),
  }));
  const competitors = await db
    .select()
    .from(youtubeCompetitorsTable)
    .where(eq(youtubeCompetitorsTable.userId, userId))
    .limit(8);
  const competitorExamples = competitors.map((competitor: typeof youtubeCompetitorsTable.$inferSelect) => ({
    channelName: competitor.channelName,
    mostViewedRecentVideos: asArray(competitor.mostViewedRecentVideos).map((video: unknown) => {
      const item = asRecord(video);
      return {
        title: asString(item.title),
        viewCount: asString(item.viewCount),
      };
    }).filter((video: { title: string | null; viewCount: string | null }) => Boolean(video.title)).slice(0, 5),
  }));
  const performanceSignals = derivePerformanceSignals(
    recentVideos.map((video: JsonRecord) => normalizeVideo(video)),
    [],
    [],
    competitors,
    parseNumber(profile.subscriberCount),
    [],
  );
  const tagEvidence = buildYoutubeTagEvidenceSummary(recentVideos, competitors, performanceSignals);
  const outputLanguage = inferOutputLanguage({
    forceLanguage: options?.uiLocale ?? null,
    title: asString(profile.channelName),
    description: getChannelDescriptionFromProfile(profile),
    recentVideos: recentVideos.slice(0, 12).map((video: JsonRecord) => ({
      title: asString(video.title),
      description: asString(video.description),
      tags: asArray(video.tags).map((tag) => String(tag)).filter(Boolean),
    })),
  });
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are a YouTube content strategist helping a creator sharpen one specific idea they came up with.
Your job is NOT to replace their idea with something generic. Your job is to make their specific idea stronger — better title, clearer hook, more search-targeted, more thumbnail-friendly — while staying true to what they were going for.
Rules:

${YOUTUBE_CREATOR_GROWTH_PLAYBOOK_RULES}

OUTPUT LANGUAGE RULE:
- ${outputLanguage.instruction}

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
  const growthThumbnailNotes = [
    normalizedDay.thumbnailConcept ? `Planned thumbnail concept: ${normalizedDay.thumbnailConcept}` : "",
    normalizedDay.hook ? `Opening hook: ${normalizedDay.hook}` : "",
    normalizedDay.rationale ? `Growth rationale: ${normalizedDay.rationale}` : "",
    normalizedDay.stage ? `Plan stage: ${normalizedDay.stage}` : "",
  ].filter(Boolean).join("\n") || null;
  const prompt = await buildYoutubeThumbnailPrompt(userId, {
    title: normalizedDay.contentIdea,
    description: normalizedDay.descriptionSuggestion,
    tags: asArray(normalizedDay.tags).map((item) => String(item)).filter(Boolean),
    textPreference: asString(input.textPreference)?.trim() || null,
    sourceImages,
    preserveUploadedImage,
    sourceImageKind: sourceImages.length ? "user_uploaded" : null,
    analysisNotes: growthThumbnailNotes,
    outputLanguage: inferOutputLanguage({
      title: normalizedDay.contentIdea,
      description: normalizedDay.descriptionSuggestion,
      tags: asArray(normalizedDay.tags).map((item) => String(item)).filter(Boolean),
    }).label,
    mode: "plan",
  });
  if (!prompt) throw new Error("Thumbnail prompt generation failed");

  const editPolicy = sourceImages.length
    ? (preserveUploadedImage ? "user_image_base" : "reference_transform")
    : null;
  const imageDataUrl = await generateYoutubeThumbnailImage(userId, prompt, sourceImages, preserveUploadedImage, editPolicy);
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

export async function generateYoutubeAuditThumbnail(
  userId: number,
  input: {
    title: string;
    description: string;
    tags?: string[];
    textPreference?: string | null;
    sourceImages?: unknown;
    fallbackSourceImageUrl?: string | null;
    preserveUploadedImage?: unknown;
    stylePreference?: string | null;
    analysisNotes?: string | null;
  },
) {
  const uploadedSourceImages = sanitizeSourceImageDataUrls(input.sourceImages);
  const fallbackSourceImage = uploadedSourceImages.length
    ? null
    : await fetchImageAsDataUrl(input.fallbackSourceImageUrl).catch(() => null);
  const sourceImages = uploadedSourceImages.length
    ? uploadedSourceImages
    : fallbackSourceImage
      ? [fallbackSourceImage]
      : [];
  const sourceImageKind = uploadedSourceImages.length
    ? "user_uploaded" as const
    : fallbackSourceImage
      ? "current_thumbnail" as const
      : null;
  const preserveUploadedImage = uploadedSourceImages.length
    ? true
    : sourceImages.length > 0 && input.preserveUploadedImage !== false;
  const prompt = await buildYoutubeThumbnailPrompt(userId, {
    title: input.title,
    description: input.description,
    tags: Array.isArray(input.tags) ? input.tags.map((item) => String(item)).filter(Boolean).slice(0, 12) : [],
    textPreference: asString(input.textPreference)?.trim() || null,
    sourceImages,
    preserveUploadedImage,
    sourceImageKind,
    stylePreference: asString(input.stylePreference)?.trim() || null,
    analysisNotes: asString(input.analysisNotes)?.trim() || null,
    outputLanguage: inferOutputLanguage({
      title: input.title,
      description: input.description,
      tags: Array.isArray(input.tags) ? input.tags.map((item) => String(item)).filter(Boolean).slice(0, 12) : [],
    }).label,
    mode: "audit",
  });
  if (!prompt) throw new Error("Thumbnail prompt generation failed");

  const editPolicy = sourceImages.length
    ? (sourceImageKind === "current_thumbnail"
      ? "current_thumbnail_repackage"
      : preserveUploadedImage
        ? "user_image_base"
        : "reference_transform")
    : null;
  const imageDataUrl = await generateYoutubeThumbnailImage(userId, prompt, sourceImages, preserveUploadedImage, editPolicy);
  return {
    imageDataUrl,
    prompt,
    requestedText: asString(input.textPreference)?.trim() || null,
    selectedStyle: asString(input.stylePreference)?.trim() || null,
    preserveUploadedImage,
    createdAt: new Date().toISOString(),
  };
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
  const snapshot = asRecord(plan.contextSnapshot);
  const latestSignals = normalizePerformanceSignalSummary(
    asRecord(
      snapshot.performanceSignals
        ?? asRecord(asRecord(snapshot.regeneratedInsights).performanceSignals),
    ),
  );
  const ideaFeedbackSummary = await getPersistedIdeaFeedbackSummary(userId, profile, plans);
  const siblingIdeas = asPlanDays(asArray(asRecord(plan.plan).days))
    .filter((item) => parsePlanDayIndex(item.day, -1) !== dayIndex)
    .map((item) => ({
      title: asString(item.contentIdea),
      format: inferIdeaFormat(item),
      targetKeyword: asString(item.targetKeyword),
    }))
    .filter((item) => item.title || item.targetKeyword);
  const outputLanguage = inferOutputLanguage({
    title: asString(profile.channelName),
    description: getChannelDescriptionFromProfile(profile),
    recentVideos: Array.isArray(profile.recentVideos)
      ? profile.recentVideos.slice(0, 12).map((video: unknown) => {
          const item = asRecord(video);
          return {
            title: asString(item.title),
            description: asString(item.description),
            tags: asArray(item.tags).map((tag) => String(tag)).filter(Boolean),
          };
        })
      : [],
  });

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are a YouTube content strategist replacing one planned video idea with something better.
The creator rejected the previous idea for this slot. Your job is to generate a genuinely different concept — not a rephrased version of the same idea.
Rules:

${YOUTUBE_CREATOR_GROWTH_PLAYBOOK_RULES}

OUTPUT LANGUAGE RULE:
- ${outputLanguage.instruction}

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
    const conflicting = existing.find((row: typeof youtubePlanResultsTable.$inferSelect) => row.videoId === videoId && row.dayIndex !== result.dayIndex);
    if (conflicting) throw new Error("One YouTube video cannot be linked to more than one content idea");
    const match = existing.find((row: typeof youtubePlanResultsTable.$inferSelect) => row.dayIndex === result.dayIndex);
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
