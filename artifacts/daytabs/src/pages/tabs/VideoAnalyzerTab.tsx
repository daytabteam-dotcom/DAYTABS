import React, { useState, useCallback, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  Upload, Film, Wand2, Shield, Scissors, TrendingUp, Sparkles,
  CheckCircle2, AlertTriangle, XCircle, RefreshCcw,
  Volume2, Eye, Zap, Hash, FileText, Lock, Download,
  Copy, Check, AlignLeft, ChevronRight, FileDown, X, History,
  Lamp, Sun, Contrast, Image, Frame, Focus, Palette, Mic2, Waves, Gauge,
} from "lucide-react";
import { useAnalysisPolling, useAnalysisResults } from "@/hooks/use-analysis";
import { usePdfExport } from "@/hooks/use-pdf-export";
import { useVideoUpload, type UploadProgressInfo } from "@/hooks/use-video-upload";
import { useToast } from "@/hooks/use-toast";
import { usePlan, getFileSizeLimitLabel, getDurationLimitLabel, FILE_SIZE_LIMITS, DURATION_LIMITS_SEC } from "@/hooks/use-plan";
import { PlanPickerModal } from "@/components/PlanPickerModal";
import { UpgradeErrorModal, type LimitError } from "@/components/UpgradeErrorModal";
import { PanelPage, PanelHeader, PanelTitle, PanelSubtitle, PanelCard, PanelCardSoft } from "@/components/panel-system";
import { Skeleton } from "@/components/ui/skeleton";

interface TabProps {
  onDataReady: () => void;
  onDataReset: () => void;
  onRegisterExport: (fn: (() => Promise<void>) | null) => void;
}

const PLATFORMS = [
  { id: "youtube_long",   label: "Long Video",          shortLabel: "Long",   color: "red" },
  { id: "youtube_shorts", label: "Short Video / Reels", shortLabel: "Short",  color: "red" },
];

const MODULES = [
  { id: "quality",    label: "Quality Check",       icon: Shield,    desc: "Lighting, audio, framing, and pacing scores",    color: "blue",   freeIncluded: true  },
  { id: "editing",    label: "Editing Suggestions",  icon: Scissors,  desc: "Hook moments, cut points, and B-roll cues",      color: "yellow", freeIncluded: true  },
  { id: "publish",    label: "Publish Package",      icon: TrendingUp, desc: "Titles, descriptions, and tags per platform",  color: "green",  freeIncluded: false },
];

const MODULE_COLORS: Record<string, string> = {
  blue:   "border-blue-500/30 bg-blue-500/10 text-blue-300",
  yellow: "border-yellow-500/30 bg-yellow-500/10 text-yellow-300",
  green:  "border-green-500/30 bg-green-500/10 text-green-300",
  violet: "border-violet-500/30 bg-violet-500/10 text-violet-300",
};

const RESULT_TABS = [
  { id: "quality",    label: "Quality",      icon: Shield },
  { id: "editing",    label: "Editing",      icon: Scissors },
  { id: "publish",    label: "Publish",      icon: TrendingUp },
  { id: "shortClips", label: "Short Clips",  icon: Sparkles },
  { id: "transcript", label: "Transcript",   icon: AlignLeft },
];

const PROGRESS_STEPS = [
  { label: "Uploading video",             statuses: [] as string[],          threshold: 10  },
  { label: "Extracting audio & frames",   statuses: ["extracting_audio"],    threshold: 25  },
  { label: "Transcribing with Whisper",   statuses: ["transcribing"],        threshold: 32  },
  { label: "Detecting speech pattern",    statuses: ["detecting_speech"],    threshold: 40  },
  { label: "Analyzing quality",           statuses: ["analyzing_visual"],    threshold: 58  },
  { label: "Generating suggestions",      statuses: ["analyzing_content"],   threshold: 82  },
  { label: "Building publish package",    statuses: ["generating_seo"],      threshold: 92  },
  { label: "Finalizing report",           statuses: [],                      threshold: 100 },
];

const TERMINAL_STATUSES = new Set(["complete", "successful", "success", "error", "failed", "cancelled"]);
const HISTORY_BADGE_STATUSES = new Set(["complete", "successful", "success", "error", "failed", "cancelled"]);
const RECOVERY_STORAGE_KEY = "daytabs:video-analyzer:pending-upload";

interface PendingUploadRecovery {
  startedAt: number;
  fileName?: string;
  jobId?: string;
  platforms: string[];
  modules: string[];
}

interface AnalysisHistoryItem {
  jobId: string;
  status: string;
  progress: number;
  currentStep: string;
  platform?: string;
  result?: {
    videoName?: string;
    totalScore?: number;
    quality?: {
      score?: number;
      overallScore?: number;
      overallVisualScore?: number;
    };
    publish?: Record<string, { titles?: string[] }>;
    analysisOptions?: {
      platforms?: string[];
      modules?: string[];
      videoName?: string;
      originalFileName?: string;
      fileName?: string;
    };
  };
  error?: string;
  createdAt: string | null;
  updatedAt: string | null;
}

