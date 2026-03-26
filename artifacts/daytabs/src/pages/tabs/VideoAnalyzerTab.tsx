import React, { useState, useCallback, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload, Film, Wand2, Shield, Scissors, TrendingUp, Sparkles,
  CheckCircle2, AlertTriangle, XCircle, RefreshCcw,
  Volume2, Eye, Zap, Hash, FileText, Lock, Download,
  Copy, Check, AlignLeft, ChevronRight, FileDown, X,
} from "lucide-react";
import { useAnalysisPolling, useAnalysisResults } from "@/hooks/use-analysis";
import { useVideoUpload, type UploadProgressInfo } from "@/hooks/use-video-upload";
import { useToast } from "@/hooks/use-toast";
import { usePlan, getFileSizeLimitLabel, getDurationLimitLabel, FILE_SIZE_LIMITS, DURATION_LIMITS_SEC } from "@/hooks/use-plan";
import { PlanPickerModal } from "@/components/PlanPickerModal";
import { generateAnalysisPDF } from "@/lib/generateAnalysisPDF";
import { UpgradeErrorModal, type LimitError } from "@/components/UpgradeErrorModal";

interface TabProps {
  onDataReady: () => void;
  onDataReset: () => void;
  onRegisterExport: (fn: (() => Promise<void>) | null) => void;
}

const PLATFORMS = [
  { id: "youtube_long",   label: "YouTube",      shortLabel: "YT",      color: "red" },
  { id: "youtube_shorts", label: "YT Shorts",    shortLabel: "Shorts",  color: "red" },
  { id: "tiktok",         label: "TikTok",       shortLabel: "TikTok",  color: "pink" },
  { id: "instagram",      label: "Instagram",    shortLabel: "IG",      color: "orange" },
  { id: "linkedin",       label: "LinkedIn",     shortLabel: "LI",      color: "blue" },
  { id: "x",              label: "X (Twitter)",  shortLabel: "X",       color: "slate" },
];

const MODULES = [
  { id: "quality",    label: "Quality Check",       icon: Shield,    desc: "Lighting, audio, framing, and pacing scores",    color: "blue",   freeIncluded: true  },
  { id: "editing",    label: "Editing Suggestions",  icon: Scissors,  desc: "Hook moments, cut points, and B-roll cues",      color: "yellow", freeIncluded: true  },
  { id: "publish",    label: "Publish Package",      icon: TrendingUp, desc: "Titles, descriptions, and tags per platform",  color: "green",  freeIncluded: false },
  { id: "shortClips", label: "Short Clip Ideas",    icon: Sparkles,  desc: "Best moments for Shorts, TikTok, and Reels",     color: "violet", freeIncluded: false },
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
  { label: "Transcribing with Whisper",   statuses: ["transcribing"],        threshold: 35  },
  { label: "Analyzing quality",           statuses: ["analyzing_visual"],    threshold: 55  },
  { label: "Generating suggestions",      statuses: ["analyzing_content"],   threshold: 82  },
  { label: "Building publish package",    statuses: ["generating_seo"],      threshold: 92  },
  { label: "Finalizing report",           statuses: [],                      threshold: 100 },
];

const TERMINAL_STATUSES = new Set(["complete", "error"]);

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
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-primary to-purple-500 text-white hover:opacity-90 transition-opacity whitespace-nowrap"
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

function ScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? "bg-green-400" : score >= 45 ? "bg-yellow-400" : "bg-red-400";
  return (
    <div className="relative h-2 bg-white/8 rounded-full overflow-hidden mt-2">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${score}%` }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className={`h-full ${color} rounded-full`}
      />
    </div>
  );
}

function SeverityBadge({ severity, numeric }: { severity?: string; numeric?: number }) {
  const s = severity ?? (numeric !== undefined ? (numeric >= 80 ? "excellent" : numeric >= 60 ? "good" : numeric >= 40 ? "needs work" : "critical") : "good");
  const cls = s === "excellent" ? "text-green-400 border-green-400/20 bg-green-400/5"
    : s === "good" ? "text-blue-400 border-blue-400/20 bg-blue-400/5"
    : s === "needs work" ? "text-yellow-400 border-yellow-400/20 bg-yellow-400/5"
    : "text-red-400 border-red-400/20 bg-red-400/5";
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border capitalize ${cls}`}>{s}</span>
  );
}

