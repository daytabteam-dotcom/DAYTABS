import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bell,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  ExternalLink,
  Flame,
  GripVertical,
  Hash,
  Heart,
  ImagePlus,
  Lightbulb,
  LayoutGrid,
  ListChecks,
  Loader2,
  MoreHorizontal,
  Play,
  Plus,
  Paintbrush,
  CircleHelp,
  RefreshCcw,
  Settings,
  Send,
  Sparkles,
  Trash2,
  ThumbsDown,
  ThumbsUp,
  TrendingDown,
  Type,
  X,
  Youtube,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  Scatter,
  ScatterChart,
  TooltipProps,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { usePlan } from "@/hooks/use-plan";
import { PanelPage, PanelHeader, PanelTitle, PanelSubtitle, PanelCard, PanelCardSoft, PanelCardStrong, PanelEyebrow } from "@/components/panel-system";
import { cn } from "@/lib/utils";

type Stage = "idea" | "recording" | "editing" | "published" | "draft";
type ViewMode = "calendar" | "planner";
type InsightConfidence = "high" | "medium" | "low";
type IdeaOrigin = "ai" | "manual";
type IdeaFeedback = "liked" | "disliked" | null;

interface RecentVideo {
  id: string;
  title: string;
  description?: string;
  tags?: string[];
  publishedAt?: string | null;
  visibility?: string | null;
  duration?: string | null;
  viewCount?: string | null;
  likeCount?: string | null;
  commentCount?: string | null;
  thumbnailUrl?: string | null;
  channelId?: string | null;
  channelTitle?: string | null;
  url: string;
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

interface YoutubeChannel {
  channelId: string;
  channelName: string;
  channelThumbnailUrl?: string | null;
  subscriberCount?: string | null;
  totalViewCount?: string | null;
  videoCount?: string | null;
  nicheProfile?: {
    niche?: string;
    contentStyle?: string;
    tone?: string;
    targetAudience?: string;
    keywords?: string[];
    summary?: string;
    channelDescription?: string | null;
  } | null;
  recentVideos?: RecentVideo[];
}

interface YoutubeCompetitor {
  id: number;
  channelId?: string;
  channelName: string;
  thumbnailUrl?: string | null;
  subscriberCount?: string | null;
  postingFrequency?: string | null;
  niche?: string | null;
  mostViewedRecentVideos?: Array<{ title?: string; viewCount?: string | null; url?: string; publishedAt?: string | null; thumbnailUrl?: string | null }>;
}

interface PlanDay {
  id?: string;
  day: number;
  date: string;
  stage?: Stage;
  contentIdea: string;
  hook: string;
  outline: string[];
  bestPostingTime: string;
  rationale: string;
  tags?: string[];
  soundSuggestion?: string;
  competitorReference?: string;
  descriptionSuggestion?: string;
  thumbnailConcept?: string;
  ideaOrigin?: IdeaOrigin;
  aiFeedback?: IdeaFeedback;
  feedbackUpdatedAt?: string | null;
  regeneratedAt?: string | null;
  isDeleted?: boolean;
  deletedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  generatedThumbnail?: {
    imageDataUrl: string;
    prompt?: string;
    requestedText?: string | null;
    createdAt?: string | null;
  } | null;
}

interface ThumbnailSourceImage {
  name: string;
  dataUrl: string;
}

interface CustomIdeaDraft {
  title: string;
  angle: string;
  date: string;
  description: string;
  tags: string;
  thumbnail: string;
}

interface PerformanceInsight {
  type?: string;
  title?: string;
  finding?: string;
  evidence?: string;
  action?: string;
  confidence?: InsightConfidence | string;
  chart?: Array<{ label?: string; value?: number; comparisonValue?: number }>;
  dataLimitations?: string;
}

interface PlanPayload {
  summary?: string;
  accountAnalysis?: {
    whatWorked?: string[];
    whyItWorked?: string[];
    underperformers?: string[];
    recommendations?: string[];
  };
  competitorInsights?: Array<{
    channelName?: string;
    channelUrl?: string;
    whatIsWorking?: string[];
    whyVideosGoViral?: string[];
    ideasToAdapt?: string[];
  }>;
  viralTags?: Array<{ tag?: string; why?: string; bestUse?: string }>;
  performanceInsights?: PerformanceInsight[];
  days?: PlanDay[];
}

interface PlanContextSnapshot {
  recentVideos?: RecentVideo[];
  trends?: RecentVideo[];
  competitors?: YoutubeCompetitor[];
  analytics?: {
    rows?: unknown[];
    error?: string;
  };
  startDate?: string;
  endDate?: string;
}

interface YoutubeWeeklyPlan {
  id: number;
  weekNumber: number;
  startDate: string;
  endDate: string;
  plan: PlanPayload;
  contextSnapshot?: PlanContextSnapshot;
}

interface YoutubePlanResult {
  id: number;
  dayIndex: number;
  plannedTitle: string;
  videoId: string;
  videoUrl: string;
  metrics: Record<string, unknown>;
}

interface PostingPatternDay {
  iso: string;
  posted: boolean;
  label: string;
  dayNumber: string;
  weekIndex: number;
  weekday: string;
  videoTitle?: string;
  isFuture?: boolean;
  isUpcoming?: boolean;
}

interface TitleLengthBucket {
  label: string;
  min: number;
  max: number;
  averageViews: number;
  count: number;
}

interface VideoDiagnostic {
  video: RecentVideo;
  hook: string;
  tags: string;
  titleLength: string;
  conceptType: string;
  timing: string;
  suggestion: string;
}

interface YoutubeStatus {
  connected: boolean;
  channel?: YoutubeChannel | null;
  channelAnalytics?: { daily: YoutubeAnalyticsPoint[]; error?: string } | null;
  competitors?: YoutubeCompetitor[];
  latestPlan?: YoutubeWeeklyPlan | null;
  latestResults?: YoutubePlanResult[];
  settings?: {
    preferredPostsPerWeek: number;
    connectedAt?: string | null;
    needsPostingPreference?: boolean;
  };
}

interface CompetitorStoredMeta {
  source?: "manual" | "discovered";
  nicheLabel?: string;
  reportSummary?: string;
  addedFromUrl?: string | null;
}

interface GrowthPlannerNotification {
  id: string;
  type: "today" | "overdue";
  title: string;
  platform: string;
  date: string;
  stage: string;
}

type InsightVisualKind = "heatmap" | "dual-line" | "scatter" | "velocity" | "tag-cloud" | "fallback";

interface InsightVisualData {
  kind: InsightVisualKind;
  points?: Array<Record<string, string | number>>;
  heatmap?: Array<{ day: string; hour: string; value: number; label: string }>;
  tags?: TagOpportunity[];
}

interface EnrichedInsight extends PerformanceInsight {
  confidence: InsightConfidence;
  visual: InsightVisualData;
}

interface TagOpportunity {
  tag: string;
  creatorUses: number;
  trendUses: number;
  score: number;
  guidance: string;
}

interface WeeklyComparisonCompetitorRow {
  key: string;
  name: string;
  shortName: string;
  views: number;
  uploads: number;
  fill: string;
  isYou: false;
  videos: NonNullable<YoutubeCompetitor["mostViewedRecentVideos"]>;
}

interface WeeklyComparisonYouRow {
  key: "you";
  name: string;
  shortName: string;
  views: number;
  uploads: number;
  fill: string;
  isYou: true;
  videos: RecentVideo[];
}

type WeeklyComparisonRow = WeeklyComparisonYouRow | WeeklyComparisonCompetitorRow;
type WeeklyComparisonWeekdayRow = {
  iso: string;
  day: string;
  youViews: number;
  youUploads: number;
} & Record<string, string | number>;

const stages: Array<{ id: Stage; label: string }> = [
  { id: "idea", label: "Ideas" },
  { id: "recording", label: "Recording" },
  { id: "editing", label: "Editing" },
  { id: "published", label: "Published" },
  { id: "draft", label: "Archived / Draft" },
];

const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hourBuckets = [
  { label: "00:00", start: 0, end: 6 },
  { label: "06:00", start: 6, end: 12 },
  { label: "12:00", start: 12, end: 18 },
  { label: "18:00", start: 18, end: 24 },
];
const leaderboardCompetitorColors = ["#fca5a5", "#93c5fd", "#fcd34d", "#c4b5fd", "#fdba74", "#5eead4", "#f9a8d4", "#bef264"];

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("daytabs_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...authHeaders(),
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "Request failed");
  return data as T;
}

async function resizeImageFileToDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.onload = () => {
      const src = typeof reader.result === "string" ? reader.result : "";
      if (!src) {
        reject(new Error(`Could not read ${file.name}`));
        return;
      }
      const image = new window.Image();
      image.onerror = () => reject(new Error(`Could not process ${file.name}`));
      image.onload = () => {
        const maxWidth = 1600;
        const maxHeight = 1600;
        const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error(`Could not process ${file.name}`));
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.88));
      };
      image.src = src;
    };
    reader.readAsDataURL(file);
  });
}

function parseNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatNumber(value?: string | number | null) {
  const number = parseNumber(value);
  if (!number && value && Number.isNaN(Number(value))) return String(value);
  return new Intl.NumberFormat(undefined, { notation: number >= 10000 ? "compact" : "standard" }).format(number);
}

function metricLabel(value: unknown) {
  if (value == null) return "n/a";
  if (typeof value === "number") return new Intl.NumberFormat().format(value);
  return String(value);
}

function readCompetitorStoredMeta(competitor: YoutubeCompetitor): CompetitorStoredMeta {
  if (!competitor.niche) return {};
  try {
    const parsed = JSON.parse(competitor.niche) as CompetitorStoredMeta;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {
      nicheLabel: competitor.niche,
    };
  }
}

function dayName(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? "Day" : date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function dateRangeLabel(startDate?: string, endDate?: string) {
  if (!startDate || !endDate) return "Weekly Calendar";
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "Weekly Calendar";
  return `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} - ${end.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

function getIsoWeekNumber(isoDate?: string) {
  if (!isoDate) return null;
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  return Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function postingTime(day: PlanDay) {
  return day.bestPostingTime?.trim() || "Time TBD";
}

function isVideoInPlanWindow(video: RecentVideo, plan: YoutubeWeeklyPlan | null) {
  if (!plan || !video.publishedAt) return false;
  const published = new Date(video.publishedAt).getTime();
  const start = new Date(`${plan.startDate}T00:00:00Z`).getTime();
  const end = new Date(`${plan.endDate}T23:59:59Z`).getTime();
  return Number.isFinite(published) && published >= start && published <= end;
}

function videoOptionLabel(video: RecentVideo) {
  const date = video.publishedAt ? new Date(video.publishedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "No date";
  return `${date} - ${video.title}`;
}

function isPublicVideo(video?: RecentVideo | null) {
  return (video?.visibility || "").toLowerCase() === "public";
}

function insightLabel(type?: string) {
  const labels: Record<string, string> = {
    best_time_to_post: "Best Time to Post",
    hook_performance: "Hook Performance Score",
    thumbnail_pattern: "Thumbnail Pattern Analysis",
    upload_frequency_growth: "Upload Frequency vs Growth",
    retention_dropoff: "Audience Retention Drop-off",
    title_length: "Title Length Sweet Spot",
    comment_sentiment: "Comment Sentiment Themes",
    subscriber_velocity: "Subscriber Velocity",
    competitor_gap: "Competitor Gap Analysis",
    posting_consistency: "Posting Consistency Score",
    tag_effectiveness: "Tag Effectiveness Ranking",
    first_24h_predictor: "First 24 Hour Predictor",
  };
  return type ? labels[type] ?? type.replace(/_/g, " ") : "Performance Insight";
}

function normalizeConfidence(confidence?: string): InsightConfidence {
  if (confidence === "high" || confidence === "medium") return confidence;
  return "low";
}

function confidenceClass(confidence?: string) {
  if (confidence === "high") return "border-emerald-400/25 bg-emerald-500/12 text-emerald-200";
  if (confidence === "medium") return "border-amber-400/25 bg-amber-500/12 text-amber-200";
  return "border-white/10 bg-white/[0.04] text-white/55";
}

function toCardId(day: PlanDay) {
  return day.id || `${day.day}-${day.date}-${day.contentIdea}`;
}

function initials(value?: string | null) {
  const parts = (value || "").trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (!parts.length) return "YT";
  return parts.map((part) => part[0]?.toUpperCase() || "").join("");
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "0%";
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function formatIsoDate(value?: string | null, options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }) {
  if (!value) return "Unknown date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, options);
}

function startOfWeek(date: Date) {
  const normalized = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = normalized.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  normalized.setUTCDate(normalized.getUTCDate() + diff);
  return normalized;
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function endOfWeek(date: Date) {
  const start = startOfWeek(date);
  start.setUTCDate(start.getUTCDate() + 6);
  return start;
}

function rangeLabelForBucket(label?: string) {
  if (!label) return "35-55";
  if (label.startsWith("Under")) return "Under 20";
  if (label.startsWith("Over")) return "70+";
  return label.replace(" chars", "");
}

function chunkByWeek(points: YoutubeAnalyticsPoint[]) {
  const weekly = new Map<string, YoutubeAnalyticsPoint[]>();
  for (const point of points) {
    const date = new Date(`${point.date}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) continue;
    const week = getIsoWeekNumber(point.date);
    const key = `${date.getUTCFullYear()}-W${week}`;
    if (!weekly.has(key)) weekly.set(key, []);
    weekly.get(key)!.push(point);
  }
  return [...weekly.entries()].slice(-8);
}

function deriveBestTimeHeatmap(videos: RecentVideo[]) {
  const matrix = new Map<string, { day: string; hour: string; value: number; count: number }>();
  for (const day of daysOfWeek) {
    for (const bucket of hourBuckets) {
      matrix.set(`${day}-${bucket.label}`, { day, hour: bucket.label, value: 0, count: 0 });
    }
  }
  for (const video of videos) {
    if (!video.publishedAt) continue;
    const date = new Date(video.publishedAt);
    if (Number.isNaN(date.getTime())) continue;
    const weekday = daysOfWeek[date.getUTCDay()];
    const bucket = hourBuckets.find((item) => date.getUTCHours() >= item.start && date.getUTCHours() < item.end);
    if (!bucket) continue;
    const key = `${weekday}-${bucket.label}`;
    const cell = matrix.get(key);
    if (!cell) continue;
    cell.value += parseNumber(video.viewCount);
    cell.count += 1;
  }
  return [...matrix.values()].map((cell) => ({
    ...cell,
    value: cell.count ? Math.round(cell.value / cell.count) : 0,
    label: cell.count ? `${cell.day} ${cell.hour}: ${formatNumber(Math.round(cell.value / cell.count))} avg views across ${cell.count} uploads` : `${cell.day} ${cell.hour}: no uploads yet`,
  }));
}

function deriveUploadGrowthSeries(videos: RecentVideo[], points: YoutubeAnalyticsPoint[]) {
  const uploadsByWeek = new Map<string, number>();
  for (const video of videos) {
    if (!video.publishedAt) continue;
    const publishedDate = video.publishedAt.slice(0, 10);
    const week = getIsoWeekNumber(publishedDate);
    const year = new Date(video.publishedAt).getUTCFullYear();
    const key = `${year}-W${week}`;
    uploadsByWeek.set(key, (uploadsByWeek.get(key) ?? 0) + 1);
  }
  return chunkByWeek(points).map(([key, weeklyPoints]) => {
    const label = weeklyPoints[0]?.date ? `W${getIsoWeekNumber(weeklyPoints[0].date)}` : key;
    return {
      week: label,
      uploads: uploadsByWeek.get(key) ?? 0,
      views: weeklyPoints.reduce((sum, point) => sum + point.views, 0),
      subscribers: weeklyPoints.reduce((sum, point) => sum + point.subscribersNet, 0),
    };
  });
}

function deriveTitleLengthSeries(videos: RecentVideo[]) {
  return videos
    .filter((video) => video.title && parseNumber(video.viewCount) > 0)
    .slice(0, 24)
    .map((video) => ({
      titleLength: video.title.length,
      views: parseNumber(video.viewCount),
      title: video.title,
    }));
}

function deriveSubscriberVelocity(points: YoutubeAnalyticsPoint[], videos: RecentVideo[]) {
  const recentPoints = points.slice(-30);
  const markers = videos
    .filter((video) => video.publishedAt)
    .map((video) => {
      const date = video.publishedAt!.slice(0, 10);
      const match = recentPoints.find((point) => point.date === date);
      return match ? { date, subscribersNet: match.subscribersNet, title: video.title } : null;
    })
    .filter((item): item is { date: string; subscribersNet: number; title: string } => Boolean(item));
  return {
    timeline: recentPoints.map((point) => ({
      date: new Date(`${point.date}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      subscribersNet: point.subscribersNet,
      rawDate: point.date,
    })),
    markers,
  };
}

function deriveTagOpportunities(recentVideos: RecentVideo[], trendVideos: RecentVideo[]) {
  const creatorCounts = new Map<string, number>();
  const trendCounts = new Map<string, number>();
  for (const video of recentVideos) {
    for (const tag of video.tags ?? []) {
      const key = tag.trim().toLowerCase();
      if (!key) continue;
      creatorCounts.set(key, (creatorCounts.get(key) ?? 0) + 1);
    }
  }
  for (const video of trendVideos) {
    for (const tag of video.tags ?? []) {
      const key = tag.trim().toLowerCase();
      if (!key) continue;
      trendCounts.set(key, (trendCounts.get(key) ?? 0) + 1);
    }
  }

  return [...new Set([...creatorCounts.keys(), ...trendCounts.keys()])]
    .map((tag) => {
      const creatorUses = creatorCounts.get(tag) ?? 0;
      const trendUses = trendCounts.get(tag) ?? 0;
      const score = creatorUses * 2 + trendUses * 3;
      return {
        tag,
        creatorUses,
        trendUses,
        score,
        guidance: creatorUses && trendUses
          ? `Already used on ${creatorUses} channel uploads and appearing on ${trendUses} trend videos.`
          : creatorUses
            ? `Used on ${creatorUses} recent uploads but not showing up in this week's trend pull.`
            : `Appearing on ${trendUses} trend videos and not yet used on this channel.`,
      } satisfies TagOpportunity;
    })
    .filter((item) => item.score > 0 && item.tag.length > 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 18);
}

function enrichInsight(
  insight: PerformanceInsight,
  context: PlanContextSnapshot | undefined,
  analytics: YoutubeAnalyticsPoint[],
  fallbackVideos: RecentVideo[],
  tagData: TagOpportunity[],
): EnrichedInsight {
  const recentVideos = context?.recentVideos?.length ? context.recentVideos : fallbackVideos;
  const confidence = normalizeConfidence(insight.confidence);
  let visual: InsightVisualData = {
    kind: "fallback",
    points: (insight.chart ?? []).map((item) => ({
      label: item.label || "",
      value: item.value ?? 0,
      comparisonValue: item.comparisonValue ?? 0,
    })),
  };

  if (insight.type === "best_time_to_post") {
    visual = { kind: "heatmap", heatmap: deriveBestTimeHeatmap(recentVideos) };
  } else if (insight.type === "upload_frequency_growth") {
    visual = { kind: "dual-line", points: deriveUploadGrowthSeries(recentVideos, analytics) };
  } else if (insight.type === "title_length") {
    visual = { kind: "scatter", points: deriveTitleLengthSeries(recentVideos) };
  } else if (insight.type === "subscriber_velocity") {
    const velocity = deriveSubscriberVelocity(analytics, recentVideos);
    visual = {
      kind: "velocity",
      points: velocity.timeline.map((item) => ({ date: item.date, subscribersNet: item.subscribersNet, rawDate: item.rawDate })),
    };
  } else if (insight.type === "tag_effectiveness") {
    visual = { kind: "tag-cloud", tags: tagData };
  }

  return { ...insight, confidence, visual };
}

function placeholderStyle(seed: string) {
  const palettes = [
    "from-red-500/70 via-orange-400/60 to-amber-300/70",
    "from-emerald-500/70 via-teal-400/60 to-cyan-300/70",
    "from-rose-500/70 via-red-400/60 to-yellow-300/70",
    "from-sky-500/70 via-cyan-400/60 to-lime-300/70",
  ];
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) hash = ((hash << 5) - hash) + seed.charCodeAt(index);
  return palettes[Math.abs(hash) % palettes.length];
}

function planCardIcon(day: PlanDay) {
  const text = `${day.contentIdea} ${day.hook}`.toLowerCase();
  if (text.includes("archive") || text.includes("draft")) return Archive;
  if (text.includes("trend") || text.includes("compare") || text.includes("vs")) return BarChart3;
  return Youtube;
}

function weekProgress(days: PlanDay[], results: YoutubePlanResult[]) {
  const planned = days.length;
  const posted = results.length;
  const progress = planned ? Math.round((posted / planned) * 100) : 0;
  return { planned, posted, progress };
}

function relativeCompetitorLabel(competitor: YoutubeCompetitor, ownSubscribers: number) {
  const competitorSubscribers = parseNumber(competitor.subscriberCount);
  if (!ownSubscribers || !competitorSubscribers) return { label: "Unknown", ratio: null as number | null };
  const ratio = competitorSubscribers / ownSubscribers;
  if (ratio <= 4) return { label: "Comparable", ratio };
  return { label: "Aspirational", ratio };
}

function channelDescription(channel?: YoutubeChannel | null) {
  return channel?.nicheProfile?.channelDescription?.trim() || channel?.nicheProfile?.summary?.trim() || "";
}

function hookType(title: string) {
  const trimmed = title.trim();
  const lower = trimmed.toLowerCase();
  if (trimmed.endsWith("?")) return "Question";
  if (/^(will|can|what|why|how)\b/i.test(trimmed)) return "Curiosity";
  if (/\b(lowest|anxiety|feel|story|struggle|fear|confession|healing|burnout|overwhelmed)\b/i.test(lower)) return "Emotional";
  return "Descriptive";
}

function contentTypeMeta(day: PlanDay) {
  const text = `${day.contentIdea} ${day.hook}`.toLowerCase();
  if (text.includes("tutorial") || text.includes("step") || text.includes("how to")) return { label: "Tutorial", Icon: Camera };
  if (text.includes("process") || text.includes("paint") || text.includes("draw with me")) return { label: "Process", Icon: Paintbrush };
  if (text.includes("?") || text.includes("what if") || text.includes("will ") || text.includes("can ")) return { label: "Curiosity", Icon: CircleHelp };
  return { label: "Emotional", Icon: Heart };
}

function isManualIdea(day: PlanDay) {
  return day.ideaOrigin === "manual" || Boolean(day.id?.startsWith("custom-"));
}

function isAiIdea(day: PlanDay) {
  return !isManualIdea(day);
}

function ideaDescription(day: PlanDay) {
  return day.descriptionSuggestion?.trim() || "AI improve can generate a ready-to-paste description in your channel voice.";
}

function ideaTags(day: PlanDay) {
  return (day.tags ?? []).map((tag) => tag.trim()).filter(Boolean);
}

function ideaThumbnail(day: PlanDay) {
  return day.thumbnailConcept?.trim() || "AI improve can generate a thumbnail idea based on your niche and top performers.";
}

function IdeaPackageFields({ day, compact = false }: { day: PlanDay; compact?: boolean }) {
  const tags = ideaTags(day);
  if (compact) {
    return (
      <div className="mt-3 space-y-2">
        <div className="rounded-lg border border-white/10 bg-black/10 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">Video Title</p>
          <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-white">{day.contentIdea}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-4 space-y-2">
      <div className="rounded-lg border border-white/10 bg-black/10 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">Video Title</p>
        <p className="mt-1 text-sm font-semibold leading-6 text-white">{day.contentIdea}</p>
      </div>
      <div className="rounded-lg border border-white/10 bg-black/10 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">Video Description</p>
        <p className="mt-1 text-sm leading-6 text-white/60">{ideaDescription(day)}</p>
      </div>
      <div className="rounded-lg border border-white/10 bg-black/10 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">Tags</p>
        {tags.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tags.slice(0, 10).map((tag) => (
              <span key={tag} className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-1 text-[10px] text-white/65">{tag}</span>
            ))}
          </div>
        ) : <p className="mt-1 text-xs text-white/35">AI improve can generate niche tags.</p>}
      </div>
      <div className="rounded-lg border border-white/10 bg-black/10 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">Thumbnail Idea</p>
        <p className="mt-1 text-sm leading-6 text-white/60">{ideaThumbnail(day)}</p>
      </div>
    </div>
  );
}