function readPendingUploadRecovery(): PendingUploadRecovery | null {
  try {
    const raw = localStorage.getItem(RECOVERY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingUploadRecovery;
    if (!parsed.startedAt || Date.now() - parsed.startedAt > 6 * 60 * 60 * 1000) {
      localStorage.removeItem(RECOVERY_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem(RECOVERY_STORAGE_KEY);
    return null;
  }
}

function writePendingUploadRecovery(recovery: PendingUploadRecovery) {
  localStorage.setItem(RECOVERY_STORAGE_KEY, JSON.stringify(recovery));
}

function clearPendingUploadRecovery() {
  localStorage.removeItem(RECOVERY_STORAGE_KEY);
}

function getStoredAuthToken() {
  return localStorage.getItem("daytabs_token");
}

function getAuthHeaders(): Record<string, string> {
  const token = getStoredAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function recoverPendingAnalysis(recovery: PendingUploadRecovery) {
  const token = getStoredAuthToken();
  if (!token) return null;

  const res = await fetch(`/api/analysis/recover?since=${recovery.startedAt}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;

  return await res.json() as {
    jobId?: string;
    result?: {
      analysisOptions?: {
        platforms?: string[];
        modules?: string[];
      };
    };
  };
}

async function cancelAnalysisRequest(jobId: string) {
  const res = await fetch(`/api/analysis/${jobId}/cancel`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? "Failed to cancel analysis");
  }
}

function formatAnalysisDate(value: string | null) {
  if (!value) return "Recent";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recent";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function getHistoryStatusLabel(status: string) {
  if (status === "complete" || status === "successful" || status === "success") return "Successful";
  if (status === "cancelled") return "Cancelled";
  if (status === "error" || status === "failed") return "Failed";
  if (status === "queued") return "Queued";
  if (status === "transcribing") return "Transcribing";
  if (status === "detecting_speech") return "Detecting mode";
  if (status === "analyzing_visual") return "Analyzing";
  if (status === "analyzing_content") return "Finding moments";
  if (status === "generating_seo") return "Publishing";
  if (status === "extracting_audio") return "Extracting audio";
  return "Processing";
}

function getHistoryStatusClasses(status: string) {
  if (status === "complete" || status === "successful" || status === "success") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-300";
  if (status === "cancelled") return "border-white/15 bg-white/5 text-white/40";
  if (status === "error" || status === "failed") return "border-red-500/25 bg-red-500/10 text-red-300";
  return "border-primary/25 bg-primary/10 text-primary";
}

function isCancellableAnalysis(status: string) {
  return !TERMINAL_STATUSES.has(status);
}

function isHistoryInProgress(status: string) {
  return !HISTORY_BADGE_STATUSES.has(status);
}

function isSuccessfulAnalysis(status: string) {
  return status === "complete" || status === "successful" || status === "success";
}

function getHistoryVideoName(item: AnalysisHistoryItem) {
  const result = item.result;
  const options = result?.analysisOptions;
  const originalName = options?.originalFileName ?? options?.fileName;
  const publishTitle = result?.publish
    ? Object.values(result.publish).find((entry) => entry?.titles?.length)?.titles?.[0]
    : undefined;
  const name = result?.videoName ?? options?.videoName ?? publishTitle ?? originalName;
  return (name ?? "Video analysis").replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Video analysis";
}

function getHistoryTotalScore(item: AnalysisHistoryItem) {
  const result = item.result;
  const raw = result?.totalScore ?? result?.quality?.score ?? result?.quality?.overallScore ?? result?.quality?.overallVisualScore;
  const score = Number(raw);
  return Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : null;
}

function getResultPlatforms(result: any): string[] {
  const platforms = result?.analysisOptions?.platforms;
  return Array.isArray(platforms) && platforms.length ? platforms : ["youtube_long"];
}

function getResultModules(result: any): string[] {
  const modules = result?.analysisOptions?.modules;
  return Array.isArray(modules) && modules.length ? modules : ["quality", "editing"];
}

function navigateToPricing(feature?: string) {
  const params = new URLSearchParams({ highlight: "creator" });
  if (feature) params.set("feature", feature);
  window.location.href = `/pricing?${params.toString()}`;
}

function UpgradeOverlay({ feature, label }: { feature: string; label: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-background/60 backdrop-blur-[2px] rounded-xl p-4">
      <div className="flex flex-col items-center gap-3 max-w-[220px] text-center">
        <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center">
          <Lock className="w-4 h-4 text-primary" />
        </div>
        <p className="text-xs text-white/70 leading-snug">{label}</p>
        <button
          onClick={() => navigateToPricing(feature)}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors whitespace-nowrap"
        >
          Upgrade to Creator, $19/mo
        </button>
      </div>
    </div>
  );
}

function BlurSection({ children, feature, label, blur }: { children: React.ReactNode; feature: string; label: string; blur: boolean }) {
  if (!blur) return <>{children}</>;
  return (
    <div className="relative rounded-xl overflow-hidden">
      <div style={{ filter: "blur(4px)", userSelect: "none", pointerEvents: "none" }}>
        {children}
      </div>
      <UpgradeOverlay feature={feature} label={label} />
    </div>
  );
}

function SeverityBadge({ severity, numeric }: { severity?: string; numeric?: number }) {
  const s = severity ?? (numeric !== undefined ? (numeric >= 95 ? "excellent" : numeric >= 80 ? "good" : numeric >= 60 ? "needs work" : "critical") : "good");
  const cls = s === "excellent" ? "text-green-400 border-green-400/20 bg-green-400/5"
    : s === "good" ? "text-blue-400 border-blue-400/20 bg-blue-400/5"
    : s === "needs work" ? "text-yellow-400 border-yellow-400/20 bg-yellow-400/5"
    : "text-red-400 border-red-400/20 bg-red-400/5";
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border capitalize ${cls}`}>{s}</span>
  );
}

function getAnalysisProfile(results: any) {
  return results?.analysisProfile ?? results?.quality?.speechProfile ?? null;
}

function getFormatProfile(profile?: any) {
  return profile?.formatProfile ?? null;
}

function contentFormatLabel(format?: string) {
  switch (format) {
    case "talking_head": return "Talking head";
    case "tutorial_howto": return "Tutorial / how-to";
    case "art_process": return "Art process";
    case "cooking_recipe": return "Cooking / recipe";
    case "chill_ambience": return "Chill / ambience";
    case "work_with_me": return "Work with me";
    case "vlog_lifestyle": return "Vlog / lifestyle";
    case "screen_demo": return "Screen demo";
    case "product_demo": return "Product demo";
    case "cinematic_montage": return "Cinematic montage";
    case "gaming": return "Gaming";
    case "performance_music": return "Performance / music";
    case "diy_craft": return "DIY / craft";
    case "transformation": return "Transformation";
    case "reaction_commentary": return "Reaction / commentary";
    default: return "General visual";
  }
}

function usesPresenterRubric(format?: string) {
  return ["talking_head", "reaction_commentary", "vlog_lifestyle"].includes(format ?? "");
}

function metricDisplayLabel(title: string, profile?: any) {
  const format = getFormatProfile(profile)?.contentFormat;
  if (title === "Framing" && !usesPresenterRubric(format)) return "Subject Framing";
  if (title === "Background") return usesPresenterRubric(format) ? "Background" : "Environment Fit";
  return title;
}

function qualityIntro(profile?: any) {
  const formatProfile = getFormatProfile(profile);
  if (!formatProfile) return "Quality checks tuned to how clearly the viewer can read the most important parts of this video.";
  return `This ${contentFormatLabel(formatProfile.contentFormat).toLowerCase()} video is being judged mainly on ${formatProfile.successFactors?.slice(0, 3).join(", ") || "clarity, pacing, and payoff"}.`;
}

function editingIntro(profile?: any) {
  const format = getFormatProfile(profile)?.contentFormat;
  if (format === "art_process" || format === "diy_craft" || format === "cooking_recipe") return "Editing notes focus on process readability, visible progression, and where the visual payoff arrives too late.";
  if (format === "work_with_me" || format === "chill_ambience") return "Editing notes focus on rhythm, atmosphere, and removing moments that quietly break the calm viewing experience.";
  if (format === "screen_demo" || format === "tutorial_howto") return "Editing notes focus on clarity, dead time, and making each step easier to follow at a glance.";
  return "Editing notes focus on the moments most likely to keep attention and the stretches most likely to lose it.";
}

function publishIntro(profile?: any) {
  const format = getFormatProfile(profile)?.contentFormat;
  if (format === "art_process" || format === "diy_craft") return "Packaging should sell the transformation, texture, or final reveal rather than pretending this is a speech-led explainer.";
  if (format === "cooking_recipe") return "Packaging should sell the dish, the result, and the easiest-to-understand promise from the process.";
  if (format === "work_with_me" || format === "chill_ambience") return "Packaging should set the mood and use case clearly so viewers know whether this fits study, focus, or relaxation.";
  return "Packaging should match the actual viewing intent of this format instead of over-leaning on transcript summaries.";
}

function analysisModeLabel(mode?: string) {
  if (mode === "talking_first") return "Talking-first";
  if (mode === "visual_first") return "Visual-first";
  if (mode === "mixed") return "Mixed";
  return "Adaptive";
}

function formatClock(seconds?: number | null) {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "none";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function AnalysisModeCard({ profile }: { profile: any }) {
  if (!profile) return null;
  const speechPct = Math.round((Number(profile.speechRatio ?? 0) || 0) * 100);
  const formatProfile = getFormatProfile(profile);
  return (
    <PanelCard className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-white/40 uppercase tracking-wider">Detected analysis mode</p>
          <div className="mt-2 flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold border border-primary/25 bg-primary/10 text-primary">
              {analysisModeLabel(profile.mode)}
            </span>
            {formatProfile?.contentFormat ? (
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold border border-white/10 bg-white/5 text-white/75">
                {contentFormatLabel(formatProfile.contentFormat)}
              </span>
            ) : null}
            <span className="text-xs text-white/35">{speechPct}% spoken coverage</span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-white/65">{profile.summary}</p>
          {formatProfile?.primarySubject ? (
            <p className="mt-3 text-sm text-white/55">
              <span className="text-white/75">Primary subject:</span> {formatProfile.primarySubject}
            </p>
          ) : null}
        </div>
        <div className="grid gap-2 text-xs text-white/45 sm:text-right">
          <span>First speech: {formatClock(profile.firstSpeechAt)}</span>
          <span>Last speech: {formatClock(profile.lastSpeechAt)}</span>
          <span>{profile.totalWords ?? 0} detected words</span>
        </div>
      </div>
      {formatProfile?.successFactors?.length ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-[11px] uppercase tracking-[0.16em] text-white/40">What matters most</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {formatProfile.successFactors.map((factor: string) => (
                <span key={factor} className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-xs text-emerald-100">
                  {factor}
                </span>
              ))}
            </div>
          </div>
          {formatProfile.ignoredSignals?.length ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-[11px] uppercase tracking-[0.16em] text-white/40">Signals we downplayed</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {formatProfile.ignoredSignals.map((signal: string) => (
                  <span key={signal} className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-xs text-white/60">
                    {signal}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </PanelCard>
  );
}

function scoreVerdict(score: number) {
  if (score >= 85) return { label: "Publish-ready", tone: "border-emerald-400/25 bg-emerald-500/10 text-emerald-100", description: "This video looks strong enough to publish with only small refinements." };
  if (score >= 70) return { label: "Almost ready", tone: "border-sky-400/25 bg-sky-500/10 text-sky-100", description: "The foundation is good. One or two focused changes should make this feel much stronger." };
  if (score >= 55) return { label: "Needs one editing pass", tone: "border-amber-400/25 bg-amber-500/10 text-amber-100", description: "There is clear potential here, but the current version is still leaving easy wins on the table." };
  return { label: "Rework before publishing", tone: "border-red-400/25 bg-red-500/10 text-red-100", description: "The current cut is likely to underperform unless you fix the main clarity or pacing problems first." };
}

function strongestMetric(data: any, profile?: any) {
  const candidates = [
    { key: "lighting", label: "Lighting", metric: data?.lighting },
    { key: "brightness", label: "Brightness", metric: data?.brightness },
    { key: "contrast", label: "Contrast", metric: data?.contrast },
    { key: "background", label: metricDisplayLabel("Background", profile), metric: data?.background },
    { key: "framing", label: metricDisplayLabel("Framing", profile), metric: data?.framing },
    { key: "sharpness", label: "Sharpness", metric: data?.sharpness },
    { key: "stability", label: "Stability", metric: data?.stability },
    { key: "audioClarity", label: "Audio clarity", metric: data?.audioClarity },
    { key: "audioVolume", label: "Audio volume", metric: data?.audioVolume },
    { key: "backgroundNoise", label: "Background noise", metric: data?.backgroundNoise },
    { key: "pacing", label: "Pacing", metric: data?.pacing },
  ].filter((item) => typeof item.metric?.numeric === "number");

  return candidates.sort((a, b) => (b.metric.numeric ?? 0) - (a.metric.numeric ?? 0))[0] ?? null;
}

function collectTopFixes(results: any) {
  const fixes = [
    results?.quality?.topFix,
    results?.quality?.retention?.dropOffMoments?.[0]?.fix,
    results?.editing?.editingSuggestions?.[0],
    results?.quality?.background?.suggestions?.[0],
    results?.quality?.framing?.suggestions?.[0],
    results?.quality?.sharpness?.suggestions?.[0],
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .filter((value, index, array) => array.findIndex((item) => item.toLowerCase() === value.toLowerCase()) === index);

  return fixes.slice(0, 3);
}

function CreatorReportIntro({ results, profile }: { results: any; profile?: any }) {
  if (!results) return null;
  const formatProfile = getFormatProfile(profile);
  const overallScore = Number(results?.quality?.score ?? results?.quality?.overallScore ?? results?.quality?.overallVisualScore ?? 0);
  const verdict = scoreVerdict(overallScore);
  const strongest = strongestMetric(results?.quality, profile);
  const topFixes = collectTopFixes(results);
  const firstRisk = results?.quality?.retention?.dropOffMoments?.[0] ?? null;
  const bestClip = results?.shortClips?.clips?.[0] ?? results?.editing?.hooks?.[0] ?? null;

  return (
    <div className="space-y-5">
      <PanelCard className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.16em] text-white/40">Creator Summary</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${verdict.tone}`}>{verdict.label}</span>
              {formatProfile?.contentFormat ? (
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-white/70">
                  {contentFormatLabel(formatProfile.contentFormat)}
                </span>
              ) : null}
            </div>
            <p className="mt-3 text-sm leading-6 text-white/70">{verdict.description}</p>
            {formatProfile?.viewerIntent ? (
              <p className="mt-3 text-sm leading-6 text-white/55">
                <span className="text-white/75">What this video is trying to do:</span> {formatProfile.viewerIntent}
              </p>
            ) : null}
          </div>
          <div className="min-w-[120px] rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center">
            <p className="text-4xl font-bold font-mono text-white">{overallScore}</p>
            <p className="mt-1 text-xs text-white/40">overall score</p>
          </div>
        </div>
      </PanelCard>

      <div className="grid gap-4 lg:grid-cols-3">
        <PanelCardSoft className="border border-white/10 p-4">
          <p className="text-[11px] uppercase tracking-[0.16em] text-white/40">Strongest part</p>
          {strongest ? (
            <>
              <p className="mt-3 text-lg font-semibold text-white">{strongest.label}</p>
              <p className="mt-2 text-sm text-white/60">{strongest.metric.assessment ?? "This is one of the cleanest parts of the current cut."}</p>
            </>
          ) : (
            <p className="mt-3 text-sm text-white/55">Once more evidence is available, this section will call out the strongest signal in the video.</p>
          )}
        </PanelCardSoft>

        <PanelCardSoft className="border border-white/10 p-4">
          <p className="text-[11px] uppercase tracking-[0.16em] text-white/40">Main retention risk</p>
          {firstRisk ? (
            <>
              <p className="mt-3 text-lg font-semibold text-white">{firstRisk.at}</p>
              <p className="mt-2 text-sm text-white/60">{firstRisk.reason}</p>
            </>
          ) : (
            <p className="mt-3 text-sm text-white/55">No obvious early drop-off point was detected from the current report.</p>
          )}
        </PanelCardSoft>

        <PanelCardSoft className="border border-white/10 p-4">
          <p className="text-[11px] uppercase tracking-[0.16em] text-white/40">Best reusable moment</p>
          {bestClip ? (
            <>
              <p className="mt-3 text-lg font-semibold text-white">{bestClip.start ?? "Clip"}</p>
              <p className="mt-2 text-sm text-white/60">{bestClip.title ?? bestClip.text ?? bestClip.description ?? "This moment has the most repurposing potential in the current cut."}</p>
            </>
          ) : (
            <p className="mt-3 text-sm text-white/55">No standout clip was extracted yet. Short clip ideas will appear here when available.</p>
          )}
        </PanelCardSoft>
      </div>

      {topFixes.length ? (
        <PanelCardSoft className="border border-amber-400/20 bg-amber-400/5 p-5">
          <p className="text-[11px] uppercase tracking-[0.16em] text-amber-200/70">Top 3 fixes</p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {topFixes.map((fix, index) => (
              <div key={`${index}-${fix}`} className="rounded-xl border border-white/10 bg-black/10 p-4">
                <p className="text-[10px] uppercase tracking-[0.16em] text-white/35">Fix {index + 1}</p>
                <p className="mt-2 text-sm leading-6 text-white/75">{fix}</p>
              </div>
            ))}
          </div>
        </PanelCardSoft>
      ) : null}
    </div>
  );
}

function LimitedSpeechNotice({ profile, children }: { profile?: any; children: React.ReactNode }) {
  if (!profile || profile.hasMeaningfulSpeech !== false) return null;
  return (
    <div className="flex items-start gap-3 p-4 rounded-xl bg-white/5 border border-white/10">
      <AlertTriangle className="w-4 h-4 text-amber-300 mt-0.5 shrink-0" />
      <div>
        <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Limited transcript signal</p>
        <p className="text-sm text-white/70 leading-relaxed">{children}</p>
      </div>
    </div>
  );
}

const METRIC_ICONS: Record<string, LucideIcon> = {
  lighting: Lamp,
  brightness: Sun,
  contrast: Contrast,
  colortemperature: Palette,
  colorbalance: Palette,
  background: Image,
  framing: Frame,
  sharpness: Focus,
  stability: Gauge,
  audioclarity: Mic2,
  audiovolume: Volume2,
  backgroundnoise: Waves,
  pacing: Gauge,
  fillerwords: Mic2,
};

function getMetricIcon(title: string): LucideIcon {
  return METRIC_ICONS[title.replace(/\s+/g, "").toLowerCase()] ?? Sparkles;
}

function parseDualGuidance(text?: string | null) {
  if (!text?.trim()) return { fixNow: "", nextVideo: "", plain: "" };
  const nowMatch = text.match(/fix now:\s*([^]+?)(?=\s*next video:|$)/i);
  const nextMatch = text.match(/next video:\s*([^]+)$/i);
  return {
    fixNow: nowMatch?.[1]?.trim() ?? "",
    nextVideo: nextMatch?.[1]?.trim() ?? "",
    plain: text.trim(),
  };
}

function MetricCard({ title, metric }: { title: string; metric: any }) {
  if (!metric) return null;
  const numVal = metric.numeric ?? 0;
  const Icon = getMetricIcon(title);
  const guidance = parseDualGuidance(metric.suggestions?.[0]);
  return (
    <div className="h-full bg-background/60 rounded-xl p-4 border border-white/8 hover:border-primary/20 transition-all">
      <div className="mb-3">
        <p className="text-xs text-white/40 uppercase tracking-wider flex items-center gap-2">
          <Icon className="w-4 h-4 text-white/35" />
          {title}
        </p>
      </div>
      <SeverityBadge severity={metric.severity} numeric={numVal} />
      {metric.assessment && <p className="text-xs text-white/50 mt-2">{metric.assessment}</p>}
      {guidance.fixNow && <p className="text-xs text-primary/80 mt-2"><span className="text-white/35">Fix now:</span> {guidance.fixNow}</p>}
      {guidance.nextVideo && <p className="text-xs text-white/55 mt-1"><span className="text-white/35">Next video:</span> {guidance.nextVideo}</p>}
      {!guidance.fixNow && !guidance.nextVideo && guidance.plain && <p className="text-xs text-primary/80 mt-1">→ {guidance.plain}</p>}
    </div>
  );
}

function QualityMetricGrid({ data, profile }: { data: any; profile?: any }) {
  const framingLabel = metricDisplayLabel("Framing", profile);
  const backgroundLabel = metricDisplayLabel("Background", profile);
  return (
    <>
      {data.lighting && <MetricCard title="Lighting" metric={data.lighting} />}
      {data.brightness && <MetricCard title="Brightness" metric={data.brightness} />}
      {data.contrast && <MetricCard title="Contrast" metric={data.contrast} />}
      {data.colorTemperature && <MetricCard title="Color Temperature" metric={{ numeric: 75, assessment: data.colorTemperature?.assessment, suggestions: data.colorTemperature?.suggestions, severity: data.colorTemperature?.severity }} />}
      {data.background && <MetricCard title={backgroundLabel} metric={data.background} />}
      {data.framing && <MetricCard title={framingLabel} metric={data.framing} />}
      {data.sharpness && <MetricCard title="Sharpness" metric={data.sharpness} />}
      {data.stability && <MetricCard title="Stability" metric={data.stability} />}
    </>
  );
}

function FillerCard({ metric }: { metric: any }) {
  if (!metric) return null;
  const numVal = metric.numeric ?? 0;
  const words: string[] = metric.words ?? [];
  return (
    <div className="h-full bg-background/60 rounded-xl p-4 border border-white/8 hover:border-primary/20 transition-all md:col-span-2 xl:col-span-3">
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          <Mic2 className="w-4 h-4 text-white/40" />
          <p className="text-xs text-white/40 uppercase tracking-wider">Filler Words</p>
        </div>
        <SeverityBadge severity={metric.severity} numeric={metric.level === "high" ? 30 : metric.level === "medium" ? 60 : 85} />
      </div>
      <div className="flex items-end gap-3 mb-2">
        <span className="text-3xl font-bold font-mono">{numVal}</span>
        <span className="text-xs text-white/40 mb-1">instances</span>
      </div>
      {metric.assessment && <p className="text-xs text-white/50 mt-2">{metric.assessment}</p>}
      {words.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {words.map((w, i) => <span key={i} className="px-2.5 py-1 bg-red-400/10 border border-red-400/20 text-red-300 rounded-lg text-xs font-mono">"{w}"</span>)}
        </div>
      )}
    </div>
  );
}

function RetentionForecastCard({ data }: { data: any }) {
  if (!data) return null;
  const moments = Array.isArray(data.dropOffMoments) ? data.dropOffMoments : [];
  const points = Array.isArray(data.retentionCurvePoints) ? data.retentionCurvePoints : [];
  const grade = data.retentionGrade ?? "C";
  const gradeClass = grade === "A" ? "text-green-400 border-green-400/20 bg-green-400/5"
    : grade === "B" ? "text-blue-400 border-blue-400/20 bg-blue-400/5"
    : grade === "C" ? "text-yellow-400 border-yellow-400/20 bg-yellow-400/5"
    : "text-red-400 border-red-400/20 bg-red-400/5";
  const maxSec = points.length > 0 ? Math.max(...points.map((point: any) => Number(point?.sec ?? 0)), 1) : 1;
  const linePoints = points.map((point: any, index: number) => {
    const x = maxSec === 0 ? 0 : (Number(point?.sec ?? 0) / maxSec) * 100;
    const y = 100 - Math.max(0, Math.min(100, Number(point?.pct ?? 0)));
    return `${index === 0 ? "M" : "L"} ${x} ${y}`;
  }).join(" ");

  return (
    <div className="space-y-4">
      <div className="p-5 rounded-2xl border border-white/8 bg-background/40">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
          <div>
            <p className="text-xs text-white/35 uppercase tracking-wider flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-white/35" />
              Retention Forecast
            </p>
            <p className="text-sm text-white/65 mt-2">{data.summary}</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <p className="text-4xl font-bold font-mono text-white">{data.estimatedRetentionPct ?? 0}%</p>
              <p className="text-xs text-white/35">estimated average</p>
            </div>
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${gradeClass}`}>Grade {grade}</span>
          </div>
        </div>

        {points.length > 1 && (
          <div className="rounded-xl border border-white/8 bg-black/15 p-3">
            <div className="relative h-32">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full overflow-visible">
                <path d="M 0 100 L 100 100" stroke="rgba(255,255,255,0.08)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                <path d="M 0 0 L 0 100" stroke="rgba(255,255,255,0.08)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                <path d={linePoints} fill="none" stroke="rgba(244,114,182,0.95)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
                {points.map((point: any, index: number) => {
                  const cx = maxSec === 0 ? 0 : (Number(point?.sec ?? 0) / maxSec) * 100;
                  const cy = 100 - Math.max(0, Math.min(100, Number(point?.pct ?? 0)));
                  return (
                    <circle
                      key={`${point.sec}-${index}`}
                      cx={cx}
                      cy={cy}
                      r="1.8"
                      fill="rgb(244,114,182)"
                    >
                      <title>{`${point.sec}s: ${point.pct}%`}</title>
                    </circle>
                  );
                })}
              </svg>
              <div className="absolute inset-x-0 bottom-0 flex justify-between text-[11px] text-white/30">
                <span>0s</span>
                <span>{`${Math.round(maxSec)}s`}</span>
              </div>
              <div className="absolute left-0 top-0 text-[11px] text-white/30">100%</div>
              <div className="absolute left-0 bottom-5 text-[11px] text-white/30">0%</div>
            </div>
          </div>
        )}
      </div>

      {moments.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            Likely Drop-Off Points
          </h3>
          <div className="grid gap-2">
            {moments.slice(0, 6).map((m: any, i: number) => (
              <div key={`${m.at}-${i}`} className="p-3 rounded-xl bg-background/60 border border-white/8">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="text-xs font-mono text-primary min-w-[48px]">{m.at}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border capitalize ${m.severity === "high" ? "text-red-400 border-red-400/20 bg-red-400/5" : m.severity === "medium" ? "text-yellow-400 border-yellow-400/20 bg-yellow-400/5" : "text-blue-400 border-blue-400/20 bg-blue-400/5"}`}>{m.severity} risk</span>
                </div>
                <p className="text-xs text-white/60">{m.reason}</p>
                {m.fix && <p className="text-xs text-primary/80 mt-1">→ {m.fix}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function QualityPanel({ data, isPaid, profile }: { data: any; isPaid: boolean; profile?: any }) {
  if (!data) return <p className="text-white/40 text-sm">No quality data.</p>;
  const overallScore = data.score ?? data.overallScore ?? data.overallVisualScore ?? 0;
  const scoreColor = overallScore >= 85 ? "text-green-400" : overallScore >= 60 ? "text-yellow-400" : "text-red-400";
  const topFixGuidance = parseDualGuidance(data.topFix);
  const gradingGuidance = parseDualGuidance(data.colorGradingRecommendation);
  const retentionPreview = data.retention ?? (!isPaid ? {
    estimatedRetentionPct: 43,
    retentionGrade: "C",
    summary: "Estimated average retention, predicted viewer drop-off points, and timestamp-specific fixes.",
    retentionCurvePoints: [
      { sec: 0, pct: 100 },
      { sec: 5, pct: 74 },
      { sec: 15, pct: 62 },
      { sec: 30, pct: 52 },
      { sec: 60, pct: 43 },
    ],
    dropOffMoments: [
      {
        at: "00:05",
        severity: "medium",
        reason: "Opening does not create enough urgency before the viewer decides whether to stay.",
        fix: "Start with the strongest outcome or most painful problem before any setup.",
      },
      {
        at: "00:28",
        severity: "high",
        reason: "Static pacing creates a likely attention drop after the initial context.",
        fix: "Cut dead air and add a visual change, proof point, or B-roll before this moment.",
      },
    ],
  } : null);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <p className="text-sm text-white/70">{qualityIntro(profile)}</p>
      </div>
      <LimitedSpeechNotice profile={profile}>
        Quality scoring focused on visual execution, audio cleanliness, and pacing proxies because this upload has little spoken content.
      </LimitedSpeechNotice>
      {data.topFix && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-400/8 border border-amber-400/20">
          <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs text-amber-400/70 uppercase tracking-wider mb-0.5 font-semibold">Most Important Fix</p>
            <p className="text-sm text-white/80">{topFixGuidance.fixNow || topFixGuidance.plain}</p>
            {topFixGuidance.nextVideo && <p className="mt-2 text-xs text-white/55"><span className="text-white/35">Next video:</span> {topFixGuidance.nextVideo}</p>}
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 p-5 rounded-2xl border border-white/8 bg-background/40">
        <div className="text-center min-w-[80px]">
          <span className={`text-5xl font-bold font-mono ${scoreColor}`}>{overallScore}</span>
          <p className="text-xs text-white/40 mt-1">Overall Score</p>
        </div>
        <div className="flex-1">
          <div className="h-3 bg-white/8 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${overallScore}%` }}
              transition={{ duration: 1, ease: "easeOut" }}
              className={`h-full rounded-full ${overallScore >= 85 ? "bg-gradient-to-r from-green-500 to-emerald-400" : overallScore >= 60 ? "bg-gradient-to-r from-yellow-500 to-amber-400" : "bg-gradient-to-r from-red-500 to-rose-400"}`}
            />
          </div>
          <p className="text-xs text-white/40 mt-2">
            {overallScore >= 85 ? "Strong video, close to publish-ready." : overallScore >= 60 ? "Usable foundation, but fix the flagged issues before publishing." : "Needs attention before publishing."}
          </p>
        </div>
      </div>

      <div className="space-y-5">
        <div className="space-y-3">
          <p className="text-xs text-white/35 uppercase tracking-wider">Visual Quality</p>
          {isPaid ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              <QualityMetricGrid data={data} profile={profile} />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {data.lighting && <MetricCard title="Lighting" metric={data.lighting} />}
              </div>
              <BlurSection blur feature="visual-quality" label="Get detailed scores for contrast, color, framing, and background">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  <QualityMetricGrid data={data} profile={profile} />
                </div>
              </BlurSection>
            </>
          )}
        </div>

        <div className="space-y-3">
          <p className="text-xs text-white/35 uppercase tracking-wider">Audio Quality</p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {data.audioClarity && <MetricCard title="Audio Clarity" metric={data.audioClarity} />}
            {data.audioVolume && <MetricCard title="Audio Volume" metric={data.audioVolume} />}
            {data.backgroundNoise && <MetricCard title="Background Noise" metric={data.backgroundNoise} />}
            {data.fillerWords && <FillerCard metric={data.fillerWords} />}
            {data.pacing && <MetricCard title="Pacing" metric={data.pacing} />}
          </div>
        </div>
      </div>

      {retentionPreview && (
        <BlurSection blur={!isPaid} feature="retention-forecast" label="Unlock retention forecasting with estimated viewer drop-off points and timestamp-specific fixes">
          <RetentionForecastCard data={retentionPreview} />
        </BlurSection>
      )}

      {data.colorGradingRecommendation && isPaid && (
        <div className="p-4 rounded-xl bg-background/60 border border-white/8">
          <p className="text-xs text-white/40 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" />Color Grading Recommendation</p>
          <p className="text-sm text-white/70">{gradingGuidance.fixNow || gradingGuidance.plain}</p>
          {gradingGuidance.nextVideo && <p className="mt-2 text-xs text-white/55"><span className="text-white/35">Next video:</span> {gradingGuidance.nextVideo}</p>}
        </div>
      )}
    </div>
  );
}

function EditingPanel({ data, isPaid, profile }: { data: any; isPaid: boolean; profile?: any }) {
  if (!data) return <p className="text-white/40 text-sm">No editing data.</p>;
  const hooks = data.hooks ?? [];
  const suggestions = data.editingSuggestions ?? [];
  const firstSuggestion = suggestions[0];
  const extraSuggestions = suggestions.slice(1);
  const nowFixes: string[] = data.nowFixes ?? [];
  const nextVideoFixes: string[] = data.nextVideoFixes ?? [];
  const editorNotes: string[] = data.editorNotes ?? [];

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <p className="text-sm text-white/70">{editingIntro(profile)}</p>
      </div>
      <LimitedSpeechNotice profile={profile}>
        Editing notes are weighted toward pacing, visual clarity, and dead-air cleanup because there is not enough speech to power script-led hook analysis.
      </LimitedSpeechNotice>
      {(data.topic || data.viewPotential || data.editingStyle) && (
        <div className="grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs text-white/35 uppercase tracking-wider">Editor Blueprint</p>
            {data.topic && <p className="mt-3 text-lg font-semibold text-white">{data.topic}</p>}
            {data.audienceGoal && <p className="mt-2 text-sm leading-relaxed text-white/65">{data.audienceGoal}</p>}
            {data.viewPotential && <p className="mt-3 text-sm leading-relaxed text-amber-100/85">{data.viewPotential}</p>}
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs text-white/35 uppercase tracking-wider">Best Editing Style</p>
            {data.editingStyle && <p className="mt-3 text-sm leading-relaxed text-white/75">{data.editingStyle}</p>}
            {data.packagingAngle && <p className="mt-3 text-xs leading-relaxed text-white/50"><span className="text-white/35">What the packaging should sell:</span> {data.packagingAngle}</p>}
          </div>
        </div>
      )}
      {(data.introGuidance || data.pacingGuidance || data.motionGuidance || data.hookApproach) && (
        <div className="grid gap-3 md:grid-cols-2">
          {data.introGuidance && (
            <div className="rounded-xl border border-white/8 bg-background/60 p-4">
              <p className="text-xs uppercase tracking-wider text-white/35">Intro</p>
              <p className="mt-2 text-sm text-white/70">{data.introGuidance}</p>
            </div>
          )}
          {data.pacingGuidance && (
            <div className="rounded-xl border border-white/8 bg-background/60 p-4">
              <p className="text-xs uppercase tracking-wider text-white/35">Pacing</p>
              <p className="mt-2 text-sm text-white/70">{data.pacingGuidance}</p>
            </div>
          )}
          {data.motionGuidance && (
            <div className="rounded-xl border border-white/8 bg-background/60 p-4">
              <p className="text-xs uppercase tracking-wider text-white/35">Motion Level</p>
              <p className="mt-2 text-sm text-white/70">{data.motionGuidance}</p>
            </div>
          )}
          {data.hookApproach && (
            <div className="rounded-xl border border-white/8 bg-background/60 p-4">
              <p className="text-xs uppercase tracking-wider text-white/35">Opening Strategy</p>
              <p className="mt-2 text-sm text-white/70">{data.hookApproach}</p>
            </div>
          )}
        </div>
      )}
      {(nowFixes.length > 0 || nextVideoFixes.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {nowFixes.length > 0 && (
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
              <p className="text-xs uppercase tracking-wider text-amber-200/70">Fix this cut now</p>
              <div className="mt-3 space-y-2">
                {nowFixes.map((fix, index) => (
                  <p key={`${index}-${fix}`} className="text-sm text-white/75">{index + 1}. {fix}</p>
                ))}
              </div>
            </div>
          )}
          {nextVideoFixes.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-wider text-white/35">Improve the next shoot</p>
              <div className="mt-3 space-y-2">
                {nextVideoFixes.map((fix, index) => (
                  <p key={`${index}-${fix}`} className="text-sm text-white/70">{index + 1}. {fix}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {editorNotes.length > 0 && isPaid && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs uppercase tracking-wider text-white/35">Format-specific Notes</p>
          <div className="mt-3 space-y-2">
            {editorNotes.map((note, index) => (
              <p key={`${index}-${note}`} className="text-sm text-white/65">{note}</p>
            ))}
          </div>
        </div>
      )}
      {data.rewrittenHook && isPaid && (
        <div className="p-4 rounded-xl bg-primary/8 border border-primary/20">
          <p className="text-xs text-primary/70 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Wand2 className="w-3.5 h-3.5" />Rewritten Hook</p>
          <p className="text-sm text-white/90 font-medium leading-relaxed">"{data.rewrittenHook}"</p>
        </div>
      )}

      {hooks.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3 flex items-center gap-2"><Zap className="w-4 h-4 text-yellow-400" />Hook Moments</h3>
          <div className="space-y-2">
            {[hooks[0]].filter(Boolean).map((h: any, i: number) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-yellow-400/5 border border-yellow-400/15">
                <span className="text-xs font-mono text-yellow-400 mt-0.5 min-w-[50px]">{h.start ?? `#${i + 1}`}</span>
                <p className="text-sm text-white/70">{h.text ?? h.description ?? h}</p>
              </div>
            ))}
            {hooks.length > 1 && (
              <BlurSection blur={!isPaid} feature="hook-moments" label="Unlock all hook moments, see every high-value clip opportunity in your video">
                <div className="space-y-2">
                  {hooks.slice(1).map((h: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-yellow-400/5 border border-yellow-400/15">
                      <span className="text-xs font-mono text-yellow-400 mt-0.5 min-w-[50px]">{h.start ?? `#${i + 2}`}</span>
                      <p className="text-sm text-white/70">{h.text ?? h.description ?? h}</p>
                    </div>
                  ))}
                </div>
              </BlurSection>
            )}
          </div>
        </div>
      )}

      {data.removeSections?.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3 flex items-center gap-2"><XCircle className="w-4 h-4 text-red-400" />Sections to Cut</h3>
          <div className="space-y-2">
            {data.removeSections.slice(0, 8).map((s: any, i: number) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-red-400/5 border border-red-400/15">
                {(s.start || s.end) && <span className="text-xs font-mono text-red-400 mt-0.5 min-w-[80px]">{s.start} → {s.end}</span>}
                <p className="text-sm text-white/70">{s.reason ?? s.description ?? s}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {suggestions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3 flex items-center gap-2"><Scissors className="w-4 h-4 text-primary" />Editing Tips</h3>
          <div className="grid gap-2">
            {firstSuggestion && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-primary/5 border border-primary/15">
                <span className="text-primary/60 text-sm mt-0.5">→</span>
                <p className="text-sm text-white/70">{firstSuggestion}</p>
              </div>
            )}
            {extraSuggestions.length > 0 && (
              <BlurSection blur={!isPaid} feature="editing-suggestions" label={`Unlock ${extraSuggestions.length} more editing tips with specific timestamps and cuts`}>
                <div className="grid gap-2">
                  {extraSuggestions.map((s: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 p-3 rounded-xl bg-primary/5 border border-primary/15">
                      <span className="text-primary/60 text-sm mt-0.5">→</span>
                      <p className="text-sm text-white/70">{s}</p>
                    </div>
                  ))}
                </div>
              </BlurSection>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PublishPanel({ data, platforms, isPaid, subtitleFile, videoFileName, profile }: { data: any; platforms: string[]; isPaid: boolean; subtitleFile?: { content: string; format: string; language: string }; videoFileName?: string; profile?: any }) {
  const [activePlatform, setActivePlatform] = useState<string>("");
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const publishKeys = data ? Object.keys(data) : [];

  useEffect(() => {
    if (publishKeys.length > 0 && !activePlatform) setActivePlatform(publishKeys[0]);
  }, [publishKeys.length]);

  if (!data || publishKeys.length === 0) return <p className="text-white/40 text-sm">No publish data.</p>;

  const pData = data[activePlatform];
  const platformLabel = PLATFORMS.find(p => p.id === activePlatform)?.label ?? activePlatform;
  const isYouTube = activePlatform === "youtube_long" || activePlatform === "youtube_shorts";
  const showSubtitleFile = isYouTube && profile?.hasMeaningfulSpeech !== false;

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedSection(key);
      setTimeout(() => setCopiedSection(null), 2000);
    });
  }

  const titles: string[] = pData?.titles ?? [];
  const firstTitle = titles[0];
  const extraTitles = titles.slice(1);
  const hashtags: Array<{ tag: string; effect?: string }> = pData?.hashtags ?? [];
  const firstTags = hashtags.slice(0, 3);
  const extraTags = hashtags.slice(3);

  const titleStrategies: string[] = pData?.titleStrategies ?? ["Curiosity gap", "How-to", "Number-based", "Problem/solution", "Bold claim"];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <p className="text-sm text-white/70">{publishIntro(profile)}</p>
      </div>
      <LimitedSpeechNotice profile={profile}>
        Publish copy was generated from the visual premise and any sparse speech that was detected, so treat these titles and descriptions as packaging drafts rather than transcript-driven summaries.
      </LimitedSpeechNotice>
      {(pData?.algorithmFit || pData?.packagingStrategy || pData?.audiencePromise) && (
        <div className="grid gap-3 md:grid-cols-3">
          {pData?.audiencePromise && (
            <div className="rounded-xl border border-white/8 bg-background/60 p-4">
              <p className="text-xs uppercase tracking-wider text-white/35">Viewer Promise</p>
              <p className="mt-2 text-sm text-white/70">{pData.audiencePromise}</p>
            </div>
          )}
          {pData?.packagingStrategy && (
            <div className="rounded-xl border border-white/8 bg-background/60 p-4">
              <p className="text-xs uppercase tracking-wider text-white/35">Packaging Angle</p>
              <p className="mt-2 text-sm text-white/70">{pData.packagingStrategy}</p>
            </div>
          )}
          {pData?.algorithmFit && (
            <div className="rounded-xl border border-white/8 bg-background/60 p-4">
              <p className="text-xs uppercase tracking-wider text-white/35">Algorithm Fit</p>
              <p className="mt-2 text-sm text-white/70">{pData.algorithmFit}</p>
            </div>
          )}
        </div>
      )}
      {Array.isArray(pData?.nicheReferences) && pData.nicheReferences.length > 0 && (
        <div className="rounded-xl border border-white/8 bg-background/60 p-4">
          <p className="text-xs uppercase tracking-wider text-white/35">Viral Packaging Patterns In This Niche</p>
          <div className="mt-3 space-y-2">
            {pData.nicheReferences.map((item: string, index: number) => (
              <p key={`${index}-${item}`} className="text-sm text-white/65">{item}</p>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-2 flex-wrap">
        {publishKeys.map(pk => {
          const pl = PLATFORMS.find(p => p.id === pk);
          return (
            <button
              key={pk}
              onClick={() => setActivePlatform(pk)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${activePlatform === pk ? "bg-primary/20 text-primary border border-primary/40" : "bg-white/5 text-white/50 border border-white/10 hover:text-white/80"}`}
            >
              {pl?.label ?? pk}
            </button>
          );
        })}
      </div>
      {pData && (
        <div className="space-y-4">
          {firstTitle && (
            <div className="p-4 rounded-xl bg-background/60 border border-white/8">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-white/40 uppercase tracking-wider flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" />Titles for {platformLabel}</p>
                <button onClick={() => copyText(titles.join("\n"), "titles")} className="text-white/30 hover:text-white/60 transition-colors">
                  {copiedSection === "titles" ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="space-y-2">
                <div className="flex items-start gap-2 group">
                  <div className="flex-1">
                    {isPaid && titleStrategies[0] && (
                      <p className="text-[10px] text-primary/50 uppercase tracking-wider mb-0.5">{titleStrategies[0]}</p>
                    )}
                    <p className="text-sm text-white/80">{firstTitle}</p>
                  </div>
                </div>
                {extraTitles.length > 0 && (
                  <BlurSection blur={!isPaid} feature="title-options" label={`Get ${extraTitles.length} more title strategies: how-to, number-based, problem/solution, bold claim`}>
                    <div className="space-y-2 mt-2">
                      {extraTitles.map((t: string, i: number) => (
                        <div key={i} className="flex items-start gap-2">
                          <div className="flex-1">
                            {titleStrategies[i + 1] && <p className="text-[10px] text-primary/50 uppercase tracking-wider mb-0.5">{titleStrategies[i + 1]}</p>}
                            <p className="text-sm text-white/80">{t}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </BlurSection>
                )}
              </div>
            </div>
          )}

          {pData.description && (
            <div className="p-4 rounded-xl bg-background/60 border border-white/8">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-white/40 uppercase tracking-wider flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" />Description</p>
                {isPaid && (
                  <button onClick={() => copyText(pData.description, "desc")} className="text-white/30 hover:text-white/60 transition-colors">
                    {copiedSection === "desc" ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
              {isPaid ? (
                <p className="text-sm text-white/70 whitespace-pre-line leading-relaxed">{pData.description}</p>
              ) : (
                <>
                  <p className="text-sm text-white/70 leading-relaxed">
                    {pData.description.split(/[.!?]/).slice(0, 2).join(". ") + "."}
                  </p>
                  <BlurSection blur feature="full-description" label="Get the full description with chapters, links section, and CTA, 150-400 words">
                    <p className="text-sm text-white/70 whitespace-pre-line leading-relaxed mt-2">{pData.description}</p>
                  </BlurSection>
                </>
              )}
            </div>
          )}

          {hashtags.length > 0 && (
            <div className="p-4 rounded-xl bg-background/60 border border-white/8">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-white/40 uppercase tracking-wider flex items-center gap-1.5"><Hash className="w-3.5 h-3.5" />Tags</p>
                {isPaid && (
                  <button onClick={() => copyText(hashtags.map(t => String(t.tag ?? "").replace(/^#+/, "")).join(", "), "tags")} className="text-white/30 hover:text-white/60 transition-colors">
                    {copiedSection === "tags" ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {firstTags.map((tag: { tag: string; effect?: string }, i: number) => (
                  <span key={i} title={tag.effect} className="px-2.5 py-1 bg-primary/10 border border-primary/20 text-primary/80 rounded-lg text-xs font-mono cursor-help">
                    {String(tag.tag ?? "").replace(/^#+/, "")}
                  </span>
                ))}
              </div>
              {extraTags.length > 0 && (
                <BlurSection blur={!isPaid} feature="tags" label={`Get ${extraTags.length + 3} more tags optimized for your niche, from broad to long-tail`}>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {extraTags.map((tag: { tag: string }, i: number) => (
                      <span key={i} className="px-2.5 py-1 bg-primary/10 border border-primary/20 text-primary/80 rounded-lg text-xs font-mono">
                        {String(tag.tag ?? "").replace(/^#+/, "")}
                      </span>
                    ))}
                  </div>
                </BlurSection>
              )}
            </div>
          )}

          {showSubtitleFile && (
            <div className="p-4 rounded-xl bg-background/60 border border-white/8">
              <p className="text-xs text-white/40 uppercase tracking-wider mb-3 flex items-center gap-1.5"><Download className="w-3.5 h-3.5" />Subtitle File (.srt)</p>
              {isPaid ? (
                subtitleFile?.content ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-white/70">YouTube-compatible subtitle file</p>
                      <p className="text-xs text-white/30 mt-0.5">Max 42 chars per line, 2 lines per card</p>
                    </div>
                    <button
                      onClick={() => {
                        const blob = new Blob([subtitleFile.content], { type: "text/srt;charset=utf-8" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        const baseName = (videoFileName ?? "subtitles").replace(/\.[^.]+$/, "");
                        a.download = `${baseName}.srt`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-primary/15 border border-primary/30 text-primary hover:bg-primary/25 transition-all"
                    >
                      <Download className="w-3.5 h-3.5" />Download .srt
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-white/30 italic">Run analysis with the Publish module enabled to generate subtitle file.</p>
                )
              ) : (
                <BlurSection blur feature="subtitle-file" label="Download subtitle file, Creator plan and above. YouTube-compatible .srt format.">
                  <div className="py-6 text-center">
                    <Download className="w-6 h-6 text-white/30 mx-auto mb-2" />
                    <p className="text-sm text-white/40">Download .srt subtitle file</p>
                  </div>
                </BlurSection>
              )}
            </div>
          )}

          {pData.timestamps?.length > 0 && (
            <div className="p-4 rounded-xl bg-background/60 border border-white/8">
              <p className="text-xs text-white/40 uppercase tracking-wider mb-3 flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" />Chapter Timestamps</p>
              <div className="space-y-1.5">
                {pData.timestamps.map((ts: { time: string; label: string }, i: number) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs font-mono text-primary/70 min-w-[48px]">{ts.time}</span>
                    <span className="text-xs text-white/50">{ts.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ShortClipsPanel({ data, isPaid }: { data: any; isPaid: boolean }) {
  const clips = data?.clips ?? data ?? [];
  if (!clips.length) return <p className="text-white/40 text-sm">No short clip ideas generated.</p>;

  const firstClip = clips[0];
  const extraClips = clips.slice(1);

  function ClipCard({ clip, index }: { clip: any; index: number }) {
    return (
      <div className="p-4 rounded-xl bg-background/60 border border-white/8 hover:border-primary/20 transition-all">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
              <span className="text-xs font-bold text-violet-300">{index + 1}</span>
            </div>
            <h4 className="text-sm font-semibold text-white/90">{clip.title ?? `Clip ${index + 1}`}</h4>
          </div>
          {(clip.start || clip.end) && (
            <span className="text-xs font-mono text-white/40 bg-white/5 px-2 py-0.5 rounded">
              {clip.start} – {clip.end}
            </span>
          )}
        </div>
        {clip.hook && <p className="text-sm text-violet-300/80 mb-2 pl-9 italic">"{clip.hook}"</p>}
        {clip.whyItWorks && <p className="text-xs text-white/50 pl-9 mb-2">{clip.whyItWorks}</p>}
        {clip.platforms?.length > 0 && (
          <div className="flex gap-1.5 pl-9 mb-2 flex-wrap">
            {clip.platforms.map((p: string, pi: number) => {
              const pl = PLATFORMS.find(x => x.label === p || x.id === p);
              return <span key={pi} className="text-xs px-2 py-0.5 bg-white/5 border border-white/10 rounded text-white/50">{pl?.shortLabel ?? p}</span>;
            })}
            {clip.platformReason && <span className="text-xs text-white/30 self-center">{clip.platformReason}</span>}
          </div>
        )}
        {isPaid && clip.tacticalNote && (
          <div className="flex items-start gap-2 pl-9 mt-2 p-2 rounded-lg bg-white/3 border border-white/8">
            <ChevronRight className="w-3.5 h-3.5 text-primary/60 mt-0.5 shrink-0" />
            <p className="text-xs text-white/60">{clip.tacticalNote}</p>
          </div>
        )}
        {isPaid && clip.engagementPotential && (
          <div className="pl-9 mt-2">
            <span className={`text-xs px-2 py-0.5 rounded font-semibold border ${clip.engagementPotential === "High" ? "bg-green-500/10 border-green-500/20 text-green-400" : clip.engagementPotential === "Medium" ? "bg-yellow-500/10 border-yellow-500/20 text-yellow-400" : "bg-white/5 border-white/15 text-white/40"}`}>
              {clip.engagementPotential} Engagement
            </span>
            {clip.engagementReason && <span className="text-xs text-white/30 ml-2">{clip.engagementReason}</span>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {firstClip && <ClipCard clip={firstClip} index={0} />}
      {extraClips.length > 0 && (
        <BlurSection blur={!isPaid} feature="short-clips" label={`Unlock ${extraClips.length} more clip ideas with tactical notes and engagement potential ratings`}>
          <div className="space-y-3">
            {extraClips.map((clip: any, i: number) => (
              <ClipCard key={i} clip={clip} index={i + 1} />
            ))}
          </div>
        </BlurSection>
      )}
    </div>
  );
}

const FILLER_WORDS_RX = /\b(um+|uh+|er+|ah+|hmm+|like|you know|basically|literally|actually|so|right)\b/gi;

function TranscriptPanel({ data, isPaid, profile }: { data: any; isPaid: boolean; profile?: any }) {
  const [copied, setCopied] = useState(false);
  const segments: Array<{ start: number; end: number; text: string }> = data?.segments ?? [];
  const fullText: string = data?.fullText ?? "";
  const FREE_CUTOFF_SEC = 60;

  if (!segments.length && !fullText) {
    return <p className="text-white/40 text-sm">No transcript available.</p>;
  }

  const visibleSegments = isPaid ? segments : segments.filter(s => s.start < FREE_CUTOFF_SEC);
  const hasMoreContent = !isPaid && segments.some(s => s.start >= FREE_CUTOFF_SEC);

  function fmtSec(s: number): string {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }

  function highlightFillers(text: string): React.ReactNode {
    const parts = text.split(FILLER_WORDS_RX);
    const matches = text.match(FILLER_WORDS_RX) ?? [];
    return parts.map((part, i) => (
      <React.Fragment key={i}>
        {part}
        {matches[i] && <mark className="bg-amber-400/20 text-amber-300 rounded px-0.5 not-italic">{matches[i]}</mark>}
      </React.Fragment>
    ));
  }

  let lastStampAt = -30;
  const fullCopyText = segments.map(s => `[${fmtSec(s.start)}] ${s.text}`).join("\n");

  return (
    <div className="space-y-4">
      <LimitedSpeechNotice profile={profile}>
        The transcript is intentionally downplayed here because speech is sparse or arrives late in the video. Use it as supplemental context, not the main source of truth.
      </LimitedSpeechNotice>
      <div className="flex items-center justify-between">
        <p className="text-xs text-white/40 uppercase tracking-wider flex items-center gap-2"><AlignLeft className="w-3.5 h-3.5" />Transcript</p>
        {isPaid && (
          <button
            onClick={() => { navigator.clipboard.writeText(fullCopyText); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied!" : "Copy all"}
          </button>
        )}
      </div>

      <div className="p-4 rounded-xl bg-background/60 border border-white/8 space-y-3 max-h-[500px] overflow-y-auto">
        {visibleSegments.map((seg, i) => {
          const showStamp = seg.start - lastStampAt >= 30;
          if (showStamp) lastStampAt = seg.start;
          return (
            <div key={i}>
              {showStamp && (
                <p className="text-xs font-mono text-primary/50 mb-1 sticky top-0 bg-background/80">{fmtSec(seg.start)}</p>
              )}
              <p className="text-sm text-white/70 leading-relaxed">{highlightFillers(seg.text)}</p>
            </div>
          );
        })}
        {hasMoreContent && (
          <div className="relative">
            <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-transparent to-background/95 pointer-events-none" />
            <BlurSection blur feature="full-transcript" label="Full transcript available on Creator plan, includes timestamps every 30 seconds">
              <div className="py-8 text-center text-sm text-white/40">
                [Transcript continues beyond 1 minute]
              </div>
            </BlurSection>
          </div>
        )}
      </div>

      <p className="text-xs text-white/25 flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-sm inline-block bg-amber-400/20 border border-amber-400/20" />
        Amber highlights indicate filler words
      </p>
    </div>
  );
}

function VideoAnalyzerLoadingState() {
  return (
    <PanelPage className="space-y-8">
      <PanelHeader className="gap-4">
        <div>
          <Skeleton className="h-8 w-48 bg-white/10" />
          <Skeleton className="mt-3 h-5 w-[32rem] max-w-full bg-white/10" />
        </div>
      </PanelHeader>
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <PanelCard className="p-6">
            <Skeleton className="h-56 bg-white/10" />
          </PanelCard>
          <PanelCard className="p-4">
            <Skeleton className="h-24 bg-white/10" />
          </PanelCard>
        </div>
        <PanelCard className="space-y-3 p-4">
          <Skeleton className="h-6 w-36 bg-white/10" />
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-20 bg-white/10" />
          ))}
          <Skeleton className="h-12 bg-white/10" />
        </PanelCard>
      </div>
    </PanelPage>
  );
}

function AnalyzingScreen({
  progress,
  currentStep,
  isSubmitting,
  uploadInfo,
  onCancel,
}: {
  progress: number;
  currentStep: string;
  isSubmitting: boolean;
  uploadInfo: UploadProgressInfo | null;
  onCancel: () => void;
}) {
  const isUploading = isSubmitting && uploadInfo !== null;
  const activeIdx = isSubmitting ? 0
    : PROGRESS_STEPS.findIndex(step => step.threshold > progress) - 1;

  if (isUploading && uploadInfo) {
    const { phase, pct, mbUploaded, totalMb, etaSec, retrying } = uploadInfo;
    const isAssembling = phase === "assembling";

    let etaLabel = "";
    if (!isAssembling && etaSec !== null) {
      if (etaSec < 60) etaLabel = `~${etaSec}s remaining`;
      else etaLabel = `~${Math.round(etaSec / 60)}m remaining`;
    }

    return (
      <div className="max-w-lg mx-auto py-12">
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center mx-auto mb-4">
            <Upload className="w-8 h-8 text-primary animate-pulse" />
          </div>
          <h2 className="text-xl font-semibold text-white">
            {isAssembling ? "Assembling video..." : "Uploading video"}
          </h2>
          <p className="text-white/40 text-sm mt-1">
            {isAssembling
              ? "Finalizing your upload, almost ready..."
              : `${mbUploaded.toFixed(1)} MB of ${totalMb.toFixed(1)} MB${etaLabel ? " - " + etaLabel : ""}`}
          </p>
        </div>

        <div className="mb-6">
          <div className="flex justify-between text-xs text-white/40 mb-2">
            <span>{isAssembling ? "Processing upload..." : "Uploading..."}</span>
            {!isAssembling && <span>{pct}%</span>}
          </div>
          <div className="h-2 bg-white/8 rounded-full overflow-hidden">
            <motion.div
              animate={{ width: `${isAssembling ? 100 : pct}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="h-full rounded-full bg-primary"
            />
          </div>
        </div>

        {!isAssembling && (
          <div className="flex justify-center">
            <button
              onClick={onCancel}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white/40 border border-white/10 hover:border-white/25 hover:text-white/60 transition-all"
            >
              <X className="w-3.5 h-3.5" />Cancel upload
            </button>
          </div>
        )}

        <p className="text-xs text-white/20 text-center mt-6">Do not close this tab during upload</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto py-12">
      <div className="text-center mb-10">
        <div className="w-16 h-16 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center mx-auto mb-4">
          <Wand2 className="w-8 h-8 text-primary animate-pulse" />
        </div>
        <h2 className="text-xl font-semibold text-white">Analyzing your video</h2>
        <p className="text-white/40 text-sm mt-1">This takes 1-3 minutes depending on length</p>
      </div>

      <div className="mb-8">
        <div className="flex justify-between text-xs text-white/40 mb-2">
          <span>{currentStep || "Processing..."}</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-2 bg-white/8 rounded-full overflow-hidden">
          <motion.div
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="h-full bg-primary rounded-full"
          />
        </div>
      </div>

      <div className="space-y-3">
        {PROGRESS_STEPS.map((step, i) => {
          const completed = i < activeIdx || (i === activeIdx && progress >= step.threshold);
          const active = i === activeIdx && !completed;
          return (
            <div key={i} className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all ${active ? "bg-primary/10 border border-primary/25" : completed ? "opacity-50" : "opacity-20"}`}>
              <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${completed ? "bg-green-500 border-green-500" : active ? "border-primary bg-primary/20" : "border-white/20"}`}>
                {completed ? <Check className="w-3 h-3 text-white" /> : active ? <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" /> : <span className="text-[9px] text-white/30">{i + 1}</span>}
              </div>
              <span className={`text-sm ${active ? "text-white font-medium" : completed ? "text-white/50" : "text-white/25"}`}>{step.label}</span>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-white/20 text-center mt-6">Do not close this tab while analyzing</p>
    </div>
  );
}

function ErrorScreen({ error, onReset }: { error: string; onReset: () => void }) {
  return (
    <div className="max-w-md mx-auto py-12 text-center">
      <div className="w-16 h-16 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
        <XCircle className="w-8 h-8 text-red-400" />
      </div>
      <h2 className="text-xl font-semibold text-white mb-2">Analysis failed</h2>
      <p className="text-sm text-white/50 mb-6 leading-relaxed">{error}</p>
      <button
        onClick={onReset}
        className="flex items-center gap-2 mx-auto px-5 py-2.5 rounded-lg text-sm font-semibold bg-primary/15 border border-primary/30 text-primary hover:bg-primary/25 transition-all"
      >
        <RefreshCcw className="w-4 h-4" />Try again
      </button>
    </div>
  );
}

function LimitReachedModal({ limit, onClose, onUpgrade }: { limit: number; onClose: () => void; onUpgrade: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-[#1a1025] border border-white/10 rounded-lg p-8 max-w-sm mx-4 text-center"
      >
        <div className="w-14 h-14 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center mx-auto mb-4">
          <Shield className="w-7 h-7 text-primary" />
        </div>
        <h2 className="text-xl font-semibold text-white mb-2">Monthly limit reached</h2>
        <p className="text-sm text-white/50 mb-6">
          You've used all {limit} free {limit === 1 ? "analysis" : "analyses"} this month. Upgrade to Creator for 15 analyses per month, or go Pro for 40.
        </p>
        <button
          onClick={onUpgrade}
          className="w-full py-3 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors mb-3"
        >
          View Plans, from $19/mo
        </button>
        <button onClick={onClose} className="text-xs text-white/30 hover:text-white/50 transition-colors">
          Maybe later
        </button>
      </motion.div>
    </div>
  );
}

/** Loads video metadata and resolves the duration in seconds, or null on failure. */
function getVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(video.duration); };
    video.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    video.src = url;
  });
}

/** Controlled upload zone, parent manages the accepted file state */
function UploadZone({ onFile, currentFile, isPending, maxSizeLabel, durationLabel }: {
  onFile: (f: File) => void;
  currentFile: File | null;
  isPending: boolean;
  maxSizeLabel?: string;
  durationLabel?: string;
}) {
  const [preview, setPreview] = useState<string | null>(null);

  // Sync preview with the controlled file
  useEffect(() => {
    if (currentFile) {
      const url = URL.createObjectURL(currentFile);
      setPreview(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreview(null);
    return undefined;
  }, [currentFile]);

  const onDrop = useCallback((accepted: File[]) => {
    const f = accepted[0]; if (!f) return;
    onFile(f); // parent decides whether to accept it
  }, [onFile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "video/*": [".mp4", ".mov", ".avi", ".webm"] },
    maxFiles: 1,
    disabled: isPending,
  });

  return (
    <div
      {...getRootProps()}
      className={`relative overflow-hidden rounded-2xl cursor-pointer transition-all duration-300 border-2 ${isDragActive ? "border-primary bg-primary/10 scale-[1.01]" : "border-white/10 hover:border-primary/40 bg-primary/3 hover:bg-primary/6"} ${currentFile ? "min-h-[180px] p-2" : "p-8"}`}
    >
      <input {...getInputProps()} />
      {currentFile && preview ? (
        <div className="relative w-full min-h-[160px] rounded-xl overflow-hidden bg-black/50">
          <video src={preview} className="w-full h-full object-cover opacity-40" autoPlay loop muted playsInline />
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-gradient-to-t from-black/80 via-transparent to-transparent">
            <Film className="w-8 h-8 text-primary mb-2" />
            <p className="text-sm font-semibold text-white/90 text-center">{currentFile.name}</p>
            <p className="text-xs text-white/40 mt-1">{(currentFile.size / 1024 / 1024).toFixed(1)} MB, click to change</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-2">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Upload className={`w-7 h-7 ${isDragActive ? "text-primary" : "text-primary/60"}`} />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-white/80">Drop your video here or click to browse</p>
            <p className="text-xs text-white/40 mt-1">MP4, MOV, AVI, WebM</p>
            {(maxSizeLabel || durationLabel) && (
              <p className="text-xs text-white/30 mt-1">
                {maxSizeLabel && `Up to ${maxSizeLabel}`}{maxSizeLabel && durationLabel && " • "}{durationLabel && `Max ${durationLabel}`}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AnalysisHistoryCards({
  items,
  loading,
  activeJobId,
  cancellingJobId,
  onOpen,
  onCancel,
}: {
  items: AnalysisHistoryItem[];
  loading: boolean;
  activeJobId: string | null;
  cancellingJobId: string | null;
  onOpen: (item: AnalysisHistoryItem) => void;
  onCancel: (item: AnalysisHistoryItem) => void;
}) {
  if (loading && items.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex items-center gap-2 text-sm text-white/60">
          <div className="w-4 h-4 border-2 border-white/15 border-t-primary rounded-full animate-spin" />
          Loading recent analyses...
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/45">
        Your completed reports will appear here.
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
      {items.map((item) => {
        const options = item.result?.analysisOptions;
        const modules = options?.modules?.length ? options.modules : ["quality", "editing"];
        const platforms = options?.platforms?.length ? options.platforms : [item.platform ?? "youtube_long"];
        const active = activeJobId === item.jobId;
        const inProgress = isHistoryInProgress(item.status);
        const totalScore = getHistoryTotalScore(item);
        const canOpen = item.status !== "error" && item.status !== "failed" && item.status !== "cancelled";
        const canCancel = isCancellableAnalysis(item.status);
        const isCancelling = cancellingJobId === item.jobId;

        return (
          <div
            key={item.jobId}
            onClick={() => canOpen && onOpen(item)}
            className={`text-left rounded-2xl border p-4 transition-all bg-white/[0.035] ${active ? "border-primary/50 shadow-lg shadow-primary/10" : "border-white/10 hover:border-white/20 hover:bg-white/[0.055]"} ${!canOpen ? "opacity-70" : "cursor-pointer"}`}
            role={canOpen ? "button" : undefined}
            tabIndex={canOpen ? 0 : -1}
            onKeyDown={(event) => {
              if (!canOpen) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpen(item);
              }
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{getHistoryVideoName(item)}</p>
                <p className="text-xs text-white/35 mt-1">{formatAnalysisDate(item.createdAt)}</p>
              </div>
              <span className={`px-2 py-1 rounded-md border text-[11px] font-semibold whitespace-nowrap ${getHistoryStatusClasses(item.status)}`}>
                {getHistoryStatusLabel(item.status)}
              </span>
            </div>

            <div className="mt-4">
              {totalScore !== null ? (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-white/30">Total score</p>
                  <p className="text-lg font-bold font-mono text-white">{totalScore}<span className="text-xs text-white/35">/100</span></p>
                </div>
              ) : (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-white/30">Total score</p>
                  <p className="text-sm font-semibold text-white/35">Pending</p>
                </div>
              )}
            </div>

            {inProgress && (
              <div className="mt-4 h-1.5 rounded-full bg-white/8 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.max(4, Math.min(100, Math.round(item.progress ?? 0)))}%` }}
                />
              </div>
            )}

            <p className="text-xs text-white/45 mt-3 truncate">
              {item.status === "error" || item.status === "failed" ? item.error ?? "Analysis failed" : item.status === "cancelled" ? "Cancelled by user" : item.currentStep || "Analysis queued"}
            </p>

            <div className="flex flex-wrap gap-1.5 mt-4">
              {platforms.slice(0, 2).map((platform) => (
                <span key={platform} className="px-2 py-1 rounded-md bg-white/5 border border-white/8 text-[11px] text-white/45">
                  {PLATFORMS.find(p => p.id === platform)?.shortLabel ?? platform}
                </span>
              ))}
              {modules.slice(0, 3).map((module) => (
                <span key={module} className="px-2 py-1 rounded-md bg-white/5 border border-white/8 text-[11px] text-white/45">
                  {MODULES.find(m => m.id === module)?.label ?? module}
                </span>
              ))}
            </div>

            {canCancel && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onCancel(item);
                }}
                disabled={isCancelling}
                className="mt-4 w-full px-3 py-2 rounded-lg text-xs font-semibold border border-red-500/25 text-red-300 bg-red-500/10 hover:bg-red-500/15 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isCancelling ? "Cancelling..." : "Cancel analysis"}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function VideoAnalyzerTab({ onDataReady, onDataReset, onRegisterExport }: TabProps) {
  const { plan, loading: planLoading, getModeLimits } = usePlan();
  const { toast } = useToast();

  const [file, setFile] = useState<File | null>(null);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [selectedModules, setSelectedModules] = useState<string[]>(["quality", "editing"]);
  const [activeResultTab, setActiveResultTab] = useState<string>("quality");
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [limitError, setLimitError] = useState<LimitError | null>(null);
  const [analysisHistory, setAnalysisHistory] = useState<AnalysisHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyResult, setHistoryResult] = useState<any | null>(null);
  const [openedHistoryJobId, setOpenedHistoryJobId] = useState<string | null>(null);
  const [cancellingJobId, setCancellingJobId] = useState<string | null>(null);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [historyBootstrapped, setHistoryBootstrapped] = useState(false);
  const [recoveryBootstrapped, setRecoveryBootstrapped] = useState(false);

  const { uploadAsync: uploadVideo, isPending: isUploading, uploadInfo, cancelUpload } = useVideoUpload();
  const { data: pollData } = useAnalysisPolling(jobId);
  const statusData = pollData as { status?: string; progress?: number; currentStep?: string } | undefined;
  const { data: results } = useAnalysisResults(jobId, statusData?.status === "complete");

  const limits = getModeLimits("video-analyzer");
  const isPaid = plan.isPaid;
  const uploadsRemaining = limits.uploadsRemaining;

  // Fix: check all non-terminal statuses, not just "processing"/"queued"
  const isAnalyzing = isUploading || isSubmitting || (!!jobId && !!statusData && !TERMINAL_STATUSES.has(statusData.status ?? ""));
  const isError = statusData?.status === "error";
  const isDone = statusData?.status === "complete";
  const displayedResults = historyResult ?? results;
  const hasResults = !!historyResult || (isDone && !!results);

  // Keep the latest filename around so history/recovered reports export with a stable name.
  const fileNameRef = useRef<string>("analysis");
  const exportBaseName = (file?.name ?? fileNameRef.current ?? "analysis").replace(/\.[^.]+$/, "") || "analysis";
  const { ref: pdfExportRef, exportPdf, isExporting: isPdfExporting } = usePdfExport(`${exportBaseName}-daytabs-report.pdf`);

  useEffect(() => { if (file?.name) fileNameRef.current = file.name; }, [file]);

  const loadAnalysisHistory = useCallback(async () => {
    const token = getStoredAuthToken();
    if (!token) {
      setAnalysisHistory([]);
      setShowUploadForm(true);
      setHistoryLoading(false);
      setHistoryBootstrapped(true);
      return;
    }

    setHistoryLoading(true);
    try {
      const res = await fetch("/api/analysis/history?limit=12", {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return;
      const data = await res.json() as { analyses?: AnalysisHistoryItem[] };
      setAnalysisHistory(data.analyses ?? []);
      if ((data.analyses ?? []).length === 0) setShowUploadForm(true);
    } catch {
      // History is helpful but non-blocking; upload and polling remain the main path.
    } finally {
      setHistoryLoading(false);
      setHistoryBootstrapped(true);
    }
  }, []);

  useEffect(() => {
    loadAnalysisHistory();
  }, [loadAnalysisHistory]);

  useEffect(() => {
    const recovery = readPendingUploadRecovery();
    if (jobId) {
      setRecoveryBootstrapped(true);
      return;
    }
    if (!recovery) {
      setRecoveryBootstrapped(true);
      return;
    }

    if (recovery.fileName) fileNameRef.current = recovery.fileName;
    if (recovery.platforms?.length) setSelectedPlatforms(recovery.platforms);
    if (recovery.modules?.length) setSelectedModules(recovery.modules);

    if (recovery.jobId) {
      setHistoryResult(null);
      setOpenedHistoryJobId(null);
      setJobId(recovery.jobId);
      toast({
        title: "Analysis restored",
        description: "We reconnected to your previous upload.",
      });
      setRecoveryBootstrapped(true);
      return;
    }

    let cancelled = false;
    recoverPendingAnalysis(recovery)
      .then((data) => {
        if (cancelled || !data?.jobId) return;
        const options = data.result?.analysisOptions;
        if (options?.platforms?.length) setSelectedPlatforms(options.platforms);
        if (options?.modules?.length) setSelectedModules(options.modules);
        setHistoryResult(null);
        setOpenedHistoryJobId(null);
        setJobId(data.jobId);
        writePendingUploadRecovery({ ...recovery, jobId: data.jobId });
        toast({
          title: "Analysis restored",
          description: "Your upload kept processing, so we reconnected to it.",
        });
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setRecoveryBootstrapped(true);
      });

    return () => {
      cancelled = true;
    };
  }, [jobId, toast]);

  useEffect(() => {
    if (hasResults) {
      clearPendingUploadRecovery();
      onDataReady();
      const resultModules = getResultModules(displayedResults);
      const firstModule = resultModules.find(m => (displayedResults as any)?.[m]);
      setActiveResultTab(firstModule ?? "quality");

      // Refresh plan usage so the Home page counter updates immediately
      window.dispatchEvent(new CustomEvent("daytabs:plan-updated"));
      loadAnalysisHistory();

      onRegisterExport(exportPdf);
    } else {
      onRegisterExport(null);
    }
  }, [hasResults, displayedResults, selectedModules, onDataReady, onRegisterExport, loadAnalysisHistory, exportPdf]);

  useEffect(() => {
    if (statusData?.status === "error") {
      clearPendingUploadRecovery();
    }
  }, [statusData?.status]);

  // Show the processing screen as soon as a jobId exists, even before first poll
  const showAnalyzing = isAnalyzing || (!!jobId && !isDone && !isError);

  function toggleModule(id: string, locked: boolean) {
    if (locked) { setShowPlanModal(true); return; }
    setSelectedModules(prev =>
      prev.includes(id) ? (prev.length > 1 ? prev.filter(m => m !== id) : prev) : [...prev, id]
    );
  }

  /** Called immediately on file drop, validates size and duration before accepting the file */
  async function handleFileSelected(f: File) {
    setHistoryResult(null);
    setOpenedHistoryJobId(null);
    setJobId(null);
    setShowUploadForm(true);

    // If the plan hasn't loaded yet, accept the file optimistically, server will enforce limits
    if (planLoading) { setFile(f); return; }

    const norm = plan.normalizedPlan;
    const sizeLimit = FILE_SIZE_LIMITS[norm] ?? FILE_SIZE_LIMITS.free;

    // 1. Instant size check (synchronous)
    if (f.size > sizeLimit) {
      const limitLabel = sizeLimit >= 1024 * 1024 * 1024
        ? `${(sizeLimit / (1024 * 1024 * 1024)).toFixed(0)} GB`
        : `${Math.round(sizeLimit / (1024 * 1024))} MB`;
      const fileLabel = `${(f.size / (1024 * 1024)).toFixed(1)} MB`;
      const upgradeMap: Record<string, { action: string; route: string }> = {
        free:    { action: "Upgrade to Creator for 1 GB videos",   route: "/pricing?highlight=creator" },
        creator: { action: "Upgrade to Pro for 5 GB videos",       route: "/pricing?highlight=pro" },
        pro:     { action: "Upgrade to Studio for 100 GB videos",  route: "/pricing?highlight=studio" },
        studio:  { action: "View Plans",                            route: "/pricing" },
      };
      const up = upgradeMap[norm] ?? upgradeMap.free;
      setLimitError({
        code: "FILE_TOO_LARGE",
        title: "Video file is too large",
        message: `Your ${plan.plan === "free" ? "Free" : norm.charAt(0).toUpperCase() + norm.slice(1)} plan supports videos up to ${limitLabel}. Your file is ${fileLabel}.`,
        action: { label: up.action, route: up.route },
        meta: { current_plan: norm },
      });
      return; // Reject, don't set the file at all
    }

    // 2. Accept the file for display immediately
    setFile(f);

    // 3. Async duration check (very fast, just reads metadata)
    const duration = await getVideoDuration(f);
    if (duration !== null && !isNaN(duration) && isFinite(duration)) {
      const durationLimit = DURATION_LIMITS_SEC[norm] ?? DURATION_LIMITS_SEC.free;
      if (duration > durationLimit) {
        setFile(null); // Reject, clear the file
        const limitMin = Math.round(durationLimit / 60);
        const durMin = Math.round(duration / 60);
        const upgradeMap: Record<string, { action: string; route: string }> = {
          free:    { action: "Upgrade to Creator for 40 min videos", route: "/pricing?highlight=creator" },
          creator: { action: "Upgrade to Pro for 2 hour videos",     route: "/pricing?highlight=pro" },
          pro:     { action: "Upgrade to Studio for 3 hour videos",  route: "/pricing?highlight=studio" },
          studio:  { action: "View Plans",                           route: "/pricing" },
        };
        const up = upgradeMap[norm] ?? upgradeMap.free;
        setLimitError({
          code: "VIDEO_TOO_LONG",
          title: "Video is too long for your plan",
          message: `Your plan supports videos up to ${limitMin} minutes. Your video is ${durMin} minutes long.`,
          action: { label: up.action, route: up.route },
          meta: { current_plan: norm },
        });
      }
    }
  }

  async function handleAnalyze() {
    if (!file) { toast({ title: "No video selected", description: "Please drop or select a video first.", variant: "destructive" }); return; }

    // Client-side pre-checks (informational, server is source of truth)
    if (uploadsRemaining === 0) { setShowLimitModal(true); return; }

    setIsSubmitting(true);
    setShowUploadForm(true);
    setHistoryResult(null);
    setOpenedHistoryJobId(null);
    const recovery: PendingUploadRecovery = {
      startedAt: Date.now(),
      fileName: file.name,
      platforms: [],
      modules: selectedModules,
    };
    writePendingUploadRecovery(recovery);
    try {
      const { jobId: id } = await uploadVideo({
        file,
        options: {
          mode: "video-analyzer",
          modules: selectedModules,
        },
      });
      writePendingUploadRecovery({ ...recovery, jobId: id });
      setHistoryResult(null);
      setOpenedHistoryJobId(null);
      setJobId(id);
    } catch (err: any) {
      // Silently reset if the user cancelled
      if (err?.message === "Upload cancelled") {
        clearPendingUploadRecovery();
        setFile(null);
        return;
      }
      // Detect structured limit errors from the server
      const structured = err?.structured ?? err?.response;
      if (structured?.code) {
        setLimitError(structured as LimitError);
      } else {
        const recovered = await recoverPendingAnalysis(recovery).catch(() => null);
        if (recovered?.jobId) {
          const options = recovered.result?.analysisOptions;
          if (options?.platforms?.length) setSelectedPlatforms(options.platforms);
          if (options?.modules?.length) setSelectedModules(options.modules);
          writePendingUploadRecovery({ ...recovery, jobId: recovered.jobId });
          setHistoryResult(null);
          setOpenedHistoryJobId(null);
          setJobId(recovered.jobId);
          toast({
            title: "Analysis restored",
            description: "The upload continued on the server, so we reconnected to it.",
          });
          return;
        }
        toast({ title: "Upload failed", description: err?.message ?? "Please try again.", variant: "destructive" });
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleOpenHistoryItem(item: AnalysisHistoryItem) {
    const options = item.result?.analysisOptions;
    const openedFileName = options?.originalFileName ?? options?.fileName ?? options?.videoName ?? item.result?.videoName;
    if (options?.platforms?.length) setSelectedPlatforms(options.platforms);
    if (options?.modules?.length) setSelectedModules(options.modules);
    if (openedFileName) fileNameRef.current = openedFileName;
    setFile(null);
    setShowUploadForm(true);

    if (isSuccessfulAnalysis(item.status) && item.result) {
      clearPendingUploadRecovery();
      setJobId(null);
      setHistoryResult(item.result);
      setOpenedHistoryJobId(item.jobId);
    } else {
      setHistoryResult(null);
      setOpenedHistoryJobId(null);
      setJobId(item.jobId);
      writePendingUploadRecovery({
        startedAt: item.createdAt ? new Date(item.createdAt).getTime() : Date.now(),
        jobId: item.jobId,
        platforms: options?.platforms?.length ? options.platforms : [item.platform ?? "youtube_long"],
        modules: options?.modules?.length ? options.modules : ["quality", "editing"],
      });
    }

    toast({
      title: isSuccessfulAnalysis(item.status) ? "Report opened" : "Analysis restored",
      description: isSuccessfulAnalysis(item.status) ? "Your saved analysis report is ready." : "We reconnected to the selected analysis.",
    });
  }

  async function handleCancelAnalysisJob(targetJobId: string) {
    setCancellingJobId(targetJobId);
    try {
      await cancelAnalysisRequest(targetJobId);
      clearPendingUploadRecovery();
      setAnalysisHistory((items) =>
        items.map((item) =>
          item.jobId === targetJobId
            ? { ...item, status: "cancelled", progress: 0, currentStep: "Analysis cancelled", error: undefined }
            : item
        )
      );
      if (jobId === targetJobId) {
        setJobId(null);
        setHistoryResult(null);
        setOpenedHistoryJobId(null);
      }
      toast({
        title: "Analysis cancelled",
        description: "The request was stopped and removed from active processing.",
      });
      loadAnalysisHistory();
    } catch (err) {
      toast({
        title: "Could not cancel analysis",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setCancellingJobId(null);
    }
  }

  function handleReset() {
    clearPendingUploadRecovery();
    setFile(null);
    setJobId(null);
    setHistoryResult(null);
    setOpenedHistoryJobId(null);
    setShowUploadForm(analysisHistory.length === 0);
    onDataReset();
  }

  function handleCancel() {
    clearPendingUploadRecovery();
    if (jobId) {
      void handleCancelAnalysisJob(jobId);
    } else {
      cancelUpload();
    }
  }

  const progress = statusData?.progress ?? (isSubmitting ? 5 : 0);
  const currentStepLabel = statusData?.currentStep ?? (isSubmitting ? "Uploading video..." : "");
  const errorMessage = (pollData as any)?.error ?? "An unexpected error occurred during analysis.";
  const analysisProfile = getAnalysisProfile(displayedResults);
  const resultModules = getResultModules(displayedResults);
  const resultPlatforms = getResultPlatforms(displayedResults);
  const availableResultTabs = RESULT_TABS.filter(t => {
    if (t.id === "transcript") return !!(displayedResults as any)?.transcript && analysisProfile?.hasMeaningfulSpeech !== false;
    return resultModules.includes(t.id) && !!(displayedResults as any)?.[t.id];
  });
  const hasHistory = analysisHistory.length > 0;
  const showHistoryLanding = !hasResults && !showAnalyzing && !isError && hasHistory && !showUploadForm;
  const isBootstrapping = planLoading || !historyBootstrapped || !recoveryBootstrapped;

  if (isBootstrapping) return <VideoAnalyzerLoadingState />;

  return (
    <PanelPage className="space-y-8">
      {showPlanModal && <PlanPickerModal onClose={() => setShowPlanModal(false)} />}
      <UpgradeErrorModal error={limitError} onClose={() => setLimitError(null)} />
      {showLimitModal && (
        <LimitReachedModal
          limit={limits.uploadLimit}
          onClose={() => setShowLimitModal(false)}
          onUpgrade={() => navigateToPricing("monthly-limit")}
        />
      )}
      {showHistoryLanding ? (
        <section className="space-y-6">
          <PanelHeader className="flex-wrap gap-4">
            <div>
              <PanelTitle>Video Analyzer</PanelTitle>
              <PanelSubtitle>Open a recent report or reconnect to work still in progress.</PanelSubtitle>
            </div>
            <button
              type="button"
              onClick={() => {
                handleReset();
                setShowUploadForm(true);
              }}
              className="px-4 py-2.5 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              New Analysis
            </button>
          </PanelHeader>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={loadAnalysisHistory}
              disabled={historyLoading}
              className="px-3 py-2 rounded-lg text-xs font-semibold text-white/55 border border-white/10 hover:border-white/20 hover:text-white transition-all disabled:opacity-50"
            >
              Refresh
            </button>
          </div>
          <AnalysisHistoryCards
            items={analysisHistory}
            loading={historyLoading}
            activeJobId={openedHistoryJobId ?? jobId}
            cancellingJobId={cancellingJobId}
            onOpen={handleOpenHistoryItem}
            onCancel={(item) => void handleCancelAnalysisJob(item.jobId)}
          />
        </section>
      ) : !hasResults && !showAnalyzing && !isError ? (
        <>
          <PanelHeader className="gap-4">
            <div>
              <PanelTitle>Video Analyzer</PanelTitle>
              <PanelSubtitle className="max-w-2xl">Upload a raw video and DayTabs will detect whether it should analyze it as talking-first, visual-first, or mixed before generating notes.</PanelSubtitle>
            </div>
            {hasHistory && (
              <button
                type="button"
                onClick={loadAnalysisHistory}
                disabled={historyLoading}
                className="px-3 py-2 rounded-lg text-xs font-semibold text-white/55 border border-white/10 hover:border-white/20 hover:text-white transition-all disabled:opacity-50"
              >
                Refresh history
              </button>
            )}
          </PanelHeader>

          <div className="grid lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 space-y-5">
              <UploadZone
                onFile={handleFileSelected}
                currentFile={file}
                isPending={isSubmitting}
                maxSizeLabel={getFileSizeLimitLabel(plan.plan)}
                durationLabel={getDurationLimitLabel(plan.plan)}
              />

              <div className="flex gap-3 rounded-lg border border-amber-500/20 bg-amber-500/8 px-4 py-3 text-left">
                <AlertTriangle className="w-4 h-4 text-amber-300 mt-0.5 shrink-0" />
                <p className="text-xs leading-relaxed text-white/55">
                  DayTabs now auto-detects where speech appears, whether the upload is long or short, and whether the frame is horizontal or vertical. Short clip ideas are generated automatically only when the video format actually supports them.
                </p>
              </div>
            </div>

            <PanelCard className="space-y-4 self-start p-4">
              <p className="text-xs text-white/40 uppercase tracking-wider flex items-center gap-2">
                <Wand2 className="w-3.5 h-3.5" />Analysis modules
              </p>
              <div className="space-y-2">
                {MODULES.map(mod => {
                  const Icon = mod.icon;
                  const active = selectedModules.includes(mod.id);
                  const locked = !mod.freeIncluded && !isPaid;
                  return (
                    <button
                      key={mod.id}
                      onClick={() => toggleModule(mod.id, locked)}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all border ${active && !locked ? `${MODULE_COLORS[mod.color]} border-opacity-40` : locked ? "panel-card-soft opacity-60" : "panel-card-soft panel-hover"}`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${active && !locked ? MODULE_COLORS[mod.color] : "bg-white/5"}`}>
                        {locked ? <Lock className="w-4 h-4 text-white/30" /> : <Icon className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-white/80">{mod.label}</span>
                          {locked && <span className="text-xs px-1.5 py-0.5 bg-amber-500/15 text-amber-400 rounded border border-amber-500/20">Creator+</span>}
                        </div>
                        <p className="text-xs text-white/35 mt-0.5">{mod.desc}</p>
                      </div>
                      <div className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center ${active && !locked ? "bg-primary border-primary" : "border-white/20"}`}>
                        {active && !locked && <CheckCircle2 className="w-3 h-3 text-white" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="pt-2">
                {limits.uploadLimit !== -1 && (
                  <p className="text-xs text-white/30 mb-3 text-center">
                    {uploadsRemaining === 0 ? "Monthly limit reached" : `${uploadsRemaining} of ${limits.uploadLimit} analyses remaining this month`}
                  </p>
                )}
                <button
                  onClick={handleAnalyze}
                  disabled={!file || isSubmitting}
                  className="w-full py-3.5 rounded-lg font-semibold text-sm transition-colors bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Wand2 className="w-4 h-4" />
                  {isSubmitting ? "Uploading..." : "Analyze Video"}
                </button>
                {uploadsRemaining === 0 && (
                  <button onClick={() => setShowLimitModal(true)} className="w-full mt-2 py-2.5 rounded-lg text-xs font-semibold text-primary border border-primary/30 hover:bg-primary/10 transition-all">
                    Upgrade for more analyses
                  </button>
                )}
              </div>
            </PanelCard>
          </div>

          {!hasHistory && (
            <section className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-white/40 uppercase tracking-wider flex items-center gap-2">
                    <History className="w-3.5 h-3.5" />Previous Analyses
                  </p>
                  <p className="text-sm text-white/45 mt-1">Open a recent report or reconnect to work still in progress.</p>
                </div>
                <button
                  type="button"
                  onClick={loadAnalysisHistory}
                  disabled={historyLoading}
                  className="px-3 py-2 rounded-lg text-xs font-semibold text-white/55 border border-white/10 hover:border-white/20 hover:text-white transition-all disabled:opacity-50"
                >
                  Refresh
                </button>
              </div>
              <AnalysisHistoryCards
                items={analysisHistory}
                loading={historyLoading}
                activeJobId={openedHistoryJobId ?? jobId}
                cancellingJobId={cancellingJobId}
                onOpen={handleOpenHistoryItem}
                onCancel={(item) => void handleCancelAnalysisJob(item.jobId)}
              />
            </section>
          )}
        </>
      ) : isError ? (
        <ErrorScreen error={errorMessage} onReset={handleReset} />
      ) : showAnalyzing ? (
        <AnalyzingScreen progress={progress} currentStep={currentStepLabel} isSubmitting={isSubmitting} uploadInfo={uploadInfo} onCancel={handleCancel} />
      ) : hasResults ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-2xl font-display font-bold text-white">Analysis Complete</h2>
              <p className="text-white/40 text-sm mt-0.5">Here's what we found in your video</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void exportPdf()}
                disabled={isPdfExporting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-primary border border-primary/30 bg-primary/10 hover:bg-primary/20 transition-all flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isPdfExporting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    Exporting…
                  </>
                ) : (
                  <>
                    <FileDown className="w-3.5 h-3.5" />
                    Download Report
                  </>
                )}
              </button>
              <button onClick={handleReset} className="px-4 py-2 rounded-xl text-xs font-semibold text-white/60 border border-white/15 hover:border-white/30 hover:text-white transition-all flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5" />Analyze New Video
              </button>
            </div>
          </div>

          <AnalysisModeCard profile={analysisProfile} />
          <CreatorReportIntro results={displayedResults} profile={analysisProfile} />

          {availableResultTabs.length > 0 && (
            <>
              <div className="flex gap-1 border-b border-white/8 overflow-x-auto">
                {availableResultTabs.map(tab => {
                  const Icon = tab.icon;
                  const isActive = activeResultTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveResultTab(tab.id)}
                      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-all border-b-2 -mb-px whitespace-nowrap ${isActive ? "text-primary border-primary" : "text-white/40 border-transparent hover:text-white/70"}`}
                    >
                      <Icon className="w-4 h-4" />{tab.label}
                    </button>
                  );
                })}
              </div>
              <AnimatePresence mode="wait">
                <motion.div key={activeResultTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                  {activeResultTab === "quality"    && <QualityPanel    data={(displayedResults as any).quality}    isPaid={isPaid} profile={analysisProfile} />}
                  {activeResultTab === "editing"    && <EditingPanel    data={(displayedResults as any).editing}    isPaid={isPaid} profile={analysisProfile} />}
                  {activeResultTab === "publish"    && <PublishPanel    data={(displayedResults as any).publish}    platforms={resultPlatforms} isPaid={isPaid} subtitleFile={(displayedResults as any).subtitleFile} videoFileName={file?.name} profile={analysisProfile} />}
                  {activeResultTab === "shortClips" && <ShortClipsPanel data={(displayedResults as any).shortClips} isPaid={isPaid} />}
                  {activeResultTab === "transcript" && <TranscriptPanel data={(displayedResults as any).transcript} isPaid={isPaid} profile={analysisProfile} />}
                </motion.div>
              </AnimatePresence>
            </>
          )}

          <div
            ref={pdfExportRef}
            data-pdf-export-root="true"
            className="fixed left-[-10000px] top-0 w-[1120px] opacity-0 pointer-events-none"
            aria-hidden="true"
          >
            <div className="space-y-6">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                <p className="text-xs uppercase tracking-[0.16em] text-white/40">DayTabs Video Analyzer Report</p>
                <h1 className="mt-2 text-3xl font-semibold text-white">{exportBaseName}</h1>
                <p className="mt-2 text-sm text-white/55">Full report export with every available section from the live analysis view.</p>
              </div>

              <AnalysisModeCard profile={analysisProfile} />
              <CreatorReportIntro results={displayedResults} profile={analysisProfile} />

              {availableResultTabs.map((tab) => (
                <section key={`pdf-${tab.id}`} data-pdf-tab-section="true" className="space-y-4 pt-2">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                    <p className="text-xs uppercase tracking-[0.16em] text-white/40">Report Section</p>
                    <h2 className="mt-2 text-2xl font-semibold text-white">{tab.label}</h2>
                  </div>

                  {tab.id === "quality" && <QualityPanel data={(displayedResults as any).quality} isPaid={isPaid} profile={analysisProfile} />}
                  {tab.id === "editing" && <EditingPanel data={(displayedResults as any).editing} isPaid={isPaid} profile={analysisProfile} />}
                  {tab.id === "publish" && <PublishPanel data={(displayedResults as any).publish} platforms={resultPlatforms} isPaid={isPaid} subtitleFile={(displayedResults as any).subtitleFile} videoFileName={file?.name ?? fileNameRef.current} profile={analysisProfile} />}
                  {tab.id === "shortClips" && <ShortClipsPanel data={(displayedResults as any).shortClips} isPaid={isPaid} />}
                  {tab.id === "transcript" && <TranscriptPanel data={(displayedResults as any).transcript} isPaid={isPaid} profile={analysisProfile} />}
                </section>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </PanelPage>
  );
}
