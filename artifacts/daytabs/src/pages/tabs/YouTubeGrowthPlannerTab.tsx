import { type FormEvent, useEffect, useMemo, useState } from "react";
import { BarChart3, Bell, CalendarDays, Check, Clock, ExternalLink, Loader2, RefreshCcw, Send, TrendingUp, Youtube } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePlan } from "@/hooks/use-plan";
import { PanelPage, PanelHeader, PanelTitle, PanelSubtitle, PanelCard, PanelCardSoft, PanelEyebrow } from "@/components/panel-system";

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
  recentVideos?: Array<{
    id: string;
    title: string;
    viewCount?: string | null;
    url: string;
  }>;
}

interface YoutubeCompetitor {
  id: number;
  channelName: string;
  subscriberCount?: string | null;
  postingFrequency?: string | null;
  mostViewedRecentVideos?: Array<{ title?: string; viewCount?: string | null; url?: string }>;
}

interface YoutubePlanDay {
  day: number;
  date: string;
  contentIdea: string;
  hook: string;
  outline: string[];
  bestPostingTime: string;
  rationale: string;
}

interface YoutubeWeeklyPlan {
  id: number;
  weekNumber: number;
  startDate: string;
  endDate: string;
  plan: {
    summary?: string;
    days?: YoutubePlanDay[];
  };
}

interface YoutubePlanResult {
  id: number;
  plannedTitle: string;
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

  const features = [
    "Weekly content calendar tailored to your niche",
    "Platform-by-platform cadence and post mix",
    "Competitor inspiration and trend prompts",
    "Next-week refresh from posted results",
  ];