function ideaOriginMeta(day: PlanDay) {
  if (isManualIdea(day)) {
    return {
      label: "Manual",
      chipClassName: "border-sky-300/25 bg-sky-400/10 text-sky-100",
      cardClassName: "border-sky-300/20 bg-sky-500/[0.05] hover:border-sky-300/35",
      accentClassName: "from-sky-300 to-cyan-300",
    };
  }
  return {
    label: "AI",
    chipClassName: "border-amber-300/25 bg-amber-400/10 text-amber-100",
    cardClassName: "border-red-300/20 bg-red-500/[0.05] hover:border-red-300/35",
    accentClassName: "from-red-300 to-amber-300",
  };
}

function hydrateVisiblePlanDays(rawDays: PlanDay[] = []) {
  return rawDays
    .filter((day) => !day.isDeleted)
    .map((day) => ({
      ...day,
      id: toCardId(day),
      stage: day.stage ?? "idea",
      ideaOrigin: day.ideaOrigin ?? "ai",
      aiFeedback: day.aiFeedback ?? null,
    }));
}

function effectivePlannerStage(
  day: PlanDay,
  resultsByDay: Map<number, YoutubePlanResult>,
  recentVideoById: Map<string, RecentVideo>,
): Stage {
  const linked = resultsByDay.get(day.day);
  const linkedVideo = linked ? recentVideoById.get(linked.videoId) : null;
  if (linked && isPublicVideo(linkedVideo)) return "published";
  return (day.stage ?? "idea") as Stage;
}

function conceptTypeFromVideo(video: RecentVideo) {
  const text = `${video.title} ${video.description || ""}`.toLowerCase();
  if (text.includes("tutorial") || text.includes("how to") || text.includes("step")) return "Tutorial";
  if (text.includes("hack") || text.includes("tip")) return "Hack";
  if (text.includes("story") || text.includes("my ") || text.includes("i ")) return "Story";
  if (text.includes("reveal") || text.includes("results") || text.includes("before and after")) return "Reveal";
  return "Process";
}

function averageViewsForHookType(videos: RecentVideo[], type: string) {
  const matches = videos.filter((video) => hookType(video.title) === type);
  return matches.length ? Math.round(matches.reduce((sum, video) => sum + parseNumber(video.viewCount), 0) / matches.length) : 0;
}

function commonTopTags(videos: RecentVideo[]) {
  const counts = new Map<string, number>();
  for (const video of videos) {
    for (const tag of video.tags ?? []) {
      const key = tag.trim().toLowerCase();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([tag]) => tag);
}

function buildVideoDiagnostics(
  videos: RecentVideo[],
  allVideos: RecentVideo[],
  titleLengthSummary: ReturnType<typeof deriveTitleLengthSummary>,
  bestTime: ReturnType<typeof deriveBestTimeSummary>,
  kind: "top" | "bottom",
) {
  const topTagSet = new Set(commonTopTags([...allVideos].sort((a, b) => parseNumber(b.viewCount) - parseNumber(a.viewCount)).slice(0, 6)));
  return videos.map((video) => {
    const type = hookType(video.title);
    const hookAverage = averageViewsForHookType(allVideos, type);
    const questionAverage = averageViewsForHookType(allVideos, "Question");
    const overlapTags = (video.tags ?? []).map((tag) => tag.trim().toLowerCase()).filter((tag) => topTagSet.has(tag));
    const inRange = titleLengthSummary.winningBucket
      ? video.title.length >= titleLengthSummary.winningBucket.min && video.title.length <= titleLengthSummary.winningBucket.max
      : false;
    const concept = conceptTypeFromVideo(video);
    const postedDay = video.publishedAt ? daysOfWeek[new Date(video.publishedAt).getUTCDay()] : "Unknown";
    const bucket = video.publishedAt ? hourBuckets.find((item) => {
      const hour = new Date(video.publishedAt!).getUTCHours();
      return hour >= item.start && hour < item.end;
    }) : null;
    const strongestWindow = bestTime.highest ? `${bestTime.highest.day} ${bestTime.highest.hour === "00:00" ? "00:00-06:00" : bestTime.highest.hour === "06:00" ? "06:00-12:00" : bestTime.highest.hour === "12:00" ? "12:00-18:00" : "18:00-24:00"}` : "your strongest window";
    return {
      video,
      hook: kind === "top"
        ? `${type} hook. ${type.toLowerCase()} titles averaged ${formatNumber(hookAverage)} views on your channel${questionAverage ? ` vs ${formatNumber(questionAverage)} for question hooks` : ""}.`
        : `${type} title with less tension. Rewrite it toward a question or emotional angle because those patterns outperform descriptive titles on your channel.`,
      tags: kind === "top"
        ? `${overlapTags.length ? overlapTags.map((tag) => `#${tag}`).join(" + ") : "No repeated niche tag cluster"}${overlapTags.length ? ` appeared across your stronger uploads and helped this video match winning metadata patterns.` : ". Test a tighter niche-specific tag combo next time."}`
        : `${overlapTags.length ? overlapTags.map((tag) => `#${tag}`).join(" + ") : "Mostly generic tags"}. Add more niche-specific tags that appear on your better videos.`,
      titleLength: kind === "top"
        ? `${video.title.length} characters. ${inRange ? "Inside" : "Outside"} your optimal ${titleLengthSummary.winningBucket ? `${titleLengthSummary.winningBucket.min}-${Number.isFinite(titleLengthSummary.winningBucket.max) ? titleLengthSummary.winningBucket.max : "70+"}` : "35-55"} range.`
        : `${video.title.length} characters. ${inRange ? "The length is fine, so the hook and concept need work." : "Move it closer to your winning range for a better first impression."}`,
      conceptType: kind === "top"
        ? `${concept} video. This format shows up repeatedly in your stronger performers.`
        : `${concept} video. Test this idea as a reveal, tutorial, or story angle with clearer stakes.`,
      timing: kind === "top"
        ? `Posted ${postedDay}${bucket ? ` ${bucket.label === "00:00" ? "00:00-06:00" : bucket.label === "06:00" ? "06:00-12:00" : bucket.label === "12:00" ? "12:00-18:00" : "18:00-24:00"}` : ""}${bestTime.highest ? `. Compare that with ${strongestWindow}, your strongest signal at ${formatNumber(bestTime.highest.value)} avg views.` : "."}`
        : `It missed your strongest heatmap signal. Try the next version in ${strongestWindow} so the topic gets a better first push.`,
      suggestion: kind === "top"
        ? `Repeat the ${type.toLowerCase()} hook pattern, keep the title close to ${titleLengthSummary.winningBucket ? `${titleLengthSummary.winningBucket.min}-${Number.isFinite(titleLengthSummary.winningBucket.max) ? titleLengthSummary.winningBucket.max : "70+"}` : "35-55"} characters, and publish in a proven window.`
        : `Try a stronger hook like "What happens if ${video.title.replace(/[?!.]+$/, "").slice(0, 58)}?" or "I tested ${video.title.replace(/[?!.]+$/, "").slice(0, 58)} so you do not have to." Pair it with tighter niche tags and your best posting window.`,
    } satisfies VideoDiagnostic;
  });
}

function buildOverviewSections(videos: RecentVideo[]) {
  const sorted = [...videos].sort((a, b) => parseNumber(b.viewCount) - parseNumber(a.viewCount));
  const top = sorted.slice(0, 3);
  const bottom = [...sorted].reverse().slice(0, 3).reverse();

  return {
    whatWorkedVideos: top,
    underperformerVideos: bottom,
  };
}

function buildPostingPattern(videos: RecentVideo[], connectedAt?: string | null) {
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const connectionDate = connectedAt ? new Date(connectedAt) : today;
  const start = startOfWeek(connectionDate);
  const end = endOfWeek(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 7)));
  const values: PostingPatternDay[] = [];
  let index = 0;

  for (let time = start.getTime(); time <= end.getTime(); time += 86400000, index += 1) {
    const date = new Date(time);
    const iso = date.toISOString().slice(0, 10);
    const matchedVideo = videos.find((video) => video.publishedAt?.slice(0, 10) === iso);
    const isBeforeConnection = iso < (connectedAt ? new Date(connectedAt).toISOString().slice(0, 10) : todayIso);
    if (isBeforeConnection) continue;
    const isFuture = iso > todayIso;
    values.push({
      iso,
      posted: Boolean(matchedVideo),
      label: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      dayNumber: date.toLocaleDateString(undefined, { day: "numeric" }),
      weekday: date.toLocaleDateString(undefined, { weekday: "short" }),
      weekIndex: Math.floor(index / 7),
      videoTitle: matchedVideo?.title,
      isFuture,
      isUpcoming: isFuture,
    });
  }

  return values;
}

function deriveBestTimeSummary(videos: RecentVideo[]) {
  const cells = deriveBestTimeHeatmap(videos);
  const populated = cells.filter((cell) => cell.value > 0);
  const highest = [...populated].sort((a, b) => b.value - a.value)[0];
  const average = videos.length ? Math.round(videos.reduce((sum, video) => sum + parseNumber(video.viewCount), 0) / videos.length) : 0;
  const sampleVideos = videos.filter((video) => {
    if (!highest || !video.publishedAt) return false;
    const date = new Date(video.publishedAt);
    const weekday = daysOfWeek[date.getUTCDay()];
    const bucket = hourBuckets.find((item) => date.getUTCHours() >= item.start && date.getUTCHours() < item.end);
    return weekday === highest.day && bucket?.label === highest.hour;
  }).slice(0, 2);
  return { cells, highest, average, sampleVideos };
}

function deriveHookRows(videos: RecentVideo[]) {
  const grouped = new Map<string, RecentVideo[]>();
  for (const video of videos) {
    const key = hookType(video.title);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(video);
  }
  return ["Question", "Emotional", "Curiosity", "Descriptive"]
    .map((type) => {
      const items = grouped.get(type) ?? [];
      const averageViews = items.length ? Math.round(items.reduce((sum, video) => sum + parseNumber(video.viewCount), 0) / items.length) : 0;
      return {
        type,
        averageViews,
        count: items.length,
        sample: items[0]?.title,
      };
    })
    .filter((row) => row.count > 0)
    .sort((a, b) => b.averageViews - a.averageViews);
}

function deriveHookInsight(videos: RecentVideo[]) {
  const rows = deriveHookRows(videos);
  const winner = rows[0];
  if (!winner) return null;
  const evidenceVideos = [...videos]
    .filter((video) => hookType(video.title) === winner.type)
    .sort((a, b) => parseNumber(b.viewCount) - parseNumber(a.viewCount))
    .slice(0, 3);
  const why = winner.type === "Emotional"
    ? "These titles create immediate personal stakes before the click, which makes the payoff feel intimate and unresolved."
    : winner.type === "Question"
      ? "These titles open a sharp curiosity gap, so viewers click to resolve the question."
      : winner.type === "Curiosity"
        ? "These titles tease a reveal without giving away the answer too early, which keeps tension high."
        : "These titles win when the value proposition is clear and easy to understand at a glance.";
  const suggestions = winner.type === "Emotional"
    ? [
      "Lead with a confession, setback, or vulnerable turning point.",
      "Put the emotional cost before the resolution in the title.",
      "Open scripts with a personal line that sounds honest rather than polished.",
    ]
    : winner.type === "Question"
      ? [
        "Frame the next title as one question the video fully answers.",
        "Use concrete stakes in the first line instead of broad curiosity.",
        "Make the question specific enough that the answer feels urgent.",
      ]
      : winner.type === "Curiosity"
        ? [
          "Tease the result without revealing it in the title.",
          "Use contrast words like 'instead', 'finally', or 'after'.",
          "Open with a reveal, test, or transformation promise.",
        ]
        : [
          "Keep the value explicit in the title.",
          "Put the result or technique before decorative phrasing.",
          "Pair clarity with one specific emotional or visual payoff.",
        ];
  return { winner, evidenceVideos, why, suggestions };
}

function deriveTitleLengthSummary(videos: RecentVideo[]) {
  const points = deriveTitleLengthSeries(videos);
  const sorted = [...points].sort((a, b) => b.views - a.views);
  const top = sorted.slice(0, 5);
  const bottom = [...sorted].reverse().slice(0, 5);
  const overallAverage = points.length ? Math.round(points.reduce((sum, point) => sum + point.views, 0) / points.length) : 0;
  const buckets: TitleLengthBucket[] = [
    { label: "Under 20 chars", min: 0, max: 19, averageViews: 0, count: 0 },
    { label: "20-35 chars", min: 20, max: 35, averageViews: 0, count: 0 },
    { label: "35-50 chars", min: 36, max: 50, averageViews: 0, count: 0 },
    { label: "50-70 chars", min: 51, max: 70, averageViews: 0, count: 0 },
    { label: "Over 70 chars", min: 71, max: Infinity, averageViews: 0, count: 0 },
  ].map((bucket) => {
    const items = points.filter((point) => point.titleLength >= bucket.min && point.titleLength <= bucket.max);
    return {
      ...bucket,
      count: items.length,
      averageViews: items.length ? Math.round(items.reduce((sum, point) => sum + point.views, 0) / items.length) : 0,
    };
  });
  const winningBucket = [...buckets].sort((a, b) => b.averageViews - a.averageViews)[0] ?? null;
  const optimalMin = winningBucket?.min ?? 0;
  const optimalMax = winningBucket && Number.isFinite(winningBucket.max) ? winningBucket.max : 0;
  const topAverage = top.length ? Math.round(top.reduce((sum, point) => sum + point.titleLength, 0) / top.length) : 0;
  const bottomAverage = bottom.length ? Math.round(bottom.reduce((sum, point) => sum + point.titleLength, 0) / bottom.length) : 0;
  const winningAverage = winningBucket?.averageViews ?? 0;
  const percentAboveAverage = overallAverage ? Math.round(((winningAverage - overallAverage) / overallAverage) * 100) : 0;
  return { points, optimalMin, optimalMax, topAverage, bottomAverage, top, bottom, buckets, winningBucket, overallAverage, percentAboveAverage };
}

function deriveSubscriberGrowth(points: YoutubeAnalyticsPoint[], videos: RecentVideo[]) {
  const velocity = deriveSubscriberVelocity(points, videos);
  const videosByDate = new Map<string, RecentVideo[]>();
  for (const video of videos) {
    const key = video.publishedAt?.slice(0, 10);
    if (!key) continue;
    if (!videosByDate.has(key)) videosByDate.set(key, []);
    videosByDate.get(key)!.push(video);
  }
  const timeline = velocity.timeline.map((item) => ({
    ...item,
    markerVideos: (videosByDate.get(item.rawDate) ?? []).map((video) => ({
      title: video.title,
      views: parseNumber(video.viewCount),
      publishedAt: video.publishedAt,
    })),
  }));
  const spike = [...timeline].sort((a, b) => b.subscribersNet - a.subscribersNet)[0];
  const spikeVideo = spike?.rawDate ? videos.find((video) => video.publishedAt?.slice(0, 10) === spike.rawDate) : null;
  return { timeline, spike, spikeVideo };
}

function deriveTagPerformance(videos: RecentVideo[]) {
  const medianSource = videos.map((video) => parseNumber(video.viewCount)).filter((value) => value > 0).sort((a, b) => a - b);
  const medianViews = medianSource.length ? medianSource[Math.floor(medianSource.length / 2)] : 0;
  const tagMap = new Map<string, number[]>();
  for (const video of videos) {
    for (const tag of video.tags ?? []) {
      const key = tag.trim().toLowerCase();
      if (!key) continue;
      if (!tagMap.has(key)) tagMap.set(key, []);
      tagMap.get(key)!.push(parseNumber(video.viewCount));
    }
  }
  return [...tagMap.entries()].map(([tag, values]) => {
    const averageViews = values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
    const delta = medianViews ? ((averageViews - medianViews) / medianViews) * 100 : 0;
    const tone = delta > 20 ? "positive" : delta < -20 ? "negative" : "neutral";
    return { tag, averageViews, count: values.length, tone, delta };
  }).sort((a, b) => b.averageViews - a.averageViews);
}

function deriveTrendingTagSuggestions(planTags: PlanPayload["viralTags"], trendVideos: RecentVideo[], existingTags: Set<string>) {
  const used = new Set(existingTags);
  const trendCounts = new Map<string, { signal: number; topViews: number }>();
  for (const video of trendVideos) {
    for (const tag of video.tags ?? []) {
      const key = tag.trim().toLowerCase();
      if (!key || used.has(key)) continue;
      const current = trendCounts.get(key) ?? { signal: 0, topViews: 0 };
      current.signal += 1;
      current.topViews = Math.max(current.topViews, parseNumber(video.viewCount));
      trendCounts.set(key, current);
    }
  }
  const fromPlan = (planTags ?? [])
    .filter((item) => item.tag && !used.has(item.tag.trim().toLowerCase()))
    .map((item) => ({
      tag: item.tag!.trim(),
      signal: trendCounts.get(item.tag!.trim().toLowerCase())?.signal ?? 0,
      topViews: trendCounts.get(item.tag!.trim().toLowerCase())?.topViews ?? 0,
      why: item.why || item.bestUse || "Pulled from your saved niche trend analysis.",
    }));
  const fromTrends = [...trendCounts.entries()]
    .sort((a, b) => (b[1].signal * 1000 + b[1].topViews) - (a[1].signal * 1000 + a[1].topViews))
    .slice(0, 8)
    .map(([tag, data]) => ({
      tag,
      signal: data.signal,
      topViews: data.topViews,
      why: data.signal > 1
        ? `#${tag} appears in ${data.signal} trending niche videos from the past 7 days that reached up to ${formatNumber(data.topViews)} views, and none of your current videos use it.`
        : `Emerging tag with signal 1. One recent niche video using #${tag} already reached ${formatNumber(data.topViews)} views, suggesting early mover advantage.`,
    }));
  const merged = [...fromPlan, ...fromTrends].filter((item, index, items) => items.findIndex((candidate) => candidate.tag.toLowerCase() === item.tag.toLowerCase()) === index);
  return merged.slice(0, 8);
}

function deriveCompetitorRows(ownSubscribers: number, recentVideos: RecentVideo[], competitors: YoutubeCompetitor[]) {
  const ownAverageViews = recentVideos.length ? Math.round(recentVideos.reduce((sum, video) => sum + parseNumber(video.viewCount), 0) / recentVideos.length) : 0;
  const ownVideosPerWeek = recentVideos.length > 1 ? Number((recentVideos.length / Math.max(1, ((new Date(recentVideos[0].publishedAt || Date.now()).getTime() - new Date(recentVideos[recentVideos.length - 1].publishedAt || Date.now()).getTime()) / (7 * 24 * 60 * 60 * 1000)))).toFixed(1)) : 0;
  return competitors.map((competitor) => {
    const averageViews = competitor.mostViewedRecentVideos?.length
      ? Math.round(competitor.mostViewedRecentVideos.reduce((sum, video) => sum + parseNumber(video.viewCount), 0) / competitor.mostViewedRecentVideos.length)
      : 0;
    const videosPerWeekMatch = competitor.postingFrequency?.match(/([\d.]+)\s+videos\/week/i);
    const videosPerWeek = videosPerWeekMatch ? Number(videosPerWeekMatch[1]) : 0;
    const subscribers = parseNumber(competitor.subscriberCount);
    return {
      ...competitor,
      averageViews,
      videosPerWeek,
      videosPerWeekLabel: videosPerWeek ? `${Math.round(videosPerWeek * 2) / 2} videos/week` : "n/a",
      subscribers,
      viewsGap: averageViews - ownAverageViews,
      frequencyGap: videosPerWeek - ownVideosPerWeek,
      subscriberGap: subscribers - ownSubscribers,
    };
  });
}

function partitionCompetitors(ownSubscribers: number, competitors: Array<ReturnType<typeof deriveCompetitorRows>[number]>) {
  const tier1 = competitors.filter((item) => ownSubscribers > 0 && item.subscribers > 0 && item.subscribers <= ownSubscribers * 5);
  const tier2 = competitors.filter((item) => ownSubscribers > 0 && item.subscribers > ownSubscribers * 5 && item.subscribers <= ownSubscribers * 30);
  const tier3 = competitors.filter((item) => ownSubscribers > 0 && item.subscribers > ownSubscribers * 30);
  return { tier1, tier2, tier3 };
}

