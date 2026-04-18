import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  Archive,
  BarChart3,
  Bell,
  CalendarDays,
  Check,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { usePlan } from "@/hooks/use-plan";
import { PanelPage, PanelHeader, PanelTitle, PanelSubtitle, PanelCard, PanelCardSoft, PanelEyebrow } from "@/components/panel-system";

type Stage = "idea" | "recording" | "editing" | "published" | "draft";
type ViewMode = "calendar" | "planner";

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
  url: string;
}

interface YoutubeChannel {
  channelId: string;
  channelName: string;
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
  performanceInsights?: Array<{
    type?: string;
    title?: string;
    finding?: string;
    evidence?: string;
    action?: string;
    confidence?: "high" | "medium" | "low" | string;
    chart?: Array<{ label?: string; value?: number; comparisonValue?: number }>;
    dataLimitations?: string;
  }>;
  days?: PlanDay[];
}

interface YoutubeWeeklyPlan {
  id: number;
  weekNumber: number;
  startDate: string;
  endDate: string;
  plan: PlanPayload;
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

const stages: Array<{ id: Stage; label: string }> = [
  { id: "idea", label: "Ideas" },
  { id: "recording", label: "Recording" },
  { id: "editing", label: "Editing" },
  { id: "published", label: "Published" },
  { id: "draft", label: "Archived / Draft" },
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
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data as T;
}

function formatNumber(value?: string | null) {
  const number = Number(value);
  if (!Number.isFinite(number)) return value || "Unknown";
  return new Intl.NumberFormat(undefined, { notation: number >= 10000 ? "compact" : "standard" }).format(number);
}

function metricLabel(value: unknown) {
  if (value == null) return "n/a";
  if (typeof value === "number") return new Intl.NumberFormat().format(value);
  return String(value);
}

function dayName(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00`);
  return Number.isNaN(date.getTime()) ? `Day` : date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function postingTime(day: PlanDay) {
  return day.bestPostingTime?.trim() || "12:00";
}

function isVideoInPlanWindow(video: RecentVideo, plan: YoutubeWeeklyPlan | null) {
  if (!plan || !video.publishedAt) return false;
  const published = new Date(video.publishedAt).getTime();
  const start = new Date(`${plan.startDate}T00:00:00`).getTime();
  const end = new Date(`${plan.endDate}T23:59:59`).getTime();
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

function confidenceClass(confidence?: string) {
  if (confidence === "high") return "border-emerald-400/20 bg-emerald-500/10 text-emerald-200";
  if (confidence === "medium") return "border-amber-400/20 bg-amber-500/10 text-amber-200";
  return "border-white/10 bg-white/5 text-white/55";
}

function MiniInsightChart({ data }: { data?: Array<{ label?: string; value?: number; comparisonValue?: number }> }) {
  const items = (data ?? []).filter((item) => typeof item.value === "number").slice(0, 4);
  if (!items.length) return null;
  const max = Math.max(...items.map((item) => Math.max(Number(item.value) || 0, Number(item.comparisonValue) || 0)), 1);
  return (
    <div className="mt-4 space-y-2">
      {items.map((item) => (
        <div key={`${item.label}-${item.value}`} className="space-y-1">
          <div className="flex justify-between gap-3 text-xs text-white/40">
            <span className="truncate">{item.label}</span>
            <span>{Math.round(Number(item.value) || 0)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/8">
            <div className="h-full rounded-full bg-emerald-300" style={{ width: `${Math.max(6, ((Number(item.value) || 0) / max) * 100)}%` }} />
          </div>
          {typeof item.comparisonValue === "number" && (
            <div className="h-1 overflow-hidden rounded-full bg-white/8">
              <div className="h-full rounded-full bg-red-300/70" style={{ width: `${Math.max(4, ((Number(item.comparisonValue) || 0) / max) * 100)}%` }} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function toCardId(day: PlanDay) {
  return day.id || `${day.day}-${day.date}-${day.contentIdea}`;
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

function IdeaCard({ day, onDragStart, compact = false }: { day: PlanDay; onDragStart: (day: PlanDay) => void; compact?: boolean }) {
  return (
    <div draggable onDragStart={() => onDragStart(day)} className="rounded-lg border border-white/10 bg-white/[0.04] p-3 transition-colors hover:bg-white/[0.07]">
      <div className="flex items-start gap-2">
        <GripVertical className="mt-1 h-4 w-4 shrink-0 text-white/25" />
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-5 text-white">{day.contentIdea}</p>
          {!compact && <p className="mt-2 text-xs leading-5 text-red-100/75">Hook: {day.hook}</p>}
          <p className="mt-2 text-xs text-white/35">{postingTime(day)}</p>
        </div>
      </div>
    </div>
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
  const weekVideos = recentVideos.filter((video) => isVideoInPlanWindow(video, latestPlan));
  const linkedVideoIds = new Set((status?.latestResults ?? []).map((result) => result.videoId));
  const selectedVideoIds = new Set(Object.values(resultSelections).filter(Boolean));
  const hasSelectedResults = Object.values(resultSelections).some(Boolean);
  const usefulTags = (planPayload.viralTags ?? []).filter((tag) => tag.tag && tag.why).slice(0, 10);
  const performanceInsights = (planPayload.performanceInsights ?? []).filter((insight) => insight.title && insight.finding);
  const hasResults = Boolean(status?.latestResults?.length);

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

  if (!plan.isStudio) return <GrowthPlannerComingSoon />;

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

  if (loading || planLoading) {
    return (
      <PanelPage className="max-w-6xl py-8">
        <div className="flex min-h-[360px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-red-300" />
        </div>
      </PanelPage>
    );
  }

  return (
    <PanelPage className="max-w-7xl space-y-8 py-8">
      <PanelHeader className="justify-between gap-5 lg:items-end">
        <div>
          <Badge className="border-red-400/20 bg-red-500/15 text-red-100 hover:brightness-100">
            <Youtube className="mr-2 h-3.5 w-3.5" />
            YouTube Growth Planner
          </Badge>
          <PanelTitle className="mt-4 text-4xl">Plan from your real channel data.</PanelTitle>
          <PanelSubtitle className="max-w-3xl">Connect any YouTube account, analyze the channel, pull live trends and comparable competitors, then generate weekly plans that learn from actual results.</PanelSubtitle>
        </div>
        {status?.connected && (
          <div className="flex flex-wrap items-center gap-2">
            <Button className="rounded-lg bg-red-500 px-5 text-white hover:bg-red-400" onClick={generatePlan} disabled={Boolean(working)}>
              {working === "plan" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Youtube className="mr-2 h-4 w-4" />}
              Generate weekly plan
            </Button>
            <Button variant="secondary" className="rounded-lg px-3 text-white/65" onClick={syncChannel} disabled={Boolean(working)}>
              {working === "sync" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
              Refresh channel
            </Button>
            <Button variant="secondary" className="rounded-lg px-3 text-white/65" onClick={() => setCustomOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add idea
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
          <section className="grid gap-4 md:grid-cols-5">
            <PanelCardSoft className="p-4 md:col-span-2"><p className="text-xs uppercase tracking-[0.18em] text-white/35">Connected Channel</p><p className="mt-2 text-xl font-semibold text-white">{status.channel?.channelName ?? "Connected"}</p><p className="mt-1 text-xs text-white/35">{status.channel?.nicheProfile?.niche ?? "Niche profile ready"}</p></PanelCardSoft>
            <PanelCardSoft className="p-4"><p className="text-xs uppercase tracking-[0.18em] text-white/35">Subscribers</p><p className="mt-2 text-lg font-semibold text-white">{formatNumber(status.channel?.subscriberCount)}</p></PanelCardSoft>
            <PanelCardSoft className="p-4"><p className="text-xs uppercase tracking-[0.18em] text-white/35">Total Views</p><p className="mt-2 text-lg font-semibold text-white">{formatNumber(status.channel?.totalViewCount)}</p></PanelCardSoft>
            <PanelCardSoft className="p-4"><p className="text-xs uppercase tracking-[0.18em] text-white/35">Videos</p><p className="mt-2 text-lg font-semibold text-white">{formatNumber(status.channel?.videoCount)}</p></PanelCardSoft>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1fr_380px]">
            <PanelCard className="p-6">
              <div className="flex items-center gap-3"><BarChart3 className="h-5 w-5 text-emerald-300" /><h2 className="text-xl font-semibold text-white">Channel Overview</h2></div>
              <p className="mt-4 text-sm leading-6 text-white/60">{status.channel?.nicheProfile?.summary ?? "Refresh the channel to generate a niche profile."}</p>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {["whatWorked", "whyItWorked", "underperformers", "recommendations"].map((key) => (
                  <PanelCardSoft key={key} className="p-4">
                    <p className="text-sm font-medium capitalize text-white">{key.replace(/([A-Z])/g, " $1")}</p>
                    <ul className="mt-3 space-y-2 text-sm text-white/55">
                      {((planPayload.accountAnalysis as Record<string, string[]> | undefined)?.[key] ?? []).slice(0, 4).map((item) => <li key={item}>{item}</li>)}
                      {!((planPayload.accountAnalysis as Record<string, string[]> | undefined)?.[key] ?? []).length && <li>Generate a plan to analyze titles, descriptions, tags, and performance signals.</li>}
                    </ul>
                  </PanelCardSoft>
                ))}
              </div>
            </PanelCard>
            <PanelCard className="p-6">
              <div className="flex items-center gap-3"><TrendingUp className="h-5 w-5 text-sky-300" /><h2 className="text-xl font-semibold text-white">Recent Videos</h2></div>
              <p className="mt-2 text-sm text-white/45">Used as source material for channel voice, title patterns, tags, and performance analysis. Open any video on YouTube.</p>
              <div className="mt-4 space-y-3">
                {recentVideos.slice(0, 5).map((video) => (
                  <a key={video.id} href={video.url} target="_blank" rel="noreferrer" className="block rounded-lg border border-white/10 p-3 text-sm text-white/70 transition-colors hover:bg-white/5">
                    <span className="line-clamp-2 text-white">{video.title}</span>
                    <span className="mt-2 flex items-center gap-3 text-xs text-white/35">{formatNumber(video.viewCount)} views <ExternalLink className="h-3 w-3" /></span>
                  </a>
                ))}
              </div>
            </PanelCard>
          </section>

          <section className="grid gap-6 lg:grid-cols-[380px_1fr]">
            <PanelCard className="p-6">
              <div className="flex items-center gap-3"><Tags className="h-5 w-5 text-amber-300" /><h2 className="text-xl font-semibold text-white">Viral Tag Opportunities</h2></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {usefulTags.length >= 3 ? usefulTags.map((tag) => (
                  <PanelCardSoft key={tag.tag} className="p-3">
                    <p className="font-medium text-white">{tag.tag}</p>
                    <p className="mt-2 text-xs leading-5 text-white/50">{tag.why}</p>
                    <p className="mt-2 text-xs text-amber-100/70">{tag.bestUse}</p>
                  </PanelCardSoft>
                )) : <p className="text-sm text-white/45">Not enough reliable tag data yet. Generate again after fresh trend data or recent uploads are available.</p>}
              </div>
            </PanelCard>
            <PanelCard className="p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-3"><BarChart3 className="h-5 w-5 text-emerald-300" /><h2 className="text-xl font-semibold text-white">Performance Intelligence</h2></div>
                  <p className="mt-2 text-sm text-white/45">Personalized patterns from your own videos, analytics, tags, comments, and comparable channels.</p>
                </div>
                <Badge className="border-emerald-400/20 bg-emerald-500/10 text-emerald-200 hover:brightness-100">{performanceInsights.length || 0}/12 insights</Badge>
              </div>
              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                {performanceInsights.length ? performanceInsights.map((insight) => (
                  <PanelCardSoft key={`${insight.type}-${insight.title}`} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.16em] text-white/35">{insightLabel(insight.type)}</p>
                        <h3 className="mt-2 text-base font-semibold text-white">{insight.title}</h3>
                      </div>
                      <Badge className={`${confidenceClass(insight.confidence)} hover:brightness-100`}>{insight.confidence ?? "low"}</Badge>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-white/65">{insight.finding}</p>
                    <MiniInsightChart data={insight.chart} />
                    <div className="mt-4 grid gap-3 text-xs leading-5 text-white/50">
                      {insight.evidence && <p><span className="text-white/75">Evidence:</span> {insight.evidence}</p>}
                      {insight.action && <p><span className="text-emerald-200">Next move:</span> {insight.action}</p>}
                      {insight.dataLimitations && <p className="text-amber-100/70">{insight.dataLimitations}</p>}
                    </div>
                  </PanelCardSoft>
                )) : (
                  <PanelCardSoft className="p-4 text-sm text-white/55 xl:col-span-2">
                    Generate a weekly plan to build personalized insight cards for best posting time, hook performance, title length, retention, tags, comments, subscriber velocity, and more.
                  </PanelCardSoft>
                )}
              </div>
            </PanelCard>
          </section>

          <PanelCard className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3"><CalendarDays className="h-5 w-5 text-red-300" /><h2 className="text-xl font-semibold text-white">{latestPlan ? `Week ${latestPlan.weekNumber} Calendar` : "Weekly Calendar"}</h2></div>
              <div className="flex gap-2">
                <Button variant={viewMode === "calendar" ? "default" : "secondary"} className="rounded-lg" onClick={() => setViewMode("calendar")}><LayoutGrid className="mr-2 h-4 w-4" />Calendar</Button>
                <Button variant={viewMode === "planner" ? "default" : "secondary"} className="rounded-lg" onClick={() => setViewMode("planner")}><ListChecks className="mr-2 h-4 w-4" />Planner</Button>
              </div>
            </div>
            {latestPlan?.plan?.summary && <p className="mt-4 text-sm text-white/55">{latestPlan.plan.summary}</p>}
            {viewMode === "calendar" ? (
              <div className="mt-5 grid gap-3 lg:grid-cols-7">
                {calendarDays.map((day) => (
                  <div key={`${day.day}-${day.date}`} onDragOver={(event) => event.preventDefault()} onDrop={() => handleDropOnDate(day.date)} className="min-h-[220px] rounded-lg border border-white/10 bg-white/[0.025] p-3">
                    <p className="text-sm font-semibold text-white">{dayName(day.date)}</p>
                    <p className="mb-3 mt-1 text-xs text-white/35">Day {day.day} · {postingTime(day)}</p>
                    <IdeaCard day={day} onDragStart={handleDragStart} compact />
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
                      {days.filter((day) => (day.stage ?? "idea") === stage.id).map((day) => <IdeaCard key={toCardId(day)} day={day} onDragStart={handleDragStart} />)}
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
                  <h2 className="text-xl font-semibold text-white">Competitor Intelligence</h2>
                  <p className="mt-1 text-sm text-white/45">Comparable channels are discovered from your niche keywords and subscriber range.</p>
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
                  return (
                    <PanelCardSoft key={competitor.id} className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div><p className="font-medium text-white">{competitor.channelName}</p><p className="mt-1 text-xs text-white/40">{formatNumber(competitor.subscriberCount)} subscribers · {competitor.postingFrequency ?? "Frequency unavailable"}</p></div>
                        <a href={url} target="_blank" rel="noreferrer" className="rounded-lg border border-white/10 p-2 text-white/55 hover:bg-white/5"><ExternalLink className="h-4 w-4" /></a>
                      </div>
                      <ul className="mt-3 space-y-2 text-sm text-white/55">
                        {(insight?.whatIsWorking ?? []).slice(0, 2).map((item) => <li key={item}>{item}</li>)}
                        {(insight?.whyVideosGoViral ?? []).slice(0, 2).map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </PanelCardSoft>
                  );
                })}
                {!status.competitors?.length && <PanelCardSoft className="p-4 text-sm text-white/55 md:col-span-2">No competitors are saved yet. Run competitor discovery and DayTabs will search YouTube for comparable channels in this niche.</PanelCardSoft>}
              </div>
            </PanelCard>

            {latestPlan && (
              <PanelCard className="p-6">
                <div className="flex items-center justify-between gap-3">
                  <div><h2 className="text-xl font-semibold text-white">End of Week Results</h2><p className="mt-1 text-sm text-white/45">Choose the posted YouTube video for each idea.</p></div>
                  <Button className="rounded-lg bg-emerald-500 text-emerald-950 hover:bg-emerald-400 disabled:bg-white/10 disabled:text-white/30" onClick={() => submitResults()} disabled={working === "results" || !hasSelectedResults}>
                    {working === "results" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Fetch results
                  </Button>
                </div>
                <div className="mt-5 space-y-3">
                  {days.map((day) => (
                    <div key={`result-${toCardId(day)}`} className="rounded-lg border border-white/10 p-3">
                      <p className="text-sm font-medium text-white">Day {day.day}: {day.contentIdea}</p>
                      <select value={resultSelections[day.day] ?? ""} onChange={(event) => setResultSelections((current) => ({ ...current, [day.day]: event.target.value }))} className="mt-3 w-full rounded-lg border border-white/10 bg-[#120d1f] px-3 py-2 text-sm text-white">
                        <option value="">{weekVideos.length ? "No video posted this day - skip" : "No videos uploaded during this week"}</option>
                        {weekVideos.map((video) => {
                          const disabled = linkedVideoIds.has(video.id) || (selectedVideoIds.has(video.id) && resultSelections[day.day] !== video.id);
                          return <option key={video.id} value={video.id} disabled={disabled}>{videoOptionLabel(video)}</option>;
                        })}
                      </select>
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
              <select value={resultSelections[publishDay.day] ?? ""} onChange={(event) => setResultSelections((current) => ({ ...current, [publishDay.day]: event.target.value }))} className="w-full rounded-lg border border-white/10 bg-[#120d1f] px-3 py-2 text-sm text-white">
                <option value="">{weekVideos.length ? "No video posted this day - skip" : "No videos uploaded during this week"}</option>
                {weekVideos.map((video) => {
                  const disabled = linkedVideoIds.has(video.id) || (selectedVideoIds.has(video.id) && resultSelections[publishDay.day] !== video.id);
                  return <option key={video.id} value={video.id} disabled={disabled}>{videoOptionLabel(video)}</option>;
                })}
              </select>
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