  async function handleNotify(event: FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await jsonFetch("/api/growth-planner/notify", {
        method: "POST",
        body: JSON.stringify({ email: email.trim() }),
      });
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
            <PanelSubtitle className="mt-0">
              Build a niche-aware content system with weekly calendars, platform mix, competitor ideas, and next-step planning from your results.
            </PanelSubtitle>
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
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="your@email.com"
                  required
                  disabled={loading}
                  className="panel-input w-full px-4 py-3 disabled:opacity-50"
                />
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

export default function YouTubeGrowthPlannerTab() {
  const { plan, loading: planLoading } = usePlan();
  const [status, setStatus] = useState<YoutubeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultUrls, setResultUrls] = useState<Record<number, string>>({});

  const latestPlan = status?.latestPlan ?? null;
  const days = useMemo(() => latestPlan?.plan?.days ?? [], [latestPlan]);
  const hasResults = Boolean(status?.latestResults?.length);

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

  if (!plan.isStudio) {
    return <GrowthPlannerComingSoon />;
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

  async function submitResults() {
    if (!latestPlan) return;
    const results = days
      .map((day) => ({
        dayIndex: day.day,
        plannedTitle: day.contentIdea,
        videoUrl: resultUrls[day.day]?.trim(),
      }))
      .filter((item): item is { dayIndex: number; plannedTitle: string; videoUrl: string } => Boolean(item.videoUrl));
    if (!results.length) {
      setError("Paste at least one YouTube video URL before submitting results.");
      return;
    }

    setWorking("results");
    setError(null);
    try {
      await jsonFetch(`/api/youtube/plans/${latestPlan.id}/results`, {
        method: "POST",
        body: JSON.stringify({ results }),
      });
      setResultUrls({});
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not collect YouTube results");
    } finally {
      setWorking(null);
    }
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
          <PanelSubtitle className="max-w-3xl">
            Connect any YouTube account, analyze the channel, pull live trends and comparable competitors, then generate weekly plans that learn from actual results.
          </PanelSubtitle>
        </div>
        <div className="flex flex-wrap gap-2">
          {status?.connected && (
            <Button variant="secondary" className="rounded-lg" onClick={syncChannel} disabled={Boolean(working)}>
              {working === "sync" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
              Refresh channel
            </Button>
          )}
          <Button className="rounded-lg bg-red-500 text-white hover:bg-red-400" onClick={status?.connected ? generatePlan : connectYoutube} disabled={Boolean(working)}>
            {working === "connect" || working === "plan" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Youtube className="mr-2 h-4 w-4" />}
            {status?.connected ? "Generate weekly plan" : "Connect to YouTube"}
          </Button>
        </div>
      </PanelHeader>

      {error && <PanelCardSoft className="border-red-400/25 bg-red-500/10 p-4 text-sm text-red-100">{error}</PanelCardSoft>}

      {!status?.connected ? (
        <PanelCard className="p-8">
          <div className="grid gap-8 lg:grid-cols-[1fr_360px] lg:items-center">
            <div>
              <PanelEyebrow>Separate integration</PanelEyebrow>
              <h2 className="mt-3 text-2xl font-semibold text-white">Use the channel account that actually matters.</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55">
                Your DayTabs login stays separate from the YouTube account you connect. OAuth tokens stay on the backend and refresh silently.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {["Channel profile", "Real trends", "Weekly results"].map((item) => (
                  <PanelCardSoft key={item} className="p-4 text-sm text-white/70">
                    <Check className="mb-3 h-4 w-4 text-emerald-300" />
                    {item}
                  </PanelCardSoft>
                ))}
              </div>
            </div>
            <Button className="rounded-lg bg-red-500 py-6 text-base text-white hover:bg-red-400" onClick={connectYoutube} disabled={Boolean(working)}>
              {working === "connect" ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Youtube className="mr-2 h-5 w-5" />}
              Connect to YouTube
            </Button>
          </div>
        </PanelCard>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-4">
            <PanelCardSoft className="p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/35">Channel</p>
              <p className="mt-2 text-lg font-semibold text-white">{status.channel?.channelName ?? "Connected"}</p>
            </PanelCardSoft>
            <PanelCardSoft className="p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/35">Subscribers</p>
              <p className="mt-2 text-lg font-semibold text-white">{formatNumber(status.channel?.subscriberCount)}</p>
            </PanelCardSoft>
            <PanelCardSoft className="p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/35">Total Views</p>
              <p className="mt-2 text-lg font-semibold text-white">{formatNumber(status.channel?.totalViewCount)}</p>
            </PanelCardSoft>
            <PanelCardSoft className="p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/35">Videos</p>
              <p className="mt-2 text-lg font-semibold text-white">{formatNumber(status.channel?.videoCount)}</p>
            </PanelCardSoft>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1fr_380px]">
            <PanelCard className="p-6">
              <div className="flex items-center gap-3">
                <BarChart3 className="h-5 w-5 text-emerald-300" />
                <h2 className="text-xl font-semibold text-white">Niche Profile</h2>
              </div>
              <p className="mt-4 text-sm leading-6 text-white/60">
                {status.channel?.nicheProfile?.summary ?? "Refresh the channel to generate a niche profile."}
              </p>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <PanelCardSoft className="p-3">
                  <p className="text-xs text-white/35">Niche</p>
                  <p className="mt-1 text-sm text-white">{status.channel?.nicheProfile?.niche ?? "Unknown"}</p>
                </PanelCardSoft>
                <PanelCardSoft className="p-3">
                  <p className="text-xs text-white/35">Style</p>
                  <p className="mt-1 text-sm text-white">{status.channel?.nicheProfile?.contentStyle ?? "Unknown"}</p>
                </PanelCardSoft>
                <PanelCardSoft className="p-3">
                  <p className="text-xs text-white/35">Audience</p>
                  <p className="mt-1 text-sm text-white">{status.channel?.nicheProfile?.targetAudience ?? "Unknown"}</p>
                </PanelCardSoft>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {(status.channel?.nicheProfile?.keywords ?? []).map((keyword) => (
                  <Badge key={keyword} className="border-white/10 bg-white/5 text-white/65 hover:brightness-100">{keyword}</Badge>
                ))}
              </div>
            </PanelCard>

            <PanelCard className="p-6">
              <div className="flex items-center gap-3">
                <TrendingUp className="h-5 w-5 text-sky-300" />
                <h2 className="text-xl font-semibold text-white">Recent Videos</h2>
              </div>
              <div className="mt-4 space-y-3">
                {(status.channel?.recentVideos ?? []).slice(0, 5).map((video) => (
                  <a key={video.id} href={video.url} target="_blank" rel="noreferrer" className="block rounded-lg border border-white/10 p-3 text-sm text-white/70 transition-colors hover:bg-white/5">
                    <span className="line-clamp-2 text-white">{video.title}</span>
                    <span className="mt-2 flex items-center gap-3 text-xs text-white/35">
                      {formatNumber(video.viewCount)} views
                      <ExternalLink className="h-3 w-3" />
                    </span>
                  </a>
                ))}
              </div>
            </PanelCard>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1fr_380px]">
            <PanelCard className="p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <CalendarDays className="h-5 w-5 text-red-300" />
                  <h2 className="text-xl font-semibold text-white">{latestPlan ? `Week ${latestPlan.weekNumber} Plan` : "Weekly Plan"}</h2>
                </div>
                <Button className="rounded-lg" onClick={generatePlan} disabled={Boolean(working)}>
                  {working === "plan" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {latestPlan ? "Generate next week" : "Generate plan"}
                </Button>
              </div>
              {latestPlan?.plan?.summary && <p className="mt-4 text-sm text-white/55">{latestPlan.plan.summary}</p>}
              <div className="mt-5 grid gap-4">
                {days.length ? days.map((day) => (
                  <PanelCardSoft key={`${latestPlan?.id}-${day.day}`} className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge className="border-red-400/20 bg-red-500/10 text-red-100 hover:brightness-100">Day {day.day} · {day.date}</Badge>
                      <span className="text-xs text-white/35">{day.bestPostingTime}</span>
                    </div>
                    <h3 className="mt-3 text-lg font-semibold text-white">{day.contentIdea}</h3>
                    <p className="mt-2 text-sm text-red-100/80">Hook: {day.hook}</p>
                    <ul className="mt-3 space-y-1 text-sm text-white/55">
                      {(day.outline ?? []).map((item) => <li key={item}>{item}</li>)}
                    </ul>
                    <p className="mt-3 text-sm leading-6 text-white/50">{day.rationale}</p>
                  </PanelCardSoft>
                )) : (
                  <div className="rounded-lg border border-white/10 p-8 text-center text-sm text-white/45">
                    Generate a plan to create seven YouTube ideas grounded in your channel data.
                  </div>
                )}
              </div>
            </PanelCard>

            <PanelCard className="p-6">
              <h2 className="text-xl font-semibold text-white">Competitors</h2>
              <div className="mt-4 space-y-3">
                {(status.competitors ?? []).slice(0, 5).map((competitor) => (
                  <PanelCardSoft key={competitor.id} className="p-3">
                    <p className="font-medium text-white">{competitor.channelName}</p>
                    <p className="mt-1 text-xs text-white/40">{formatNumber(competitor.subscriberCount)} subscribers · {competitor.postingFrequency ?? "Posting frequency unavailable"}</p>
                    <div className="mt-3 space-y-1">
                      {(competitor.mostViewedRecentVideos ?? []).slice(0, 2).map((video) => (
                        <p key={video.url ?? video.title} className="text-xs text-white/55">{video.title} · {formatNumber(video.viewCount)} views</p>
                      ))}
                    </div>
                  </PanelCardSoft>
                ))}
                {!status.competitors?.length && <p className="text-sm text-white/45">Generate a plan to discover comparable channels in your niche.</p>}
              </div>
            </PanelCard>
          </section>

          {latestPlan && (
            <PanelCard className="p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-white">End of Week Results</h2>
                  <p className="mt-1 text-sm text-white/45">Paste videos you published for this plan. DayTabs fetches real Analytics metrics and uses them for the next plan.</p>
                </div>
                <Button className="rounded-lg bg-emerald-500 text-emerald-950 hover:bg-emerald-400" onClick={submitResults} disabled={working === "results"}>
                  {working === "results" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  Fetch results
                </Button>
              </div>
              <div className="mt-5 grid gap-3">
                {days.map((day) => (
                  <div key={`result-${day.day}`} className="grid gap-3 rounded-lg border border-white/10 p-3 md:grid-cols-[1fr_420px] md:items-center">
                    <div>
                      <p className="text-sm font-medium text-white">Day {day.day}: {day.contentIdea}</p>
                      <p className="mt-1 text-xs text-white/35">{day.date}</p>
                    </div>
                    <Input
                      value={resultUrls[day.day] ?? ""}
                      onChange={(event) => setResultUrls((prev) => ({ ...prev, [day.day]: event.target.value }))}
                      placeholder="https://www.youtube.com/watch?v=..."
                      className="panel-input"
                    />
                  </div>
                ))}
              </div>
              {hasResults && (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/35">Saved Results</h3>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {(status.latestResults ?? []).map((result) => (
                      <PanelCardSoft key={result.id} className="p-4">
                        <p className="text-sm font-medium text-white">{result.plannedTitle}</p>
                        <a className="mt-1 block text-xs text-red-200 hover:text-red-100" href={result.videoUrl} target="_blank" rel="noreferrer">{result.videoUrl}</a>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-white/50">
                          {Object.entries(result.metrics ?? {}).slice(0, 6).map(([key, value]) => (
                            <span key={key}>{key}: {metricLabel(value)}</span>
                          ))}
                        </div>
                      </PanelCardSoft>
                    ))}
                  </div>
                </div>
              )}
            </PanelCard>
          )}
        </>
      )}
    </PanelPage>
  );
}