function deriveWeeklyComparisonData(
  competitors: Array<ReturnType<typeof deriveCompetitorRows>[number]>,
  latestPlan: YoutubeWeeklyPlan | null,
  recentVideos: RecentVideo[],
  channelName?: string,
) {
  if (!latestPlan) return null;
  const scheduledStart = new Date(`${latestPlan.startDate}T00:00:00Z`);
  const scheduledEnd = new Date(`${latestPlan.endDate}T23:59:59Z`);
  const inWindow = (value: string | null | undefined, start: Date, end: Date) => {
    if (!value) return false;
    const time = new Date(value).getTime();
    return Number.isFinite(time) && time >= start.getTime() && time <= end.getTime();
  };

  const scheduledCompetitorRows = competitors.map((competitor) => ({
    competitor,
    videos: (competitor.mostViewedRecentVideos ?? []).filter((video) => inWindow(video.publishedAt, scheduledStart, scheduledEnd)),
  }));
  const scheduledHasCompetitorActivity = scheduledCompetitorRows.some((row) => row.videos.length > 0);

  let comparisonStart = scheduledStart;
  let comparisonEnd = scheduledEnd;
  let windowLabel = "Current scheduled week";
  let windowDescription = "Published videos from your current plan week.";

  if (!scheduledHasCompetitorActivity) {
    const allPublishedTimes = competitors
      .flatMap((competitor) => competitor.mostViewedRecentVideos ?? [])
      .map((video) => video.publishedAt ? new Date(video.publishedAt).getTime() : Number.NaN)
      .filter((time) => Number.isFinite(time));

    if (allPublishedTimes.length) {
      const latestPublishedTime = Math.max(...allPublishedTimes);
      comparisonEnd = new Date(latestPublishedTime);
      comparisonEnd.setUTCHours(23, 59, 59, 999);
      comparisonStart = new Date(comparisonEnd.getTime() - 6 * 24 * 60 * 60 * 1000);
      comparisonStart.setUTCHours(0, 0, 0, 0);
      windowLabel = "Latest live competitor week";
      windowDescription = "Latest 7-day window with live competitor publishes.";
    }
  }

  const yourVideos = recentVideos.filter((video) => inWindow(video.publishedAt, comparisonStart, comparisonEnd));

  const competitorRows = competitors
    .map((competitor, index) => {
      const weeklyVideos = (competitor.mostViewedRecentVideos ?? []).filter((video) => inWindow(video.publishedAt, comparisonStart, comparisonEnd));
      return {
        key: `competitor${index}`,
        name: competitor.channelName,
        shortName: competitor.channelName,
        views: weeklyVideos.reduce((sum, video) => sum + parseNumber(video.viewCount), 0),
        uploads: weeklyVideos.length,
        fill: leaderboardCompetitorColors[index % leaderboardCompetitorColors.length],
        isYou: false,
        videos: weeklyVideos,
      } satisfies WeeklyComparisonCompetitorRow;
    })
    .filter((row) => row.uploads > 0 || row.views > 0);

  const youRow = {
    key: "you",
    name: channelName || "You",
    shortName: "You",
    views: yourVideos.reduce((sum, video) => sum + parseNumber(video.viewCount), 0),
    uploads: yourVideos.length,
    fill: "#34d399",
    isYou: true,
    videos: yourVideos,
  } satisfies WeeklyComparisonYouRow;

  if (!competitorRows.length) {
    return {
      rows: [youRow],
      competitors: [],
      motivatingCompetitor: undefined,
      weekdayRows: [],
      windowLabel,
      windowDescription,
    };
  }

  const weekdayRows = Array.from({ length: 7 }).map((_, index) => {
    const iso = toIsoDate(addUtcDays(new Date(comparisonStart), index));
    const day = daysOfWeek[new Date(`${iso}T00:00:00Z`).getUTCDay()];
    const yourDayVideos = yourVideos.filter((video) => video.publishedAt?.slice(0, 10) === iso);
    const row: WeeklyComparisonWeekdayRow = {
      iso,
      day,
      youViews: yourDayVideos.reduce((sum, video) => sum + parseNumber(video.viewCount), 0),
      youUploads: yourDayVideos.length,
    };
    for (const competitor of competitorRows) {
      const competitorDayVideos = competitor.videos.filter((video) => video.publishedAt?.slice(0, 10) === iso);
      row[`${competitor.key}Views`] = competitorDayVideos.reduce((sum, video) => sum + parseNumber(video.viewCount), 0);
      row[`${competitor.key}Uploads`] = competitorDayVideos.length;
    }
    return row;
  });

  const motivatingCompetitor = [...competitorRows].sort((a, b) => Math.abs(a.uploads - youRow.uploads) - Math.abs(b.uploads - youRow.uploads) || Math.abs(a.views - youRow.views) - Math.abs(b.views - youRow.views))[0];

  return { rows: [youRow, ...competitorRows], competitors: competitorRows, motivatingCompetitor, weekdayRows, windowLabel, windowDescription };
}

function deriveCurrentWeekConsistencyData(weekDates: string[], plannedDates: Set<string>, videos: RecentVideo[]) {
  const postedCountByDate = videos.reduce<Map<string, number>>((map, video) => {
    const iso = video.publishedAt?.slice(0, 10);
    if (!iso) return map;
    map.set(iso, (map.get(iso) ?? 0) + 1);
    return map;
  }, new Map<string, number>());
  const todayIso = new Date().toISOString().slice(0, 10);

  return weekDates.map((iso) => {
    const postedCount = postedCountByDate.get(iso) ?? 0;
    const plannedCount = plannedDates.has(iso) ? 1 : 0;
    const status: "posted" | "missed" | "planned" | "empty" = postedCount > 0 ? "posted" : iso < todayIso && plannedCount > 0 ? "missed" : plannedCount > 0 ? "planned" : "empty";
    return {
      iso,
      day: daysOfWeek[new Date(`${iso}T00:00:00Z`).getUTCDay()],
      postedCount,
      plannedCount,
      missed: iso < todayIso && plannedCount > 0 && postedCount === 0,
      status,
    };
  });
}

function deriveFriendlyLeaderboardMessage(weeklyComparison: NonNullable<ReturnType<typeof deriveWeeklyComparisonData>>) {
  const you = weeklyComparison.rows[0];
  const competitor = weeklyComparison.motivatingCompetitor;
  if (!you || !competitor) {
    return "Keep publishing this week and the leaderboard will sharpen as more live results come in.";
  }

  const viewGap = you.views - competitor.views;
  const uploadGap = you.uploads - competitor.uploads;

  if (viewGap >= 0 && uploadGap >= 0) {
    return `You are ahead of ${competitor.name} by ${formatNumber(viewGap)} views with ${Math.abs(uploadGap)} more upload${Math.abs(uploadGap) === 1 ? "" : "s"} in this week. Keep the pace and protect the lead.`;
  }
  if (viewGap >= 0 && uploadGap < 0) {
    return `You are ahead by ${formatNumber(viewGap)} views even with fewer uploads than ${competitor.name}. Quality is winning this week, so one more strong post could widen the gap fast.`;
  }
  if (viewGap < 0 && uploadGap >= 0) {
    return `${competitor.name} is ahead by ${formatNumber(Math.abs(viewGap))} views even though you matched or beat their upload pace. Keep posting, but focus the next upload on your strongest window.`;
  }
  return `${competitor.name} is ahead by ${formatNumber(Math.abs(viewGap))} views and ${Math.abs(uploadGap)} upload${Math.abs(uploadGap) === 1 ? "" : "s"} this week. One well-timed upload can still close a meaningful part of that gap.`;
}

function uploadReviewPrompt(video: RecentVideo, matchingIdeas: PlanDay[]) {
  if (matchingIdeas.length === 0) {
    return "No planned ideas exist on this publish date yet. Save this upload as a new idea so your week stays complete.";
  }
  if (matchingIdeas.length === 1) {
    return "We found one planned idea on this publish date. Link it if this upload matches, or save it as a new idea instead.";
  }
  return `We found ${matchingIdeas.length} planned ideas on this publish date. Choose the one this upload belongs to, or save it as a new idea.`;
}

function deriveCompetitorGapSummary(ownAverageViews: number, competitorRows: Array<ReturnType<typeof deriveCompetitorRows>[number]>) {
  const actionable = [...competitorRows]
    .filter((row) => row.averageViews > ownAverageViews)
    .sort((a, b) => Math.abs(a.subscriberGap) - Math.abs(b.subscriberGap) || b.averageViews - a.averageViews)[0];
  if (!actionable) return null;
  const topVideo = actionable.mostViewedRecentVideos?.[0];
  const contentDriver = topVideo?.title ? contentTypeMeta({
    day: 0,
    date: "",
    contentIdea: topVideo.title,
    hook: topVideo.title,
    outline: [],
    bestPostingTime: "",
    rationale: "",
  } as PlanDay).label.toLowerCase() : "educational";
  return {
    actionable,
    contentDriver,
    explanation: `${actionable.channelName} posts ${actionable.videosPerWeekLabel} and averages ${formatNumber(actionable.averageViews)} views per video vs your average of ${formatNumber(ownAverageViews)}. Their strongest content leans ${contentDriver} with clearer educational framing. Adding one weekly idea in that lane could close the gap significantly.`,
  };
}

function deriveCompetitorCardInsight(competitor: YoutubeCompetitor) {
  const topTitles = (competitor.mostViewedRecentVideos ?? []).map((video) => video.title).filter(Boolean) as string[];
  const topTitle = topTitles[0] ?? "";
  const style = topTitle ? contentTypeMeta({
    day: 0,
    date: "",
    contentIdea: topTitle,
    hook: topTitle,
    outline: [],
    bestPostingTime: "",
    rationale: "",
  } as PlanDay).label.toLowerCase() : "educational";
  const hook = topTitle ? hookType(topTitle).toLowerCase() : "descriptive";
  return `${competitor.channelName} posts ${competitor.postingFrequency ?? "consistently"} and gets traction with ${style} videos using ${hook} hooks. Test one idea that borrows that structure while keeping your own voice.`;
}

function deriveBestPostingSlotByDay(cells: Array<{ day: string; hour: string; value: number; label: string }>) {
  return daysOfWeek.reduce<Record<string, { slot: string; value: number }>>((acc, day) => {
    const best = cells
      .filter((cell) => cell.day === day)
      .sort((a, b) => b.value - a.value)[0];
    if (best) {
      acc[day] = {
        slot: best.hour === "00:00" ? "00:00-06:00" : best.hour === "06:00" ? "06:00-12:00" : best.hour === "12:00" ? "12:00-18:00" : "18:00-24:00",
        value: best.value,
      };
    }
    return acc;
  }, {});
}

function buildWhyThisMightWork(
  day: PlanDay,
  weekday: string,
  bestSlot: { slot: string; value: number } | undefined,
  hookInsight: ReturnType<typeof deriveHookInsight>,
  trendingTags: Array<{ tag: string }>,
) {
  const lines = [
    `This idea leans into ${hookType(day.hook).toLowerCase()} tension, which matches the title structures that have been earning stronger attention on your channel.`,
    bestSlot
      ? `${weekday} ${bestSlot.slot} is one of your stronger windows at about ${formatNumber(bestSlot.value)} average views, so this concept has a better chance of getting an early push when viewers are already responsive.`
      : `${weekday} has limited posting data so this idea gives you a clean test in a slot the planner thinks is still promising.`,
    trendingTags[0] ? `Use tags like #${trendingTags[0].tag} only if they honestly fit the video, because that helps this upload connect to patterns already working in your niche.` : "Keep the framing specific to the audience you already attract so the click promise feels familiar and credible.",
  ];
  return lines.join(" ");
}

function StatsSkeleton() {
  return (
    <section className="grid gap-4 md:grid-cols-5">
      {Array.from({ length: 5 }).map((_, index) => (
        <PanelCardSoft key={index} className={cn("p-4", index === 0 && "md:col-span-2")}>
          <Skeleton className="h-3 w-24 bg-white/10" />
          <Skeleton className="mt-4 h-8 w-28 bg-white/10" />
          <Skeleton className="mt-4 h-12 w-full bg-white/10" />
        </PanelCardSoft>
      ))}
    </section>
  );
}

function VideoPicker({
  videos,
  selected,
  disabledIds,
  onSelect,
}: {
  videos: RecentVideo[];
  selected?: string;
  disabledIds: Set<string>;
  onSelect: (videoId: string) => void;
}) {
  const filteredVideos = useMemo(
    () => [...videos].sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime()),
    [videos],
  );
  if (!videos.length) return <p className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/35">No synced YouTube uploads found yet. Refresh uploaded videos and try again.</p>;
  return (
    <div className="mt-3">
      <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
      {filteredVideos.map((video) => {
        const disabled = disabledIds.has(video.id) && selected !== video.id;
        const active = selected === video.id;
        return (
          <button
            key={video.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(video.id)}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-all",
              active ? "border-emerald-300/50 bg-emerald-500/10 shadow-[0_12px_32px_rgba(16,185,129,0.12)]" : "border-white/10 bg-white/[0.03] hover:-translate-y-0.5 hover:bg-white/[0.06]",
              disabled && "opacity-35",
            )}
          >
            {video.thumbnailUrl ? (
              <img src={video.thumbnailUrl} alt="" className="h-[45px] w-20 rounded-md object-cover" />
            ) : (
              <div className="flex h-[45px] w-20 items-center justify-center rounded-md bg-[#151515]"><Play className="h-4 w-4 text-white/60" /></div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-white">{video.title}</p>
              <p className="mt-1 text-[11px] text-white/35">
                {videoOptionLabel(video)} · {formatNumber(video.viewCount)} views
              </p>
            </div>
            {active ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" /> : null}
          </button>
        );
      })}
      </div>
    </div>
  );
}

function VideoDiagnosticCard({
  diagnostic,
  tone,
}: {
  diagnostic: VideoDiagnostic;
  tone: "positive" | "negative";
}) {
  const positive = tone === "positive";
  const metricItems: Array<{ label: string; value: string; Icon: LucideIcon; className: string }> = [
    { label: "Hook", value: diagnostic.hook, Icon: Sparkles, className: positive ? "text-emerald-200" : "text-red-200" },
    { label: "Tags", value: diagnostic.tags, Icon: Hash, className: "text-amber-200" },
    { label: "Title length", value: diagnostic.titleLength, Icon: Type, className: "text-sky-200" },
    { label: "Concept", value: diagnostic.conceptType, Icon: Paintbrush, className: "text-pink-200" },
    { label: "Timing", value: diagnostic.timing, Icon: Clock, className: "text-violet-200" },
    { label: positive ? "Repeat this" : "Suggested fix", value: diagnostic.suggestion, Icon: Lightbulb, className: positive ? "text-emerald-200" : "text-amber-200" },
  ];

  return (
    <PanelCardSoft className={cn(
      "p-4 transition-all duration-200 hover:-translate-y-0.5",
      positive ? "border-emerald-300/20" : "border-red-300/20",
    )}>
      <div className="flex gap-4">
        <a href={diagnostic.video.url} target="_blank" rel="noreferrer" className="group relative h-24 w-40 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/30 max-sm:h-20 max-sm:w-28">
          {diagnostic.video.thumbnailUrl ? (
            <img src={diagnostic.video.thumbnailUrl} alt="" className="h-full w-full object-cover opacity-90 transition-transform duration-500 group-hover:scale-105" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-white/[0.04]">
              <Play className="h-8 w-8 text-white/45" />
            </div>
          )}
          <span className="absolute right-2 top-2 rounded-full bg-black/55 p-1 text-white/70 opacity-0 transition-opacity group-hover:opacity-100">
            <ExternalLink className="h-3.5 w-3.5" />
          </span>
        </a>
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap gap-2">
            <span className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
              positive ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100" : "border-red-300/25 bg-red-400/10 text-red-100",
            )}>
              {positive ? "Repeat" : "Fix"}
            </span>
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">
              {formatNumber(diagnostic.video.viewCount)} views
            </span>
          </div>
          <a href={diagnostic.video.url} target="_blank" rel="noreferrer" className="line-clamp-2 text-base font-semibold leading-6 text-white transition-colors hover:text-white/80">
            {diagnostic.video.title}
          </a>
        </div>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {metricItems.map(({ label, value, Icon, className }) => (
          <div key={label} className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05]">
                <Icon className={cn("h-4 w-4", className)} />
              </span>
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/40">{label}</p>
            </div>
            <p className="text-sm leading-6 text-white/70">{value}</p>
          </div>
        ))}
      </div>
    </PanelCardSoft>
  );
}

function AnalysisLane({
  title,
  subtitle,
  Icon,
  diagnostics,
  tone,
}: {
  title: string;
  subtitle: string;
  Icon: LucideIcon;
  diagnostics: VideoDiagnostic[];
  tone: "positive" | "negative";
}) {
  const positive = tone === "positive";
  const [activeIndex, setActiveIndex] = useState(0);
  const active = diagnostics[Math.min(activeIndex, Math.max(0, diagnostics.length - 1))];
  function move(direction: -1 | 1) {
    if (!diagnostics.length) return;
    setActiveIndex((current) => (current + direction + diagnostics.length) % diagnostics.length);
  }
  return (
    <PanelCardSoft className={cn("space-y-4 p-5", positive ? "border-emerald-300/15" : "border-red-300/15")}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border",
            positive ? "border-emerald-300/20 bg-emerald-400/10" : "border-red-300/20 bg-red-400/10",
          )}>
            <Icon className={cn("h-5 w-5", positive ? "text-emerald-200" : "text-red-200")} />
          </span>
          <div>
            <h3 className="text-xl font-semibold text-white">{title}</h3>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-white/50">{subtitle}</p>
          </div>
        </div>
        <Badge className={cn(
          "rounded-full border px-3 py-1 text-xs hover:brightness-100",
          positive ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100" : "border-red-300/20 bg-red-400/10 text-red-100",
        )}>
          {diagnostics.length ? `${activeIndex + 1} of ${diagnostics.length}` : "0 videos"}
        </Badge>
      </div>
      {active ? (
        <div className="space-y-3">
          <VideoDiagnosticCard key={`${tone}-${active.video.id}`} diagnostic={active} tone={tone} />
          {diagnostics.length > 1 ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex gap-1.5">
                {diagnostics.map((diagnostic, index) => (
                  <button
                    key={`${tone}-dot-${diagnostic.video.id}`}
                    type="button"
                    aria-label={`Show video ${index + 1}`}
                    onClick={() => setActiveIndex(index)}
                    className={cn(
                      "h-2 rounded-full transition-all",
                      index === activeIndex ? (positive ? "w-6 bg-emerald-300" : "w-6 bg-red-300") : "w-2 bg-white/20 hover:bg-white/35",
                    )}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" className="h-9 rounded-lg px-3" onClick={() => move(-1)}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Button type="button" variant="secondary" className="h-9 rounded-lg px-3" onClick={() => move(1)}>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <PanelCardSoft className="border border-white/10 p-5 text-sm text-white/55">
          Sync more uploads to generate channel-specific evidence here.
        </PanelCardSoft>
      )}
    </PanelCardSoft>
  );
}

function CommandStat({
  label,
  value,
  caption,
  Icon,
}: {
  label: string;
  value: string;
  caption: string;
  Icon: LucideIcon;
}) {
  return (
    <PanelCardSoft className="flex items-center gap-3 p-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05]">
        <Icon className="h-4 w-4 text-white/55" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">{label}</p>
        <p className="mt-1 truncate text-sm font-semibold text-white">{value}</p>
        <p className="mt-0.5 truncate text-xs text-white/40">{caption}</p>
      </div>
    </PanelCardSoft>
  );
}

function CalendarPreviewCard({
  day,
  linked,
  onDragStart,
  onOpen,
  onDelete,
  onQuickPublish,
  onCreateThumbnail,
}: {
  day: PlanDay;
  linked?: boolean;
  onDragStart: (day: PlanDay) => void;
  onOpen: (day: PlanDay) => void;
  onDelete: (day: PlanDay) => void;
  onQuickPublish: (day: PlanDay) => void;
  onCreateThumbnail: (day: PlanDay) => void;
}) {
  const origin = ideaOriginMeta(day);
  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          draggable
          onDragStart={() => onDragStart(day)}
          onClick={() => onOpen(day)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") onOpen(day);
          }}
          className={cn("group relative w-full overflow-hidden rounded-2xl border text-left transition-all hover:-translate-y-1 hover:bg-white/[0.06]", origin.cardClassName)}
        >
          <div className={cn("h-2 bg-gradient-to-r", linked ? "from-emerald-300 to-emerald-500" : origin.accentClassName)} />
          {linked ? (
            <span className="absolute right-12 top-3 flex h-6 w-6 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-500/15 text-emerald-300">
              <Check className="h-3.5 w-3.5" />
            </span>
          ) : null}
          <Popover>
            <PopoverTrigger asChild>
              <span
                role="button"
                tabIndex={0}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
                className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-black/35 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
              >
                <MoreHorizontal className="h-4 w-4" />
              </span>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-40 border-white/10 bg-[#120d1f] p-1 text-white">
              <button type="button" onClick={(event) => { event.stopPropagation(); onOpen(day); }} className="w-full rounded-md px-3 py-2 text-left text-sm text-white/70 hover:bg-white/[0.06] hover:text-white">Open brief</button>
              <button type="button" onClick={(event) => { event.stopPropagation(); onDelete(day); }} className="w-full rounded-md px-3 py-2 text-left text-sm text-red-200 hover:bg-red-500/10 hover:text-red-100">Delete</button>
            </PopoverContent>
          </Popover>
          <div className="p-4">
            {day.generatedThumbnail?.imageDataUrl ? (
              <div className="mb-3 overflow-hidden rounded-xl border border-white/10 bg-black/20">
                <img src={day.generatedThumbnail.imageDataUrl} alt={`${day.contentIdea} thumbnail`} className="h-28 w-full object-cover" />
              </div>
            ) : null}
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">{formatIsoDate(day.date, { month: "short", day: "numeric" })}</p>
              </div>
              <span className={cn("rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]", origin.chipClassName)}>
                {origin.label}
              </span>
            </div>
            <IdeaPackageFields day={day} compact />
            <div className="mt-4 flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="flex-1 rounded-lg"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpen(day);
                }}
              >
                Open
              </Button>
              <Button
                type="button"
                size="sm"
                className="flex-1 rounded-lg bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
                onClick={(event) => {
                  event.stopPropagation();
                  onQuickPublish(day);
                }}
              >
                {linked ? "Linked" : "Publish"}
              </Button>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="mt-2 w-full rounded-lg"
              onClick={(event) => {
                event.stopPropagation();
                onCreateThumbnail(day);
              }}
            >
              <ImagePlus className="mr-2 h-4 w-4" />
              {day.generatedThumbnail?.imageDataUrl ? "Regenerate thumbnail" : "Create thumbnail"}
            </Button>
          </div>
        </div>
      </HoverCardTrigger>
      <HoverCardContent className="border-white/10 bg-[#120d1f] text-white">
        <p className="text-xs uppercase tracking-[0.16em] text-white/40">Hook</p>
        <p className="mt-2 text-sm leading-6 text-white/80">{day.hook}</p>
      </HoverCardContent>
    </HoverCard>
  );
}

