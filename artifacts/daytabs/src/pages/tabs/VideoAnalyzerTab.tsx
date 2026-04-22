import React, { useState, useCallback, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  Upload, Film, Wand2, Shield, Scissors, TrendingUp, Sparkles,
  CheckCircle2, AlertTriangle, XCircle, RefreshCcw,
  Volume2, Eye, Zap, Hash, FileText, Lock, Download,
  Copy, Check, AlignLeft, ChevronRight, FileDown, X, History,
  Lamp, Sun, Contrast, Image, Frame, Focus, Palette, Mic2, Waves, Gauge, ChevronDown,
  Target, Clock3, Rocket, PenTool, Trophy,
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
import { ToastAction } from "@/components/ui/toast";

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
  { id: "transcript", label: "Transcript",           icon: AlignLeft, desc: "Get the spoken transcript with timestamps",       color: "blue",   freeIncluded: true  },
  { id: "publish",    label: "Publish Package",      icon: TrendingUp, desc: "Titles, descriptions, and tags per platform",  color: "green",  freeIncluded: false },
];

const MODULE_COLORS: Record<string, string> = {
  blue:   "border-blue-500/30 bg-blue-500/10 text-blue-300",
  yellow: "border-yellow-500/30 bg-yellow-500/10 text-yellow-300",
  green:  "border-green-500/30 bg-green-500/10 text-green-300",
  violet: "border-violet-500/30 bg-violet-500/10 text-violet-300",
};

const RESULT_TABS = [
  { id: "overview",   label: "Report",            icon: Eye },
  { id: "quality",    label: "Fix First",         icon: Shield },
  { id: "editing",    label: "Timeline And Edit", icon: Scissors },
  { id: "publish",    label: "Publish Package",   icon: TrendingUp },
  { id: "transcript", label: "Transcript",        icon: AlignLeft },
];