function MetricCard({ title, metric }: { title: string; metric: any }) {
  if (!metric) return null;
  const numVal = metric.numeric ?? 0;
  return (
    <div className="bg-background/60 rounded-xl p-4 border border-white/8 hover:border-primary/20 transition-all">
      <div className="flex justify-between items-start mb-2">
        <p className="text-xs text-white/40 uppercase tracking-wider">{title}</p>
        <SeverityBadge severity={metric.severity} numeric={numVal} />
      </div>
      <span className="text-3xl font-bold font-mono">{numVal}</span>
      <span className="text-xs text-white/40 ml-1">/ 100</span>
      <ScoreBar score={numVal} />
      {metric.assessment && <p className="text-xs text-white/50 mt-2">{metric.assessment}</p>}
      {metric.suggestions?.[0] && <p className="text-xs text-primary/80 mt-1">→ {metric.suggestions[0]}</p>}
    </div>
  );
}

function FillerCard({ metric }: { metric: any }) {
  if (!metric) return null;
  const numVal = metric.numeric ?? 0;
  const words: string[] = metric.words ?? [];
  return (
    <div className="bg-background/60 rounded-xl p-4 border border-white/8 hover:border-primary/20 transition-all col-span-2">
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-white/40" />
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

function QualityPanel({ data, isPaid }: { data: any; isPaid: boolean }) {
  if (!data) return <p className="text-white/40 text-sm">No quality data.</p>;
  const overallScore = data.score ?? data.overallScore ?? data.overallVisualScore ?? 0;
  const scoreColor = overallScore >= 70 ? "text-green-400" : overallScore >= 45 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="space-y-6">
      {data.topFix && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-400/8 border border-amber-400/20">
          <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs text-amber-400/70 uppercase tracking-wider mb-0.5 font-semibold">Most Important Fix</p>
            <p className="text-sm text-white/80">{data.topFix}</p>
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
              className={`h-full rounded-full ${overallScore >= 70 ? "bg-gradient-to-r from-green-500 to-emerald-400" : overallScore >= 45 ? "bg-gradient-to-r from-yellow-500 to-amber-400" : "bg-gradient-to-r from-red-500 to-rose-400"}`}
            />
          </div>
          <p className="text-xs text-white/40 mt-2">
            {overallScore >= 70 ? "Strong video, ready to publish." : overallScore >= 45 ? "Good foundation, a few improvements needed." : "Needs attention before publishing."}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {data.lighting && <MetricCard title="Lighting" metric={data.lighting} />}
        {data.audioClarity && <MetricCard title="Audio Clarity" metric={data.audioClarity} />}

        <BlurSection blur={!isPaid} feature="visual-quality" label="Get detailed scores for contrast, color, framing, and background">
          <div className="grid grid-cols-1 gap-3">
            {data.brightness    && <MetricCard title="Brightness"    metric={data.brightness} />}
            {data.contrast      && <MetricCard title="Contrast"      metric={data.contrast} />}
            {data.colorTemperature && <MetricCard title="Color Temperature" metric={{ numeric: 75, assessment: data.colorTemperature?.assessment, suggestions: data.colorTemperature?.suggestions, severity: data.colorTemperature?.severity }} />}
            {data.background    && <MetricCard title="Background"    metric={data.background} />}
            {data.framing       && <MetricCard title="Framing"       metric={data.framing} />}
            {data.sharpness     && <MetricCard title="Sharpness"     metric={data.sharpness} />}
            {data.stability     && <MetricCard title="Stability"     metric={data.stability} />}
          </div>
        </BlurSection>

        {data.audioVolume && <MetricCard title="Audio Volume" metric={data.audioVolume} />}
        {data.backgroundNoise && <MetricCard title="Background Noise" metric={data.backgroundNoise} />}
        {data.fillerWords && <FillerCard metric={data.fillerWords} />}
      </div>

      {data.colorGradingRecommendation && isPaid && (
        <div className="p-4 rounded-xl bg-background/60 border border-white/8">
          <p className="text-xs text-white/40 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" />Color Grading Recommendation</p>
          <p className="text-sm text-white/70">{data.colorGradingRecommendation}</p>
        </div>
      )}
    </div>
  );
}

function EditingPanel({ data, isPaid }: { data: any; isPaid: boolean }) {
  if (!data) return <p className="text-white/40 text-sm">No editing data.</p>;
  const hooks = data.hooks ?? [];
  const suggestions = data.editingSuggestions ?? [];
  const firstSuggestion = suggestions[0];
  const extraSuggestions = suggestions.slice(1);

  return (
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
  );
}

function PublishPanel({ data, platforms, isPaid, subtitleFile, videoFileName }: { data: any; platforms: string[]; isPaid: boolean; subtitleFile?: { content: string; format: string; language: string }; videoFileName?: string }) {
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

          {isYouTube && (
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

function TranscriptPanel({ data, isPaid }: { data: any; isPaid: boolean }) {
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
          <div className="w-16 h-16 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center mx-auto mb-4">
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
            <span>{isAssembling ? "Processing upload..." : retrying ? "Connection issue - retrying..." : `Uploading... ${pct}%`}</span>
            {!isAssembling && <span>{pct}%</span>}
          </div>
          <div className="h-2 bg-white/8 rounded-full overflow-hidden">
            <motion.div
              animate={{ width: `${isAssembling ? 100 : pct}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className={`h-full rounded-full ${retrying ? "bg-amber-400" : "bg-gradient-to-r from-primary to-purple-500"}`}
            />
          </div>
          {retrying && (
            <p className="text-xs text-amber-400/80 mt-2">Connection issue - retrying chunk...</p>
          )}
        </div>

        {!isAssembling && (
          <div className="flex justify-center">
            <button
              onClick={onCancel}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white/40 border border-white/10 hover:border-white/25 hover:text-white/60 transition-all"
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
        <div className="w-16 h-16 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center mx-auto mb-4">
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
            className="h-full bg-gradient-to-r from-primary to-purple-500 rounded-full"
          />
        </div>
      </div>

      <div className="space-y-3">
        {PROGRESS_STEPS.map((step, i) => {
          const completed = i < activeIdx || (i === activeIdx && progress >= step.threshold);
          const active = i === activeIdx && !completed;
          return (
            <div key={i} className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all ${active ? "bg-primary/10 border border-primary/25" : completed ? "opacity-50" : "opacity-20"}`}>
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
      <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
        <XCircle className="w-8 h-8 text-red-400" />
      </div>
      <h2 className="text-xl font-semibold text-white mb-2">Analysis failed</h2>
      <p className="text-sm text-white/50 mb-6 leading-relaxed">{error}</p>
      <button
        onClick={onReset}
        className="flex items-center gap-2 mx-auto px-5 py-2.5 rounded-xl text-sm font-semibold bg-primary/15 border border-primary/30 text-primary hover:bg-primary/25 transition-all"
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
        className="bg-[#1a1025] border border-white/10 rounded-2xl p-8 max-w-sm mx-4 text-center"
      >
        <div className="w-14 h-14 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center mx-auto mb-4">
          <Shield className="w-7 h-7 text-primary" />
        </div>
        <h2 className="text-xl font-semibold text-white mb-2">Monthly limit reached</h2>
        <p className="text-sm text-white/50 mb-6">
          You've used all {limit} free {limit === 1 ? "analysis" : "analyses"} this month. Upgrade to Creator for 15 analyses per month, or go Pro for 40.
        </p>
        <button
          onClick={onUpgrade}
          className="w-full py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-primary to-purple-500 text-white hover:opacity-90 transition-opacity mb-3"
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

export default function VideoAnalyzerTab({ onDataReady, onDataReset, onRegisterExport }: TabProps) {
  const { plan, loading: planLoading, getModeLimits } = usePlan();
  const { toast } = useToast();

  const [file, setFile] = useState<File | null>(null);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["youtube_long"]);
  const [selectedModules, setSelectedModules] = useState<string[]>(["quality", "editing"]);
  const [activeResultTab, setActiveResultTab] = useState<string>("quality");
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [limitError, setLimitError] = useState<LimitError | null>(null);

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
  const hasResults = isDone && !!results;

  // Keep refs so the PDF export closure always has the latest values
  const resultsRef = useRef<any>(null);
  const fileNameRef = useRef<string>("analysis");
  const [isPdfExporting, setIsPdfExporting] = useState(false);

  useEffect(() => { resultsRef.current = results ?? null; }, [results]);
  useEffect(() => { if (file?.name) fileNameRef.current = file.name; }, [file]);

  useEffect(() => {
    if (hasResults) {
      onDataReady();
      const firstModule = selectedModules.find(m => (results as any)?.[m]);
      setActiveResultTab(firstModule ?? "quality");

      // Refresh plan usage so the Home page counter updates immediately
      window.dispatchEvent(new CustomEvent("daytabs:plan-updated"));

      // Register real PDF export so ExportWarningDialog can trigger it
      const exportFn = async () => {
        if (!resultsRef.current) return;
        await generateAnalysisPDF(resultsRef.current, fileNameRef.current);
      };
      onRegisterExport(exportFn);
    } else {
      onRegisterExport(null);
    }
  }, [hasResults]);

  // Show the processing screen as soon as a jobId exists, even before first poll
  const showAnalyzing = isAnalyzing || (!!jobId && !isDone && !isError);

  function togglePlatform(id: string) {
    setSelectedPlatforms([id]);
  }

  function toggleModule(id: string, locked: boolean) {
    if (locked) { setShowPlanModal(true); return; }
    setSelectedModules(prev =>
      prev.includes(id) ? (prev.length > 1 ? prev.filter(m => m !== id) : prev) : [...prev, id]
    );
  }

  /** Called immediately on file drop, validates size and duration before accepting the file */
  async function handleFileSelected(f: File) {
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
        free:    { action: "Upgrade to Creator for 500 MB videos", route: "/pricing?highlight=creator" },
        creator: { action: "Upgrade to Pro for 1 GB videos",       route: "/pricing?highlight=pro" },
        pro:     { action: "Upgrade to Studio for 2 GB videos",    route: "/pricing?highlight=studio" },
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
          free:    { action: "Upgrade to Creator for 15 min videos", route: "/pricing?highlight=creator" },
          creator: { action: "Upgrade to Pro for 30 min videos",     route: "/pricing?highlight=pro" },
          pro:     { action: "Upgrade to Studio for 60 min videos",  route: "/pricing?highlight=studio" },
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
    try {
      const { jobId: id } = await uploadVideo({
        file,
        options: {
          mode: "video-analyzer",
          platforms: selectedPlatforms,
          modules: selectedModules,
        },
      });
      setJobId(id);
    } catch (err: any) {
      // Silently reset if the user cancelled
      if (err?.message === "Upload cancelled") {
        setFile(null);
        return;
      }
      // Detect structured limit errors from the server
      const structured = err?.structured ?? err?.response;
      if (structured?.code) {
        setLimitError(structured as LimitError);
      } else {
        toast({ title: "Upload failed", description: err?.message ?? "Please try again.", variant: "destructive" });
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleReset() {
    setFile(null);
    setJobId(null);
    onDataReset();
  }

  function handleCancel() {
    cancelUpload();
  }

  const progress = statusData?.progress ?? (isSubmitting ? 5 : 0);
  const currentStepLabel = statusData?.currentStep ?? (isSubmitting ? "Uploading video..." : "");
  const errorMessage = (pollData as any)?.error ?? "An unexpected error occurred during analysis.";

  const availableResultTabs = RESULT_TABS.filter(t => {
    if (t.id === "transcript") return !!(results as any)?.transcript;
    return selectedModules.includes(t.id) && !!(results as any)?.[t.id];
  });

  return (
    <div className="space-y-8">
      {showPlanModal && <PlanPickerModal onClose={() => setShowPlanModal(false)} />}
      <UpgradeErrorModal error={limitError} onClose={() => setLimitError(null)} />
      {showLimitModal && (
        <LimitReachedModal
          limit={limits.uploadLimit}
          onClose={() => setShowLimitModal(false)}
          onUpgrade={() => navigateToPricing("monthly-limit")}
        />
      )}
      {!hasResults && !showAnalyzing && !isError ? (
        <>
          <div className="text-center">
            <h1 className="text-3xl font-display font-bold text-white">Video Analyzer</h1>
            <p className="text-white/50 mt-2">Upload your video and get a full AI analysis; quality, editing, publishing, and more.</p>
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-5">
              <UploadZone
                onFile={handleFileSelected}
                currentFile={file}
                isPending={isSubmitting}
                maxSizeLabel={getFileSizeLimitLabel(plan.plan)}
                durationLabel={getDurationLimitLabel(plan.plan)}
              />

              <div>
                <p className="text-xs text-white/40 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <TrendingUp className="w-3.5 h-3.5" />Target Platform
                </p>
                <div className="flex flex-wrap gap-2">
                  {PLATFORMS.map(pl => {
                    const active = selectedPlatforms.includes(pl.id);
                    return (
                      <button
                        key={pl.id}
                        onClick={() => togglePlatform(pl.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${active ? "bg-primary/20 text-primary border-primary/40" : "bg-white/5 text-white/50 border-white/10 hover:text-white/80 hover:border-white/20"}`}
                      >
                        {pl.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-xs text-white/40 uppercase tracking-wider flex items-center gap-2">
                <Wand2 className="w-3.5 h-3.5" />Analysis Modules
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
                      className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all border ${active && !locked ? `${MODULE_COLORS[mod.color]} border-opacity-40` : locked ? "bg-white/3 border-white/8 opacity-60" : "bg-white/3 border-white/8 hover:border-white/15"}`}
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
                  className="w-full py-3.5 rounded-xl font-semibold text-sm transition-all bg-gradient-to-r from-primary to-purple-500 hover:from-primary/90 hover:to-purple-500/90 text-white disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-primary/25 flex items-center justify-center gap-2"
                >
                  <Wand2 className="w-4 h-4" />
                  {isSubmitting ? "Uploading..." : "Analyze Video"}
                </button>
                {uploadsRemaining === 0 && (
                  <button onClick={() => setShowLimitModal(true)} className="w-full mt-2 py-2.5 rounded-xl text-xs font-semibold text-primary border border-primary/30 hover:bg-primary/10 transition-all">
                    Upgrade for more analyses
                  </button>
                )}
              </div>
            </div>
          </div>
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
                onClick={async () => {
                  if (!results) return;
                  setIsPdfExporting(true);
                  try {
                    await generateAnalysisPDF(results as any, file?.name ?? "analysis");
                  } finally {
                    setIsPdfExporting(false);
                  }
                }}
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
                  {activeResultTab === "quality"    && <QualityPanel    data={(results as any).quality}    isPaid={isPaid} />}
                  {activeResultTab === "editing"    && <EditingPanel    data={(results as any).editing}    isPaid={isPaid} />}
                  {activeResultTab === "publish"    && <PublishPanel    data={(results as any).publish}    platforms={selectedPlatforms} isPaid={isPaid} subtitleFile={(results as any).subtitleFile} videoFileName={file?.name} />}
                  {activeResultTab === "shortClips" && <ShortClipsPanel data={(results as any).shortClips} isPaid={isPaid} />}
                  {activeResultTab === "transcript" && <TranscriptPanel data={(results as any).transcript} isPaid={isPaid} />}
                </motion.div>
              </AnimatePresence>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
