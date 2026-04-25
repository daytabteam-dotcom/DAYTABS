import { FormEvent, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ExternalLink,
  Eye,
  Lightbulb,
  Loader2,
  Search,
  Sparkles,
  Tag,
  Target,
  Youtube,
} from "lucide-react";
import { usePlan } from "@/hooks/use-plan";
import { PanelCard, PanelCardSoft, PanelHeader, PanelPage, PanelSubtitle, PanelTitle } from "@/components/panel-system";

type AuditReport = {
  summary: string;
  video: {
    title: string;
    channelName: string;
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
  transcript: {
    available: boolean;
    source: "manual" | "auto" | null;
    language: string | null;
    text: string | null;
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
    confidence: "high" | "medium" | "low";
    sourceLabel: string;
    priority: 1 | 2 | 3;
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
};

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("daytabs_token");
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || "Request failed");
  }
  return data as T;
}

function formatNumber(value?: number | null) {
  if (!Number.isFinite(value ?? NaN)) return "n/a";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value));
}

function confidenceClass(value: "high" | "medium" | "low") {
  if (value === "high") return "border-emerald-400/20 bg-emerald-500/10 text-emerald-200";
  if (value === "medium") return "border-amber-400/20 bg-amber-500/10 text-amber-200";
  return "border-red-400/20 bg-red-500/10 text-red-200";
}

function priorityLabel(value: 1 | 2 | 3) {
  if (value === 1) return "Start here";
  if (value === 2) return "Next";
  return "Lower priority";
}

