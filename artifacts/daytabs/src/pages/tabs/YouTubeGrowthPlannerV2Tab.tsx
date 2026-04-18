import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  Archive,
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  GripVertical,
  LayoutGrid,
  ListChecks,
  Loader2,
  Plus,
  RefreshCcw,
  Send,
  Sparkles,
  Tags,
  TrendingUp,
  Youtube,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { usePlan } from "@/hooks/use-plan";
import { PanelPage, PanelHeader, PanelTitle, PanelSubtitle, PanelCard, PanelCardSoft, PanelCardStrong, PanelEyebrow } from "@/components/panel-system";
import { cn } from "@/lib/utils";

type Stage = "idea" | "recording" | "editing" | "published" | "draft";
type ViewMode = "calendar" | "planner";
type InsightConfidence = "high" | "medium" | "low";

interface RecentVideo {
  id: string;
  title: string;
  description?: string;
  tags?: string[];
  publishedAt?: string | null;
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
  mostViewedRecentVideos?: Array<{ title?: string; viewCount?: string | null; url?: string }>;
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

interface YoutubeStatus {
  connected: boolean;
  channel?: YoutubeChannel | null;
  channelAnalytics?: { daily: YoutubeAnalyticsPoint[]; error?: string } | null;
  competitors?: YoutubeCompetitor[];
  latestPlan?: YoutubeWeeklyPlan | null;
  latestResults?: YoutubePlanResult[];
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
  return day.bestPostingTime?.trim() || "12:00";
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

function deriveStatTrend(points: YoutubeAnalyticsPoint[], metric: "views" | "subscribersNet") {
  const recent = points.slice(-60);
  if (recent.length < 14) return { series: [] as number[], change: null as number | null };
  const current = recent.slice(-30);
  const previous = recent.slice(-60, -30);
  const currentTotal = current.reduce((sum, point) => sum + point[metric], 0);
  const previousTotal = previous.reduce((sum, point) => sum + point[metric], 0);
  const change = previousTotal > 0 ? ((currentTotal - previousTotal) / previousTotal) * 100 : null;
  return { series: current.map((point) => point[metric]), change };
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

function comparisonBarWidth(value: number, max: number) {
  if (!value || !max) return 6;
  return Math.max(6, (Math.log10(value + 1) / Math.log10(max + 1)) * 100);
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

function ChannelSparkline({ values }: { values: number[] }) {
  const points = values.filter((value) => Number.isFinite(value));
  if (points.length < 2) return <p className="mt-3 text-xs text-white/30">Waiting for enough analytics history.</p>;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const polyline = points.map((value, index) => {
    const x = (index / Math.max(1, points.length - 1)) * 100;
    const y = 30 - (((value - min) / Math.max(1, max - min)) * 24);
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg viewBox="0 0 100 34" className="mt-3 h-10 w-full">
      <polyline points={polyline} fill="none" stroke="rgb(248 113 113)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatCard({
  label,
  value,
  trend,
  caption,
}: {
  label: string;
  value?: string | number | null;
  trend?: { series: number[]; change: number | null };
  caption?: string;
}) {
  return (
    <PanelCardSoft className="p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/35">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{formatNumber(value)}</p>
      {trend?.series?.length ? <ChannelSparkline values={trend.series} /> : <div className="mt-3 h-10" />}
      <p className={cn("text-xs", trend?.change != null ? (trend.change >= 0 ? "text-emerald-300" : "text-red-300") : "text-white/40")}>
        {trend?.change != null ? `${trend.change >= 0 ? "↑" : "↓"}${Math.abs(Math.round(trend.change))}% over the last 30 days` : caption || "Trend appears after more analytics data arrives."}
      </p>
    </PanelCardSoft>
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
  if (!videos.length) return <p className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/35">No videos uploaded during this week. Skip this day.</p>;
  return (
    <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
      <button
        type="button"
        onClick={() => onSelect("")}
        className={cn(
          "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors",
          !selected ? "border-white/20 bg-white/[0.05] text-white/45" : "border-white/10 bg-white/[0.03] text-white/35 hover:bg-white/[0.05]",
        )}
      >
        <span className="text-xs">No video posted this day - skip</span>
      </button>
      {videos.map((video) => {
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
              <img src={video.thumbnailUrl} alt="" className="h-[30px] w-10 rounded object-cover" />
            ) : (
              <div className="flex h-[30px] w-10 items-center justify-center rounded bg-red-500/10"><Youtube className="h-4 w-4 text-red-200" /></div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-white">{video.title}</p>
              <p className="mt-1 text-[11px] text-white/35">
                {videoOptionLabel(video)} · {formatNumber(video.viewCount)} views
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function CalendarPreviewCard({ day, onDragStart }: { day: PlanDay; onDragStart: (day: PlanDay) => void }) {
  const Icon = planCardIcon(day);
  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <button
          type="button"
          draggable
          onDragStart={() => onDragStart(day)}
          className="w-full rounded-lg border border-white/10 bg-white/[0.03] text-left transition-all hover:-translate-y-0.5 hover:bg-white/[0.06]"
        >
          <div className={cn("relative flex aspect-video items-end overflow-hidden rounded-t-lg bg-gradient-to-br p-3", placeholderStyle(day.contentIdea))}>
            <div className="absolute right-3 top-3 rounded-md border border-white/20 bg-black/20 p-1.5">
              <Icon className="h-4 w-4 text-white" />
            </div>
            <p className="line-clamp-2 max-w-[80%] text-sm font-semibold text-white">{day.contentIdea}</p>
          </div>
          <div className="p-3">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-white/35">
              <GripVertical className="h-3 w-3" />
              {postingTime(day)}
            </div>
            <p className="mt-2 line-clamp-2 text-sm text-white/80">{day.contentIdea}</p>
          </div>
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="border-white/10 bg-[#120d1f] text-white">
        <p className="text-xs uppercase tracking-[0.16em] text-white/40">Hook</p>
        <p className="mt-2 text-sm leading-6 text-white/80">{day.hook}</p>
      </HoverCardContent>
    </HoverCard>
  );
}

function PlannerIdeaCard({ day, onDragStart }: { day: PlanDay; onDragStart: (day: PlanDay) => void }) {
  return (
    <div draggable onDragStart={() => onDragStart(day)} className="rounded-lg border border-white/10 bg-white/[0.04] p-3 transition-all hover:-translate-y-0.5 hover:bg-white/[0.07]">
      <div className="flex items-start gap-2">
        <GripVertical className="mt-1 h-4 w-4 shrink-0 text-white/25" />
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-5 text-white">{day.contentIdea}</p>
          <p className="mt-2 text-xs leading-5 text-red-100/75">Hook: {day.hook}</p>
          <p className="mt-2 text-xs text-white/35">{postingTime(day)}</p>
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
        <div className="px-3 py-2" />
        {hourBuckets.map((bucket) => <div key={bucket.label} className="px-3 py-2 text-center">{bucket.label}</div>)}
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
                {cell?.value ? formatNumber(cell.value) : "—"}
              </div>
            );
          })}
        </div>
      ))}
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
                <PanelTitle>Growth Planner</PanelTitle>
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
                We'll notify you when Growth Planner launches.
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
  const [publishDay, setPublishDay] = useState<PlanDay | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customIdea, setCustomIdea] = useState({ title: "", angle: "", date: "" });

  const latestPlan = status?.latestPlan ?? null;
  const planPayload = latestPlan?.plan ?? {};
  const recentVideos = status?.channel?.recentVideos ?? [];
  const contextSnapshot = latestPlan?.contextSnapshot;
  const analyticsPoints = status?.channelAnalytics?.daily ?? [];
  const weekVideos = recentVideos.filter((video) => isVideoInPlanWindow(video, latestPlan));
  const linkedVideoIds = new Set((status?.latestResults ?? []).map((result) => result.videoId));
  const selectedVideoIds = new Set(Object.values(resultSelections).filter(Boolean));
  const hasSelectedResults = Object.values(resultSelections).some(Boolean);
  const matchedResultsCount = Object.values(resultSelections).filter(Boolean).length;
  const performanceInsights = (planPayload.performanceInsights ?? []).filter((insight) => insight.title && insight.finding);
  const hasResults = Boolean(status?.latestResults?.length);
  const ownSubscribers = parseNumber(status?.channel?.subscriberCount);

  useEffect(() => {
    setDays((latestPlan?.plan?.days ?? []).map((day) => ({ ...day, id: toCardId(day), stage: day.stage ?? "idea" })));
  }, [latestPlan?.id]);

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

  useEffect(() => {
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
  }, [plan.isStudio]);

  const calendarDays = useMemo(() => [...days].sort((a, b) => a.date.localeCompare(b.date) || a.day - b.day), [days]);
  const tagInsights = useMemo(
    () => deriveTagOpportunities(contextSnapshot?.recentVideos ?? recentVideos, contextSnapshot?.trends ?? []),
    [contextSnapshot?.recentVideos, contextSnapshot?.trends, recentVideos],
  );
  const insightDeck = useMemo(
    () => performanceInsights.map((insight) => enrichInsight(insight, contextSnapshot, analyticsPoints, recentVideos, tagInsights)),
    [performanceInsights, contextSnapshot, analyticsPoints, recentVideos, tagInsights],
  );
  const highConfidenceInsights = insightDeck.filter((insight) => insight.confidence === "high").slice(0, 3);
  const mediumConfidenceInsights = insightDeck.filter((insight) => insight.confidence === "medium");
  const lowConfidenceInsights = insightDeck.filter((insight) => insight.confidence === "low");
  const subscriberTrend = deriveStatTrend(analyticsPoints, "subscribersNet");
  const viewTrend = deriveStatTrend(analyticsPoints, "views");
  const progressState = weekProgress(days, status?.latestResults ?? []);
  const calendarWeek = getIsoWeekNumber(latestPlan?.startDate);

  if (!plan.isStudio) return <GrowthPlannerComingSoon />;
  if (loading || planLoading) return <LoadingState />;

  function updateDay(cardId: string, patch: Partial<PlanDay>) {
    setDays((current) => current.map((day) => toCardId(day) === cardId ? { ...day, ...patch } : day));
  }

  function handleDragStart(day: PlanDay) {
    window.sessionStorage.setItem("daytabs-dragged-youtube-day", toCardId(day));
  }

  function handleDropOnDate(date: string) {
    const cardId = window.sessionStorage.getItem("daytabs-dragged-youtube-day");
    if (cardId) updateDay(cardId, { date });
  }

  function handleDropOnStage(stage: Stage) {
    const cardId = window.sessionStorage.getItem("daytabs-dragged-youtube-day");
    const day = days.find((item) => toCardId(item) === cardId);
    if (!cardId || !day) return;
    if (stage === "published") {
      setPublishDay(day);
      return;
    }
    updateDay(cardId, { stage });
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
    setWorking("results");
    setError(null);
    try {
      await jsonFetch(`/api/youtube/plans/${latestPlan.id}/results`, { method: "POST", body: JSON.stringify({ results }) });
      setResultSelections({});
      setPublishDay(null);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not collect YouTube results");
    } finally {
      setWorking(null);
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
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not improve idea");
    } finally {
      setWorking(null);
    }
  }

  async function addCustomIdea() {
    const title = customIdea.title.trim();
    if (!title) return;
    const nextDay = days.length + 1;
    const date = customIdea.date || days[days.length - 1]?.date || new Date().toISOString().slice(0, 10);
    setDays((current) => [...current, {
      id: `custom-${crypto.randomUUID()}`,
      day: nextDay,
      date,
      stage: "idea",
      contentIdea: title,
      hook: customIdea.angle.split("\n")[0] || "AI-improved custom idea",
      outline: customIdea.angle.split("\n").filter(Boolean).slice(1, 5),
      bestPostingTime: "Use your best recent posting window",
      rationale: customIdea.angle || "User-added idea for this week's plan.",
    }]);
    setCustomIdea({ title: "", angle: "", date: "" });
    setCustomOpen(false);
  }

  return (
    <PanelPage className="max-w-7xl space-y-8 py-8">
      <PanelHeader className="justify-between gap-5 lg:items-end">
        <div className="space-y-4">
          <Badge className="border-red-400/20 bg-red-500/15 text-red-100 hover:brightness-100">
            <Youtube className="mr-2 h-3.5 w-3.5" />
            YouTube Growth Planner
          </Badge>
          <div>
            <PanelTitle className="text-4xl">Plan from your real channel data.</PanelTitle>
            <PanelSubtitle className="max-w-3xl">Connect your channel, use live YouTube and YouTube Analytics data, then turn actual performance patterns into a weekly plan you can execute.</PanelSubtitle>
          </div>
        </div>
        {status?.connected && (
          <div className="flex flex-wrap items-center gap-3">
            <Button className="rounded-lg bg-red-500 px-5 text-white hover:bg-red-400" onClick={generatePlan} disabled={Boolean(working)}>
              {working === "plan" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Youtube className="mr-2 h-4 w-4" />}
              Generate weekly plan
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="secondary" className="rounded-lg px-3 text-white/65" onClick={syncChannel} disabled={Boolean(working)}>
                {working === "sync" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                Refresh channel
              </Button>
              <Button variant="secondary" className="rounded-lg px-3 text-white/65" onClick={() => setCustomOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add idea
              </Button>
            </div>
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
          <section className="grid gap-4 md:grid-cols-5">
            <PanelCardStrong className="border border-white/10 p-5 md:col-span-2">
              <div className="flex items-center gap-4">
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
                  <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">Connected Channel</p>
                  <h2 className="mt-2 truncate text-2xl font-semibold text-white">{status.channel?.channelName ?? "Connected"}</h2>
                  <p className="mt-1 text-sm text-white/45">{status.channel?.nicheProfile?.niche ?? "Niche profile ready"}</p>
                  <p className="mt-3 text-sm leading-6 text-white/60">{status.channel?.nicheProfile?.summary ?? "Refresh the channel to generate a niche profile."}</p>
                </div>
              </div>
            </PanelCardStrong>
            <StatCard label="Subscribers" value={status.channel?.subscriberCount} trend={subscriberTrend} />
            <StatCard label="Total Views" value={status.channel?.totalViewCount} trend={viewTrend} />
            <StatCard label="Videos" value={status.channel?.videoCount} caption="Current published video count from YouTube." />
          </section>

          <section className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <PanelCard className="p-6">
              <div className="flex items-center gap-3">
                <BarChart3 className="h-5 w-5 text-emerald-300" />
                <h2 className="text-2xl font-semibold text-white">Channel Overview</h2>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {["whatWorked", "whyItWorked", "underperformers", "recommendations"].map((key) => (
                  <PanelCardSoft key={key} className="p-4">
                    <p className="text-lg font-semibold capitalize text-white">{key.replace(/([A-Z])/g, " $1")}</p>
                    <ul className="mt-3 space-y-2 text-sm leading-6 text-white/60">
                      {((planPayload.accountAnalysis as Record<string, string[]> | undefined)?.[key] ?? []).slice(0, 4).map((item) => <li key={item}>{item}</li>)}
                      {!((planPayload.accountAnalysis as Record<string, string[]> | undefined)?.[key] ?? []).length && <li>Generate a plan to analyze titles, descriptions, tags, and performance signals.</li>}
                    </ul>
                  </PanelCardSoft>
                ))}
              </div>
            </PanelCard>

            <PanelCard className="p-6">
              <div className="flex items-center gap-3">
                <TrendingUp className="h-5 w-5 text-sky-300" />
                <h2 className="text-2xl font-semibold text-white">Recent Videos</h2>
              </div>
              <p className="mt-2 text-sm text-white/45">All source material here comes from the connected channel’s actual recent uploads.</p>
              <div className="mt-4 space-y-3">
                {recentVideos.slice(0, 5).map((video) => (
                  <a key={video.id} href={video.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-lg border border-white/10 p-3 text-sm text-white/70 transition-all hover:-translate-y-0.5 hover:bg-white/5">
                    {video.thumbnailUrl ? <img src={video.thumbnailUrl} alt="" className="h-14 w-20 rounded object-cover" /> : <div className="flex h-14 w-20 items-center justify-center rounded bg-red-500/10"><Youtube className="h-5 w-5 text-red-200" /></div>}
                    <div className="min-w-0">
                      <span className="line-clamp-2 text-white">{video.title}</span>
                      <span className="mt-2 flex items-center gap-3 text-xs text-white/35">{formatNumber(video.viewCount)} views <ExternalLink className="h-3 w-3" /></span>
                    </div>
                  </a>
                ))}
              </div>
            </PanelCard>
          </section>

          <PanelCard className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-3">
                  <BarChart3 className="h-5 w-5 text-emerald-300" />
                  <h2 className="text-2xl font-semibold text-white">Performance Intelligence</h2>
                </div>
                <p className="mt-2 text-sm text-white/45">Charts are drawn from saved plan context, channel uploads, YouTube Analytics history, and discovered competitor data.</p>
              </div>
              <Badge className="border-emerald-400/20 bg-emerald-500/10 text-emerald-200 hover:brightness-100">{performanceInsights.length || 0}/12 insights</Badge>
            </div>

            {highConfidenceInsights.length ? (
              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                {highConfidenceInsights.map((insight, index) => (
                  <div key={`${insight.type}-${index}`} className={cn(index === 0 && highConfidenceInsights.length === 3 ? "xl:col-span-2" : "")}>
                    <PerformanceInsightCard insight={insight} />
                  </div>
                ))}
              </div>
            ) : (
              <PanelCardSoft className="mt-5 p-4 text-sm text-white/55">
                Generate a weekly plan to unlock high-confidence headline insights from your current channel data.
              </PanelCardSoft>
            )}

            <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <PanelCardSoft className="border border-white/10 p-5">
                <div className="flex items-center gap-3">
                  <Tags className="h-5 w-5 text-amber-300" />
                  <h3 className="text-xl font-semibold text-white">Viral Tag Opportunities</h3>
                </div>
                <p className="mt-2 text-sm text-white/45">Ranked from actual tag overlap between this channel’s uploads and the trend videos saved with the plan.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {tagInsights.length ? tagInsights.map((tag) => (
                    <Popover key={tag.tag}>
                      <PopoverTrigger asChild>
                        <button type="button" className="rounded-lg border border-amber-300/15 bg-amber-400/10 px-3 py-2 text-sm text-white transition-transform hover:-translate-y-0.5">
                          #{tag.tag}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="border-white/10 bg-[#120d1f] text-white">
                        <p className="font-medium">#{tag.tag}</p>
                        <p className="mt-2 text-sm leading-6 text-white/75">{tag.guidance}</p>
                        <p className="mt-2 text-xs text-white/45">{tag.creatorUses} channel uses · {tag.trendUses} trend uses</p>
                      </PopoverContent>
                    </Popover>
                  )) : <p className="text-sm text-white/45">Not enough real tag overlap data yet. Generate a fresh plan after syncing the channel.</p>}
                </div>
              </PanelCardSoft>

              <PanelCardSoft className="border border-white/10 p-5">
                <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">Needs More Data to Confirm</p>
                <div className="mt-4 space-y-3">
                  {lowConfidenceInsights.length ? lowConfidenceInsights.map((insight) => (
                    <div key={`${insight.type}-${insight.title}`} className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3" title={insight.dataLimitations || "The underlying YouTube data was missing or too thin to support a stronger claim."}>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-white">{insight.title}</p>
                          <p className="mt-1 text-sm text-white/50">{insight.finding}</p>
                        </div>
                        <Badge className={`${confidenceClass("low")} hover:brightness-100`}>low</Badge>
                      </div>
                    </div>
                  )) : <p className="text-sm text-white/45">No low-confidence insight rows right now.</p>}
                </div>
              </PanelCardSoft>
            </div>

            {mediumConfidenceInsights.length ? (
              <div className="mt-6 grid gap-4 xl:grid-cols-2">
                {mediumConfidenceInsights.map((insight) => (
                  <PerformanceInsightCard key={`${insight.type}-${insight.title}`} insight={insight} compact />
                ))}
              </div>
            ) : null}
          </PanelCard>

          <PanelCard className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-3">
                  <CalendarDays className="h-5 w-5 text-red-300" />
                  <h2 className="text-2xl font-semibold text-white">
                    {latestPlan ? `Week ${calendarWeek ?? latestPlan.weekNumber} Calendar` : "Weekly Calendar"}
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
                <span>{progressState.planned} of 7 planned</span>
                <span>{progressState.posted} posted</span>
              </div>
              <Progress value={progressState.progress} className="mt-3 bg-white/10 [&>div]:bg-red-400" />
            </div>
            {latestPlan?.plan?.summary && <p className="mt-4 text-sm text-white/55">{latestPlan.plan.summary}</p>}
            {viewMode === "calendar" ? (
              <div className="mt-5 grid gap-3 lg:grid-cols-7">
                {calendarDays.map((day) => (
                  <div key={`${day.day}-${day.date}`} onDragOver={(event) => event.preventDefault()} onDrop={() => handleDropOnDate(day.date)} className="min-h-[260px] rounded-lg border border-white/10 bg-white/[0.025] p-3">
                    <p className="text-sm font-semibold text-white">{dayName(day.date)}</p>
                    <p className="mb-3 mt-1 text-xs text-white/35">Day {day.day} · {postingTime(day)}</p>
                    <CalendarPreviewCard day={day} onDragStart={handleDragStart} />
                  </div>
                ))}
                {!days.length && <div className="rounded-lg border border-white/10 p-8 text-center text-sm text-white/45 lg:col-span-7">Generate a plan to create seven YouTube ideas grounded in your channel data.</div>}
              </div>
            ) : (
              <div className="mt-5 grid gap-3 lg:grid-cols-5">
                {stages.map((stage) => (
                  <div key={stage.id} onDragOver={(event) => event.preventDefault()} onDrop={() => handleDropOnStage(stage.id)} className="min-h-[260px] rounded-lg border border-white/10 bg-white/[0.025] p-3">
                    <p className="mb-3 text-sm font-semibold text-white">{stage.label}</p>
                    <div className="space-y-3">
                      {days.filter((day) => (day.stage ?? "idea") === stage.id).map((day) => <PlannerIdeaCard key={toCardId(day)} day={day} onDragStart={handleDragStart} />)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </PanelCard>

          <section className="grid gap-6 lg:grid-cols-[1fr_420px]">
            <PanelCard className="p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold text-white">Competitor Intelligence</h2>
                  <p className="mt-1 text-sm text-white/45">Comparable and aspirational channels are labeled against this channel’s actual subscriber count.</p>
                </div>
                <Button variant="secondary" className="rounded-lg" onClick={discoverCompetitorsOnly} disabled={Boolean(working)}>
                  {working === "competitors" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                  Discover competitors
                </Button>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {(status.competitors ?? []).slice(0, 6).map((competitor) => {
                  const insight = planPayload.competitorInsights?.find((item) => item.channelName === competitor.channelName);
                  const url = insight?.channelUrl || `https://www.youtube.com/channel/${competitor.channelId ?? ""}`;
                  const relative = relativeCompetitorLabel(competitor, ownSubscribers);
                  const maxSubscribers = Math.max(ownSubscribers, ...(status.competitors ?? []).map((item) => parseNumber(item.subscriberCount)));
                  const competitorSubs = parseNumber(competitor.subscriberCount);
                  return (
                    <PanelCardSoft key={competitor.id} className="border border-white/10 p-4 transition-all hover:-translate-y-0.5 hover:bg-white/[0.05]">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-12 w-12 rounded-[14px]">
                            <AvatarImage src={competitor.thumbnailUrl ?? undefined} alt={competitor.channelName} />
                            <AvatarFallback className="rounded-[14px] bg-white/[0.08] text-sm text-white">{initials(competitor.channelName)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium text-white">{competitor.channelName}</p>
                            <p className="mt-1 text-xs text-white/40">{formatNumber(competitor.subscriberCount)} subscribers</p>
                          </div>
                        </div>
                        <a href={url} target="_blank" rel="noreferrer" className="rounded-lg border border-white/10 p-2 text-white/55 hover:bg-white/5"><ExternalLink className="h-4 w-4" /></a>
                      </div>
                      <div className="mt-4 rounded-lg border border-white/10 bg-black/10 p-3">
                        <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.16em] text-white/40">
                          <span>{relative.label}</span>
                          <span>{relative.ratio ? `${Math.round(relative.ratio)}x Aeda` : "No ratio yet"}</span>
                        </div>
                        <div className="mt-3 space-y-2">
                          <div>
                            <div className="mb-1 flex items-center justify-between text-xs text-white/45"><span>Aeda</span><span>{formatNumber(ownSubscribers)}</span></div>
                            <div className="h-2 rounded-full bg-white/8"><div className="h-full rounded-full bg-red-300" style={{ width: `${comparisonBarWidth(ownSubscribers, maxSubscribers)}%` }} /></div>
                          </div>
                          <div>
                            <div className="mb-1 flex items-center justify-between text-xs text-white/45"><span>{competitor.channelName}</span><span>{formatNumber(competitorSubs)}</span></div>
                            <div className="h-2 rounded-full bg-white/8"><div className="h-full rounded-full bg-emerald-300" style={{ width: `${comparisonBarWidth(competitorSubs, maxSubscribers)}%` }} /></div>
                          </div>
                        </div>
                      </div>
                      <p className="mt-3 text-xs text-white/45">{competitor.postingFrequency ?? "Frequency unavailable"}</p>
                      {!!competitor.mostViewedRecentVideos?.length && (
                        <p className="mt-3 text-sm text-white/60">Top recent signal: {competitor.mostViewedRecentVideos[0]?.title}</p>
                      )}
                    </PanelCardSoft>
                  );
                })}
                {!status.competitors?.length && <PanelCardSoft className="p-4 text-sm text-white/55 md:col-span-2">No competitors are saved yet. Run competitor discovery and DayTabs will search YouTube for comparable channels in this niche.</PanelCardSoft>}
              </div>
            </PanelCard>

            {latestPlan && (
              <PanelCard className="p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-semibold text-white">End of Week Results</h2>
                    <p className="mt-1 text-sm text-white/45">Match each content idea to an actual uploaded video using the real thumbnail, date, and view count.</p>
                  </div>
                  <Button
                    className="rounded-lg bg-emerald-500 text-emerald-950 hover:bg-emerald-400 disabled:bg-white/10 disabled:text-white/30"
                    onClick={() => submitResults()}
                    disabled={working === "results" || !hasSelectedResults}
                  >
                    {working === "results" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    {hasSelectedResults ? `Fetch results for ${matchedResultsCount} matched video${matchedResultsCount === 1 ? "" : "s"}` : "Fetch results"}
                  </Button>
                </div>
                <div className="mt-5 space-y-3">
                  {days.map((day) => (
                    <div key={`result-${toCardId(day)}`} className="rounded-lg border border-white/10 p-3">
                      <p className="text-sm font-medium text-white">Day {day.day}: {day.contentIdea}</p>
                      <VideoPicker
                        videos={weekVideos}
                        selected={resultSelections[day.day] ?? ""}
                        disabledIds={new Set([...linkedVideoIds, ...selectedVideoIds].filter((videoId) => resultSelections[day.day] !== videoId))}
                        onSelect={(videoId) => setResultSelections((current) => ({ ...current, [day.day]: videoId }))}
                      />
                    </div>
                  ))}
                </div>
                {hasResults && (
                  <div className="mt-5 space-y-3">
                    {(status.latestResults ?? []).map((result) => (
                      <PanelCardSoft key={result.id} className="p-3">
                        <p className="text-sm font-medium text-white">{result.plannedTitle}</p>
                        <a className="mt-1 block text-xs text-red-200 hover:text-red-100" href={result.videoUrl} target="_blank" rel="noreferrer">{result.videoUrl}</a>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-white/50">{Object.entries(result.metrics ?? {}).slice(0, 6).map(([key, value]) => <span key={key}>{key}: {metricLabel(value)}</span>)}</div>
                      </PanelCardSoft>
                    ))}
                  </div>
                )}
              </PanelCard>
            )}
          </section>
        </>
      )}

      <Dialog open={Boolean(publishDay)} onOpenChange={(open) => !open && setPublishDay(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link published video</DialogTitle>
            <DialogDescription>Choose which YouTube upload matches this content idea so DayTabs can pull real performance.</DialogDescription>
          </DialogHeader>
          {publishDay && (
            <div className="space-y-4">
              <p className="text-sm text-white/70">{publishDay.contentIdea}</p>
              <VideoPicker
                videos={weekVideos}
                selected={resultSelections[publishDay.day] ?? ""}
                disabledIds={new Set([...linkedVideoIds, ...selectedVideoIds].filter((videoId) => resultSelections[publishDay.day] !== videoId))}
                onSelect={(videoId) => setResultSelections((current) => ({ ...current, [publishDay.day]: videoId }))}
              />
              <Button className="w-full rounded-lg bg-emerald-500 text-emerald-950 hover:bg-emerald-400" disabled={!resultSelections[publishDay.day] || working === "results"} onClick={() => submitResults([{ dayIndex: publishDay.day, plannedTitle: publishDay.contentIdea, videoId: resultSelections[publishDay.day] }]).then(() => updateDay(toCardId(publishDay), { stage: "published" }))}>
                {working === "results" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}Link and publish
              </Button>
            </div>
          )}
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