function WeeklyComparisonChart({
  rows,
  weekdayRows,
}: {
  rows: WeeklyComparisonRow[];
  weekdayRows: WeeklyComparisonWeekdayRow[];
}) {
  const competitors = rows.filter((row): row is WeeklyComparisonCompetitorRow => !row.isYou);
  const uploadsConfig = {
    youUploads: { label: "You", color: "#34d399" },
    ...Object.fromEntries(competitors.map((competitor) => [`${competitor.key}Uploads`, { label: competitor.name, color: competitor.fill }])),
  };
  const viewsConfig = {
    youViews: { label: "You", color: "#34d399" },
    ...Object.fromEntries(competitors.map((competitor) => [`${competitor.key}Views`, { label: competitor.name, color: competitor.fill }])),
  };

  return (
    <div className="mt-4 grid gap-4 xl:grid-cols-2">
      <PanelCardSoft className="p-4">
        <h5 className="text-sm font-semibold text-white">Upload count by weekday</h5>
        <p className="mt-1 text-xs text-white/45">Comparing your uploads with every competitor that has live published-video data in the active window.</p>
        <div className="mt-4 h-56">
          <ChartContainer config={uploadsConfig} className="h-full w-full">
            <BarChart data={weekdayRows} margin={{ left: 6, right: 6, top: 12, bottom: 32 }}>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="day" tickLine={false} axisLine={false} interval={0} height={42} />
              <YAxis tickLine={false} axisLine={false} />
              <ChartTooltip
                content={({ active, payload }: TooltipProps<number, string>) => {
                  if (!active || !payload?.length) return null;
                  const point = payload[0]?.payload as WeeklyComparisonWeekdayRow;
                  return (
                    <div className="rounded-lg border border-white/10 bg-[#120d1f] px-3 py-2 text-xs text-white shadow-xl">
                      <p className="font-medium">{formatIsoDate(point.iso)}</p>
                      <p className="mt-1 text-white/65">You: {point.youUploads} upload{point.youUploads === 1 ? "" : "s"}</p>
                      {competitors.map((competitor) => {
                        const uploads = Number(point[`${competitor.key}Uploads`] ?? 0);
                        return (
                          <p key={`${competitor.key}-uploads-tooltip`} className="mt-1 text-white/65">
                            {competitor.name}: {uploads} upload{uploads === 1 ? "" : "s"}
                          </p>
                        );
                      })}
                    </div>
                  );
                }}
              />
              <Bar dataKey="youUploads" radius={[8, 8, 0, 0]} fill="#34d399" />
              {competitors.map((competitor) => (
                <Bar key={`${competitor.key}-uploads`} dataKey={`${competitor.key}Uploads`} radius={[8, 8, 0, 0]} fill={competitor.fill} />
              ))}
            </BarChart>
          </ChartContainer>
        </div>
      </PanelCardSoft>
      <PanelCardSoft className="p-4">
        <h5 className="text-sm font-semibold text-white">Views by weekday</h5>
        <p className="mt-1 text-xs text-white/45">Current scheduled week view totals, sourced from published videos in this window.</p>
        <div className="mt-4 h-56">
          <ChartContainer config={viewsConfig} className="h-full w-full">
            <BarChart data={weekdayRows} margin={{ left: 6, right: 6, top: 12, bottom: 32 }}>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="day" tickLine={false} axisLine={false} interval={0} height={42} />
              <YAxis tickLine={false} axisLine={false} />
              <ChartTooltip
                content={({ active, payload }: TooltipProps<number, string>) => {
                  if (!active || !payload?.length) return null;
                  const point = payload[0]?.payload as WeeklyComparisonWeekdayRow;
                  return (
                    <div className="rounded-lg border border-white/10 bg-[#120d1f] px-3 py-2 text-xs text-white shadow-xl">
                      <p className="font-medium">{formatIsoDate(point.iso)}</p>
                      <p className="mt-1 text-white/65">You: {formatNumber(point.youViews)} views</p>
                      {competitors.map((competitor) => (
                        <p key={`${competitor.key}-views-tooltip`} className="mt-1 text-white/65">
                          {competitor.name}: {formatNumber(point[`${competitor.key}Views`])} views
                        </p>
                      ))}
                    </div>
                  );
                }}
              />
              <Bar dataKey="youViews" radius={[8, 8, 0, 0]} fill="#34d399" />
              {competitors.map((competitor) => (
                <Bar key={`${competitor.key}-views`} dataKey={`${competitor.key}Views`} radius={[8, 8, 0, 0]} fill={competitor.fill} />
              ))}
            </BarChart>
          </ChartContainer>
        </div>
      </PanelCardSoft>
    </div>
  );
}

function CurrentWeekConsistencyChart({ rows }: { rows: Array<{ iso: string; day: string; postedCount: number; plannedCount: number; missed: boolean; status: "posted" | "missed" | "planned" | "empty" }> }) {
  const summary = {
    published: rows.filter((row) => row.status === "posted").length,
    planned: rows.filter((row) => row.status === "planned").length,
    missed: rows.filter((row) => row.status === "missed").length,
    uploads: rows.reduce((sum, row) => sum + row.postedCount, 0),
    open: rows.filter((row) => row.status === "empty").length,
  };
  return (
    <div className="mt-5 space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Published Days", value: summary.published, caption: `${summary.uploads} upload${summary.uploads === 1 ? "" : "s"} landed this week`, tone: "border-emerald-300/20 bg-emerald-400/10 text-emerald-100" },
          { label: "Still Planned", value: summary.planned, caption: "Scheduled days still on track", tone: "border-sky-300/20 bg-sky-400/10 text-sky-100" },
          { label: "Missed", value: summary.missed, caption: "Scheduled days with no live upload", tone: "border-red-300/20 bg-red-400/10 text-red-100" },
          { label: "Open Days", value: summary.open, caption: "No schedule and no upload yet", tone: "border-white/10 bg-white/[0.04] text-white/75" },
        ].map((item) => (
          <PanelCardSoft key={item.label} className={cn("border p-4", item.tone)}>
            <p className="text-[11px] uppercase tracking-[0.16em] opacity-70">{item.label}</p>
            <p className="mt-2 text-2xl font-semibold">{item.value}</p>
            <p className="mt-1 text-xs opacity-75">{item.caption}</p>
          </PanelCardSoft>
        ))}
      </div>
      <PanelCardSoft className="overflow-hidden p-0">
        <div className="border-b border-white/10 px-4 py-3">
          <h5 className="text-sm font-semibold text-white">Current week consistency</h5>
          <p className="mt-1 text-xs text-white/45">Any day with a real uploaded video turns green automatically, whether it was scheduled or not.</p>
        </div>
        <div className="grid gap-px bg-white/10 md:grid-cols-7">
          {rows.map((day) => (
            <div
              key={day.iso}
              className={cn(
                "min-h-[132px] bg-[#120d1f] p-4 transition-all",
                day.status === "posted" && "bg-emerald-500/10",
                day.status === "missed" && "bg-red-500/10",
                day.status === "planned" && "bg-sky-500/10",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-white">{day.day}</p>
                  <p className="mt-1 text-[11px] text-white/45">{formatIsoDate(day.iso, { month: "short", day: "numeric" })}</p>
                </div>
                <span className={cn(
                  "rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
                  day.status === "posted" && "border-emerald-300/25 bg-emerald-400/15 text-emerald-100",
                  day.status === "missed" && "border-red-300/25 bg-red-400/15 text-red-100",
                  day.status === "planned" && "border-sky-300/25 bg-sky-400/15 text-sky-100",
                  day.status === "empty" && "border-white/10 bg-white/[0.04] text-white/50",
                )}>
                  {day.status === "posted" ? "Live" : day.status === "missed" ? "Missed" : day.status === "planned" ? "Planned" : "Open"}
                </span>
              </div>
              <div className="mt-5">
                <p className="text-3xl font-semibold text-white">{day.postedCount > 0 ? day.postedCount : day.plannedCount > 0 ? day.plannedCount : 0}</p>
                <p className="mt-1 text-xs text-white/55">
                  {day.postedCount > 0
                    ? `${day.postedCount} uploaded video${day.postedCount === 1 ? "" : "s"}`
                    : day.status === "planned"
                      ? "Scheduled and waiting"
                      : day.status === "missed"
                        ? "Scheduled but not published"
                        : "Nothing booked yet"}
                </p>
              </div>
            </div>
          ))}
        </div>
      </PanelCardSoft>
    </div>
  );
}