export default function YouTubeAuditTab() {
  const { plan, loading: planLoading } = usePlan();
  const [videoUrl, setVideoUrl] = useState("");
  const [report, setReport] = useState<AuditReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isStudio = plan.isStudio;

  const topMetrics = useMemo(() => {
    if (!report) return [];
    return [
      { label: "Views", value: formatNumber(report.video.viewCount) },
      { label: "Likes", value: formatNumber(report.video.likeCount) },
      { label: "Comments", value: formatNumber(report.video.commentCount) },
      { label: "Views / day", value: formatNumber(report.performanceContext.viewsPerDay) },
    ];
  }, [report]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!videoUrl.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await jsonFetch<{ report: AuditReport }>("/api/youtube/audit", {
        method: "POST",
        body: JSON.stringify({ videoUrl: videoUrl.trim() }),
      });
      setReport(data.report);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to audit video");
    } finally {
      setLoading(false);
    }
  }

  if (planLoading) {
    return (
      <PanelPage className="max-w-6xl">
        <PanelCard className="p-8 text-white/60">Loading plan…</PanelCard>
      </PanelPage>
    );
  }

  if (!isStudio) {
    return (
      <PanelPage className="max-w-4xl">
        <PanelHeader>
          <div>
            <PanelTitle>YouTube Audit</PanelTitle>
            <PanelSubtitle>Paste a YouTube URL and get a competitor-aware audit.</PanelSubtitle>
          </div>
        </PanelHeader>
        <PanelCard className="border-pink-500/20 bg-pink-500/8 p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-pink-400/20 bg-pink-500/10">
            <Youtube className="h-5 w-5 text-pink-300" />
          </div>
          <h3 className="mt-4 text-xl font-semibold text-white">Studio-only feature</h3>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-white/65">
            This first version is only enabled on the Studio plan while we test pasted-video audits, competitor comparison, and metadata fixes.
          </p>
          <a
            href="/pricing?highlight=studio"
            className="mt-6 inline-flex rounded-xl border border-pink-400/25 bg-pink-500/12 px-4 py-2 text-sm font-semibold text-pink-200 transition-colors hover:bg-pink-500/18"
          >
            Upgrade to Studio
          </a>
        </PanelCard>
      </PanelPage>
    );
  }

  return (
    <PanelPage className="max-w-6xl space-y-6">
      <PanelHeader>
        <div>
          <PanelTitle>YouTube Audit</PanelTitle>
          <PanelSubtitle>Paste a YouTube URL to audit packaging, niche fit, thumbnail quality, and competitor gaps.</PanelSubtitle>
        </div>
      </PanelHeader>

      <PanelCard className="p-5">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
            <input
              value={videoUrl}
              onChange={(event) => setVideoUrl(event.target.value)}
              placeholder="Paste a YouTube video URL"
              className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.03] pl-10 pr-4 text-sm text-white outline-none transition-colors placeholder:text-white/30 focus:border-primary/35"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !videoUrl.trim()}
            className="inline-flex h-12 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Run Audit"}
          </button>
        </form>
        <p className="mt-3 text-xs text-white/40">
          Current v1 uses public metadata, real comparable videos, public transcripts when available, and thumbnail-only packaging analysis.
        </p>
        {error ? (
          <div className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}
      </PanelCard>

      {report ? (
        <>
          <div className="grid gap-4 lg:grid-cols-[1.1fr,0.9fr]">
            <PanelCard className="p-5">
              <div className="flex gap-4">
                {report.video.thumbnailUrl ? (
                  <img src={report.video.thumbnailUrl} alt={report.video.title} className="h-28 w-44 rounded-2xl border border-white/10 object-cover" />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-white/35">Audit summary</p>
                  <h3 className="mt-2 text-xl font-semibold text-white">{report.video.title}</h3>
                  <p className="mt-1 text-sm text-white/45">{report.video.channelName}</p>
                  <p className="mt-3 text-sm leading-6 text-white/72">{report.summary}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-white/70">
                      Inferred niche: {report.nicheInference.label}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-white/70">{report.video.likelyFormat}</span>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-white/70">
                      {report.transcript.available
                        ? `Transcript: ${report.transcript.source === "manual" ? "Manual" : "Auto"}${report.transcript.language ? ` · ${report.transcript.language}` : ""}`
                        : "Transcript unavailable"}
                    </span>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-white/45">
                    Niche confidence: {report.nicheInference.confidence} · {report.nicheInference.basis}
                  </p>
                </div>
              </div>
            </PanelCard>

            <PanelCard className="p-5">
              <p className="text-[11px] uppercase tracking-[0.16em] text-white/35">Public performance context</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {topMetrics.map((metric) => (
                  <div key={metric.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-white/35">{metric.label}</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{metric.value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 text-xs leading-6 text-white/50">
                Age: {report.performanceContext.ageDays != null ? `${report.performanceContext.ageDays} day${report.performanceContext.ageDays === 1 ? "" : "s"}` : "n/a"} · Channel median: {formatNumber(report.performanceContext.channelMedianViews)} · Competitor median: {formatNumber(report.performanceContext.competitorMedianViews)}
              </div>
            </PanelCard>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr,1fr]">
            <PanelCardSoft className="p-5">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-300" />
                <p className="text-sm font-semibold text-white">What likely hurt performance</p>
              </div>
              <div className="mt-4 space-y-3">
                {report.diagnosis.map((item, index) => (
                  <div key={`${item.area}-${index}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold capitalize text-white">{item.area}</p>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-200">
                          {priorityLabel(item.priority)}
                        </span>
                        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${confidenceClass(item.confidence)}`}>{item.confidence}</span>
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-white/78">{item.issue}</p>
                    <p className="mt-2 text-xs leading-6 text-white/50">{item.whyItHurts}</p>
                    <p className="mt-2 text-[11px] uppercase tracking-[0.14em] text-white/30">{item.sourceLabel}</p>
                  </div>
                ))}
              </div>
            </PanelCardSoft>

            <PanelCardSoft className="p-5">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-sky-300" />
                <p className="text-sm font-semibold text-white">Fixes to test next</p>
              </div>
              <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-white/35">Better titles</p>
                  <ul className="mt-3 space-y-2">
                    {report.fixes.titles.map((title, index) => (
                      <li key={`${title}-${index}`} className="text-sm text-white/82">{index + 1}. {title}</li>
                    ))}
                  </ul>
                </div>
                {report.transcript.available ? (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-white/35">Better hook</p>
                    <p className="mt-3 text-sm text-white/82">{report.fixes.hookRewrite || "No hook rewrite returned yet."}</p>
                  </div>
                ) : null}
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-white/35">Thumbnail idea</p>
                  <p className="mt-3 text-sm leading-6 text-white/82">{report.fixes.thumbnailIdea || "No thumbnail direction returned yet."}</p>
                </div>
              </div>
            </PanelCardSoft>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr,1fr]">
            <PanelCard className="p-5">
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold text-white">Description and tags</p>
              </div>
              <p className="mt-4 text-sm leading-6 text-white/78">{report.fixes.description}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {report.fixes.tags.map((tag, index) => (
                  <span key={`${tag}-${index}`} className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    {tag}
                  </span>
                ))}
              </div>
              <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-[11px] uppercase tracking-[0.14em] text-white/35">Packaging strategy</p>
                <p className="mt-2 text-sm leading-6 text-white/75">{report.fixes.packagingStrategy}</p>
              </div>
            </PanelCard>

            <PanelCard className="p-5">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-violet-300" />
                <p className="text-sm font-semibold text-white">Thumbnail packaging notes</p>
              </div>
              {report.visualAudit ? (
                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-white/35">Assessment basis</p>
                    <p className="mt-2 text-sm text-white/78">Public thumbnail only. This is packaging feedback, not a full video quality audit.</p>
                    <p className="mt-3 text-sm text-white/78">{report.visualAudit.topFix}</p>
                  </div>
                  {[
                    ["Lighting", report.visualAudit.lighting],
                    ["Framing", report.visualAudit.framing],
                    ["Sharpness", report.visualAudit.sharpness],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-white/35">{label}</p>
                      <p className="mt-2 text-sm leading-6 text-white/75">{value || "No note returned."}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-white/55">Visual audit was not available for this video.</p>
              )}
              {report.fixes.qualityFixes.length ? (
                <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-white/35">Packaging notes from thumbnail</p>
                  <ul className="mt-3 space-y-2">
                    {report.fixes.qualityFixes.map((item, index) => (
                      <li key={`${item}-${index}`} className="text-sm text-white/78">{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </PanelCard>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr,1fr]">
            <PanelCardSoft className="p-5">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-emerald-300" />
                <p className="text-sm font-semibold text-white">Top creators in this lane</p>
              </div>
              <div className="mt-4 space-y-3">
                {report.topCreators.map((creator, index) => (
                  <div key={`${creator.channelName}-${index}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-sm font-semibold text-white">{creator.channelName}</p>
                    <p className="mt-1 text-xs text-white/40">Avg views: {formatNumber(creator.averageViews)}</p>
                    <p className="mt-2 text-sm leading-6 text-white/72">{creator.whyTheyMatter}</p>
                  </div>
                ))}
              </div>
            </PanelCardSoft>

            <PanelCardSoft className="p-5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-300" />
                <p className="text-sm font-semibold text-white">Competitor videos worth studying</p>
              </div>
              <div className="mt-4 space-y-3">
                {report.competitorExamples.map((video, index) => (
                  <a key={`${video.url}-${index}`} href={video.url} target="_blank" rel="noreferrer" className="block rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-primary/30">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{video.title}</p>
                        <p className="mt-1 text-xs text-white/40">{video.channelName} · {formatNumber(video.viewCount)} views</p>
                      </div>
                      <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-white/30" />
                    </div>
                    <p className="mt-2 text-sm leading-6 text-white/72">{video.whyItWins}</p>
                  </a>
                ))}
              </div>
            </PanelCardSoft>
          </div>

          <PanelCard className="p-5">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-300" />
              <p className="text-sm font-semibold text-white">Current limitations</p>
            </div>
            <ul className="mt-4 space-y-2">
              {report.limitations.map((item, index) => (
                <li key={`${item}-${index}`} className="flex items-start gap-2 text-sm text-white/65">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-white/30" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </PanelCard>
        </>
      ) : null}
    </PanelPage>
  );
}