const PROGRESS_STEPS = [
  { label: "Uploading your video",         statuses: [] as string[],          threshold: 10  },
  { label: "Preparing your video",         statuses: ["extracting_audio"],    threshold: 25  },
  { label: "Understanding the words",      statuses: ["transcribing"],        threshold: 32  },
  { label: "Understanding the style",      statuses: ["detecting_speech"],    threshold: 40  },
  { label: "Reviewing video quality",      statuses: ["analyzing_visual"],    threshold: 58  },
  { label: "Creating your action plan",    statuses: ["analyzing_content"],   threshold: 82  },
  { label: "Preparing publishing ideas",   statuses: ["generating_seo"],      threshold: 92  },
  { label: "Finalizing your report",       statuses: [],                      threshold: 100 },
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

interface AnalysisQueueStatus {
  state: "waiting" | "running" | "unknown";
  position: number | null;
  ahead: number | null;
  running: number;
  waiting: number;
  concurrency: number;
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

function playAnalysisCompleteSound() {
  if (typeof window === "undefined") return;
  const AudioContextConstructor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return;

  const context = new AudioContextConstructor();
  const startAt = context.currentTime + 0.02;
  const notes = [
    { frequency: 659.25, duration: 0.12 },
    { frequency: 783.99, duration: 0.16 },
    { frequency: 987.77, duration: 0.24 },
  ];

  notes.forEach((note, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const noteStart = startAt + index * 0.12;
    const noteEnd = noteStart + note.duration;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(note.frequency, noteStart);

    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(0.14, noteStart + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(noteStart);
    oscillator.stop(noteEnd + 0.02);
  });

  window.setTimeout(() => {
    void context.close().catch(() => {});
  }, 900);
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

async function cancelActiveAnalysesRequest() {
  const res = await fetch("/api/analysis/cancel-active", {
    method: "POST",
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? "Failed to cancel active analyses");
  }
  return await res.json() as { cancelled: number; jobIds: string[] };
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

function getFriendlyAnalysisStep(status?: string, fallback?: string) {
  if (status === "queued") return "Waiting for your turn";
  if (status === "processing") return "Starting analysis";
  if (status === "downloading") return "Downloading your video";
  if (status === "extracting_audio") return "Preparing your video";
  if (status === "transcribing") return "Understanding the words";
  if (status === "detecting_speech") return "Understanding the style";
  if (status === "analyzing_visual") return "Reviewing video quality";
  if (status === "analyzing_content") return "Creating your action plan";
  if (status === "generating_seo") return "Preparing publishing ideas";
  if (status === "complete") return "Finalizing your report";
  if (!fallback || /[_/]/.test(fallback)) return "Working on your report";
  if (fallback.toLowerCase().includes("analysis")) return "Working on your report";
  return fallback;
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

function scoreColorMeta(score: number) {
  if (score >= 85) {
    return {
      ring: "#34d399",
      bg: "from-emerald-500/20 via-emerald-400/8 to-transparent",
      chip: "border-emerald-400/25 bg-emerald-500/10 text-emerald-100",
      panel: "border-emerald-400/20 bg-emerald-500/6",
    };
  }
  if (score >= 70) {
    return {
      ring: "#38bdf8",
      bg: "from-sky-500/20 via-sky-400/8 to-transparent",
      chip: "border-sky-400/25 bg-sky-500/10 text-sky-100",
      panel: "border-sky-400/20 bg-sky-500/6",
    };
  }
  if (score >= 55) {
    return {
      ring: "#f59e0b",
      bg: "from-amber-500/20 via-amber-400/8 to-transparent",
      chip: "border-amber-400/25 bg-amber-500/10 text-amber-100",
      panel: "border-amber-400/20 bg-amber-500/6",
    };
  }
  return {
    ring: "#f87171",
    bg: "from-red-500/20 via-red-400/8 to-transparent",
    chip: "border-red-400/25 bg-red-500/10 text-red-100",
    panel: "border-red-400/20 bg-red-500/6",
  };
}

function metricToneMeta(numeric?: number) {
  const value = Number(numeric ?? 0);
  if (value >= 85) return { badge: "Excellent", card: "border-emerald-400/20 bg-emerald-500/8", text: "text-emerald-100", subtext: "text-emerald-100/75", icon: "text-emerald-300", bar: "bg-emerald-400" };
  if (value >= 70) return { badge: "Good", card: "border-sky-400/20 bg-sky-500/8", text: "text-sky-100", subtext: "text-sky-100/75", icon: "text-sky-300", bar: "bg-sky-400" };
  if (value >= 55) return { badge: "Watch", card: "border-amber-400/20 bg-amber-500/8", text: "text-amber-100", subtext: "text-amber-100/75", icon: "text-amber-300", bar: "bg-amber-400" };
  return { badge: "Fix first", card: "border-red-400/20 bg-red-500/8", text: "text-red-100", subtext: "text-red-100/75", icon: "text-red-300", bar: "bg-red-400" };
}

function overallScoreFromResults(results: any) {
  return Number(
    results?.quality?.score
    ?? results?.quality?.overallScore
    ?? results?.quality?.overallVisualScore
    ?? 0,
  );
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

function compactTags(tags: Array<{ tag?: string }> = [], max = 8) {
  return tags
    .map((item) => String(item?.tag ?? "").replace(/^#+/, "").trim())
    .filter(Boolean)
    .slice(0, max);
}

function parseTimestampToSeconds(value?: string | null) {
  if (!value?.trim()) return Number.POSITIVE_INFINITY;
  const parts = value.trim().split(":").map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) return Number.POSITIVE_INFINITY;
  if (parts.length === 2) return (parts[0] * 60) + parts[1];
  if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  return Number.POSITIVE_INFINITY;
}

function weakestMetrics(results: any, profile?: any) {
  const quality = results?.quality ?? {};
  return [
    { label: "Lighting", metric: quality.lighting },
    { label: "Brightness", metric: quality.brightness },
    { label: "Contrast", metric: quality.contrast },
    { label: metricDisplayLabel("Background", profile), metric: quality.background },
    { label: metricDisplayLabel("Framing", profile), metric: quality.framing },
    { label: "Sharpness", metric: quality.sharpness },
    { label: "Stability", metric: quality.stability },
    { label: "Audio clarity", metric: quality.audioClarity },
    { label: "Audio volume", metric: quality.audioVolume },
    { label: "Background noise", metric: quality.backgroundNoise },
    { label: "Pacing", metric: quality.pacing },
  ]
    .filter((item) => typeof item.metric?.numeric === "number")
    .sort((a, b) => (a.metric.numeric ?? 0) - (b.metric.numeric ?? 0))
    .slice(0, 3);
}

function scoreReasonSummary(results: any, profile?: any) {
  const drivers = weakestMetrics(results, profile).map((item) => item.label.toLowerCase());
  if (drivers.length === 0) return "No major blockers were surfaced in the current analysis.";
  if (drivers.length === 1) return `The score is mostly being held back by ${drivers[0]}.`;
  if (drivers.length === 2) return `The score is mostly being held back by ${drivers[0]} and ${drivers[1]}.`;
  return `The score is mostly being held back by ${drivers[0]}, ${drivers[1]}, and ${drivers[2]}.`;
}

function sectionVisualMeta(label: string) {
  const key = label.toLowerCase();
  if (key.includes("fix")) return { Icon: AlertTriangle, className: "border-red-400/20 bg-red-500/10 text-red-100" };
  if (key.includes("hook")) return { Icon: Zap, className: "border-amber-400/20 bg-amber-500/10 text-amber-100" };
  if (key.includes("packaging") || key.includes("promise")) return { Icon: Rocket, className: "border-sky-400/20 bg-sky-500/10 text-sky-100" };
  if (key.includes("timeline")) return { Icon: Clock3, className: "border-violet-400/20 bg-violet-500/10 text-violet-100" };
  if (key.includes("score")) return { Icon: Target, className: "border-white/10 bg-white/[0.05] text-white" };
  return { Icon: Sparkles, className: "border-white/10 bg-white/[0.05] text-white" };
}

function ScoreDonut({ score, label }: { score: number; label: string }) {
  const meta = scoreColorMeta(score);
  return (
    <div className={`rounded-[28px] border bg-gradient-to-br p-5 ${meta.panel} ${meta.bg}`}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-white/40">Readiness Score</p>
          <p className="mt-2 text-sm text-white/60">{label}</p>
        </div>
        <div
          className="relative flex h-32 w-32 items-center justify-center rounded-full"
          style={{ background: `conic-gradient(${meta.ring} 0deg ${Math.round((Math.max(0, Math.min(100, score)) / 100) * 360)}deg, rgba(255,255,255,0.08) ${Math.round((Math.max(0, Math.min(100, score)) / 100) * 360)}deg 360deg)` }}
        >
          <div className="flex h-24 w-24 flex-col items-center justify-center rounded-full border border-white/10 bg-[#0f0f12]">
            <span className="text-4xl font-bold font-mono text-white">{score}</span>
            <span className="text-[11px] uppercase tracking-[0.14em] text-white/40">out of 100</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function buildTimelineMoments(results: any) {
  const hooks = Array.isArray(results?.editing?.hooks) ? results.editing.hooks : [];
  const dropOffs = Array.isArray(results?.quality?.retention?.dropOffMoments) ? results.quality.retention.dropOffMoments : [];
  const removeSections = Array.isArray(results?.editing?.removeSections) ? results.editing.removeSections : [];

  return [
    ...hooks.slice(0, 2).map((hook: any, index: number) => ({
      time: hook?.start ?? `Hook ${index + 1}`,
      sortTime: parseTimestampToSeconds(hook?.start),
      title: index === 0 ? "Hook window" : "Alternate hook",
      detail: hook?.text ?? hook?.description ?? "Strong opening moment",
      tone: "emerald" as const,
    })),
    ...dropOffs.slice(0, 3).map((moment: any) => ({
      time: moment?.at ?? "Risk",
      sortTime: parseTimestampToSeconds(moment?.at),
      title: "Drop-off risk",
      detail: moment?.fix ? `${moment.reason} Fix: ${moment.fix}` : (moment?.reason ?? "Likely retention dip"),
      tone: "red" as const,
    })),
    ...removeSections.slice(0, 2).map((section: any) => ({
      time: section?.start ? `${section.start}${section?.end ? `-${section.end}` : ""}` : "Cut",
      sortTime: parseTimestampToSeconds(section?.start),
      title: "Cut or tighten",
      detail: section?.reason ?? section?.description ?? "Trim this section to keep the pace moving.",
      tone: "amber" as const,
    })),
  ]
    .sort((a, b) => a.sortTime - b.sortTime)
    .slice(0, 7);
}

function SignalChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
      <span className="text-[10px] uppercase tracking-[0.16em] text-white/35">{label}</span>
      <span className="ml-2 text-xs font-semibold text-white/80">{value}</span>
    </div>
  );
}

function ActionCard({
  index,
  title,
  detail,
  tone = "amber",
}: {
  index: number;
  title: string;
  detail?: string;
  tone?: "amber" | "blue" | "emerald";
}) {
  const tones = {
    amber: "border-amber-400/20 bg-amber-400/8 text-amber-100",
    blue: "border-sky-400/20 bg-sky-400/8 text-sky-100",
    emerald: "border-emerald-400/20 bg-emerald-400/8 text-emerald-100",
  };
  const Icon = tone === "emerald" ? CheckCircle2 : tone === "blue" ? Rocket : AlertTriangle;

  return (
    <div className={`rounded-2xl border p-4 ${tones[tone]}`}>
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/15">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.14em] text-white/45">Step {index}</span>
          </div>
          <p className="mt-1 text-sm font-semibold text-white">{title}</p>
          {detail ? <p className="mt-2 text-xs leading-relaxed text-white/70">{detail}</p> : null}
        </div>
      </div>
    </div>
  );
}

function CreatorReportIntro({ results, profile, isPaid }: { results: any; profile?: any; isPaid: boolean }) {
  if (!results) return null;
  const formatProfile = getFormatProfile(profile);
  const editingData = results?.editing ?? {};
  const topFixes = collectTopFixes(results);
  const strongest = strongestMetric(results?.quality, profile);
  const publishData = results?.publish ? Object.values(results.publish)[0] as any : null;
  const primaryPromise = publishData?.audiencePromise ?? editingData?.packagingAngle ?? formatProfile?.viewerIntent ?? "Clear outcome-driven packaging";
  const score = overallScoreFromResults(results);
  const verdict = scoreVerdict(score);
  const scoreDrivers = weakestMetrics(results, profile);
  const timelineMoments = buildTimelineMoments(results);
  const visibleFixes = isPaid ? topFixes : topFixes.slice(0, 1);
  const hiddenFixes = isPaid ? [] : topFixes.slice(1);
  const visibleTimelineMoments = isPaid ? timelineMoments : timelineMoments.slice(0, 1);
  const hiddenTimelineMoments = isPaid ? [] : timelineMoments.slice(1);
  const visibleScoreDrivers = isPaid ? scoreDrivers : scoreDrivers.slice(0, 3);
  const hiddenScoreDrivers = isPaid ? [] : scoreDrivers.slice(3);
  const hookInsight = editingData?.hooks?.[0]?.text ?? editingData?.rewrittenHook ?? editingData?.hookApproach ?? null;
  const scoreMeta = scoreColorMeta(score);

  return (
    <div className="space-y-6">
      <PanelCard className="overflow-hidden border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(244,114,182,0.12),transparent_30%),radial-gradient(circle_at_top_right,rgba(56,189,248,0.12),transparent_28%)] p-6">
        <div className="grid gap-6 lg:grid-cols-[1.15fr,0.85fr]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${verdict.tone}`}>{verdict.label}</span>
              {formatProfile?.contentFormat ? <SignalChip label="Format" value={contentFormatLabel(formatProfile.contentFormat)} /> : null}
            </div>
            <h3 className="mt-4 text-3xl font-semibold text-white">
              {editingData?.topic ?? formatProfile?.primarySubject ?? "Video verdict"}
            </h3>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-white/72">
              {editingData?.viewPotential ?? verdict.description}
            </p>
            <p className="mt-3 text-sm text-white/60">{scoreReasonSummary(results, profile)}</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {[
                { label: "Fix first", value: visibleFixes[0] ?? "Tighten the opening before publishing." },
                { label: "Hook insight", value: hookInsight ?? "Lead with the strongest payoff or most unresolved question first." },
                { label: "Packaging promise", value: primaryPromise },
              ].map((item) => {
                const meta = sectionVisualMeta(item.label);
                const Icon = meta.Icon;
                return (
                  <div key={item.label} className={`rounded-2xl border p-4 ${meta.className}`}>
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-black/15">
                        <Icon className="h-4 w-4" />
                      </span>
                      <p className="text-[11px] uppercase tracking-[0.16em] text-white/55">{item.label}</p>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-white/85">{item.value}</p>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="space-y-4">
            <ScoreDonut score={score} label={verdict.label} />
            <div className={`rounded-2xl border p-4 ${scoreMeta.panel}`}>
              <div className="flex items-center gap-2">
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${scoreMeta.chip}`}>
                  {verdict.label}
                </span>
                <p className="text-xs text-white/45">Current export status</p>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-white/72">{verdict.description}</p>
            </div>
          </div>
        </div>
      </PanelCard>

      {visibleFixes.length > 0 && (
        <PanelCardSoft className="border border-amber-400/20 bg-amber-400/5 p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-amber-200/70">Fix First</p>
              <p className="mt-2 text-sm text-white/65">{isPaid ? "Three changes to make before you worry about anything else." : "The first improvement to make before anything else."}</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {visibleFixes.map((fix, index) => (
              <ActionCard
                key={`${index}-${fix}`}
                index={index + 1}
                title={fix}
                detail={index === 0 ? "Highest impact on this cut." : index === 1 ? "Next best improvement after the main fix." : "Finish with this if you want the strongest export."}
              />
            ))}
          </div>
          {hiddenFixes.length > 0 && (
            <div className="mt-3">
              <BlurSection blur feature="full-fix-list" label="See all improvements">
                <div className="grid gap-3 md:grid-cols-3">
                  {hiddenFixes.map((fix, index) => (
                    <ActionCard
                      key={`hidden-${index}-${fix}`}
                      index={index + 2}
                      title={fix}
                      detail="More of the full breakdown."
                    />
                  ))}
                </div>
              </BlurSection>
            </div>
          )}
        </PanelCardSoft>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
        <PanelCardSoft className="border border-white/10 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-white/40">Video Timeline</p>
              <p className="mt-2 text-sm text-white/65">Hook windows, risk moments, cuts, and clip opportunities in the order they happen.</p>
            </div>
          </div>
          <div className="mt-5 space-y-4">
            {visibleTimelineMoments.length > 0 ? visibleTimelineMoments.map((moment, index) => {
              const toneClass = moment.tone === "emerald"
                ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
                : moment.tone === "red"
                  ? "border-red-400/20 bg-red-400/10 text-red-100"
                  : moment.tone === "sky"
                    ? "border-sky-400/20 bg-sky-400/10 text-sky-100"
                    : "border-amber-400/20 bg-amber-400/10 text-amber-100";
              const Icon = moment.tone === "emerald" ? Zap : moment.tone === "red" ? AlertTriangle : moment.tone === "sky" ? Sparkles : Scissors;
              return (
                <div key={`${moment.time}-${index}`} className="grid gap-3 sm:grid-cols-[104px,1fr]">
                  <div className="flex items-start gap-3">
                    <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                      <Icon className="h-4 w-4 text-white/75" />
                    </div>
                    <div>
                      <div className="text-sm font-mono text-primary/80">{moment.time}</div>
                      <div className="mt-1 h-full w-px bg-white/10" />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-background/50 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${toneClass}`}>{moment.title}</span>
                      <span className="text-[11px] uppercase tracking-[0.14em] text-white/35">Moment {index + 1}</span>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-white/68">{moment.detail}</p>
                  </div>
                </div>
              );
            }) : (
              <p className="text-sm text-white/45">No timestamped moments were surfaced for this video.</p>
            )}
            {hiddenTimelineMoments.length > 0 && (
              <BlurSection blur feature="full-timeline" label="Unlock full breakdown">
                <div className="space-y-4">
                  {hiddenTimelineMoments.map((moment, index) => (
                    <div key={`hidden-${moment.time}-${index}`} className="grid gap-3 sm:grid-cols-[88px,1fr]">
                      <div className="text-sm font-mono text-primary/80">{moment.time}</div>
                      <div className="rounded-xl border border-white/8 bg-background/50 p-4">
                        <p className="text-sm leading-relaxed text-white/68">{moment.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </BlurSection>
            )}
          </div>
        </PanelCardSoft>

        <div className="space-y-6">
          <PanelCardSoft className="border border-white/10 p-5">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                <Target className="h-4 w-4 text-white/75" />
              </span>
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-white/40">Why The Score Landed Here</p>
                <p className="mt-1 text-sm text-white/55">Low metrics are pushed into warmer warning colors, stronger metrics stand out in cooler or positive tones.</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3">
              {visibleScoreDrivers.length > 0 ? visibleScoreDrivers.map((item) => (
                <div key={item.label} className={`rounded-2xl border p-4 ${metricToneMeta(item.metric.numeric).card}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-black/15">
                        {(() => {
                          const Icon = getMetricIcon(item.label);
                          return <Icon className={`h-4 w-4 ${metricToneMeta(item.metric.numeric).icon}`} />;
                        })()}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-white">{item.label}</p>
                        <p className={`mt-1 text-[11px] uppercase tracking-[0.14em] ${metricToneMeta(item.metric.numeric).subtext}`}>{metricToneMeta(item.metric.numeric).badge}</p>
                      </div>
                    </div>
                    <span className={`text-sm font-mono ${metricToneMeta(item.metric.numeric).text}`}>{item.metric.numeric}</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/20">
                    <div className={`h-full rounded-full ${metricToneMeta(item.metric.numeric).bar}`} style={{ width: `${Math.max(6, Math.min(100, Number(item.metric.numeric ?? 0)))}%` }} />
                  </div>
                  {item.metric?.assessment ? <p className="mt-3 text-xs leading-relaxed text-white/70">{item.metric.assessment}</p> : null}
                </div>
              )) : (
                  <p className="text-sm text-white/45">No score drivers were surfaced.</p>
              )}
              {hiddenScoreDrivers.length > 0 && (
                <BlurSection blur feature="score-breakdown" label="Unlock full breakdown">
                  <div className="grid gap-3">
                    {hiddenScoreDrivers.map((item) => (
                      <div key={`hidden-${item.label}`} className="rounded-xl border border-white/8 bg-background/50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-white">{item.label}</p>
                          <span className="text-sm font-mono text-white/55">{item.metric.numeric}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </BlurSection>
              )}
              {strongest ? (
                <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-500/10">
                      <Trophy className="h-4 w-4 text-emerald-300" />
                    </span>
                    <p className="text-xs uppercase tracking-[0.16em] text-emerald-100/70">Working Well</p>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-white">{strongest.label}</p>
                  <p className="mt-2 text-xs leading-relaxed text-white/55">{strongest.metric.assessment ?? "This is one of the cleanest parts of the current cut."}</p>
                </div>
              ) : null}
            </div>
          </PanelCardSoft>
        </div>
      </div>
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

function CollapsibleSection({
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
      >
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-white/35">{title}</p>
          {subtitle ? <p className="mt-1 text-xs text-white/40">{subtitle}</p> : null}
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-white/35 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? <div className="border-t border-white/8 px-4 py-4">{children}</div> : null}
    </div>
  );
}

function DecisionBar({ results, profile }: { results: any; profile?: any }) {
  if (!results) return null;
  const editingData = results?.editing ?? {};
  const qualityData = results?.quality ?? {};
  const publishData = results?.publish ? Object.values(results.publish)[0] as any : null;
  const score = overallScoreFromResults(results);
  const verdict = scoreVerdict(score);
  const topBlocker = collectTopFixes(results)[0] ?? qualityData?.topFix ?? editingData?.nowFixes?.[0] ?? "Review the detailed recommendations below.";
  const topOpportunity = editingData?.packagingAngle ?? publishData?.audiencePromise ?? editingData?.editingStyle ?? "Tighten the first 10 seconds and sharpen the promise.";
  const actionLabel = score >= 85 ? "Publish after a quick pass" : score >= 60 ? "Fix the opening, then publish" : "Rework before publishing";

  return (
    <div className="rounded-2xl border border-white/10 bg-background/75 p-4 backdrop-blur shadow-[0_20px_60px_rgba(0,0,0,0.18)]">
      <div className="grid gap-4 lg:grid-cols-[1.15fr,1fr,1fr,auto] lg:items-center">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-white/35">Verdict</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${verdict.tone}`}>{verdict.label}</span>
            {getFormatProfile(profile)?.contentFormat ? (
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-white/70">
                {contentFormatLabel(getFormatProfile(profile)?.contentFormat)}
              </span>
            ) : null}
          </div>
          <p className="mt-3 text-sm text-white/70">{editingData?.viewPotential ?? verdict.description}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-white/35">What Is Hurting It</p>
          <p className="mt-2 text-sm text-white/75">{topBlocker}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-white/35">What Could Win More Clicks</p>
          <p className="mt-2 text-sm text-white/75">{topOpportunity}</p>
        </div>
        <div className="rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-center">
          <p className="text-3xl font-bold font-mono text-white">{score}</p>
          <p className="mt-1 text-xs text-white/45">readiness score</p>
          <p className="mt-2 text-xs font-semibold text-primary">{actionLabel}</p>
        </div>
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
  const tone = metricToneMeta(numVal);
  return (
    <div className={`h-full rounded-2xl border p-4 transition-all ${tone.card}`}>
      <div className="mb-3">
        <p className="text-xs uppercase tracking-wider flex items-center gap-2 text-white/55">
          <Icon className={`w-4 h-4 ${tone.icon}`} />
          {title}
        </p>
      </div>
      <div className="flex items-center justify-between gap-3">
        <SeverityBadge severity={metric.severity} numeric={numVal} />
        <span className={`text-sm font-mono ${tone.text}`}>{numVal}</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/20">
        <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${Math.max(6, Math.min(100, Number(numVal)))}%` }} />
      </div>
      {metric.assessment && <p className="text-xs text-white/70 mt-3">{metric.assessment}</p>}
      {guidance.fixNow && <p className={`text-xs mt-2 ${tone.subtext}`}><span className="text-white/35">Fix now:</span> {guidance.fixNow}</p>}
      {guidance.nextVideo && <p className="text-xs text-white/60 mt-1"><span className="text-white/35">Next video:</span> {guidance.nextVideo}</p>}
      {!guidance.fixNow && !guidance.nextVideo && guidance.plain && <p className={`text-xs mt-1 ${tone.subtext}`}>→ {guidance.plain}</p>}
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

function shouldSurfaceMetric(metric: any) {
  if (!metric) return false;
  if (typeof metric.numeric === "number") return metric.numeric < 90;
  return metric.severity ? metric.severity !== "excellent" : true;
}

function FillerCard({ metric }: { metric: any }) {
  if (!metric) return null;
  const numVal = metric.numeric ?? 0;
  const words: string[] = metric.words ?? [];
  const tone = metricToneMeta(metric.level === "high" ? 30 : metric.level === "medium" ? 60 : 85);
  return (
    <div className={`h-full rounded-2xl p-4 border transition-all md:col-span-2 xl:col-span-3 ${tone.card}`}>
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          <Mic2 className={`w-4 h-4 ${tone.icon}`} />
          <p className="text-xs text-white/55 uppercase tracking-wider">Filler Words</p>
        </div>
        <SeverityBadge severity={metric.severity} numeric={metric.level === "high" ? 30 : metric.level === "medium" ? 60 : 85} />
      </div>
      <div className="flex items-end gap-3 mb-2">
        <span className={`text-3xl font-bold font-mono ${tone.text}`}>{numVal}</span>
        <span className="text-xs text-white/40 mb-1">instances</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/20">
        <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${Math.max(6, Math.min(100, Number(metric.level === "high" ? 30 : metric.level === "medium" ? 60 : 85)))}%` }} />
      </div>
      {metric.assessment && <p className="text-xs text-white/70 mt-3">{metric.assessment}</p>}
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
  const topFixGuidance = parseDualGuidance(data.topFix);
  const gradingGuidance = parseDualGuidance(data.colorGradingRecommendation);
  const visualMetricDefs = [
    { title: "Lighting", metric: data.lighting },
    { title: "Brightness", metric: data.brightness },
    { title: "Contrast", metric: data.contrast },
    { title: "Color Temperature", metric: data.colorTemperature ? { numeric: 75, assessment: data.colorTemperature?.assessment, suggestions: data.colorTemperature?.suggestions, severity: data.colorTemperature?.severity } : null },
    { title: metricDisplayLabel("Background", profile), metric: data.background },
    { title: metricDisplayLabel("Framing", profile), metric: data.framing },
    { title: "Sharpness", metric: data.sharpness },
    { title: "Stability", metric: data.stability },
  ].filter((item) => item.metric);
  const surfacedVisualMetrics = visualMetricDefs.filter((item) => shouldSurfaceMetric(item.metric));
  const visualCandidates = surfacedVisualMetrics.length > 0 ? surfacedVisualMetrics : visualMetricDefs.slice(0, Math.min(3, visualMetricDefs.length));
  const visibleVisualMetrics = isPaid ? visualCandidates : visualCandidates.slice(0, 1);
  const hiddenVisualCount = Math.max(0, visualMetricDefs.length - visibleVisualMetrics.length);

  const audioMetricDefs = [
    { title: "Audio Clarity", metric: data.audioClarity, type: "metric" },
    { title: "Audio Volume", metric: data.audioVolume, type: "metric" },
    { title: "Background Noise", metric: data.backgroundNoise, type: "metric" },
    { title: "Filler Words", metric: data.fillerWords, type: "filler" },
    { title: "Pacing", metric: data.pacing, type: "metric" },
  ].filter((item) => item.metric && (item.type !== "filler" || Number(item.metric?.numeric ?? 0) > 1));
  const surfacedAudioMetrics = audioMetricDefs.filter((item) => shouldSurfaceMetric(item.metric));
  const audioCandidates = surfacedAudioMetrics.length > 0 ? surfacedAudioMetrics : audioMetricDefs.slice(0, Math.min(3, audioMetricDefs.length));
  const visibleAudioMetrics = isPaid ? audioCandidates : audioCandidates.slice(0, 1);
  const hiddenAudioCount = Math.max(0, audioMetricDefs.length - visibleAudioMetrics.length);
  const workingWellVisual = visualMetricDefs.filter((item) => !visibleVisualMetrics.some((visible) => visible.title === item.title)).map((item) => item.title);
  const workingWellAudio = audioMetricDefs.filter((item) => !visibleAudioMetrics.some((visible) => visible.title === item.title)).map((item) => item.title);
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
            <p className="text-xs text-amber-400/70 uppercase tracking-wider mb-0.5 font-semibold">Fix This Before Exporting</p>
            <p className="text-sm text-white/80">{topFixGuidance.fixNow || topFixGuidance.plain}</p>
            {topFixGuidance.nextVideo && <p className="mt-2 text-xs text-white/55"><span className="text-white/35">Next video:</span> {topFixGuidance.nextVideo}</p>}
          </div>
        </div>
      )}

      <CollapsibleSection
        title="Main Issues"
        subtitle="Only the weaker metrics are shown first so you can focus on what actually needs work."
        defaultOpen
      >
        <div className="space-y-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-white/35 uppercase tracking-wider">Visual Quality</p>
              {hiddenVisualCount > 0 && <p className="text-xs text-white/30">{hiddenVisualCount} strong metrics hidden</p>}
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visibleVisualMetrics.map((item) => (
                <MetricCard key={item.title} title={item.title} metric={item.metric} />
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-white/35 uppercase tracking-wider">Audio Quality</p>
              {hiddenAudioCount > 0 && <p className="text-xs text-white/30">{hiddenAudioCount} strong metrics hidden</p>}
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visibleAudioMetrics.map((item) =>
                item.type === "filler"
                  ? <FillerCard key={item.title} metric={item.metric} />
                  : <MetricCard key={item.title} title={item.title} metric={item.metric} />
              )}
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {isPaid && (workingWellVisual.length > 0 || workingWellAudio.length > 0) && (
        <PanelCardSoft className="border border-white/10 p-4">
          <p className="text-[11px] uppercase tracking-[0.16em] text-white/40">Working Well</p>
          <p className="mt-3 text-sm text-white/65">
            {[...workingWellVisual, ...workingWellAudio].join(", ")}
          </p>
        </PanelCardSoft>
      )}

      {data.colorGradingRecommendation && isPaid && (
        <CollapsibleSection title="Color And Finish" subtitle="Post-production polish and next-shoot prevention." defaultOpen={false}>
          <div className="rounded-xl bg-background/60 border border-white/8 p-4">
            <p className="text-xs text-white/40 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" />Color Grading Recommendation</p>
            <p className="text-sm text-white/70">{gradingGuidance.fixNow || gradingGuidance.plain}</p>
            {gradingGuidance.nextVideo && <p className="mt-2 text-xs text-white/55"><span className="text-white/35">Next video:</span> {gradingGuidance.nextVideo}</p>}
          </div>
        </CollapsibleSection>
      )}

      {retentionPreview && (
        <CollapsibleSection title="Where Viewers May Drop" subtitle="Projected retention dips and the fixes most likely to keep people watching." defaultOpen={false}>
          <BlurSection blur={!isPaid} feature="retention-forecast" label="Unlock full breakdown">
            <RetentionForecastCard data={retentionPreview} />
          </BlurSection>
        </CollapsibleSection>
      )}

      {!isPaid && (hiddenVisualCount > 0 || hiddenAudioCount > 0) && (
        <BlurSection blur feature="quality-breakdown" label="See all improvements">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-wider text-white/35">More visual checks</p>
              <p className="mt-2 text-sm text-white/60">Exposure, framing, stability, and finish notes continue in the full breakdown.</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-wider text-white/35">More audio checks</p>
              <p className="mt-2 text-sm text-white/60">Clarity, pacing, filler words, and cleanup notes continue in the full breakdown.</p>
            </div>
          </div>
        </BlurSection>
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
          <div className="rounded-2xl border border-amber-400/20 bg-amber-500/6 p-4">
            <p className="text-xs text-amber-100/70 uppercase tracking-wider flex items-center gap-2"><Scissors className="h-4 w-4 text-amber-300" />What The Edit Needs To Do</p>
            {data.topic && <p className="mt-3 text-lg font-semibold text-white">{data.topic}</p>}
            {data.audienceGoal && <p className="mt-2 text-sm leading-relaxed text-white/65">{data.audienceGoal}</p>}
            {data.viewPotential && <p className="mt-3 text-sm leading-relaxed text-amber-100/85">{data.viewPotential}</p>}
          </div>
          <div className="rounded-2xl border border-sky-400/20 bg-sky-500/6 p-4">
            <p className="text-xs text-sky-100/70 uppercase tracking-wider flex items-center gap-2"><PenTool className="h-4 w-4 text-sky-300" />Best Editing Style</p>
            {data.editingStyle && <p className="mt-3 text-sm leading-relaxed text-white/75">{data.editingStyle}</p>}
            {data.packagingAngle && <p className="mt-3 text-xs leading-relaxed text-white/50"><span className="text-white/35">What the packaging should sell:</span> {data.packagingAngle}</p>}
          </div>
        </div>
      )}
      {(data.introGuidance || data.pacingGuidance || data.motionGuidance || data.hookApproach) && (
        <div className="grid gap-3 md:grid-cols-2">
          {data.introGuidance && (
            <div className="rounded-2xl border border-amber-400/20 bg-amber-500/6 p-4">
              <p className="text-xs uppercase tracking-wider text-amber-100/70 flex items-center gap-2"><Zap className="h-4 w-4 text-amber-300" />Intro</p>
              <p className="mt-2 text-sm text-white/70">{data.introGuidance}</p>
            </div>
          )}
          {data.pacingGuidance && (
            <div className="rounded-2xl border border-red-400/20 bg-red-500/6 p-4">
              <p className="text-xs uppercase tracking-wider text-red-100/70 flex items-center gap-2"><Clock3 className="h-4 w-4 text-red-300" />Pacing</p>
              <p className="mt-2 text-sm text-white/70">{data.pacingGuidance}</p>
            </div>
          )}
          {data.motionGuidance && (
            <div className="rounded-2xl border border-violet-400/20 bg-violet-500/6 p-4">
              <p className="text-xs uppercase tracking-wider text-violet-100/70 flex items-center gap-2"><Film className="h-4 w-4 text-violet-300" />Motion Level</p>
              <p className="mt-2 text-sm text-white/70">{data.motionGuidance}</p>
            </div>
          )}
          {data.hookApproach && (
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/6 p-4">
              <p className="text-xs uppercase tracking-wider text-emerald-100/70 flex items-center gap-2"><Target className="h-4 w-4 text-emerald-300" />Opening Strategy</p>
              <p className="mt-2 text-sm text-white/70">{data.hookApproach}</p>
            </div>
          )}
        </div>
      )}
      {isPaid && (nowFixes.length > 0 || nextVideoFixes.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {nowFixes.length > 0 && (
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
              <p className="text-xs uppercase tracking-wider text-amber-200/70">Fix This Cut Now</p>
              <div className="mt-3 grid gap-3">
                {nowFixes.map((fix, index) => (
                  <ActionCard key={`${index}-${fix}`} index={index + 1} title={fix} detail="This improves the current edit immediately." />
                ))}
              </div>
            </div>
          )}
          {nextVideoFixes.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-wider text-white/35">Make The Next Shoot Better</p>
              <div className="mt-3 grid gap-3">
                {nextVideoFixes.map((fix, index) => (
                  <ActionCard key={`${index}-${fix}`} index={index + 1} title={fix} detail="This prevents the problem instead of patching it later." tone="blue" />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {!isPaid && (nowFixes.length > 0 || nextVideoFixes.length > 0 || editorNotes.length > 0) && (
        <BlurSection blur feature="editing-plan-preview" label="Get full editing plan">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-wider text-white/35">Current cut improvements</p>
              <p className="mt-2 text-sm text-white/60">Scene trims, rewrite notes, and timestamped edit fixes continue in the full plan.</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-wider text-white/35">Next shoot improvements</p>
              <p className="mt-2 text-sm text-white/60">Setup notes, pacing changes, and format-specific direction continue in the full plan.</p>
            </div>
          </div>
        </BlurSection>
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
      <CollapsibleSection title="What To Cut And Rewrite" subtitle="Hook options, cut list, and the extra edit notes for your next pass." defaultOpen={false}>
        {!isPaid ? (
          <div className="space-y-4">
            {firstSuggestion ? (
              <div>
                <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3 flex items-center gap-2"><Scissors className="w-4 h-4 text-primary" />Editing Tip</h3>
                <div className="flex items-start gap-2 p-3 rounded-xl bg-primary/5 border border-primary/15">
                  <span className="text-primary/60 text-sm mt-0.5">→</span>
                  <p className="text-sm text-white/70">{firstSuggestion}</p>
                </div>
              </div>
            ) : null}
            <BlurSection blur feature="editing-plan" label="Get full editing plan">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs uppercase tracking-wider text-white/35">Opening rewrites</p>
                  <p className="mt-2 text-sm text-white/60">Alternative hooks and stronger opening angles.</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs uppercase tracking-wider text-white/35">Cut list</p>
                  <p className="mt-2 text-sm text-white/60">Timestamped trims, pacing fixes, and restructure notes.</p>
                </div>
              </div>
            </BlurSection>
          </div>
        ) : (
        <div className="space-y-6">
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
        )}
      </CollapsibleSection>
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
  const priorityTitles = titles.slice(0, 3);
  const extraTitles = titles.slice(3);
  const hashtags: Array<{ tag: string; effect?: string }> = pData?.hashtags ?? [];
  const visibleTagCount = isPaid ? 15 : 8;
  const firstTags = hashtags.slice(0, visibleTagCount);
  const extraTags = hashtags.slice(visibleTagCount);

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
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/6 p-4">
              <p className="text-xs uppercase tracking-wider text-emerald-100/70 flex items-center gap-2"><Target className="h-4 w-4 text-emerald-300" />Promise The Viewer Buys</p>
              <p className="mt-2 text-sm text-white/70">{pData.audiencePromise}</p>
            </div>
          )}
          {pData?.packagingStrategy && (
            <div className="rounded-2xl border border-sky-400/20 bg-sky-500/6 p-4">
              <p className="text-xs uppercase tracking-wider text-sky-100/70 flex items-center gap-2"><PenTool className="h-4 w-4 text-sky-300" />Angle To Lean Into</p>
              <p className="mt-2 text-sm text-white/70">{pData.packagingStrategy}</p>
            </div>
          )}
          {pData?.algorithmFit && (
            <div className="rounded-2xl border border-amber-400/20 bg-amber-500/6 p-4">
              <p className="text-xs uppercase tracking-wider text-amber-100/70 flex items-center gap-2"><Rocket className="h-4 w-4 text-amber-300" />Why This Should Get Clicked</p>
              <p className="mt-2 text-sm text-white/70">{pData.algorithmFit}</p>
            </div>
          )}
        </div>
      )}
      {Array.isArray(pData?.nicheReferences) && pData.nicheReferences.length > 0 && (
        <div className="rounded-xl border border-white/8 bg-background/60 p-4">
          <p className="text-xs uppercase tracking-wider text-white/35">Patterns Winning In This Niche</p>
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
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${activePlatform === pk ? "bg-emerald-500/15 text-emerald-200 border border-emerald-400/30 shadow-[0_10px_30px_rgba(16,185,129,0.12)]" : "bg-white/5 text-white/50 border border-white/10 hover:text-white/80"}`}
            >
              {pl?.label ?? pk}
            </button>
          );
        })}
      </div>
      {pData && (
        <div className="space-y-4">
          {!isPaid ? (
            <BlurSection blur feature="publish-package" label="Unlock publishing package">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-white/8 bg-background/60 p-4">
                  <p className="text-xs uppercase tracking-wider text-white/35">Titles to test</p>
                  <p className="mt-2 text-sm text-white/60">Platform-specific title options built around click tension and viewer intent.</p>
                </div>
                <div className="rounded-xl border border-white/8 bg-background/60 p-4">
                  <p className="text-xs uppercase tracking-wider text-white/35">Description and tags</p>
                  <p className="mt-2 text-sm text-white/60">Paste-ready metadata, hashtags, chapters, and upload copy.</p>
                </div>
                <div className="rounded-xl border border-white/8 bg-background/60 p-4">
                  <p className="text-xs uppercase tracking-wider text-white/35">Packaging angle</p>
                  <p className="mt-2 text-sm text-white/60">Clear thumbnail direction and audience promise for each platform.</p>
                </div>
                <div className="rounded-xl border border-white/8 bg-background/60 p-4">
                  <p className="text-xs uppercase tracking-wider text-white/35">Subtitle export</p>
                  <p className="mt-2 text-sm text-white/60">Downloadable subtitle file available on higher plans.</p>
                </div>
              </div>
            </BlurSection>
          ) : (
          <>
          {priorityTitles.length > 0 && (
            <div className="p-4 rounded-2xl bg-emerald-500/6 border border-emerald-400/20">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-emerald-100/70 uppercase tracking-wider flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" />Pick A Title For {platformLabel}</p>
                <button onClick={() => copyText(titles.join("\n"), "titles")} className="text-white/30 hover:text-white/60 transition-colors">
                  {copiedSection === "titles" ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {priorityTitles.map((title: string, index: number) => (
                  <button
                    key={`${index}-${title}`}
                    type="button"
                    onClick={() => copyText(title, `title-${index}`)}
                    className="rounded-xl border border-white/10 bg-black/10 p-4 text-left transition-all hover:border-emerald-400/25 hover:bg-emerald-500/8"
                  >
                    {titleStrategies[index] && (
                      <p className="text-[10px] text-primary/50 uppercase tracking-wider mb-1">{titleStrategies[index]}</p>
                    )}
                    <p className="text-sm text-white/80 leading-relaxed">{title}</p>
                  </button>
                ))}
              </div>
              {extraTitles.length > 0 && (
                <CollapsibleSection title="More Title Options" subtitle="Open for additional variations and angles." defaultOpen={false}>
                  <div className="space-y-2">
                    {extraTitles.map((t: string, i: number) => (
                      <div key={i} className="flex items-start gap-2">
                        <div className="flex-1">
                          {titleStrategies[i + 3] && <p className="text-[10px] text-primary/50 uppercase tracking-wider mb-0.5">{titleStrategies[i + 3]}</p>}
                          <p className="text-sm text-white/80">{t}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CollapsibleSection>
              )}
            </div>
          )}

          {hashtags.length > 0 && (
            <div className="p-4 rounded-2xl bg-sky-500/6 border border-sky-400/20">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-sky-100/70 uppercase tracking-wider flex items-center gap-1.5"><Hash className="w-3.5 h-3.5" />Paste-Ready Tags</p>
                {isPaid && (
                  <button onClick={() => copyText(hashtags.map(t => String(t.tag ?? "").replace(/^#+/, "")).join(", "), "tags")} className="text-white/30 hover:text-white/60 transition-colors">
                    {copiedSection === "tags" ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {firstTags.map((tag: { tag: string; effect?: string }, i: number) => (
                  <span key={i} title={tag.effect} className="px-2.5 py-1 bg-sky-500/10 border border-sky-400/20 text-sky-200 rounded-lg text-xs font-mono cursor-help">
                    {String(tag.tag ?? "").replace(/^#+/, "")}
                  </span>
                ))}
              </div>
              {extraTags.length > 0 && (
                <CollapsibleSection title="More Tags" subtitle="Keep the first set focused, then expand if you need a broader tag bank." defaultOpen={false}>
                  <div className="flex flex-wrap gap-1.5">
                    {extraTags.map((tag: { tag: string }, i: number) => (
                      <span key={i} className="px-2.5 py-1 bg-primary/10 border border-primary/20 text-primary/80 rounded-lg text-xs font-mono">
                        {String(tag.tag ?? "").replace(/^#+/, "")}
                      </span>
                    ))}
                  </div>
                </CollapsibleSection>
              )}
            </div>
          )}

          {pData.description && (
            <CollapsibleSection title="Copy/Paste Publish Package" subtitle="Description, chapters, and platform copy you can lift straight into upload." defaultOpen={false}>
              <div className="space-y-4">
                <div className="rounded-2xl bg-amber-500/6 border border-amber-400/20 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-amber-100/70 uppercase tracking-wider flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" />Description</p>
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

                {pData.timestamps?.length > 0 && (
                  <div className="rounded-2xl bg-violet-500/6 border border-violet-400/20 p-4">
                    <p className="text-xs text-violet-100/70 uppercase tracking-wider mb-3 flex items-center gap-1.5"><Clock3 className="w-3.5 h-3.5" />Chapter Timestamps</p>
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
            </CollapsibleSection>
          )}

          {showSubtitleFile && (
            <div className="p-4 rounded-2xl bg-emerald-500/6 border border-emerald-400/20">
              <p className="text-xs text-emerald-100/70 uppercase tracking-wider mb-3 flex items-center gap-1.5"><Download className="w-3.5 h-3.5" />Subtitle File (.srt)</p>
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
          </>
          )}
        </div>
      )}
    </div>
  );
}

const FILLER_WORDS_RX = /\b(um+|uh+|er+|ah+|hmm+|like|you know|basically|literally|actually|so|right)\b/gi;

function TranscriptPanel({ data, isPaid, profile }: { data: any; isPaid: boolean; profile?: any }) {
  const [copied, setCopied] = useState(false);
  const segments: Array<{ start: number; end: number; text: string }> = data?.segments ?? [];
  const fullText: string = data?.fullText ?? "";

  if (!segments.length && !fullText) {
    return <p className="text-white/40 text-sm">No transcript available.</p>;
  }

  const visibleSegments = isPaid ? segments : [];

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

      {!isPaid ? (
        <BlurSection blur feature="full-transcript" label="Unlock full breakdown">
          <div className="rounded-xl border border-white/8 bg-background/60 p-6 text-center">
            <p className="text-sm text-white/60">Full transcript with time markers and copy support.</p>
          </div>
        </BlurSection>
      ) : (
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
      </div>
      )}

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
  queueStatus,
  isPaid,
  onCancel,
}: {
  progress: number;
  currentStep: string;
  isSubmitting: boolean;
  uploadInfo: UploadProgressInfo | null;
  queueStatus?: AnalysisQueueStatus;
  isPaid: boolean;
  onCancel: () => void;
}) {
  const isUploading = isSubmitting && uploadInfo !== null;
  const activeIdx = isSubmitting ? 0
    : PROGRESS_STEPS.findIndex(step => step.threshold > progress) - 1;
  const [displayedUploadPct, setDisplayedUploadPct] = useState(1);

  useEffect(() => {
    if (!uploadInfo) {
      setDisplayedUploadPct(1);
      return undefined;
    }

    const targetPct = uploadInfo.phase === "assembling" ? 100 : Math.max(1, Math.min(100, uploadInfo.pct));
    const timer = window.setInterval(() => {
      setDisplayedUploadPct((current) => {
        if (current >= targetPct) return current;
        const step = Math.max(1, Math.ceil((targetPct - current) * 0.18));
        return Math.min(targetPct, current + step);
      });
    }, 180);

    return () => window.clearInterval(timer);
  }, [uploadInfo?.pct, uploadInfo?.phase]);

  if (isUploading && uploadInfo) {
    const { phase, mbUploaded, totalMb, etaSec, retrying } = uploadInfo;
    const isAssembling = phase === "assembling";
    const visiblePct = Math.round(displayedUploadPct);

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
            {retrying
              ? "Checking the upload and reconnecting if needed..."
              : isAssembling
              ? "Finalizing your upload, almost ready..."
              : `${mbUploaded.toFixed(1)} MB of ${totalMb.toFixed(1)} MB${etaLabel ? " - " + etaLabel : ""}`}
          </p>
        </div>

        <div className="mb-6">
          <div className="flex justify-between text-xs text-white/40 mb-2">
            <span>{isAssembling ? "Processing upload..." : "Uploading..."}</span>
            {!isAssembling && <span>{visiblePct}%</span>}
          </div>
          <div className="h-2 bg-white/8 rounded-full overflow-hidden">
            <motion.div
              animate={{ width: `${isAssembling ? 100 : visiblePct}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="h-full rounded-full bg-primary"
            />
          </div>
        </div>

        <div className="flex justify-center">
          <button
            onClick={onCancel}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white/40 border border-white/10 hover:border-white/25 hover:text-white/60 transition-all"
          >
            <X className="w-3.5 h-3.5" />Cancel upload
          </button>
        </div>

        <p className="text-xs text-white/20 text-center mt-6">Do not close this tab during upload</p>
      </div>
    );
  }

  const isWaiting = queueStatus?.state === "waiting";
  const isStarting = queueStatus?.state === "running" && progress <= 8;
  const ahead = typeof queueStatus?.ahead === "number" ? queueStatus.ahead : null;

  return (
    <div className="max-w-lg mx-auto py-12">
      <div className="text-center mb-10">
        <div className="w-16 h-16 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center mx-auto mb-4">
          <Wand2 className="w-8 h-8 text-primary animate-pulse" />
        </div>
        <h2 className="text-xl font-semibold text-white">Analyzing your video</h2>
        <p className="text-white/40 text-sm mt-1">This takes 1-3 minutes depending on length</p>
      </div>

      {(isWaiting || isStarting) && (
        <div className="mb-6 rounded-2xl border border-primary/20 bg-primary/8 p-4">
          <div className="flex items-start gap-3">
            <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-semibold text-white">
                {isWaiting ? "You're in line" : "Your analysis is starting"}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-white/55">
                {isWaiting
                  ? ahead === 0
                    ? "You're next. We'll start as soon as a slot opens."
                    : ahead === 1
                      ? "1 person is ahead of you. This updates automatically."
                      : `${ahead ?? queueStatus?.waiting ?? "A few"} people are ahead of you. This updates automatically.`
                  : "A processing slot opened. We're getting your report ready now."}
              </p>
              {isWaiting && !isPaid && (
                <button
                  type="button"
                  onClick={() => navigateToPricing("priority-queue")}
                  className="mt-3 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-all hover:bg-primary/20"
                >
                  Upgrade to Creator to wait less
                </button>
              )}
            </div>
          </div>
        </div>
      )}

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
        <h2 className="text-xl font-semibold text-white mb-2">You've reached your monthly usage limit</h2>
        <p className="text-sm text-white/50 mb-6">
          You’ve used the monthly usage included in your plan. Upgrade to keep analyzing longer videos and more uploads this month.
        </p>
        <button
          onClick={onUpgrade}
          className="w-full py-3 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors mb-3"
        >
          View plans
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

function getAnalysisUsageHint(durationSeconds?: number | null) {
  if (!durationSeconds || !Number.isFinite(durationSeconds)) return null;
  if (durationSeconds <= 5 * 60) {
    return { title: "Quick analysis", message: "Best for a shorter upload and light monthly usage." };
  }
  if (durationSeconds <= 30 * 60) {
    return { title: "Standard analysis", message: "A balanced pass for a longer edit." };
  }
  return { title: "Heavy analysis", message: "This will use more of your monthly usage." };
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
  const [activeResultTab, setActiveResultTab] = useState<string>("overview");
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
  const [fileDurationSec, setFileDurationSec] = useState<number | null>(null);

  const { uploadAsync: uploadVideo, isPending: isUploading, uploadInfo, cancelUpload } = useVideoUpload();
  const { data: pollData } = useAnalysisPolling(jobId);
  const statusData = pollData as { status?: string; progress?: number; currentStep?: string; queue?: AnalysisQueueStatus } | undefined;
  const { data: results } = useAnalysisResults(jobId, statusData?.status === "complete");

  const limits = getModeLimits("video-analyzer");
  const isPaid = plan.isPaid;
  const usageRemaining = limits.usageRemaining;
  const usageHint = getAnalysisUsageHint(fileDurationSec);
  const isNearUsageLimit = usageRemaining > 0 && usageRemaining <= Math.max(2, Math.ceil(limits.usageLimit * 0.2));

  // Fix: check all non-terminal statuses, not just "processing"/"queued"
  const isAnalyzing = isUploading || isSubmitting || (!!jobId && !!statusData && !TERMINAL_STATUSES.has(statusData.status ?? ""));
  const isError = statusData?.status === "error";
  const isDone = statusData?.status === "complete";
  const displayedResults = historyResult ?? results;
  const hasResults = !!historyResult || (isDone && !!results);

  // Keep the latest filename around so history/recovered reports export with a stable name.
  const fileNameRef = useRef<string>("analysis");
  const completedJobSoundRef = useRef<string | null>(null);
  const queueUpgradeToastJobRef = useRef<string | null>(null);
  const exportBaseName = (file?.name ?? fileNameRef.current ?? "analysis").replace(/\.[^.]+$/, "") || "analysis";
  const { ref: pdfExportRef, exportPdf, isExporting: isPdfExporting } = usePdfExport(`${exportBaseName}-daytabs-report.pdf`);

  useEffect(() => { if (file?.name) fileNameRef.current = file.name; }, [file]);

  useEffect(() => {
    if (!jobId || !isDone || !results) return;
    if (completedJobSoundRef.current === jobId) return;
    completedJobSoundRef.current = jobId;
    playAnalysisCompleteSound();
  }, [jobId, isDone, results]);

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
      setActiveResultTab("overview");

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

  useEffect(() => {
    const ahead = statusData?.queue?.ahead;
    if (!jobId || isPaid || statusData?.queue?.state !== "waiting" || typeof ahead !== "number" || ahead <= 0) return;
    if (queueUpgradeToastJobRef.current === jobId) return;
    queueUpgradeToastJobRef.current = jobId;

    toast({
      title: "Want a shorter wait?",
      description: "Creator and higher plans get priority in the analysis queue.",
      action: (
        <ToastAction altText="Upgrade to Creator" onClick={() => navigateToPricing("priority-queue")}>
          Upgrade
        </ToastAction>
      ),
    });
  }, [jobId, isPaid, statusData?.queue?.ahead, statusData?.queue?.state, toast]);

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
    setFileDurationSec(null);

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
          free:    { action: "Upgrade to Creator for 25 min videos", route: "/pricing?highlight=creator" },
          creator: { action: "Upgrade to Pro for 60 min videos",     route: "/pricing?highlight=pro" },
          pro:     { action: "Upgrade to Studio for 90 min videos",  route: "/pricing?highlight=studio" },
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
        return;
      }
      setFileDurationSec(duration);
    }
  }

  async function handleAnalyze() {
    if (!file) { toast({ title: "No video selected", description: "Please drop or select a video first.", variant: "destructive" }); return; }

    // Client-side pre-checks (informational, server is source of truth)
    if (usageRemaining === 0) { setShowLimitModal(true); return; }

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
          durationSeconds: fileDurationSec ?? undefined,
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

  async function handleCancelActiveAnalyses() {
    setCancellingJobId(jobId ?? "active");
    try {
      const result = await cancelActiveAnalysesRequest();
      clearPendingUploadRecovery();
      setAnalysisHistory((items) =>
        items.map((item) =>
          result.jobIds.includes(item.jobId)
            ? { ...item, status: "cancelled", progress: 0, currentStep: "Analysis cancelled", error: undefined }
            : item
        )
      );
      setJobId(null);
      setHistoryResult(null);
      setOpenedHistoryJobId(null);
      toast({
        title: result.cancelled ? "Active analyses cancelled" : "No active analyses found",
        description: result.cancelled
          ? `${result.cancelled} active request${result.cancelled === 1 ? " was" : "s were"} stopped.`
          : "There were no queued or running analyses for this account.",
      });
      loadAnalysisHistory();
    } catch (err) {
      toast({
        title: "Could not cancel active analyses",
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
    setFileDurationSec(null);
    setJobId(null);
    setHistoryResult(null);
    setOpenedHistoryJobId(null);
    setShowUploadForm(analysisHistory.length === 0);
    onDataReset();
  }

  function handleCancel() {
    clearPendingUploadRecovery();
    cancelUpload();
    if (jobId) {
      void handleCancelAnalysisJob(jobId);
    } else if (getStoredAuthToken()) {
      void handleCancelActiveAnalyses();
    }
  }

  const progress = statusData?.progress ?? (isSubmitting ? 5 : 0);
  const currentStepLabel = isSubmitting
    ? "Uploading your video..."
    : getFriendlyAnalysisStep(statusData?.status, statusData?.currentStep);
  const errorMessage = (pollData as any)?.error ?? "An unexpected error occurred during analysis.";
  const analysisProfile = getAnalysisProfile(displayedResults);
  const resultModules = getResultModules(displayedResults);
  const resultPlatforms = getResultPlatforms(displayedResults);
  const availableResultTabs = RESULT_TABS.filter(t => {
    if (t.id === "overview") return true;
    if (t.id === "transcript") return resultModules.includes("transcript") && !!(displayedResults as any)?.transcript && analysisProfile?.hasMeaningfulSpeech !== false;
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
          limit={limits.usageLimit}
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
                  DayTabs now auto-detects where speech appears and whether the upload should be judged as talking-first, visual-first, or mixed before generating your report.
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
                          {locked && <span className="text-xs px-1.5 py-0.5 bg-amber-500/15 text-amber-400 rounded border border-amber-500/20">Unlock</span>}
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
                <div className="mb-3 space-y-2">
                  <p className="text-xs text-center text-white/35">
                    {usageRemaining === 0
                      ? "You've reached your monthly usage limit"
                      : `${limits.usageUsed} of ${limits.usageLimit} monthly usage used`}
                  </p>
                  <p className="text-[11px] text-center text-white/25">
                    Up to {limits.analysesLimit} video analyses this month, depending on video length.
                  </p>
                  {usageHint ? (
                    <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-left">
                      <p className="text-xs font-semibold text-white">{usageHint.title}</p>
                      <p className="mt-1 text-[11px] text-white/45">{usageHint.message}</p>
                    </div>
                  ) : null}
                  {isNearUsageLimit ? (
                    <div className="rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-100">
                      You’re getting close to your monthly usage limit.
                    </div>
                  ) : null}
                </div>
                <button
                  onClick={handleAnalyze}
                  disabled={!file || isSubmitting}
                  className="w-full py-3.5 rounded-lg font-semibold text-sm transition-colors bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Wand2 className="w-4 h-4" />
                  {isSubmitting ? "Uploading..." : "Analyze Video"}
                </button>
                {usageRemaining === 0 && (
                  <button onClick={() => setShowLimitModal(true)} className="w-full mt-2 py-2.5 rounded-lg text-xs font-semibold text-primary border border-primary/30 hover:bg-primary/10 transition-all">
                    Upgrade for more usage
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
        <AnalyzingScreen progress={progress} currentStep={currentStepLabel} isSubmitting={isSubmitting} uploadInfo={uploadInfo} queueStatus={statusData?.queue} isPaid={isPaid} onCancel={handleCancel} />
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

          {availableResultTabs.length > 0 && (
            <>
              <div className="sticky top-3 z-10 -mt-1 overflow-x-auto rounded-2xl border border-white/8 bg-background/88 px-2 py-2 backdrop-blur">
                <div className="flex gap-1 min-w-max">
                {availableResultTabs.map(tab => {
                  const Icon = tab.icon;
                  const isActive = activeResultTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveResultTab(tab.id)}
                      className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all whitespace-nowrap ${isActive ? "bg-primary/15 text-primary border border-primary/30" : "text-white/45 border border-transparent hover:text-white/75 hover:bg-white/[0.04]"}`}
                    >
                      <Icon className="w-4 h-4" />{tab.label}
                    </button>
                  );
                })}
                </div>
              </div>
              <AnimatePresence mode="wait">
                <motion.div key={activeResultTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                  {activeResultTab === "overview"   && (
                    <CreatorReportIntro results={displayedResults} profile={analysisProfile} isPaid={isPaid} />
                  )}
                  {activeResultTab === "quality"    && <QualityPanel    data={(displayedResults as any).quality}    isPaid={isPaid} profile={analysisProfile} />}
                  {activeResultTab === "editing"    && <EditingPanel    data={(displayedResults as any).editing}    isPaid={isPaid} profile={analysisProfile} />}
                  {activeResultTab === "publish"    && <PublishPanel    data={(displayedResults as any).publish}    platforms={resultPlatforms} isPaid={isPaid} subtitleFile={(displayedResults as any).subtitleFile} videoFileName={file?.name} profile={analysisProfile} />}
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

              {availableResultTabs.map((tab) => (
                <section key={`pdf-${tab.id}`} data-pdf-tab-section="true" className="space-y-4 pt-2">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                    <p className="text-xs uppercase tracking-[0.16em] text-white/40">Report Section</p>
                    <h2 className="mt-2 text-2xl font-semibold text-white">{tab.label}</h2>
                  </div>

                  {tab.id === "overview" && (
                    <CreatorReportIntro results={displayedResults} profile={analysisProfile} isPaid={isPaid} />
                  )}
                  {tab.id === "quality" && <QualityPanel data={(displayedResults as any).quality} isPaid={isPaid} profile={analysisProfile} />}
                  {tab.id === "editing" && <EditingPanel data={(displayedResults as any).editing} isPaid={isPaid} profile={analysisProfile} />}
                  {tab.id === "publish" && <PublishPanel data={(displayedResults as any).publish} platforms={resultPlatforms} isPaid={isPaid} subtitleFile={(displayedResults as any).subtitleFile} videoFileName={file?.name ?? fileNameRef.current} profile={analysisProfile} />}
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