function PlannerIdeaCard({ day, onDragStart, onDelete, onOpen, onCreateThumbnail }: { day: PlanDay; onDragStart: (day: PlanDay) => void; onDelete: (day: PlanDay) => void; onOpen: (day: PlanDay) => void; onCreateThumbnail: (day: PlanDay) => void }) {
  const origin = ideaOriginMeta(day);
  return (
    <div
      draggable
      onDragStart={() => onDragStart(day)}
      className={cn("relative rounded-lg border p-3 pr-10 transition-all hover:-translate-y-0.5 hover:bg-white/[0.07]", origin.cardClassName)}
    >
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg text-white/45 hover:bg-white/10 hover:text-white">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-40 border-white/10 bg-[#120d1f] p-1 text-white">
          <button type="button" onClick={() => onOpen(day)} className="w-full rounded-md px-3 py-2 text-left text-sm text-white/70 hover:bg-white/[0.06] hover:text-white">Open brief</button>
          <button type="button" onClick={() => onDelete(day)} className="w-full rounded-md px-3 py-2 text-left text-sm text-red-200 hover:bg-red-500/10 hover:text-red-100">Delete</button>
        </PopoverContent>
      </Popover>
      <div className="flex items-start gap-2">
        <GripVertical className="mt-1 h-4 w-4 shrink-0 text-white/25" />
        <div className="min-w-0">
          {day.generatedThumbnail?.imageDataUrl ? (
            <div className="mb-3 overflow-hidden rounded-xl border border-white/10 bg-black/20">
              <img src={day.generatedThumbnail.imageDataUrl} alt={`${day.contentIdea} thumbnail`} className="h-24 w-full object-cover" />
            </div>
          ) : null}
          <span className={cn("inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]", origin.chipClassName)}>
            {origin.label}
          </span>
          <IdeaPackageFields day={day} compact />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="mt-3 rounded-lg"
            onClick={() => onCreateThumbnail(day)}
          >
            <ImagePlus className="mr-2 h-4 w-4" />
            {day.generatedThumbnail?.imageDataUrl ? "Regenerate thumbnail" : "Create thumbnail"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function InsightFallbackChart({ data }: { data?: Array<Record<string, string | number>> }) {
  const items = (data ?? []).slice(0, 5);
  if (!items.length) return <p className="mt-4 text-xs text-white/35">No chartable data was returned for this insight.</p>;
  const max = Math.max(...items.map((item) => parseNumber(item.value)), 1);
  return (
    <div className="mt-4 space-y-2">
      {items.map((item, index) => (
        <div key={`${item.label}-${index}`} className="space-y-1">
          <div className="flex items-center justify-between text-xs text-white/45">
            <span>{String(item.label)}</span>
            <span>{formatNumber(item.value as number)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/8">
            <div className="h-full rounded-full bg-red-300" style={{ width: `${Math.max(8, (parseNumber(item.value) / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function BestTimeHeatmap({ cells }: { cells?: Array<{ day: string; hour: string; value: number; label: string }> }) {
  if (!cells?.length) return <p className="mt-4 text-xs text-white/35">Need more uploads across different publish windows to draw a reliable heatmap.</p>;
  const max = Math.max(...cells.map((cell) => cell.value), 1);
  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-white/10">
      <div className="grid grid-cols-[64px_repeat(4,minmax(0,1fr))] bg-white/[0.03] text-[11px] text-white/45">
        <div className="px-3 py-2 text-left">Day</div>
        {hourBuckets.map((bucket) => <div key={bucket.label} className="px-3 py-2 text-center">{`${bucket.label}-${String(bucket.end).padStart(2, "0")}:00`}</div>)}
      </div>
      {daysOfWeek.map((day) => (
        <div key={day} className="grid grid-cols-[64px_repeat(4,minmax(0,1fr))] border-t border-white/10">
          <div className="px-3 py-3 text-[11px] text-white/45">{day}</div>
          {hourBuckets.map((bucket) => {
            const cell = cells.find((item) => item.day === day && item.hour === bucket.label);
            const intensity = cell ? Math.max(0.08, cell.value / max) : 0;
            return (
              <div
                key={`${day}-${bucket.label}`}
                title={cell?.label}
                className="flex min-h-12 items-center justify-center border-l border-white/10 text-[11px] text-white/80"
                style={{ backgroundColor: `rgba(248, 113, 113, ${intensity})` }}
              >
                {cell?.value ? formatNumber(cell.value) : "No data"}
              </div>
            );
          })}
        </div>
      ))}
      <div className="flex items-center justify-between gap-3 border-t border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-white/45">
        <span>Lower view density</span>
        <div className="flex items-center gap-1">
          {[0.2, 0.45, 0.7, 1].map((opacity) => <span key={opacity} className="h-3 w-6 rounded-sm" style={{ backgroundColor: `rgba(248, 113, 113, ${opacity})` }} />)}
        </div>
        <span>Higher view density</span>
      </div>
    </div>
  );
}

function weekRating(posted: number, missed: number, scheduled: number) {
  if (scheduled === 0) return { label: "No schedule", className: "border-white/10 bg-white/[0.04] text-white/45" };
  if (missed === 0 && posted >= scheduled) return { label: "Excellent", className: "border-emerald-300/25 bg-emerald-400/10 text-emerald-100" };
  if (posted / scheduled >= 0.7) return { label: "Good", className: "border-sky-300/25 bg-sky-400/10 text-sky-100" };
  if (posted > 0) return { label: "Needs focus", className: "border-amber-300/25 bg-amber-400/10 text-amber-100" };
  return { label: "Missed", className: "border-red-300/25 bg-red-400/10 text-red-100" };
}

function PostingPatternStrip({
  days,
  plannedDates,
}: {
  days: PostingPatternDay[];
  plannedDates: Set<string>;
}) {
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const postedByIso = new Map(days.filter((day) => day.posted).map((day) => [day.iso, day]));
  const start = addUtcDays(startOfWeek(today), -21);
  const weeks = Array.from({ length: 4 }).map((_, weekIndex) => {
    const weekStart = addUtcDays(start, weekIndex * 7);
    const weekDays = Array.from({ length: 7 }).map((_, dayIndex) => {
      const date = addUtcDays(weekStart, dayIndex);
      const iso = toIsoDate(date);
      const posted = postedByIso.has(iso);
      const scheduled = plannedDates.has(iso);
      const isPast = iso < todayIso;
      return {
        iso,
        label: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        dayNumber: date.toLocaleDateString(undefined, { day: "numeric" }),
        weekday: date.toLocaleDateString(undefined, { weekday: "short" }),
        posted,
        scheduled,
        missed: scheduled && isPast && !posted,
        future: iso >= todayIso,
        videoTitle: postedByIso.get(iso)?.videoTitle,
      };
    });
    const scheduled = weekDays.filter((day) => day.scheduled).length;
    const posted = weekDays.filter((day) => day.posted).length;
    const missed = weekDays.filter((day) => day.missed).length;
    return { weekIndex, weekStart, weekDays, scheduled, posted, missed, rating: weekRating(posted, missed, scheduled) };
  });
  const rangeStart = weeks[0]?.weekDays[0]?.iso;
  const rangeEnd = weeks[weeks.length - 1]?.weekDays[6]?.iso;
  return (
    <TooltipProvider>
      <div className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-white/60">Four-week consistency view. Green means published, red means scheduled but missed, grey means no post was scheduled.</p>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/50">
            {rangeStart && rangeEnd ? `${formatIsoDate(rangeStart)} to ${formatIsoDate(rangeEnd)}` : "Month range"}
          </span>
        </div>
        <div className="mt-4 grid gap-3 xl:grid-cols-4">
          {weeks.map((week) => (
            <PanelCardSoft key={`consistency-week-${week.weekIndex}`} className="p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">Week {week.weekIndex + 1}</p>
                  <p className="mt-1 text-xs text-white/40">{formatIsoDate(week.weekDays[0]?.iso)} to {formatIsoDate(week.weekDays[6]?.iso)}</p>
                </div>
                <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]", week.rating.className)}>
                  {week.rating.label}
                </span>
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {week.weekDays.map((day) => (
                  <Tooltip key={day.iso}>
                    <TooltipTrigger asChild>
                      <div className="space-y-1">
                        <div className={cn(
                          "flex h-11 flex-col items-center justify-center rounded-lg border text-xs font-semibold",
                          day.posted && "border-emerald-300/35 bg-emerald-400/80 text-emerald-950",
                          day.missed && "border-red-300/35 bg-red-400/80 text-red-950",
                          !day.posted && !day.missed && day.scheduled && "border-sky-300/25 bg-sky-400/15 text-sky-100",
                          !day.posted && !day.missed && !day.scheduled && "border-white/10 bg-white/[0.05] text-white/35",
                        )}>
                          <span className="text-[9px] uppercase opacity-70">{day.weekday.slice(0, 1)}</span>
                          {day.dayNumber}
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-56 border border-white/10 bg-[#120d1f] text-white">
                      <p>{formatIsoDate(day.iso)}</p>
                      <p className="mt-1 text-white/70">{day.posted ? "Published" : day.missed ? "Scheduled but missed" : day.scheduled ? "Scheduled" : "Not scheduled"}</p>
                      {day.videoTitle ? <p className="mt-1 text-white/70">{day.videoTitle}</p> : null}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-2">
                  <p className="font-semibold text-white">{week.scheduled}</p>
                  <p className="mt-0.5 text-white/35">Scheduled</p>
                </div>
                <div className="rounded-lg border border-emerald-300/15 bg-emerald-400/10 px-2 py-2">
                  <p className="font-semibold text-emerald-100">{week.posted}</p>
                  <p className="mt-0.5 text-emerald-100/55">Posted</p>
                </div>
                <div className="rounded-lg border border-red-300/15 bg-red-400/10 px-2 py-2">
                  <p className="font-semibold text-red-100">{week.missed}</p>
                  <p className="mt-0.5 text-red-100/55">Missed</p>
                </div>
              </div>
            </PanelCardSoft>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-3 text-xs text-white/45">
          <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-emerald-400" />Published</span>
          <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-red-400" />Scheduled but missed</span>
          <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-sky-400/30" />Scheduled</span>
          <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-white/15" />Not scheduled</span>
        </div>
      </div>
    </TooltipProvider>
  );
}
function HookComparisonChart({ rows }: { rows: Array<{ type: string; averageViews: number; count: number; sample?: string }> }) {
  const max = Math.max(...rows.map((row) => row.averageViews), 1);
  return (
    <div className="mt-4 space-y-3">
      {rows.map((row) => (
        <div key={row.type}>
          <div className="flex items-center justify-between gap-3 text-sm">
            <div>
              <p className="text-white">{row.type}</p>
              <p className="text-xs text-white/40">{row.count} video{row.count === 1 ? "" : "s"}{row.sample ? ` · e.g. ${row.sample}` : ""}</p>
            </div>
            <span className="text-sm text-white/70">{formatNumber(row.averageViews)} avg views</span>
          </div>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full bg-red-400" style={{ width: `${Math.max(8, (row.averageViews / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function TitleLengthBarChart({ buckets, winnerLabel }: { buckets: TitleLengthBucket[]; winnerLabel?: string }) {
  const max = Math.max(...buckets.map((bucket) => bucket.averageViews), 1);
  const chartData = buckets.map((bucket) => ({ name: bucket.label.replace(" chars", ""), views: bucket.averageViews, fill: bucket.label === winnerLabel ? "#34d399" : "#fca5a5" }));
  return (
    <div className="mt-4 h-72">
      <ChartContainer config={{ views: { label: "Average views", color: "#fca5a5" } }} className="h-full w-full">
        <BarChart data={chartData} margin={{ left: 6, right: 6, top: 12, bottom: 28 }}>
          <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.08)" />
          <XAxis dataKey="name" tickLine={false} axisLine={false} interval={0} angle={-18} textAnchor="end" height={64} />
          <YAxis tickLine={false} axisLine={false} />
          <ChartTooltip
            content={({ active, payload }: TooltipProps<number, string>) => {
              if (!active || !payload?.length) return null;
              const point = payload[0]?.payload as { name?: string; views?: number };
              return (
                <div className="rounded-lg border border-white/10 bg-[#120d1f] px-3 py-2 text-xs text-white shadow-xl">
                  <p className="font-medium">{point.name}</p>
                  <p className="mt-1 text-white/65">{formatNumber(point.views)} average views</p>
                </div>
              );
            }}
          />
          <Bar dataKey="views" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ChartContainer>
    </div>
  );
}

function InsightChart({ insight }: { insight: EnrichedInsight }) {
  if (insight.visual.kind === "heatmap") return <BestTimeHeatmap cells={insight.visual.heatmap} />;

  if (insight.visual.kind === "tag-cloud") {
    const tags = insight.visual.tags ?? [];
    if (!tags.length) return <p className="mt-4 text-xs text-white/35">No overlapping tag data from channel uploads and trend pulls yet.</p>;
    const maxScore = Math.max(...tags.map((tag) => tag.score), 1);
    return (
      <div className="mt-4 flex flex-wrap gap-2">
        {tags.map((tag) => (
          <Popover key={tag.tag}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="rounded-lg border border-amber-300/15 bg-amber-400/10 px-3 py-1.5 text-left text-white transition-transform hover:-translate-y-0.5"
                style={{ fontSize: `${12 + ((tag.score / maxScore) * 6)}px` }}
              >
                #{tag.tag}
              </button>
            </PopoverTrigger>
            <PopoverContent className="border-white/10 bg-[#120d1f] text-white">
              <p className="font-medium">#{tag.tag}</p>
              <p className="mt-2 text-sm text-white/75">{tag.guidance}</p>
              <p className="mt-2 text-xs text-white/45">{tag.creatorUses} channel uses · {tag.trendUses} trend uses</p>
            </PopoverContent>
          </Popover>
        ))}
      </div>
    );
  }

  if (insight.visual.kind === "dual-line") {
    const data = insight.visual.points ?? [];
    if (!data.length) return <InsightFallbackChart data={insight.visual.points} />;
    return (
      <div className="mt-4 h-56">
        <ChartContainer
          config={{
            uploads: { label: "Uploads", color: "#fca5a5" },
            views: { label: "Views", color: "#34d399" },
          }}
          className="h-full w-full"
        >
          <LineChart data={data}>
            <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey="week" tickLine={false} axisLine={false} />
            <YAxis yAxisId="left" hide />
            <YAxis yAxisId="right" hide orientation="right" />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line yAxisId="left" type="monotone" dataKey="uploads" stroke="var(--color-uploads)" strokeWidth={3} dot={false} />
            <Line yAxisId="right" type="monotone" dataKey="views" stroke="var(--color-views)" strokeWidth={3} dot={false} />
          </LineChart>
        </ChartContainer>
      </div>
    );
  }

  if (insight.visual.kind === "scatter") {
    const data = insight.visual.points ?? [];
    if (!data.length) return <InsightFallbackChart data={insight.visual.points} />;
    return (
      <div className="mt-4 h-56">
        <ChartContainer config={{ views: { label: "Views", color: "#fca5a5" } }} className="h-full w-full">
          <ScatterChart margin={{ left: 8, right: 8, top: 12, bottom: 12 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.08)" />
            <XAxis type="number" dataKey="titleLength" tickLine={false} axisLine={false} name="Title length" />
            <YAxis type="number" dataKey="views" tickLine={false} axisLine={false} name="Views" />
            <ChartTooltip
              cursor={{ strokeDasharray: "4 4" }}
              content={({ active, payload }: TooltipProps<number, string>) => {
                if (!active || !payload?.length) return null;
                const point = payload[0]?.payload as { title?: string; titleLength?: number; views?: number };
                return (
                  <div className="rounded-lg border border-white/10 bg-[#120d1f] px-3 py-2 text-xs text-white shadow-xl">
                    <p className="max-w-48 font-medium text-white">{point.title}</p>
                    <p className="mt-1 text-white/65">{point.titleLength} chars · {formatNumber(point.views)} views</p>
                  </div>
                );
              }}
            />
            <Scatter data={data} fill="var(--color-views)" />
          </ScatterChart>
        </ChartContainer>
      </div>
    );
  }

  if (insight.visual.kind === "velocity") {
    const data = insight.visual.points ?? [];
    if (!data.length) return <InsightFallbackChart data={insight.visual.points} />;
    return (
      <div className="mt-4 h-56">
        <ChartContainer config={{ subscribersNet: { label: "Subscribers", color: "#34d399" } }} className="h-full w-full">
          <LineChart data={data}>
            <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis hide />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line type="monotone" dataKey="subscribersNet" stroke="var(--color-subscribersNet)" strokeWidth={3} dot={false} />
            {data.map((point, index) => parseNumber(point.subscribersNet) !== 0 ? (
              <ReferenceDot key={`${point.rawDate}-${index}`} x={point.date} y={point.subscribersNet} r={4} fill="#fca5a5" stroke="none" />
            ) : null)}
          </LineChart>
        </ChartContainer>
      </div>
    );
  }

  return <InsightFallbackChart data={insight.visual.points} />;
}

function PerformanceInsightCard({
  insight,
  compact = false,
}: {
  insight: EnrichedInsight;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const Card = compact ? PanelCardSoft : PanelCardStrong;
  return (
    <Card className={cn("border border-white/10 p-5 transition-all hover:-translate-y-1 hover:bg-white/[0.05]", compact ? "bg-white/[0.03]" : "bg-white/[0.04]")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/35">{insightLabel(insight.type)}</p>
          <h3 className={cn("mt-2 font-semibold text-white", compact ? "text-lg" : "text-2xl")}>{insight.title}</h3>
        </div>
        <Badge className={`${confidenceClass(insight.confidence)} hover:brightness-100`}>{insight.confidence}</Badge>
      </div>
      <p className={cn("mt-3 leading-6 text-white/70", compact ? "text-sm" : "text-base")}>{insight.finding}</p>
      <InsightChart insight={insight} />
      {compact ? (
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <button type="button" className="mt-4 flex items-center gap-2 text-sm text-white/60 transition-colors hover:text-white">
              {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {open ? "Hide detail" : "Show detail"}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 pt-4 text-sm leading-6 text-white/60">
            {insight.evidence && <p><span className="text-white/80">Evidence:</span> {insight.evidence}</p>}
            {insight.action && <p><span className="text-emerald-200">Next move:</span> {insight.action}</p>}
            {insight.dataLimitations && <p className="text-amber-100/70">{insight.dataLimitations}</p>}
          </CollapsibleContent>
        </Collapsible>
      ) : (
        <div className="mt-4 space-y-2 text-sm leading-6 text-white/60">
          {insight.evidence && <p><span className="text-white/80">Evidence:</span> {insight.evidence}</p>}
          {insight.action && <p><span className="text-emerald-200">Next move:</span> {insight.action}</p>}
          {insight.dataLimitations && <p className="text-amber-100/70">{insight.dataLimitations}</p>}
        </div>
      )}
    </Card>
  );
}

export function getGrowthPlannerNotificationCounts() {
  return { today: 0, overdue: 0 };
}

export function getGrowthPlannerNotifications() {
  return [] as GrowthPlannerNotification[];
}

function GrowthPlannerComingSoon() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const features = ["Weekly content calendar tailored to your niche", "Platform-by-platform cadence and post mix", "Competitor inspiration and trend prompts", "Next-week refresh from posted results"];

  async function handleNotify(event: FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await jsonFetch("/api/growth-planner/notify", { method: "POST", body: JSON.stringify({ email: email.trim() }) });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PanelPage className="max-w-4xl py-8">
      <PanelCard className="p-6 md:p-8">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-start">
          <div className="max-w-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="panel-card-soft relative flex h-11 w-11 items-center justify-center">
                <CalendarDays className="h-5 w-5 text-pink-300" />
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-300 text-amber-950">
                  <Clock className="h-3 w-3" />
                </span>
              </div>
              <div>
                <PanelEyebrow>Coming soon</PanelEyebrow>
                <PanelTitle>YouTube Growth</PanelTitle>
              </div>
            </div>
            <PanelSubtitle className="mt-0">Build a niche-aware content system with weekly calendars, platform mix, competitor ideas, and next-step planning from your results.</PanelSubtitle>
            <div className="grid gap-3 sm:grid-cols-2">
              {features.map((feature) => (
                <PanelCardSoft key={feature} className="flex items-center gap-3 p-3 text-sm text-white/60">
                  <Check className="h-4 w-4 shrink-0 text-pink-300" />
                  {feature}
                </PanelCardSoft>
              ))}
            </div>
          </div>
          <div className="w-full md:w-[320px]">
            {submitted ? (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-300">
                <Check className="h-4 w-4" />
                We'll notify you when YouTube Growth launches.
              </div>
            ) : (
              <form onSubmit={handleNotify} className="space-y-3">
                <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="your@email.com" required disabled={loading} className="panel-input w-full px-4 py-3 disabled:opacity-50" />
                {error && <p className="text-xs text-red-400">{error}</p>}
                <Button type="submit" disabled={loading} className="w-full border-pink-400/35 bg-pink-500 text-white hover:bg-pink-400">
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}
                  {loading ? "Submitting..." : "Notify me"}
                </Button>
              </form>
            )}
          </div>
        </div>
      </PanelCard>
    </PanelPage>
  );
}

function LoadingState() {
  return (
    <PanelPage className="max-w-7xl space-y-8 py-8">
      <PanelHeader className="justify-between gap-6">
        <div className="space-y-3">
          <Skeleton className="h-6 w-40 bg-white/10" />
          <Skeleton className="h-12 w-[28rem] max-w-full bg-white/10" />
          <Skeleton className="h-5 w-[36rem] max-w-full bg-white/10" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-11 w-36 bg-white/10" />
          <Skeleton className="h-11 w-28 bg-white/10" />
        </div>
      </PanelHeader>
      <StatsSkeleton />
      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <PanelCard className="p-6">
          <Skeleton className="h-6 w-56 bg-white/10" />
          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-72 bg-white/10" />)}
          </div>
        </PanelCard>
        <PanelCard className="p-6">
          <Skeleton className="h-6 w-48 bg-white/10" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-24 bg-white/10" />)}
          </div>
        </PanelCard>
      </div>
      <PanelCard className="p-6">
        <Skeleton className="h-6 w-44 bg-white/10" />
        <div className="mt-5 grid gap-3 lg:grid-cols-7">
          {Array.from({ length: 7 }).map((_, index) => <Skeleton key={index} className="h-64 bg-white/10" />)}
        </div>
      </PanelCard>
    </PanelPage>
  );
}

export default function YouTubeGrowthPlannerV2Tab() {
  const { plan, loading: planLoading } = usePlan();
  const [status, setStatus] = useState<YoutubeStatus | null>(null);
  const [days, setDays] = useState<PlanDay[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("calendar");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultSelections, setResultSelections] = useState<Record<number, string>>({});
  const [detailDay, setDetailDay] = useState<PlanDay | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customIdea, setCustomIdea] = useState<CustomIdeaDraft>({ title: "", angle: "", date: "", description: "", tags: "", thumbnail: "" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [channelDetailsOpen, setChannelDetailsOpen] = useState(false);
  const [tagExpanded, setTagExpanded] = useState(false);
  const [savingResultDay, setSavingResultDay] = useState<number | null>(null);
  const [saveConfirmationDay, setSaveConfirmationDay] = useState<number | null>(null);
  const [linkingDay, setLinkingDay] = useState<number | null>(null);
  const [ideaActionDay, setIdeaActionDay] = useState<number | null>(null);
  const [movingDay, setMovingDay] = useState<PlanDay | null>(null);
  const [postingFrequencyInput, setPostingFrequencyInput] = useState("3");
  const [savingSettings, setSavingSettings] = useState(false);
  const [manualCompetitorUrl, setManualCompetitorUrl] = useState("");
  const [thumbnailDay, setThumbnailDay] = useState<PlanDay | null>(null);
  const [thumbnailTextPreference, setThumbnailTextPreference] = useState("");
  const [thumbnailSourceImages, setThumbnailSourceImages] = useState<ThumbnailSourceImage[]>([]);

  const latestPlan = status?.latestPlan ?? null;
  const planPayload = latestPlan?.plan ?? {};
  const recentVideos = status?.channel?.recentVideos ?? [];
  const contextSnapshot = latestPlan?.contextSnapshot;
  const analyticsPoints = status?.channelAnalytics?.daily ?? [];
  const linkedVideoIds = new Set((status?.latestResults ?? []).map((result) => result.videoId));
  const selectedVideoIds = new Set(Object.values(resultSelections).filter(Boolean));
  const ownSubscribers = parseNumber(status?.channel?.subscriberCount);
  const latestResults = status?.latestResults ?? [];
  const preferredPostsPerWeek = status?.settings?.preferredPostsPerWeek ?? 3;
  const needsPostingPreference = Boolean(status?.connected && status?.settings?.needsPostingPreference);

  useEffect(() => {
    setDays(hydrateVisiblePlanDays(latestPlan?.plan?.days ?? []));
  }, [latestPlan?.id]);

  useEffect(() => {
    setPostingFrequencyInput(String(preferredPostsPerWeek));
  }, [preferredPostsPerWeek]);

  async function loadStatus() {
    setLoading(true);
    setError(null);
    try {
      setStatus(await jsonFetch<YoutubeStatus>("/api/youtube/status"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load YouTube status");
    } finally {
      setLoading(false);
    }
  }

  async function savePostingSettings(value: number) {
    setSavingSettings(true);
    setError(null);
    try {
      const data = await jsonFetch<{ settings: YoutubeStatus["settings"] }>("/api/youtube/settings", {
        method: "POST",
        body: JSON.stringify({ preferredPostsPerWeek: value }),
      });
      setStatus((current) => current ? { ...current, settings: data.settings } : current);
      setSettingsOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save posting settings");
    } finally {
      setSavingSettings(false);
    }
  }

  useEffect(() => {
    if (planLoading) return;
    if (!plan.isStudio) {
      setLoading(false);
      return;
    }
    loadStatus();
    const params = new URLSearchParams(window.location.search);
    if (params.has("youtube") || params.has("error")) {
      params.delete("youtube");
      params.delete("error");
      params.delete("detail");
      const next = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname;
      window.history.replaceState({}, "", next);
    }
  }, [plan.isStudio, planLoading]);

  const calendarDays = useMemo(() => [...days].sort((a, b) => a.date.localeCompare(b.date) || a.day - b.day), [days]);
  const weekCalendarDates = useMemo(() => {
    if (!latestPlan?.startDate || !latestPlan?.endDate) return [];
    const start = new Date(`${latestPlan.startDate}T00:00:00Z`);
    const end = new Date(`${latestPlan.endDate}T00:00:00Z`);
    const values: string[] = [];
    for (let time = start.getTime(); time <= end.getTime(); time += 86400000) {
      values.push(new Date(time).toISOString().slice(0, 10));
    }
    return values;
  }, [latestPlan?.startDate, latestPlan?.endDate]);
  const daysByDate = useMemo(() => {
    const values = new Map<string, PlanDay[]>();
    for (const day of calendarDays) {
      values.set(day.date, [...(values.get(day.date) ?? []), day]);
    }
    return values;
  }, [calendarDays]);
  const plannedDateSet = useMemo(() => new Set(calendarDays.map((day) => day.date)), [calendarDays]);
  const progressState = weekProgress(days, status?.latestResults ?? []);
  const overview = useMemo(() => buildOverviewSections(recentVideos), [recentVideos]);
  const bestTime = useMemo(() => deriveBestTimeSummary(contextSnapshot?.recentVideos ?? recentVideos), [contextSnapshot?.recentVideos, recentVideos]);
  const bestPostingSlotByDay = useMemo(() => deriveBestPostingSlotByDay(bestTime.cells), [bestTime.cells]);
  const hookRows = useMemo(() => deriveHookRows(recentVideos), [recentVideos]);
  const hookInsight = useMemo(() => deriveHookInsight(recentVideos), [recentVideos]);
  const titleLengthSummary = useMemo(() => deriveTitleLengthSummary(recentVideos), [recentVideos]);
  const subscriberGrowth = useMemo(() => deriveSubscriberGrowth(analyticsPoints, recentVideos), [analyticsPoints, recentVideos]);
  const tagPerformance = useMemo(() => deriveTagPerformance(recentVideos), [recentVideos]);
  const existingTags = useMemo(() => new Set(tagPerformance.map((item) => item.tag)), [tagPerformance]);
  const trendingTagSuggestions = useMemo(
    () => deriveTrendingTagSuggestions(planPayload.viralTags, contextSnapshot?.trends ?? [], existingTags),
    [planPayload.viralTags, contextSnapshot?.trends, existingTags],
  );
  const competitorRows = useMemo(() => deriveCompetitorRows(ownSubscribers, recentVideos, status?.competitors ?? []), [ownSubscribers, recentVideos, status?.competitors]);
  const recentVideoById = useMemo(() => new Map(recentVideos.map((video) => [video.id, video])), [recentVideos]);
  const resultsByDay = useMemo(() => new Map(latestResults.map((result) => [result.dayIndex, result])), [latestResults]);
  const topDiagnostics = useMemo(() => buildVideoDiagnostics(overview.whatWorkedVideos ?? [], recentVideos, titleLengthSummary, bestTime, "top"), [overview, recentVideos, titleLengthSummary, bestTime]);
  const underperformerDiagnostics = useMemo(() => buildVideoDiagnostics(overview.underperformerVideos ?? [], recentVideos, titleLengthSummary, bestTime, "bottom"), [overview, recentVideos, titleLengthSummary, bestTime]);
  const competitorTiers = useMemo(() => partitionCompetitors(ownSubscribers, competitorRows), [ownSubscribers, competitorRows]);
  const weeklyComparison = useMemo(() => deriveWeeklyComparisonData(competitorRows, latestPlan, recentVideos, status?.channel?.channelName), [competitorRows, latestPlan, recentVideos, status?.channel?.channelName]);
  const leaderboardHostTierKey = useMemo(() => {
    if (!weeklyComparison?.competitors.length) return null;
    if (competitorTiers.tier1.length) return "tier1";
    if (competitorTiers.tier2.length) return "tier2";
    if (competitorTiers.tier3.length) return "tier3";
    return null;
  }, [competitorTiers.tier1.length, competitorTiers.tier2.length, competitorTiers.tier3.length, weeklyComparison?.competitors.length]);
  const publishableVideos = useMemo(
    () => [...recentVideos].sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime()),
    [recentVideos],
  );
  const unlinkedWeekVideos = useMemo(
    () => publishableVideos.filter((video) => isVideoInPlanWindow(video, latestPlan) && !linkedVideoIds.has(video.id)),
    [publishableVideos, latestPlan, linkedVideoIds],
  );
  const todayIso = new Date().toISOString().slice(0, 10);
  const todayPlannedDays = useMemo(
    () => (daysByDate.get(todayIso) ?? []).filter((day) => effectivePlannerStage(day, resultsByDay, recentVideoById) !== "published"),
    [daysByDate, resultsByDay, recentVideoById, todayIso],
  );
  const currentWeekConsistency = useMemo(
    () => deriveCurrentWeekConsistencyData(weekCalendarDates, plannedDateSet, recentVideos),
    [weekCalendarDates, plannedDateSet, recentVideos],
  );
  const weeklyLeaderboardMessage = useMemo(
    () => weeklyComparison ? deriveFriendlyLeaderboardMessage(weeklyComparison) : null,
    [weeklyComparison],
  );

  useEffect(() => {
    setDays((current) => current.map((day) => {
      const linked = resultsByDay.get(day.day);
      const linkedVideo = linked ? recentVideoById.get(linked.videoId) : null;
      if (linked && isPublicVideo(linkedVideo) && day.stage !== "published") {
        return { ...day, stage: "published" };
      }
      return day;
    }));
  }, [resultsByDay, recentVideoById]);

  if (loading || planLoading) return <LoadingState />;
  if (!plan.isStudio) return <GrowthPlannerComingSoon />;

  function updateDay(cardId: string, patch: Partial<PlanDay>) {
    setDays((current) => current.map((day) => toCardId(day) === cardId ? { ...day, ...patch } : day));
  }

  function applyServerPlanUpdate(nextPlan: YoutubeWeeklyPlan, nextDay?: Partial<PlanDay> | null) {
    setStatus((current) => current ? { ...current, latestPlan: nextPlan } : current);
    setDays(hydrateVisiblePlanDays(nextPlan.plan.days ?? []));
    if (nextDay) {
      setDetailDay((current) => current && current.day === nextDay.day ? { ...current, ...nextDay } : current);
      setThumbnailDay((current) => current && current.day === nextDay.day ? { ...current, ...nextDay } : current);
    }
  }

  function openThumbnailDialog(day: PlanDay) {
    setThumbnailDay(day);
    setThumbnailTextPreference(day.generatedThumbnail?.requestedText || "");
    setThumbnailSourceImages([]);
  }

  function closeThumbnailDialog() {
    setThumbnailDay(null);
    setThumbnailTextPreference("");
    setThumbnailSourceImages([]);
  }

  async function deleteDay(day: PlanDay) {
    const confirmed = window.confirm(`Delete "${day.contentIdea}" from this plan?`);
    if (!confirmed) return;
    if (!latestPlan) {
      const cardId = toCardId(day);
      setDays((current) => current.filter((item) => toCardId(item) !== cardId));
      setDetailDay((current) => current && toCardId(current) === cardId ? null : current);
      return;
    }
    setError(null);
    try {
      const data = await jsonFetch<{ plan: YoutubeWeeklyPlan; day: PlanDay }>(`/api/youtube/plans/${latestPlan.id}/days/${day.day}`, {
        method: "DELETE",
      });
      applyServerPlanUpdate(data.plan);
      setDetailDay((current) => current?.day === day.day ? null : current);
      setMovingDay((current) => current?.day === day.day ? null : current);
      setResultSelections((current) => {
        const next = { ...current };
        delete next[day.day];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete idea");
    }
  }

  function handleDragStart(day: PlanDay) {
    window.sessionStorage.setItem("daytabs-dragged-youtube-day", toCardId(day));
  }

  function handleDropOnDate(date: string) {
    const cardId = window.sessionStorage.getItem("daytabs-dragged-youtube-day");
    const day = days.find((item) => toCardId(item) === cardId);
    if (cardId && day) void moveIdeaToDate(day, date);
  }

  function handleDropOnStage(stage: Stage) {
    const cardId = window.sessionStorage.getItem("daytabs-dragged-youtube-day");
    const day = days.find((item) => toCardId(item) === cardId);
    if (!cardId || !day) return;
    if (stage === "published") {
      const linked = resultsByDay.get(day.day);
      const linkedVideo = linked ? recentVideoById.get(linked.videoId) : null;
      if (linked && isPublicVideo(linkedVideo)) {
        updateDay(cardId, { stage: "published" });
        if (latestPlan) {
          void patchPlanDay(day.day, { stage: "published" });
        }
        return;
      }
      setDetailDay(day);
      setLinkingDay(day.day);
      return;
    }
    if (latestPlan) {
      void patchPlanDay(day.day, { stage });
    } else {
      updateDay(cardId, { stage });
    }
  }

  async function connectYoutube() {
    setWorking("connect");
    setError(null);
    try {
      const data = await jsonFetch<{ url: string }>("/api/youtube/connect-url");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start YouTube connection");
      setWorking(null);
    }
  }

  async function syncChannel() {
    setWorking("sync");
    setError(null);
    try {
      await jsonFetch("/api/youtube/sync", { method: "POST", body: "{}" });
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sync YouTube channel");
    } finally {
      setWorking(null);
    }
  }

  async function generatePlan() {
    setWorking("plan");
    setError(null);
    try {
      await jsonFetch("/api/youtube/plans/generate", { method: "POST", body: "{}" });
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate YouTube plan");
    } finally {
      setWorking(null);
    }
  }

  async function discoverCompetitorsOnly() {
    setWorking("competitors");
    setError(null);
    try {
      await jsonFetch("/api/youtube/competitors/discover", { method: "POST", body: "{}" });
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not discover competitors");
    } finally {
      setWorking(null);
    }
  }

  async function addCompetitorFromUrl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const channelUrl = manualCompetitorUrl.trim();
    if (!channelUrl) return;
    setWorking("competitor-add");
    setError(null);
    try {
      await jsonFetch<{ competitor: YoutubeCompetitor }>("/api/youtube/competitors", {
        method: "POST",
        body: JSON.stringify({ channelUrl }),
      });
      setManualCompetitorUrl("");
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add competitor");
    } finally {
      setWorking(null);
    }
  }

  async function removeCompetitor(competitorId: number) {
    setWorking(`competitor-remove:${competitorId}`);
    setError(null);
    try {
      await jsonFetch(`/api/youtube/competitors/${competitorId}`, {
        method: "DELETE",
      });
      setStatus((current) => current ? {
        ...current,
        competitors: (current.competitors ?? []).filter((competitor) => competitor.id !== competitorId),
      } : current);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove competitor");
    } finally {
      setWorking(null);
    }
  }

  async function handleThumbnailSourceFiles(files: FileList | null) {
    const nextFiles = Array.from(files ?? []).filter((file) => file.type.startsWith("image/")).slice(0, 4);
    if (!nextFiles.length) return;
    setError(null);
    try {
      const processed = await Promise.all(nextFiles.map(async (file) => ({
        name: file.name,
        dataUrl: await resizeImageFileToDataUrl(file),
      })));
      setThumbnailSourceImages((current) => [...current, ...processed].slice(0, 4));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read source images");
    }
  }

  async function generateThumbnailForDay() {
    if (!latestPlan || !thumbnailDay) return;
    setWorking("thumbnail");
    setError(null);
    try {
      const data = await jsonFetch<{ plan: YoutubeWeeklyPlan; day: PlanDay }>(`/api/youtube/plans/${latestPlan.id}/days/${thumbnailDay.day}/thumbnail`, {
        method: "POST",
        body: JSON.stringify({
          textPreference: thumbnailTextPreference.trim() || null,
          sourceImages: thumbnailSourceImages.map((image) => image.dataUrl),
        }),
      });
      applyServerPlanUpdate(data.plan, data.day);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate thumbnail");
    } finally {
      setWorking(null);
    }
  }

  async function submitResults(items?: Array<{ dayIndex: number; plannedTitle: string; videoId: string }>) {
    if (!latestPlan) return;
    const results = items ?? days
      .map((day) => ({ dayIndex: day.day, plannedTitle: day.contentIdea, videoId: resultSelections[day.day] }))
      .filter((item): item is { dayIndex: number; plannedTitle: string; videoId: string } => Boolean(item.videoId));
    if (!results.length) {
      setError("Choose at least one YouTube video before submitting results.");
      return;
    }
    if (new Set(results.map((item) => item.videoId)).size !== results.length) {
      setError("One YouTube video cannot be linked to more than one content idea.");
      return;
    }
    setError(null);
    const activeDay = results[0]?.dayIndex ?? null;
    setSavingResultDay(activeDay);
    try {
      const data = await jsonFetch<{ results: YoutubePlanResult[] }>(`/api/youtube/plans/${latestPlan.id}/results`, { method: "POST", body: JSON.stringify({ results }) });
      setStatus((current) => current ? {
        ...current,
        latestResults: [
          ...(current.latestResults ?? []).filter((row) => !data.results.some((saved) => saved.dayIndex === row.dayIndex)),
          ...data.results,
        ].sort((a, b) => a.dayIndex - b.dayIndex),
      } : current);
      setSaveConfirmationDay(activeDay);
      if (activeDay != null) {
        window.setTimeout(() => setSaveConfirmationDay((current) => current === activeDay ? null : current), 1800);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not collect YouTube results");
    } finally {
      setSavingResultDay(null);
    }
  }

  async function improveCustomIdea() {
    setWorking("improve");
    setError(null);
    try {
      const data = await jsonFetch<{ idea: Partial<PlanDay> }>("/api/youtube/ideas/improve", {
        method: "POST",
        body: JSON.stringify({ idea: customIdea }),
      });
      setCustomIdea((current) => ({
        ...current,
        title: data.idea.contentIdea || current.title,
        angle: [data.idea.hook, ...(data.idea.outline ?? []), data.idea.rationale].filter(Boolean).join("\n"),
        description: data.idea.descriptionSuggestion || current.description,
        tags: (data.idea.tags ?? []).join(", ") || current.tags,
        thumbnail: data.idea.thumbnailConcept || current.thumbnail,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not improve idea");
    } finally {
      setWorking(null);
    }
  }

  function openCustomIdeaForDate(date: string) {
    setCustomIdea((current) => ({ ...current, date }));
    setCustomOpen(true);
  }

  async function addCustomIdea() {
    const title = customIdea.title.trim();
    if (!title) return;
    const nextDay = Math.max(0, ...days.map((day) => day.day)) + 1;
    const date = customIdea.date || days[days.length - 1]?.date || new Date().toISOString().slice(0, 10);
    const ideaLines = customIdea.angle.split("\n").map((line) => line.trim()).filter(Boolean);
    const newDay: PlanDay = {
      id: `custom-${crypto.randomUUID()}`,
      day: nextDay,
      date,
      stage: "idea",
      ideaOrigin: "manual",
      aiFeedback: null,
      contentIdea: title,
      hook: ideaLines[0] || title,
      outline: ideaLines.slice(1, 5),
      bestPostingTime: "",
      rationale: customIdea.angle.trim(),
      tags: customIdea.tags.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 10),
      soundSuggestion: "",
      competitorReference: "",
      descriptionSuggestion: customIdea.description.trim(),
      thumbnailConcept: customIdea.thumbnail.trim(),
      isDeleted: false,
      deletedAt: null,
    };
    if (latestPlan) {
      try {
        const data = await jsonFetch<{ plan: YoutubeWeeklyPlan; day: PlanDay }>(`/api/youtube/plans/${latestPlan.id}/days`, {
          method: "POST",
          body: JSON.stringify({ day: newDay }),
        });
        applyServerPlanUpdate(data.plan, data.day);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save custom idea");
        return;
      }
    } else {
      setDays((current) => [...current, newDay]);
    }
    setCustomIdea({ title: "", angle: "", date: "", description: "", tags: "", thumbnail: "" });
    setCustomOpen(false);
  }

  async function patchPlanDay(dayIndex: number, patch: Partial<PlanDay>) {
    if (!latestPlan) return;
    const data = await jsonFetch<{ plan: YoutubeWeeklyPlan; day: PlanDay }>(`/api/youtube/plans/${latestPlan.id}/days/${dayIndex}`, {
      method: "PATCH",
      body: JSON.stringify({ patch }),
    });
    applyServerPlanUpdate(data.plan, data.day);
  }

  async function moveIdeaToDate(day: PlanDay, date: string) {
    if (latestPlan) {
      try {
        await patchPlanDay(day.day, { date });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not move idea");
        return;
      }
    } else {
      updateDay(toCardId(day), { date });
    }
    setMovingDay(null);
    setDetailDay((current) => current && current.day === day.day ? { ...current, date } : current);
  }

  async function linkVideoToPlannedDay(video: RecentVideo, day: PlanDay) {
    setResultSelections((current) => ({ ...current, [day.day]: video.id }));
    await submitResults([{ dayIndex: day.day, plannedTitle: day.contentIdea, videoId: video.id }]);
    if (latestPlan) {
      try {
        await patchPlanDay(day.day, { stage: "published" });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not update idea stage");
      }
    } else {
      updateDay(toCardId(day), { stage: "published" });
    }
  }

  async function addUploadedVideoAsIdea(video: RecentVideo) {
    const nextDay = Math.max(0, ...days.map((day) => day.day)) + 1;
    const date = video.publishedAt?.slice(0, 10) || (latestPlan?.startDate ?? new Date().toISOString().slice(0, 10));
    const newDay: PlanDay = {
      id: `upload-${video.id}`,
      day: nextDay,
      date,
      stage: "published",
      ideaOrigin: "manual",
      aiFeedback: null,
      contentIdea: video.title,
      hook: video.title,
      outline: [],
      bestPostingTime: "",
      rationale: "Created from a real uploaded video that did not match an existing planned idea.",
      tags: video.tags ?? [],
      soundSuggestion: "",
      competitorReference: "",
      descriptionSuggestion: video.description ?? "",
      thumbnailConcept: "",
      isDeleted: false,
      deletedAt: null,
    };
    let persistedDay = newDay;
    if (latestPlan) {
      const data = await jsonFetch<{ plan: YoutubeWeeklyPlan; day: PlanDay }>(`/api/youtube/plans/${latestPlan.id}/days`, {
        method: "POST",
        body: JSON.stringify({ day: newDay }),
      });
      applyServerPlanUpdate(data.plan, data.day);
      persistedDay = data.day;
    } else {
      setDays((current) => [...current, newDay]);
    }
    setResultSelections((current) => ({ ...current, [persistedDay.day]: video.id }));
    await submitResults([{ dayIndex: persistedDay.day, plannedTitle: video.title, videoId: video.id }]);
  }

  async function saveIdeaFeedback(day: PlanDay, feedback: IdeaFeedback) {
    if (!latestPlan || !isAiIdea(day)) return;
    setIdeaActionDay(day.day);
    setError(null);
    try {
      const data = await jsonFetch<{ plan: YoutubeWeeklyPlan; day: PlanDay }>(`/api/youtube/plans/${latestPlan.id}/days/${day.day}/feedback`, {
        method: "POST",
        body: JSON.stringify({ feedback }),
      });
      applyServerPlanUpdate(data.plan, data.day);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save idea feedback");
    } finally {
      setIdeaActionDay(null);
    }
  }

  async function regenerateIdea(day: PlanDay) {
    if (!latestPlan || !isAiIdea(day)) return;
    setIdeaActionDay(day.day);
    setError(null);
    try {
      const data = await jsonFetch<{ plan: YoutubeWeeklyPlan; day: PlanDay }>(`/api/youtube/plans/${latestPlan.id}/days/${day.day}/regenerate`, {
        method: "POST",
        body: "{}",
      });
      applyServerPlanUpdate(data.plan, data.day);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate a new idea");
    } finally {
      setIdeaActionDay(null);
    }
  }

  const planCalendarSection = (
    <PanelCard id="this-week-plan" className="scroll-mt-24 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <CalendarDays className="h-5 w-5 text-red-300" />
            <h2 className="text-2xl font-semibold text-white">
              {latestPlan ? "This Week Plan" : "Weekly Plan"}
            </h2>
          </div>
          <p className="mt-2 text-sm text-white/45">{dateRangeLabel(latestPlan?.startDate, latestPlan?.endDate)}</p>
        </div>
        <div className="flex gap-2">
          <Button variant={viewMode === "calendar" ? "default" : "secondary"} className="rounded-lg" onClick={() => setViewMode("calendar")}><LayoutGrid className="mr-2 h-4 w-4" />Calendar</Button>
          <Button variant={viewMode === "planner" ? "default" : "secondary"} className="rounded-lg" onClick={() => setViewMode("planner")}><ListChecks className="mr-2 h-4 w-4" />Planner</Button>
        </div>
      </div>
      <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-center justify-between gap-3 text-sm text-white/70">
          <span>{progressState.planned} planned this week · {progressState.posted} published</span>
          <span>{progressState.progress}%</span>
        </div>
        <Progress value={progressState.progress} className="mt-3 bg-white/10 [&>div]:bg-red-400" />
      </div>
      {latestPlan?.plan?.summary && <p className="mt-4 text-sm text-white/55">{latestPlan.plan.summary}</p>}
      {viewMode === "calendar" ? (
        <div className="mt-5 overflow-x-auto pb-2">
          <div className="flex min-w-max gap-3">
          {weekCalendarDates.map((date) => {
            const dateDays = daysByDate.get(date) ?? [];
            const hasPublished = dateDays.some((day) => resultsByDay.has(day.day));
            const isToday = date === new Date().toISOString().slice(0, 10);
            return (
              <div key={date} onDragOver={(event) => event.preventDefault()} onDrop={() => handleDropOnDate(date)} className={cn("min-h-[260px] w-[290px] shrink-0 rounded-2xl border bg-white/[0.025] p-3 transition-all hover:bg-white/[0.04] xl:w-[calc((100vw-10rem)/4)] xl:max-w-[320px]", isToday ? "border-red-300/35" : "border-white/10")}>
                <div className="mb-3 flex items-start justify-between gap-2 rounded-xl border border-white/10 bg-black/10 px-3 py-2">
                  <div>
                    <p className="text-sm font-semibold text-white">{dayName(date)}</p>
                    <p className="mt-1 text-xs text-white/35">{formatIsoDate(date, { month: "short", day: "numeric" })}</p>
                  </div>
                  {hasPublished ? <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-200">Published</span> : dateDays.length ? <span className="rounded-full border border-sky-400/25 bg-sky-500/10 px-2 py-1 text-[10px] font-medium text-sky-100">{dateDays.length} planned</span> : <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-medium text-white/35">Open</span>}
                </div>
                {dateDays.length ? (
                  <div className="space-y-3">
                    {dateDays.map((day) => (
                      <CalendarPreviewCard
                        key={toCardId(day)}
                        day={day}
                        linked={Boolean(resultsByDay.get(day.day))}
                        onDragStart={handleDragStart}
                        onOpen={setDetailDay}
                        onDelete={deleteDay}
                        onCreateThumbnail={openThumbnailDialog}
                        onQuickPublish={(targetDay) => {
                          setDetailDay(targetDay);
                          setLinkingDay(targetDay.day);
                        }}
                      />
                    ))}
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full rounded-xl border-dashed text-white/55 hover:text-white"
                      onClick={() => openCustomIdeaForDate(date)}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => openCustomIdeaForDate(date)}
                    className="flex h-[180px] w-full flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/10 text-center text-sm text-white/30 transition-all hover:-translate-y-0.5 hover:border-red-300/30 hover:bg-red-500/10 hover:text-white"
                  >
                    <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.05]">
                      <Plus className="h-5 w-5" />
                    </span>
                    Add idea
                  </button>
                )}
              </div>
            );
          })}
          {!days.length && <div className="w-full rounded-lg border border-white/10 p-8 text-center text-sm text-white/45">Generate a plan to create exactly {preferredPostsPerWeek} YouTube ideas grounded in your channel data and strongest posting windows.</div>}
          </div>
        </div>
      ) : (
        <div className="mt-5 grid gap-3 lg:grid-cols-5">
          {stages.map((stage) => (
            <div key={stage.id} onDragOver={(event) => event.preventDefault()} onDrop={() => handleDropOnStage(stage.id)} className="min-h-[260px] rounded-lg border border-white/10 bg-white/[0.025] p-3">
              <p className="mb-3 text-sm font-semibold text-white">{stage.label}</p>
              <div className="space-y-3">
                {days.filter((day) => effectivePlannerStage(day, resultsByDay, recentVideoById) === stage.id).map((day) => <PlannerIdeaCard key={toCardId(day)} day={day} onDragStart={handleDragStart} onDelete={deleteDay} onOpen={setDetailDay} onCreateThumbnail={openThumbnailDialog} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </PanelCard>
  );

  const consistencySection = (
    <PanelCard id="posting-consistency" className="p-6 transition-all hover:-translate-y-1 hover:bg-white/[0.04]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-300" />
            <h2 className="text-2xl font-semibold text-white">Consistency Tracker</h2>
          </div>
          <p className="mt-2 text-sm text-white/45">Four weeks of publishing behavior so you can see if growth is a consistency issue, a performance issue, or both.</p>
        </div>
        <Badge className={`${confidenceClass(recentVideos.length >= 4 ? "high" : "medium")} hover:brightness-100`}>{recentVideos.length >= 4 ? "high" : "medium"}</Badge>
      </div>
      <CurrentWeekConsistencyChart rows={currentWeekConsistency} />
    </PanelCard>
  );

  const uploadReviewSection = unlinkedWeekVideos.length ? (
    <PanelCard className="border-emerald-300/15 bg-[radial-gradient(circle_at_top_left,rgba(52,211,153,0.18),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-100/70">Action queue</p>
          <h3 className="mt-2 text-xl font-semibold text-white">Sort this week&apos;s unlinked uploads</h3>
          <p className="mt-1 max-w-3xl text-sm text-white/55">These videos are already live in the current schedule week, but they are not attached to an idea yet. Clearing this list keeps your plan accurate and makes the rest of the week easier to trust.</p>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-100">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {unlinkedWeekVideos.length} upload{unlinkedWeekVideos.length === 1 ? "" : "s"} waiting for review
          </div>
        </div>
        <Button variant="secondary" className="rounded-lg" onClick={() => void syncChannel()} disabled={working === "sync"}>
          {working === "sync" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
          Refresh uploads
        </Button>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {[
          { label: "Review uploads", value: unlinkedWeekVideos.length, caption: "Videos need a decision", tone: "border-white/10 bg-white/[0.04] text-white" },
          { label: "Link to plan", value: unlinkedWeekVideos.filter((video) => (daysByDate.get(video.publishedAt?.slice(0, 10) ?? "") ?? []).some((day) => !resultsByDay.has(day.day))).length, caption: "Can match an existing idea", tone: "border-emerald-300/20 bg-emerald-400/10 text-emerald-100" },
          { label: "Create new idea", value: unlinkedWeekVideos.filter((video) => !(daysByDate.get(video.publishedAt?.slice(0, 10) ?? "") ?? []).some((day) => !resultsByDay.has(day.day))).length, caption: "No plan card found yet", tone: "border-amber-300/20 bg-amber-400/10 text-amber-100" },
        ].map((item) => (
          <PanelCardSoft key={item.label} className={cn("border p-4", item.tone)}>
            <p className="text-[11px] uppercase tracking-[0.16em] opacity-70">{item.label}</p>
            <p className="mt-2 text-2xl font-semibold">{item.value}</p>
            <p className="mt-1 text-xs opacity-75">{item.caption}</p>
          </PanelCardSoft>
        ))}
      </div>
      <div className="mt-5 space-y-4">
        {unlinkedWeekVideos.map((video, index) => {
          const videoDate = video.publishedAt?.slice(0, 10) ?? "";
          const matchingIdeas = (daysByDate.get(videoDate) ?? []).filter((day) => !resultsByDay.has(day.day));
          return (
            <PanelCardSoft key={video.id} className="border border-white/10 p-4 transition-all hover:-translate-y-0.5 hover:bg-white/[0.05]">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/65">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-100">{index + 1}</span>
                  Review upload
                </div>
                <span className="text-xs text-white/45">{formatIsoDate(video.publishedAt)} · {formatNumber(video.viewCount)} views</span>
              </div>
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  {video.thumbnailUrl ? <img src={video.thumbnailUrl} alt="" className="h-20 w-32 rounded-xl object-cover" /> : <div className="flex h-20 w-32 items-center justify-center rounded-xl bg-white/[0.05]"><Play className="h-5 w-5 text-white/50" /></div>}
                  <div className="min-w-0">
                    <p className="mt-2 line-clamp-2 text-base font-semibold text-white">{video.title}</p>
                    <p className="mt-1 text-sm text-white/50">{uploadReviewPrompt(video, matchingIdeas)}</p>
                  </div>
                </div>
                <Button className="rounded-lg bg-white text-black hover:bg-white/90" onClick={() => void addUploadedVideoAsIdea(video)}>
                  <Plus className="mr-2 h-4 w-4" />
                  This is a new idea
                </Button>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {matchingIdeas.map((day) => (
                  <button
                    key={`${video.id}-${day.day}`}
                    type="button"
                    onClick={() => void linkVideoToPlannedDay(video, day)}
                    className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left text-sm text-white transition-all hover:-translate-y-0.5 hover:border-emerald-300/35 hover:bg-emerald-500/10"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-100/65">Yes, link it here</p>
                    <p className="font-semibold">{day.contentIdea}</p>
                    {day.hook && day.hook !== day.contentIdea ? <p className="mt-1 text-white/55">{day.hook}</p> : null}
                  </button>
                ))}
                {!matchingIdeas.length ? <div className="rounded-xl border border-dashed border-white/10 px-4 py-3 text-sm text-white/45">No matching plan card was found for this date. The easiest next step is saving it as a new idea.</div> : null}
              </div>
            </PanelCardSoft>
          );
        })}
      </div>
    </PanelCard>
  ) : null;

  const sectionNav = (
    <PanelCardSoft className="sticky top-4 z-20 flex flex-wrap gap-2 p-2 backdrop-blur">
      {[
        ["this-week-plan", "Plan"],
        ["repeat-or-fix", "Patterns"],
        ["posting-consistency", "Consistency"],
        ["performance-signals", "Performance"],
        ["competitor-playbook", "Competitors"],
      ].map(([id, label]) => (
        <a key={id} href={`#${id}`} className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white">
          {label}
        </a>
      ))}
    </PanelCardSoft>
  );

  const todayActionCard = (
    <PanelCardSoft className="border-red-300/15 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Today</p>
          {todayPlannedDays.length ? (
            <>
              <h3 className="mt-2 text-lg font-semibold text-white">Today&apos;s planned cards</h3>
              <p className="mt-1 text-sm text-white/50">Publish what shipped, or move an idea to a better day without opening the full planner.</p>
            </>
          ) : (
            <>
              <h3 className="mt-2 text-lg font-semibold text-white">No pending upload</h3>
              <p className="mt-1 text-sm text-white/50">Add an idea or generate a plan to set your next move.</p>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" className="rounded-lg" onClick={() => openCustomIdeaForDate(new Date().toISOString().slice(0, 10))}>
            <Plus className="mr-2 h-4 w-4" />
            Add idea
          </Button>
        </div>
      </div>
      {todayPlannedDays.length ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {todayPlannedDays.map((day) => (
            <PanelCardSoft key={`today-${toCardId(day)}`} className="border border-white/10 p-4 transition-all duration-200 hover:-translate-y-1 hover:border-red-300/25 hover:bg-white/[0.05]">
              <p className="text-base font-semibold text-white">{day.contentIdea}</p>
              {day.hook && day.hook !== day.contentIdea ? <p className="mt-2 text-sm text-white/55">{day.hook}</p> : null}
              <div className="mt-4 flex gap-2">
                <Button type="button" className="flex-1 rounded-lg bg-emerald-500 text-emerald-950 hover:bg-emerald-400" onClick={() => { setDetailDay(day); setLinkingDay(day.day); }}>
                  Publish
                </Button>
                <Button type="button" variant="secondary" className="flex-1 rounded-lg transition-all hover:-translate-y-0.5" onClick={() => setMovingDay(day)}>
                  Move
                </Button>
              </div>
            </PanelCardSoft>
          ))}
        </div>
      ) : null}
    </PanelCardSoft>
  );

  return (
    <PanelPage className="max-w-7xl space-y-8 py-8">
      <PanelHeader className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="space-y-3">
          <PanelEyebrow>YouTube Growth</PanelEyebrow>
          <PanelTitle className="text-4xl">Grow your next upload week.</PanelTitle>
          <PanelSubtitle className="max-w-3xl">A focused workspace for channel patterns, weekly planning, competitor context, and publishing follow-through.</PanelSubtitle>
        </div>
        {status?.connected && (
          <div className="flex flex-wrap items-start gap-2 lg:justify-end">
            <Button className="rounded-lg bg-red-500 px-5 text-white hover:bg-red-400" onClick={generatePlan} disabled={Boolean(working)}>
              {working === "plan" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Youtube className="mr-2 h-4 w-4" />}
              Generate next week's plan
            </Button>
            <Button variant="secondary" className="rounded-lg px-3 text-white/65" onClick={() => setSettingsOpen(true)}>
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Button>
            <Button variant="secondary" className="rounded-lg px-3 text-white/65" onClick={syncChannel} disabled={Boolean(working)}>
              {working === "sync" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
              Refresh channel
            </Button>
          </div>
        )}
      </PanelHeader>

      {error && <PanelCardSoft className="border-red-400/25 bg-red-500/10 p-4 text-sm text-red-100">{error}</PanelCardSoft>}

      {!status?.connected ? (
        <section className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <PanelCard className="p-6 md:p-8">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-red-400/20 bg-red-500/10">
                <Youtube className="h-6 w-6 text-red-200" />
              </div>
              <div>
                <PanelEyebrow>Secure connection</PanelEyebrow>
                <h2 className="mt-3 text-2xl font-semibold text-white">Connect the channel you want to grow.</h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55">Your DayTabs login and YouTube channel can be different Google accounts. DayTabs stores tokens on the backend and refreshes access silently.</p>
                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  {["Channel profile", "Real trends", "Weekly results"].map((item) => (
                    <PanelCardSoft key={item} className="p-4 text-sm text-white/70">
                      <Check className="mb-3 h-4 w-4 text-emerald-300" />
                      {item}
                    </PanelCardSoft>
                  ))}
                </div>
              </div>
            </div>
          </PanelCard>
          <PanelCard className="flex flex-col justify-between p-6">
            <div>
              <p className="text-sm font-medium text-white">Ready when you are.</p>
              <p className="mt-2 text-sm leading-6 text-white/45">Google will ask for read-only YouTube and Analytics access.</p>
            </div>
            <Button className="mt-6 rounded-lg bg-red-500 py-6 text-base text-white hover:bg-red-400" onClick={connectYoutube} disabled={Boolean(working)}>
              {working === "connect" ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Youtube className="mr-2 h-5 w-5" />}
              Connect to YouTube
            </Button>
          </PanelCard>
        </section>
      ) : (
        <>
          <PanelCardStrong className="p-5">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_1.3fr] xl:items-center">
              <div className="flex items-start gap-4">
                <div className="relative">
                  <Avatar className="h-20 w-20 rounded-[20px] border border-white/10">
                    <AvatarImage src={status.channel?.channelThumbnailUrl ?? undefined} alt={status.channel?.channelName ?? "YouTube channel"} />
                    <AvatarFallback className="rounded-[20px] bg-white/[0.08] text-lg text-white">{initials(status.channel?.channelName)}</AvatarFallback>
                  </Avatar>
                  <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-red-500 text-white">
                    <Youtube className="h-4 w-4" />
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">Command Center</p>
                  <h2 className="mt-2 truncate text-2xl font-semibold text-white">{status.channel?.channelName ?? "Connected channel"}</h2>
                  <p className="mt-1 text-sm text-white/45">{status.channel?.nicheProfile?.niche ?? "Niche profile ready"}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/45">
                    <span>{formatNumber(status.channel?.subscriberCount)} subscribers</span>
                    <span>·</span>
                    <span>{formatNumber(status.channel?.totalViewCount)} total views</span>
                    <span>·</span>
                    <span>{formatNumber(status.channel?.videoCount)} videos</span>
                  </div>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <CommandStat
                  label="Weekly target"
                  value={`${preferredPostsPerWeek} upload${preferredPostsPerWeek === 1 ? "" : "s"}`}
                  caption="Used when generating plans"
                  Icon={CalendarDays}
                />
                <CommandStat
                  label="Progress"
                  value={`${progressState.posted}/${Math.max(days.length, preferredPostsPerWeek)} published`}
                  caption="Linked uploads this week"
                  Icon={CheckCircle2}
                />
                <CommandStat
                  label="Best slot"
                  value={bestTime.highest ? `${bestTime.highest.day} ${bestTime.highest.hour}` : "Needs more data"}
                  caption={bestTime.highest ? `${formatNumber(bestTime.highest.value)} avg views` : "More uploads improve this"}
                  Icon={Clock}
                />
              </div>
            </div>
          </PanelCardStrong>

          {uploadReviewSection}
          {sectionNav}
          {todayActionCard}
          {planCalendarSection}

          <section id="repeat-or-fix" className="scroll-mt-24">
            <PanelCard className="overflow-hidden border border-white/10 p-0 transition-all hover:-translate-y-1 hover:bg-white/[0.04]">
              <div className="border-b border-white/10 bg-white/[0.03] p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <BarChart3 className="h-5 w-5 text-emerald-300" />
                      <h2 className="text-2xl font-semibold text-white">Repeat or Fix</h2>
                    </div>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">Pick one proven move to repeat and one underperforming video to repair. Each card shows the source upload, the signal behind it, and the next action to try.</p>
                  </div>
                  <Badge className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-white/65 hover:brightness-100">
                    {topDiagnostics.length + underperformerDiagnostics.length} cards
                  </Badge>
                </div>
                {channelDescription(status.channel) ? (
                  <PanelCardSoft className="mt-5 border border-white/10 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Channel context for these recommendations</p>
                    <p className="mt-2 text-sm leading-6 text-white/65">{channelDescription(status.channel)}</p>
                  </PanelCardSoft>
                ) : null}
              </div>
              <div className="grid gap-4 p-5 md:p-6 2xl:grid-cols-2">
                <AnalysisLane
                  title="What worked"
                  subtitle="Your strongest recent videos, broken into the exact creative signals worth repeating."
                  Icon={CheckCircle2}
                  diagnostics={topDiagnostics}
                  tone="positive"
                />
                <AnalysisLane
                  title="Needs work"
                  subtitle="The weakest recent uploads, shown as specific hook, tag, title, concept, and timing issues."
                  Icon={TrendingDown}
                  diagnostics={underperformerDiagnostics}
                  tone="negative"
                />
              </div>
            </PanelCard>
          </section>

          {consistencySection}

          <PanelCard id="performance-signals" className="scroll-mt-24 p-6 transition-all hover:-translate-y-1 hover:bg-white/[0.04]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-3">
                  <BarChart3 className="h-5 w-5 text-emerald-300" />
                  <h2 className="text-2xl font-semibold text-white">Performance Signals</h2>
                </div>
                <p className="mt-2 text-sm text-white/45">Signals from your uploads, analytics, and competitors.</p>
              </div>
            </div>
            <div className="sticky top-4 z-10 mt-5 flex flex-wrap gap-2 rounded-xl border border-white/10 bg-[#120d1f]/90 p-3 backdrop-blur">
              {[
                ["optimal-posting-schedule", "Best Times"],
                ["hook-efficacy-analysis", "Hooks"],
                ["optimal-title-length", "Title Length"],
                ["subscriber-growth-chart", "Subscriber Growth"],
                ["your-tag-performance", "Tags"],
                ["trending-tags", "Tags to Test"],
              ].map(([id, label]) => (
                <a key={id} href={`#${id}`} className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white">{label}</a>
              ))}
            </div>

            <div className="mt-6 space-y-6">
              <PanelCardSoft id="optimal-posting-schedule" className="border border-white/10 p-5 transition-all hover:-translate-y-1 hover:bg-white/[0.05]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-semibold text-white">Best Times to Post</h3>
                    <p className="mt-2 text-sm text-white/45">Average views by weekday and publish window from your real upload history.</p>
                  </div>
                  <Badge className={`${confidenceClass(bestTime.highest ? "high" : "low")} hover:brightness-100`}>{bestTime.highest ? "high" : "low"}</Badge>
                </div>
                <BestTimeHeatmap cells={bestTime.cells} />
                {bestTime.highest ? (
                  <p className="mt-4 text-sm text-white/65">
                    Your strongest slot is {bestTime.highest.day} {bestTime.highest.hour === "00:00" ? "00:00-06:00" : bestTime.highest.hour === "06:00" ? "06:00-12:00" : bestTime.highest.hour === "12:00" ? "12:00-18:00" : "18:00-24:00"} at {formatNumber(bestTime.highest.value)} average views, {formatPercent(bestTime.average ? ((bestTime.highest.value - bestTime.average) / bestTime.average) * 100 : 0)} above your channel average. Evidence: {bestTime.sampleVideos.map((video) => `"${video.title}" (${formatNumber(video.viewCount)} views)`).join(" and ")}.
                  </p>
                ) : null}
              </PanelCardSoft>

              {hookRows.length ? (
                <PanelCardSoft id="hook-efficacy-analysis" className="border border-white/10 p-5 transition-all hover:-translate-y-1 hover:bg-white/[0.05]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-semibold text-white">Hooks That Pull Views</h3>
                      <p className="mt-2 text-sm text-white/45">Average views by hook style across your actual video titles.</p>
                    </div>
                    <Badge className={`${confidenceClass(hookRows.length >= 3 ? "high" : "medium")} hover:brightness-100`}>{hookRows.length >= 3 ? "high" : "medium"}</Badge>
                  </div>
                  <HookComparisonChart rows={hookRows} />
                  {hookInsight ? (
                    <p className="mt-4 text-sm text-white/65">
                      Your {hookInsight.winner.type.toLowerCase()} hooks average {formatNumber(hookInsight.winner.averageViews)} views because {hookInsight.why} Evidence: {hookInsight.evidenceVideos.map((video) => `"${video.title}" (${formatNumber(video.viewCount)} views)`).join(" · ")}. Next hooks should: {hookInsight.suggestions.join(" ")}
                    </p>
                  ) : null}
                </PanelCardSoft>
              ) : null}

              {titleLengthSummary.points.length ? (
                <PanelCardSoft id="optimal-title-length" className="border border-white/10 p-5 transition-all hover:-translate-y-1 hover:bg-white/[0.05]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-semibold text-white">Optimal Title Length</h3>
                      <p className="mt-2 text-sm text-white/45">Average views by title-length bucket so the winning range is obvious.</p>
                    </div>
                    <Badge className={`${confidenceClass(titleLengthSummary.points.length >= 8 ? "high" : "medium")} hover:brightness-100`}>{titleLengthSummary.points.length >= 8 ? "high" : "medium"}</Badge>
                  </div>
                  <TitleLengthBarChart buckets={titleLengthSummary.buckets} winnerLabel={titleLengthSummary.winningBucket?.label} />
                  <div className="mt-4 overflow-x-auto rounded-lg border border-white/10">
                    <table className="min-w-full text-sm">
                      <thead className="bg-white/[0.03] text-left text-white/45">
                        <tr>
                          <th className="px-4 py-3 font-medium">Top 5 titles</th>
                          <th className="px-4 py-3 font-medium">Chars · Views</th>
                          <th className="px-4 py-3 font-medium">Bottom 5 titles</th>
                          <th className="px-4 py-3 font-medium">Chars · Views</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: 5 }).map((_, index) => {
                          const top = titleLengthSummary.top[index];
                          const bottom = titleLengthSummary.bottom[index];
                          return (
                            <tr key={`title-row-${index}`} className="border-t border-white/10">
                              <td className="px-4 py-3 text-white">{top?.title ?? "No data"}</td>
                              <td className="px-4 py-3 text-white/65">{top ? `${top.titleLength} · ${formatNumber(top.views)}` : "No data"}</td>
                              <td className="px-4 py-3 text-white">{bottom?.title ?? "No data"}</td>
                              <td className="px-4 py-3 text-white/65">{bottom ? `${bottom.titleLength} · ${formatNumber(bottom.views)}` : "No data"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {titleLengthSummary.winningBucket ? (
                    <p className="mt-4 text-sm text-white/65">
                      Videos with titles between {titleLengthSummary.winningBucket.min} and {Number.isFinite(titleLengthSummary.winningBucket.max) ? titleLengthSummary.winningBucket.max : "70+"} characters average {formatNumber(titleLengthSummary.winningBucket.averageViews)} views on your channel, which is {formatPercent(titleLengthSummary.percentAboveAverage)} above your overall average.
                    </p>
                  ) : null}
                </PanelCardSoft>
              ) : null}

              {subscriberGrowth.timeline.length ? (
                <PanelCardSoft id="subscriber-growth-chart" className="border border-white/10 p-5 transition-all hover:-translate-y-1 hover:bg-white/[0.05]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-semibold text-white">Subscriber Growth Chart</h3>
                      <p className="mt-2 text-sm text-white/45">Net subscriber gain with publish markers from your recent uploads.</p>
                    </div>
                    <Badge className={`${confidenceClass(subscriberGrowth.timeline.length >= 14 ? "high" : "medium")} hover:brightness-100`}>{subscriberGrowth.timeline.length >= 14 ? "high" : "medium"}</Badge>
                  </div>
                  <div className="mt-4 h-64">
                    <ChartContainer config={{ subscribersNet: { label: "Subscribers", color: "#34d399" } }} className="h-full w-full">
                      <LineChart data={subscriberGrowth.timeline}>
                        <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.08)" />
                        <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={24} />
                        <YAxis tickLine={false} axisLine={false} />
                        <ChartTooltip
                          content={({ active, payload }: TooltipProps<number, string>) => {
                            if (!active || !payload?.length) return null;
                            const point = payload[0]?.payload as { date?: string; rawDate?: string; subscribersNet?: number; markerVideos?: Array<{ title: string; views: number }> };
                            const video = point.markerVideos?.[0];
                            return (
                              <div className="rounded-lg border border-white/10 bg-[#120d1f] px-3 py-2 text-xs text-white shadow-xl">
                                <p className="font-medium">{formatIsoDate(point.rawDate)}</p>
                                {video ? <p className="mt-1 text-white">{video.title}</p> : null}
                                {video ? <p className="mt-1 text-white/65">{formatNumber(video.views)} views</p> : null}
                                <p className="mt-1 text-white/65">Estimated subscriber gain: {formatNumber(point.subscribersNet)}</p>
                              </div>
                            );
                          }}
                        />
                        <Line type="monotone" dataKey="subscribersNet" stroke="var(--color-subscribersNet)" strokeWidth={3} dot={false} />
                        {subscriberGrowth.timeline.filter((point) => point.markerVideos.length).map((point) => <ReferenceLine key={point.rawDate} x={point.date} stroke="rgba(255,255,255,0.25)" strokeDasharray="4 4" />)}
                        {subscriberGrowth.timeline.filter((point) => point.markerVideos.length).map((point) => <ReferenceDot key={`${point.rawDate}-dot`} x={point.date} y={point.subscribersNet} r={5} fill="#fca5a5" stroke="none" />)}
                        {subscriberGrowth.spike ? <ReferenceLine x={subscriberGrowth.spike.date} stroke="rgba(52,211,153,0.5)" label={{ value: "Highest spike", position: "top", fill: "#a7f3d0", fontSize: 11 }} /> : null}
                      </LineChart>
                    </ChartContainer>
                  </div>
                  {subscriberGrowth.spike ? <p className="mt-4 text-sm text-white/65">Your biggest subscriber spike came from "{subscriberGrowth.spikeVideo?.title ?? "a recent upload"}" on {formatIsoDate(subscriberGrowth.spike.rawDate)}. It drove an estimated {formatNumber(subscriberGrowth.spike.subscribersNet)} net subscribers, used a {contentTypeMeta(subscriberGrowth.spikeVideo ? { day: 0, date: "", contentIdea: subscriberGrowth.spikeVideo.title, hook: subscriberGrowth.spikeVideo.title, outline: [], bestPostingTime: "", rationale: "" } as PlanDay : { day: 0, date: "", contentIdea: "", hook: "", outline: [], bestPostingTime: "", rationale: "" } as PlanDay).label.toLowerCase()} format, and leaned on a {hookType(subscriberGrowth.spikeVideo?.title ?? "").toLowerCase()} hook. Future ideas should replicate that combination.</p> : null}
                </PanelCardSoft>
              ) : null}

              {tagPerformance.length ? (
                <PanelCardSoft id="your-tag-performance" className="border border-white/10 p-5 transition-all hover:-translate-y-1 hover:bg-white/[0.05]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-semibold text-white">Tags That Help or Hurt</h3>
                      <p className="mt-2 text-sm text-white/45">Tags pulled from your real uploaded videos and grouped by average performance.</p>
                    </div>
                    <Badge className={`${confidenceClass(tagPerformance.length >= 6 ? "high" : "medium")} hover:brightness-100`}>{tagPerformance.length >= 6 ? "high" : "medium"}</Badge>
                  </div>
                  <p className="mt-4 text-sm text-white/55">Green = above average performance · Grey = neutral · Red = below average.</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {(tagExpanded ? tagPerformance : tagPerformance.slice(0, 15)).map((tag) => (
                      <span key={tag.tag} className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm", tag.tone === "positive" && "border-emerald-400/25 bg-emerald-500/10 text-emerald-100", tag.tone === "negative" && "border-red-400/25 bg-red-500/10 text-red-100", tag.tone === "neutral" && "border-white/10 bg-white/[0.05] text-white/70")}>
                        <span>#{tag.tag}</span>
                        <span className="text-xs opacity-75">{formatNumber(tag.averageViews)}</span>
                      </span>
                    ))}
                  </div>
                  {tagPerformance.length > 15 ? (
                    <button type="button" onClick={() => setTagExpanded((current) => !current)} className="mt-4 text-sm text-white/55 transition-colors hover:text-white">
                      {tagExpanded ? "Show fewer tags" : "Show all tags"}
                    </button>
                  ) : null}
                </PanelCardSoft>
              ) : null}

              {trendingTagSuggestions.length ? (
                <PanelCardSoft id="trending-tags" className="border border-white/10 p-5 transition-all hover:-translate-y-1 hover:bg-white/[0.05]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-semibold text-white">Niche Tags to Test</h3>
                      <p className="mt-2 text-sm text-white/45">Trend tags that do not overlap with your current tag set.</p>
                    </div>
                    <Badge className={`${confidenceClass("medium")} hover:brightness-100`}>medium</Badge>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {trendingTagSuggestions.map((tag) => (
                      <span key={tag.tag} className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1.5 text-sm text-amber-50">
                        <Flame className="h-3.5 w-3.5" />
                        #{tag.tag}
                        <span className="text-xs text-amber-100/70">signal {tag.signal || 1}</span>
                      </span>
                    ))}
                  </div>
                  <div className="mt-4 space-y-2 text-sm text-white/65">
                    {trendingTagSuggestions.map((tag) => <p key={`${tag.tag}-why`}><span className="text-white">#{tag.tag}</span>: {tag.why}</p>)}
                  </div>
                </PanelCardSoft>
              ) : null}

            </div>
          </PanelCard>

          <section id="competitor-playbook" className="scroll-mt-24">
            <PanelCard className="p-6 transition-all hover:-translate-y-1 hover:bg-white/[0.04]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold text-white">Competitor Playbook</h2>
                  <p className="mt-1 text-sm text-white/45">Use this like a coach&apos;s scouting report: who you can catch now, who is just ahead, and who defines the playbook for your niche.</p>
                </div>
                <div className="flex w-full flex-col gap-3 md:w-auto md:min-w-[360px]">
                  <Button variant="secondary" className="rounded-lg" onClick={discoverCompetitorsOnly} disabled={Boolean(working)}>
                    {working === "competitors" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                    Discover competitors
                  </Button>
                  <form onSubmit={(event) => void addCompetitorFromUrl(event)} className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      value={manualCompetitorUrl}
                      onChange={(event) => setManualCompetitorUrl(event.target.value)}
                      placeholder="Add competitor by YouTube channel URL"
                      disabled={Boolean(working)}
                      className="border-white/10 bg-white/[0.04] text-white placeholder:text-white/30"
                    />
                    <Button type="submit" className="rounded-lg" disabled={!manualCompetitorUrl.trim() || Boolean(working)}>
                      {working === "competitor-add" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                      Add competitor
                    </Button>
                  </form>
                </div>
              </div>
              <div className="mt-5 space-y-6">
                {[
                  {
                    key: "tier1",
                    title: "Tier 1: Your Level, Channels You Can Beat",
                    subtitle: "These are the channels close enough to race right now. Treat them like proof that your next push can move the leaderboard.",
                    rows: competitorTiers.tier1,
                    accent: "border-emerald-400/25",
                  },
                  {
                    key: "tier2",
                    title: "Tier 2: Growing Fast, Just Ahead of You",
                    subtitle: "These channels are realistic near-term targets. Study the patterns that helped them break away.",
                    rows: competitorTiers.tier2,
                    accent: "border-white/10",
                  },
                  {
                    key: "tier3",
                    title: "Tier 3: Top of Your Niche, Study Their Playbook",
                    subtitle: "Learn from the best in your niche. Use them as ideation fuel, not intimidation.",
                    rows: competitorTiers.tier3,
                    accent: "border-amber-300/25",
                  },
                ].map((tier) => (
                  <div key={tier.key} className="space-y-3">
                    <div>
                      <h3 className="text-lg font-semibold text-white">{tier.title}</h3>
                      <p className="mt-1 text-sm text-white/50">{tier.subtitle}</p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      {tier.rows.map((competitor) => {
                        const insight = planPayload.competitorInsights?.find((item) => item.channelName === competitor.channelName);
                        const storedMeta = readCompetitorStoredMeta(competitor);
                        const url = insight?.channelUrl || `https://www.youtube.com/channel/${competitor.channelId ?? ""}`;
                        const topVideo = [...(competitor.mostViewedRecentVideos ?? [])].sort((a, b) => parseNumber(b.viewCount) - parseNumber(a.viewCount))[0];
                        const isRemoving = working === `competitor-remove:${competitor.id}`;
                        return (
                          <PanelCardSoft key={`${tier.key}-${competitor.id}`} className={cn("border p-4 transition-all hover:-translate-y-0.5 hover:bg-white/[0.05]", tier.accent)}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <Avatar className="h-12 w-12">
                                  <AvatarImage src={competitor.thumbnailUrl ?? undefined} alt={competitor.channelName} />
                                  <AvatarFallback className="bg-white/[0.08] text-sm text-white">{initials(competitor.channelName)}</AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="font-medium text-white">{competitor.channelName}</p>
                                  <p className="mt-1 text-xs text-white/40">{formatNumber(competitor.subscriberCount)} subscribers · {competitor.videosPerWeekLabel}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => void removeCompetitor(competitor.id)}
                                  disabled={isRemoving || Boolean(working && working !== `competitor-remove:${competitor.id}`)}
                                  className="rounded-lg border border-white/10 p-2 text-white/55 transition-colors hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                                  aria-label={`Remove ${competitor.channelName}`}
                                >
                                  {isRemoving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                </button>
                                <a href={url} target="_blank" rel="noreferrer" className="rounded-lg border border-white/10 p-2 text-white/55 hover:bg-white/5"><ExternalLink className="h-4 w-4" /></a>
                              </div>
                            </div>
                            <p className="mt-4 text-sm leading-6 text-white/70">{storedMeta.reportSummary || deriveCompetitorCardInsight(competitor)}</p>
                            {storedMeta.source === "manual" ? <p className="mt-2 text-xs text-sky-100/70">Added by you{storedMeta.addedFromUrl ? " from a channel URL" : ""}.</p> : null}
                            {tier.key === "tier3" ? <p className="mt-2 text-sm text-amber-100/75">Watch their top video to see what your niche&apos;s audience loves most.</p> : null}
                            {topVideo ? (
                              <a href={topVideo.url} target="_blank" rel="noreferrer" className="mt-3 block text-sm text-red-200 transition-colors hover:text-red-100">
                                Top video: {topVideo.title}
                              </a>
                            ) : null}
                          </PanelCardSoft>
                        );
                      })}
                      {!tier.rows.length ? <PanelCardSoft className="p-4 text-sm text-white/55 md:col-span-2">No channels are in this tier yet. Refresh competitors and DayTabs will keep scouting your niche.</PanelCardSoft> : null}
                    </div>
                    {tier.key === leaderboardHostTierKey && weeklyComparison ? (
                      <PanelCardSoft className="border border-emerald-400/20 p-4">
                        <h4 className="text-base font-semibold text-white">This Week&apos;s Friendly Leaderboard</h4>
                        <p className="mt-1 text-sm text-white/50">{weeklyComparison.windowLabel}: uploads and views for you and competitors based on published videos.</p>
                        <WeeklyComparisonChart rows={weeklyComparison.rows} weekdayRows={weeklyComparison.weekdayRows} />
                        <p className="mt-3 text-sm text-white/55">{weeklyComparison.windowDescription}</p>
                        {weeklyLeaderboardMessage ? <p className="mt-2 text-sm text-white/65">{weeklyLeaderboardMessage}</p> : null}
                      </PanelCardSoft>
                    ) : null}
                  </div>
                ))}
              </div>
            </PanelCard>
          </section>
        </>
      )}

      <Dialog open={Boolean(detailDay)} onOpenChange={(open) => !open && setDetailDay(null)}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto pt-10">
          <DialogHeader>
            <DialogTitle>{detailDay?.contentIdea}</DialogTitle>
            <DialogDescription>Full content brief for this planned upload.</DialogDescription>
          </DialogHeader>
          {detailDay ? (
            <div className="space-y-4 text-sm text-white/70">
              {(() => {
                const weekday = daysOfWeek[new Date(`${detailDay.date}T00:00:00Z`).getUTCDay()];
                const slot = bestPostingSlotByDay[weekday];
                const linked = resultsByDay.get(detailDay.day);
                const linkedVideo = linked ? recentVideoById.get(linked.videoId) : null;
                const titleRange = titleLengthSummary.winningBucket ? rangeLabelForBucket(titleLengthSummary.winningBucket.label) : "35-55";
                const selectedVideoId = resultSelections[detailDay.day] ?? linked?.videoId ?? "";
                const disabledIds = new Set([...linkedVideoIds, ...selectedVideoIds].filter((videoId) => videoId !== selectedVideoId && videoId !== linked?.videoId));
                const origin = ideaOriginMeta(detailDay);
                const showGeneratedSections = isAiIdea(detailDay);
                return (
                  <>
                    <PanelCardSoft className={cn("border p-4", isManualIdea(detailDay) ? "border-sky-300/20 bg-sky-500/10" : "border-red-400/20 bg-red-500/10")}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className={cn("text-xs uppercase tracking-[0.16em]", isManualIdea(detailDay) ? "text-sky-100/75" : "text-red-100/70")}>
                            {origin.label} idea
                          </p>
                          {detailDay.hook ? <p className="mt-3 text-lg font-semibold leading-7 text-white">{detailDay.hook}</p> : <p className="mt-3 text-lg font-semibold leading-7 text-white">{detailDay.contentIdea}</p>}
                        </div>
                        <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]", origin.chipClassName)}>
                          {origin.label}
                        </span>
                      </div>
                      {isAiIdea(detailDay) ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant={detailDay.aiFeedback === "liked" ? "default" : "secondary"}
                            className="rounded-lg"
                            disabled={ideaActionDay === detailDay.day}
                            onClick={() => void saveIdeaFeedback(detailDay, detailDay.aiFeedback === "liked" ? null : "liked")}
                          >
                            <ThumbsUp className="mr-2 h-4 w-4" />
                            Like
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={detailDay.aiFeedback === "disliked" ? "default" : "secondary"}
                            className="rounded-lg"
                            disabled={ideaActionDay === detailDay.day}
                            onClick={() => void saveIdeaFeedback(detailDay, detailDay.aiFeedback === "disliked" ? null : "disliked")}
                          >
                            <ThumbsDown className="mr-2 h-4 w-4" />
                            Dislike
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="rounded-lg"
                            disabled={ideaActionDay === detailDay.day}
                            onClick={() => void regenerateIdea(detailDay)}
                          >
                            {ideaActionDay === detailDay.day ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                            Generate new idea
                          </Button>
                        </div>
                      ) : null}
                    </PanelCardSoft>
                    {slot ? (
                      <PanelCardSoft className="p-4">
                        <p className="text-white">{weekday} {slot.slot} is your best window for this day at about {formatNumber(slot.value)} average views.</p>
                      </PanelCardSoft>
                    ) : null}
                    {detailDay.rationale ? (
                      <PanelCardSoft className="p-4">
                        <p className="text-xs uppercase tracking-[0.16em] text-white/40">{showGeneratedSections ? "Why this might work" : "Notes"}</p>
                        <p className="mt-3 leading-6 text-white/70">
                          {showGeneratedSections && slot ? `${detailDay.rationale} ${buildWhyThisMightWork(detailDay, weekday, slot, hookInsight, trendingTagSuggestions)}` : detailDay.rationale}
                        </p>
                      </PanelCardSoft>
                    ) : null}
                    <PanelCardSoft className="p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs uppercase tracking-[0.16em] text-white/40">Publish package</p>
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-white/45">{detailDay.contentIdea.length} chars · Sweet spot: {titleRange}</p>
                          <Button type="button" size="sm" variant="secondary" className="rounded-lg" onClick={() => openThumbnailDialog(detailDay)}>
                            <ImagePlus className="mr-2 h-4 w-4" />
                            {detailDay.generatedThumbnail?.imageDataUrl ? "Regenerate thumbnail" : "Create thumbnail"}
                          </Button>
                        </div>
                      </div>
                      {detailDay.generatedThumbnail?.imageDataUrl ? (
                        <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-black/20">
                          <img src={detailDay.generatedThumbnail.imageDataUrl} alt={`${detailDay.contentIdea} thumbnail`} className="w-full object-cover" />
                        </div>
                      ) : null}
                      <IdeaPackageFields day={detailDay} />
                    </PanelCardSoft>
                    {(detailDay.outline ?? []).length ? (
                      <PanelCardSoft className="p-4">
                        <p className="text-xs uppercase tracking-[0.16em] text-white/40">Outline</p>
                        <div className="mt-3 space-y-2">
                          {(detailDay.outline ?? []).map((item, index) => (
                            <p key={`${detailDay.day}-outline-${index}`} className="leading-6 text-white/70">
                              <span className="text-white">{index + 1}.</span> {item}
                            </p>
                          ))}
                        </div>
                      </PanelCardSoft>
                    ) : null}
                    {detailDay.competitorReference ? (
                      <PanelCardSoft className="p-4">
                        <p className="text-xs uppercase tracking-[0.16em] text-white/40">Competitor reference</p>
                        <p className="mt-3 leading-6 text-white/70">{detailDay.competitorReference}</p>
                      </PanelCardSoft>
                    ) : null}
                    <PanelCardSoft className="p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-xs uppercase tracking-[0.16em] text-white/40">Publish sync</p>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="rounded-lg"
                          disabled={working === "sync"}
                          onClick={() => void syncChannel()}
                        >
                          {working === "sync" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                          Refresh uploaded videos
                        </Button>
                      </div>
                      {!linked ? (
                        <>
                          {saveConfirmationDay === detailDay.day ? <p className="mb-3 text-xs text-emerald-300">Saved</p> : null}
                          {linkingDay === detailDay.day ? (
                            <>
                              <VideoPicker
                                videos={publishableVideos}
                                selected={selectedVideoId}
                                disabledIds={disabledIds}
                                onSelect={(videoId) => setResultSelections((current) => ({ ...current, [detailDay.day]: videoId }))}
                              />
                              <Button
                                className="mt-3 w-full rounded-lg bg-emerald-500 text-emerald-950 hover:bg-emerald-400 disabled:bg-white/10 disabled:text-white/30"
                                onClick={() => {
                                  if (!selectedVideoId) return;
                                  void submitResults([{ dayIndex: detailDay.day, plannedTitle: detailDay.contentIdea, videoId: selectedVideoId }]).then(() => {
                                    setLinkingDay(null);
                                    if (latestPlan) {
                                      void patchPlanDay(detailDay.day, { stage: "published" });
                                    } else {
                                      updateDay(toCardId(detailDay), { stage: "published" });
                                    }
                                  });
                                }}
                                disabled={!selectedVideoId || savingResultDay === detailDay.day}
                              >
                                {savingResultDay === detailDay.day ? "Saving..." : "Confirm"}
                              </Button>
                            </>
                          ) : (
                            <Button className="w-full rounded-lg bg-emerald-500 text-emerald-950 hover:bg-emerald-400" onClick={() => setLinkingDay(detailDay.day)}>
                              Mark as published - link your video
                            </Button>
                          )}
                        </>
                      ) : (
                        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/5 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              {linkedVideo?.thumbnailUrl ? <img src={linkedVideo.thumbnailUrl} alt="" className="h-[45px] w-20 rounded-md object-cover" /> : <div className="flex h-[45px] w-20 items-center justify-center rounded-md bg-[#151515]"><Play className="h-4 w-4 text-white/60" /></div>}
                              <div className="min-w-0">
                                <p className="line-clamp-2 text-sm text-white">{linkedVideo?.title ?? linked.plannedTitle}</p>
                                <p className="mt-1 text-xs text-white/45">{linkedVideo ? formatIsoDate(linkedVideo.publishedAt) : "Published"}{linkedVideo?.viewCount ? ` · ${formatNumber(linkedVideo.viewCount)} views` : ""}</p>
                              </div>
                            </div>
                            <button type="button" onClick={() => setLinkingDay(linkingDay === detailDay.day ? null : detailDay.day)} className="text-xs text-white/55 hover:text-white">Change</button>
                          </div>
                          {linkingDay === detailDay.day ? (
                            <>
                              <VideoPicker
                                videos={publishableVideos}
                                selected={selectedVideoId}
                                disabledIds={disabledIds}
                                onSelect={(videoId) => setResultSelections((current) => ({ ...current, [detailDay.day]: videoId }))}
                              />
                              <Button
                                className="mt-3 w-full rounded-lg bg-emerald-500 text-emerald-950 hover:bg-emerald-400 disabled:bg-white/10 disabled:text-white/30"
                                onClick={() => {
                                  if (!selectedVideoId) return;
                                  void submitResults([{ dayIndex: detailDay.day, plannedTitle: detailDay.contentIdea, videoId: selectedVideoId }]).then(() => setLinkingDay(null));
                                }}
                                disabled={savingResultDay === detailDay.day}
                              >
                                {savingResultDay === detailDay.day ? "Saving..." : "Confirm"}
                              </Button>
                            </>
                          ) : null}
                        </div>
                      )}
                    </PanelCardSoft>
                  </>
                );
              })()}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(movingDay)} onOpenChange={(open) => !open && setMovingDay(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Move idea</DialogTitle>
            <DialogDescription>Choose a new day for this card, or delete it if it no longer fits the week.</DialogDescription>
          </DialogHeader>
          {movingDay ? (
            <div className="space-y-4">
              <PanelCardSoft className="p-4">
                <p className="text-sm font-semibold text-white">{movingDay.contentIdea}</p>
                {movingDay.hook && movingDay.hook !== movingDay.contentIdea ? <p className="mt-2 text-sm text-white/55">{movingDay.hook}</p> : null}
              </PanelCardSoft>
              <div className="grid grid-cols-2 gap-2">
                {weekCalendarDates.map((date) => (
                  <Button
                    key={`move-${date}`}
                    type="button"
                    variant={movingDay.date === date ? "default" : "secondary"}
                    className="justify-start rounded-lg"
                    onClick={() => moveIdeaToDate(movingDay, date)}
                  >
                    {dayName(date)}
                  </Button>
                ))}
              </div>
              <Button
                type="button"
                variant="secondary"
                className="w-full rounded-lg border-red-300/20 text-red-200 hover:bg-red-500/10 hover:text-red-100"
                onClick={() => {
                  deleteDay(movingDay);
                  setMovingDay(null);
                }}
              >
                Delete idea
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(thumbnailDay)} onOpenChange={(open) => !open && closeThumbnailDialog()}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto pt-10">
          <DialogHeader>
            <DialogTitle>Create Thumbnail</DialogTitle>
            <DialogDescription>Upload optional source images, set optional text, and generate a saved thumbnail for this idea card.</DialogDescription>
          </DialogHeader>
          {thumbnailDay ? (
            <div className="space-y-4">
              <PanelCardSoft className="p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-white/40">Idea</p>
                <p className="mt-2 text-base font-semibold text-white">{thumbnailDay.contentIdea}</p>
                {thumbnailDay.descriptionSuggestion ? <p className="mt-2 text-sm text-white/55">{thumbnailDay.descriptionSuggestion}</p> : null}
              </PanelCardSoft>

              <PanelCardSoft className="p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-white/40">Source images</p>
                <p className="mt-2 text-sm text-white/55">Add up to 4 images. These are optional reference inputs for the AI.</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  {thumbnailSourceImages.map((image, index) => (
                    <div key={`${image.name}-${index}`} className="relative overflow-hidden rounded-xl border border-white/10 bg-black/20">
                      <img src={image.dataUrl} alt={image.name} className="h-28 w-40 object-cover" />
                      <button
                        type="button"
                        onClick={() => setThumbnailSourceImages((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                        className="absolute right-2 top-2 rounded-full border border-white/10 bg-black/50 p-1 text-white/70 hover:text-white"
                        aria-label={`Remove ${image.name}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  {thumbnailSourceImages.length < 4 ? (
                    <label className="flex h-28 w-40 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.03] text-center text-sm text-white/45 hover:border-white/20 hover:text-white/70">
                      <ImagePlus className="mb-2 h-5 w-5" />
                      Add image
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(event) => void handleThumbnailSourceFiles(event.target.files)}
                      />
                    </label>
                  ) : null}
                </div>
              </PanelCardSoft>

              <PanelCardSoft className="p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-white/40">Text on thumbnail</p>
                <Textarea
                  value={thumbnailTextPreference}
                  onChange={(event) => setThumbnailTextPreference(event.target.value)}
                  placeholder="Optional. Leave empty and AI will generate the strongest thumbnail text."
                  className="mt-3 min-h-24"
                />
              </PanelCardSoft>

              {thumbnailDay.generatedThumbnail?.imageDataUrl ? (
                <PanelCardSoft className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-white/40">Generated thumbnail</p>
                      <p className="mt-2 text-sm text-white/55">Saved on this idea card and ready to download.</p>
                    </div>
                    <a
                      href={thumbnailDay.generatedThumbnail.imageDataUrl}
                      download={`${thumbnailDay.contentIdea.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "youtube-thumbnail"}.png`}
                      className="inline-flex items-center rounded-lg border border-white/10 px-3 py-2 text-sm text-white/75 transition-colors hover:bg-white/[0.06] hover:text-white"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download thumbnail
                    </a>
                  </div>
                  <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-black/20">
                    <img src={thumbnailDay.generatedThumbnail.imageDataUrl} alt={`${thumbnailDay.contentIdea} generated thumbnail`} className="w-full object-cover" />
                  </div>
                </PanelCardSoft>
              ) : null}

              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="secondary" className="rounded-lg" onClick={closeThumbnailDialog}>
                  Close
                </Button>
                <Button type="button" className="rounded-lg" onClick={() => void generateThumbnailForDay()} disabled={working === "thumbnail"}>
                  {working === "thumbnail" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  {thumbnailDay.generatedThumbnail?.imageDataUrl ? "Generate again" : "Generate thumbnail"}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={settingsOpen || needsPostingPreference} onOpenChange={(open) => {
        if (!needsPostingPreference) setSettingsOpen(open);
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{needsPostingPreference ? "How many videos do you want to post per week?" : "Posting settings"}</DialogTitle>
            <DialogDescription>{needsPostingPreference ? "Choose your weekly target so YouTube Growth only generates the number of ideas you actually want to ship." : "Update how many videos YouTube Growth should schedule each week."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4, 5, 6, 7].map((value) => (
                <Button
                  key={value}
                  type="button"
                  variant={Number(postingFrequencyInput) === value ? "default" : "secondary"}
                  className="rounded-lg"
                  onClick={() => setPostingFrequencyInput(String(value))}
                >
                  {value}
                </Button>
              ))}
              <Input
                value={postingFrequencyInput}
                onChange={(event) => setPostingFrequencyInput(event.target.value.replace(/[^\d]/g, ""))}
                placeholder="Custom"
                className="col-span-4"
              />
            </div>
            <Button
              className="w-full rounded-lg bg-red-500 text-white hover:bg-red-400"
              disabled={savingSettings || !Number(postingFrequencyInput)}
              onClick={() => void savePostingSettings(Math.max(1, Number(postingFrequencyInput)))}
            >
              {savingSettings ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save posting preference
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={channelDetailsOpen} onOpenChange={setChannelDetailsOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{status?.channel?.channelName}</DialogTitle>
            <DialogDescription>Full connected channel details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm text-white/70">
            <div className="flex items-center gap-4">
              <Avatar className="h-20 w-20 rounded-[20px] border border-white/10">
                <AvatarImage src={status?.channel?.channelThumbnailUrl ?? undefined} alt={status?.channel?.channelName ?? "YouTube channel"} />
                <AvatarFallback className="rounded-[20px] bg-white/[0.08] text-lg text-white">{initials(status?.channel?.channelName)}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 gap-2 sm:grid-cols-3">
                <PanelCardSoft className="p-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-white/40">Subscribers</p>
                  <p className="mt-2 text-white">{formatNumber(status?.channel?.subscriberCount)}</p>
                </PanelCardSoft>
                <PanelCardSoft className="p-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-white/40">Total Views</p>
                  <p className="mt-2 text-white">{formatNumber(status?.channel?.totalViewCount)}</p>
                </PanelCardSoft>
                <PanelCardSoft className="p-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-white/40">Videos</p>
                  <p className="mt-2 text-white">{formatNumber(status?.channel?.videoCount)}</p>
                </PanelCardSoft>
              </div>
            </div>
            <PanelCardSoft className="p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-white/40">Description</p>
              <p className="mt-3 whitespace-pre-wrap text-white/70">{channelDescription(status?.channel) || "No description available."}</p>
            </PanelCardSoft>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add custom idea</DialogTitle>
            <DialogDescription>Add your own concept, then let AI sharpen it for your niche and current plan.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={customIdea.title} onChange={(event) => setCustomIdea((current) => ({ ...current, title: event.target.value }))} placeholder="Idea title" />
            <Input type="date" value={customIdea.date} onChange={(event) => setCustomIdea((current) => ({ ...current, date: event.target.value }))} />
            <Textarea value={customIdea.angle} onChange={(event) => setCustomIdea((current) => ({ ...current, angle: event.target.value }))} placeholder="Angle, rough hook, or notes" className="min-h-28" />
            <Textarea value={customIdea.description} onChange={(event) => setCustomIdea((current) => ({ ...current, description: event.target.value }))} placeholder="Video description" className="min-h-24" />
            <Input value={customIdea.tags} onChange={(event) => setCustomIdea((current) => ({ ...current, tags: event.target.value }))} placeholder="Tags, separated by commas" />
            <Textarea value={customIdea.thumbnail} onChange={(event) => setCustomIdea((current) => ({ ...current, thumbnail: event.target.value }))} placeholder="Thumbnail idea" className="min-h-20" />
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1 rounded-lg" onClick={improveCustomIdea} disabled={working === "improve"}>{working === "improve" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}AI improve</Button>
              <Button className="flex-1 rounded-lg" onClick={addCustomIdea}><Plus className="mr-2 h-4 w-4" />Add idea</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </PanelPage>
  );
}
