import React, { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload, Film, Wand2, Shield, Scissors, TrendingUp, Sparkles,
  CheckCircle2, AlertTriangle, XCircle,
  Volume2, Eye, Zap, Hash, FileText, Lock
} from "lucide-react";
import { useAnalysisPolling, useAnalysisResults } from "@/hooks/use-analysis";
import { useVideoUpload } from "@/hooks/use-video-upload";
import { useToast } from "@/hooks/use-toast";
import { usePlan, getFileSizeLimit, getFileSizeLimitLabel, getDurationLimitLabel } from "@/hooks/use-plan";
import { PlanPickerModal } from "@/components/PlanPickerModal";

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
  {
    id: "quality",
    label: "Quality Check",
    icon: Shield,
    desc: "Lighting, audio, framing, and pacing scores",
    color: "blue",
    freeIncluded: true,
  },
  {
    id: "editing",
    label: "Editing Suggestions",
    icon: Scissors,
    desc: "Hook moments, cut points, and B-roll cues",
    color: "yellow",
    freeIncluded: true,
  },
  {
    id: "publish",
    label: "Publish Package",
    icon: TrendingUp,
    desc: "Titles, descriptions, and tags per platform",
    color: "green",
    freeIncluded: false,
  },
  {
    id: "shortClips",
    label: "Short Clip Ideas",
    icon: Sparkles,
    desc: "Best moments for Shorts, TikTok, and Reels",
    color: "violet",
    freeIncluded: false,
  },
];

const MODULE_COLORS: Record<string, string> = {
  blue:   "border-blue-500/30 bg-blue-500/10 text-blue-300",
  yellow: "border-yellow-500/30 bg-yellow-500/10 text-yellow-300",
  green:  "border-green-500/30 bg-green-500/10 text-green-300",
  violet: "border-violet-500/30 bg-violet-500/10 text-violet-300",
};

const RESULT_TABS = [
  { id: "quality",    label: "Quality",        icon: Shield },
  { id: "editing",    label: "Editing",        icon: Scissors },
  { id: "publish",    label: "Publish",        icon: TrendingUp },
  { id: "shortClips", label: "Short Clips",   icon: Sparkles },
];

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

function MetricCard({ title, metric }: { title: string; metric: any }) {
  if (!metric) return null;
  const numVal = metric.numeric ?? 0;
  const color = numVal >= 70 ? "text-green-400 border-green-400/20 bg-green-400/5" : numVal >= 45 ? "text-yellow-400 border-yellow-400/20 bg-yellow-400/5" : "text-red-400 border-red-400/20 bg-red-400/5";
  const Icon = numVal >= 70 ? CheckCircle2 : numVal >= 45 ? AlertTriangle : XCircle;
  return (
    <div className="bg-background/60 rounded-xl p-4 border border-white/8 hover:border-primary/20 transition-all">
      <div className="flex justify-between items-start mb-2">
        <p className="text-xs text-white/40 uppercase tracking-wider">{title}</p>
        <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${color}`}>
          <Icon className="w-3 h-3" />{metric.level}
        </div>
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
  const color = numVal >= 70 ? "text-green-400 border-green-400/20 bg-green-400/5" : numVal >= 45 ? "text-yellow-400 border-yellow-400/20 bg-yellow-400/5" : "text-red-400 border-red-400/20 bg-red-400/5";
  const Icon = numVal >= 70 ? CheckCircle2 : numVal >= 45 ? AlertTriangle : XCircle;
  const words: string[] = metric.words ?? [];
  return (
    <div className="bg-background/60 rounded-xl p-4 border border-white/8 hover:border-primary/20 transition-all col-span-2">
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-white/40" />
          <p className="text-xs text-white/40 uppercase tracking-wider">Filler Words</p>
        </div>
        <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${color}`}>
          <Icon className="w-3 h-3" />{metric.level}
        </div>
      </div>
      <div className="flex items-end gap-3 mb-2">
        <span className="text-3xl font-bold font-mono">{numVal}</span>
        <span className="text-xs text-white/40 mb-1">/ 100</span>
        {metric.count != null && <span className="text-sm text-white/40 mb-1">{metric.count} instance{metric.count !== 1 ? "s" : ""}</span>}
      </div>
      <ScoreBar score={numVal} />
      {metric.assessment && <p className="text-xs text-white/50 mt-2">{metric.assessment}</p>}
      {words.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {words.map((w, i) => <span key={i} className="px-2.5 py-1 bg-red-400/10 border border-red-400/20 text-red-300 rounded-lg text-xs font-mono">"{w}"</span>)}
        </div>
      )}
    </div>
  );
}

function QualityPanel({ data }: { data: any }) {
  if (!data) return <p className="text-white/40 text-sm">No quality data.</p>;
  const overallScore = data.score ?? data.overallScore ?? 0;
  const scoreColor = overallScore >= 70 ? "text-green-400" : overallScore >= 45 ? "text-yellow-400" : "text-red-400";
  return (
    <div className="space-y-6">
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
            {overallScore >= 70 ? "Strong video — ready to publish." : overallScore >= 45 ? "Good foundation — a few improvements recommended." : "Needs attention before publishing."}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {data.lighting && <MetricCard title="Lighting" metric={data.lighting} />}
        {data.audioQuality && <MetricCard title="Audio Quality" metric={data.audioQuality} />}
        {data.motionStability && <MetricCard title="Motion Stability" metric={data.motionStability} />}
        {data.framingComposition && <MetricCard title="Framing" metric={data.framingComposition} />}
        {data.pacing && <MetricCard title="Pacing" metric={data.pacing} />}
        {data.fillerWords && <FillerCard metric={data.fillerWords} />}
      </div>
    </div>
  );
}

function EditingPanel({ data }: { data: any }) {
  if (!data) return <p className="text-white/40 text-sm">No editing data.</p>;
  return (
    <div className="space-y-6">
      {data.hooks?.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3 flex items-center gap-2"><Zap className="w-4 h-4 text-yellow-400" />Hook Moments</h3>
          <div className="space-y-2">
            {data.hooks.map((h: any, i: number) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-yellow-400/5 border border-yellow-400/15">
                <span className="text-xs font-mono text-yellow-400 mt-0.5 min-w-[50px]">{h.timestamp ?? h.time ?? `#${i + 1}`}</span>
                <p className="text-sm text-white/70">{h.description ?? h.text ?? h}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {data.removeSections?.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3 flex items-center gap-2"><XCircle className="w-4 h-4 text-red-400" />Sections to Cut</h3>
          <div className="space-y-2">
            {data.removeSections.map((s: any, i: number) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-red-400/5 border border-red-400/15">
                {(s.start || s.end) && <span className="text-xs font-mono text-red-400 mt-0.5 min-w-[80px]">{s.start} → {s.end}</span>}
                <p className="text-sm text-white/70">{s.reason ?? s.description ?? s}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {data.editingSuggestions?.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3 flex items-center gap-2"><Scissors className="w-4 h-4 text-primary" />Editing Tips</h3>
          <div className="grid gap-2">
            {data.editingSuggestions.map((s: string, i: number) => (
              <div key={i} className="flex items-start gap-2 p-3 rounded-xl bg-primary/5 border border-primary/15">
                <span className="text-primary/60 text-sm mt-0.5">→</span>
                <p className="text-sm text-white/70">{s}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PublishPanel({ data, platforms }: { data: any; platforms: string[] }) {
  const [activePlatform, setActivePlatform] = useState<string>("");
  const publishKeys = data ? Object.keys(data) : [];

  useEffect(() => {
    if (publishKeys.length > 0 && !activePlatform) setActivePlatform(publishKeys[0]);
  }, [publishKeys.length]);

  if (!data || publishKeys.length === 0) return <p className="text-white/40 text-sm">No publish data.</p>;

  const pData = data[activePlatform];
  const platformLabel = PLATFORMS.find(p => p.id === activePlatform)?.label ?? activePlatform;

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
          {pData.titles?.length > 0 && (
            <div className="p-4 rounded-xl bg-background/60 border border-white/8">
              <p className="text-xs text-white/40 uppercase tracking-wider mb-3 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" />Titles for {platformLabel}</p>
              <div className="space-y-2">
                {pData.titles.map((t: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 group">
                    <span className="text-xs font-mono text-white/25 mt-0.5">{i + 1}.</span>
                    <p className="text-sm text-white/80 flex-1">{t}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {pData.description && (
            <div className="p-4 rounded-xl bg-background/60 border border-white/8">
              <p className="text-xs text-white/40 uppercase tracking-wider mb-2 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" />Description</p>
              <p className="text-sm text-white/70 whitespace-pre-line leading-relaxed">{pData.description}</p>
            </div>
          )}
          {pData.tags?.length > 0 && (
            <div className="p-4 rounded-xl bg-background/60 border border-white/8">
              <p className="text-xs text-white/40 uppercase tracking-wider mb-3 flex items-center gap-1.5"><Hash className="w-3.5 h-3.5" />Tags</p>
              <div className="flex flex-wrap gap-1.5">
                {pData.tags.map((tag: string, i: number) => (
                  <span key={i} className="px-2.5 py-1 bg-primary/10 border border-primary/20 text-primary/80 rounded-lg text-xs font-mono">#{tag.replace(/^#/, "")}</span>
                ))}
              </div>
            </div>
          )}
          {pData.thumbnailIdeas?.length > 0 && (
            <div className="p-4 rounded-xl bg-background/60 border border-white/8">
              <p className="text-xs text-white/40 uppercase tracking-wider mb-3 flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" />Thumbnail Ideas</p>
              <div className="space-y-2">
                {pData.thumbnailIdeas.map((idea: string, i: number) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-primary/50 text-sm">→</span>
                    <p className="text-sm text-white/70">{idea}</p>
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

function ShortClipsPanel({ data }: { data: any }) {
  const clips = data?.clips ?? data ?? [];
  if (!clips.length) return <p className="text-white/40 text-sm">No short clip ideas generated.</p>;
  return (
    <div className="space-y-3">
      {clips.map((clip: any, i: number) => (
        <div key={i} className="p-4 rounded-xl bg-background/60 border border-white/8 hover:border-primary/20 transition-all">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
                <span className="text-xs font-bold text-violet-300">{i + 1}</span>
              </div>
              <h4 className="text-sm font-semibold text-white/90">{clip.title ?? `Clip ${i + 1}`}</h4>
            </div>
            {(clip.start || clip.end || clip.duration) && (
              <span className="text-xs font-mono text-white/40 bg-white/5 px-2 py-0.5 rounded">
                {clip.start && clip.end ? `${clip.start} - ${clip.end}` : clip.duration ?? ""}
              </span>
            )}
          </div>
          {clip.hook && <p className="text-sm text-violet-300/80 mb-2 pl-9">"{clip.hook}"</p>}
          {clip.reason && <p className="text-xs text-white/50 pl-9">{clip.reason}</p>}
          {clip.platforms?.length > 0 && (
            <div className="flex gap-1.5 mt-2 pl-9">
              {clip.platforms.map((p: string, pi: number) => {
                const pl = PLATFORMS.find(x => x.id === p);
                return <span key={pi} className="text-xs px-2 py-0.5 bg-white/5 border border-white/10 rounded text-white/50">{pl?.shortLabel ?? p}</span>;
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function UploadZone({ onFile, isPending, maxSizeLabel, durationLabel }: { onFile: (f: File) => void; isPending: boolean; maxSizeLabel?: string; durationLabel?: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const onDrop = useCallback((accepted: File[]) => {
    const f = accepted[0]; if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    onFile(f);
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
      className={`relative overflow-hidden rounded-2xl cursor-pointer transition-all duration-300 border-2 ${isDragActive ? "border-primary bg-primary/10 scale-[1.01]" : "border-white/10 hover:border-primary/40 bg-primary/3 hover:bg-primary/6"} ${file ? "min-h-[180px] p-2" : "p-8"}`}
    >
      <input {...getInputProps()} />
      {file && preview ? (
        <div className="relative w-full min-h-[160px] rounded-xl overflow-hidden bg-black/50">
          <video src={preview} className="w-full h-full object-cover opacity-40" autoPlay loop muted playsInline />
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-gradient-to-t from-black/80 via-transparent to-transparent">
            <Film className="w-8 h-8 text-primary mb-2" />
            <p className="text-sm font-semibold text-white/90 text-center">{file.name}</p>
            <p className="text-xs text-white/40 mt-1">{(file.size / 1024 / 1024).toFixed(1)} MB — click to change</p>
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
  const { plan, getModeLimits } = usePlan();
  const { toast } = useToast();

  const [file, setFile] = useState<File | null>(null);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["youtube_long"]);
  const [selectedModules, setSelectedModules] = useState<string[]>(["quality", "editing"]);
  const [activeResultTab, setActiveResultTab] = useState<string>("quality");
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { uploadAsync: uploadVideo, isPending: isUploading } = useVideoUpload();
  const { data: pollData } = useAnalysisPolling(jobId);
  const statusData = pollData as { status?: string; progress?: number; currentStep?: string } | undefined;
  const { data: results } = useAnalysisResults(jobId, statusData?.status === "complete");

  const limits = getModeLimits("video-analyzer");
  const isPaid = plan.isPaid;
  const uploadsRemaining = limits.uploadsRemaining;
  const isAnalyzing = isUploading || isSubmitting || (!!jobId && (statusData?.status === "processing" || statusData?.status === "queued"));
  const isDone = statusData?.status === "complete";
  const hasResults = isDone && !!results;

  useEffect(() => {
    if (hasResults) {
      onDataReady();
      setActiveResultTab(selectedModules[0] ?? "quality");
    }
  }, [hasResults]);

  useEffect(() => {
    onRegisterExport(null);
  }, []);

  function togglePlatform(id: string) {
    setSelectedPlatforms(prev =>
      prev.includes(id) ? (prev.length > 1 ? prev.filter(p => p !== id) : prev) : [...prev, id]
    );
  }

  function toggleModule(id: string, locked: boolean) {
    if (locked) { setShowPlanModal(true); return; }
    setSelectedModules(prev =>
      prev.includes(id) ? (prev.length > 1 ? prev.filter(m => m !== id) : prev) : [...prev, id]
    );
  }

  async function handleAnalyze() {
    if (!file) { toast({ title: "No video selected", description: "Please drop or select a video first.", variant: "destructive" }); return; }
    if (limits.uploadsRemaining === 0) { setShowPlanModal(true); return; }

    const sizeLimit = getFileSizeLimit(plan.plan);
    if (file.size > sizeLimit) {
      toast({ title: "File too large", description: `Your plan allows up to ${getFileSizeLimitLabel(plan.plan)} per video.`, variant: "destructive" });
      return;
    }

    const needsPublish = selectedModules.includes("publish");
    if (!isPaid && needsPublish) { setShowPlanModal(true); return; }

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
      toast({ title: "Upload failed", description: err?.message ?? "Please try again.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleReset() {
    setFile(null);
    setJobId(null);
    onDataReset();
  }

  const progress = statusData?.progress ?? (isSubmitting ? 5 : 0);
  const currentStepLabel = statusData?.currentStep ?? (isSubmitting ? "Uploading video..." : "");

  const availableResultTabs = RESULT_TABS.filter(t => selectedModules.includes(t.id) && results?.[t.id]);

  return (
    <div className="space-y-8">
      {showPlanModal && <PlanPickerModal onClose={() => setShowPlanModal(false)} />}

      {!hasResults && !isAnalyzing ? (
        <>
          <div className="text-center">
            <h1 className="text-3xl font-display font-bold text-white">Video Analyzer</h1>
            <p className="text-white/50 mt-2">Upload your video and get a full AI analysis — quality, editing, publishing, and more.</p>
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-5">
              <UploadZone
                onFile={setFile}
                isPending={isSubmitting}
                maxSizeLabel={getFileSizeLimitLabel(plan.plan)}
                durationLabel={getDurationLimitLabel(plan.plan)}
              />

              <div>
                <p className="text-xs text-white/40 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <TrendingUp className="w-3.5 h-3.5" />Target Platforms
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
                  disabled={!file || isSubmitting || uploadsRemaining === 0}
                  className="w-full py-3.5 rounded-xl font-semibold text-sm transition-all bg-gradient-to-r from-primary to-purple-500 hover:from-primary/90 hover:to-purple-500/90 text-white disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-primary/25 flex items-center justify-center gap-2"
                >
                  <Wand2 className="w-4 h-4" />
                  {isSubmitting ? "Uploading..." : "Analyze Video"}
                </button>
                {uploadsRemaining === 0 && (
                  <button onClick={() => setShowPlanModal(true)} className="w-full mt-2 py-2.5 rounded-xl text-xs font-semibold text-primary border border-primary/30 hover:bg-primary/10 transition-all">
                    Upgrade for more analyses
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      ) : isAnalyzing ? (
        <div className="max-w-lg mx-auto py-12">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center mx-auto mb-4">
              <Wand2 className="w-8 h-8 text-primary animate-pulse" />
            </div>
            <h2 className="text-xl font-semibold text-white">Analyzing your video</h2>
            <p className="text-white/40 text-sm mt-1">This takes 1-3 minutes depending on length</p>
          </div>
          <div className="space-y-4">
            <div className="flex justify-between text-xs text-white/40 mb-1">
              <span>{currentStepLabel || "Processing..."}</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 bg-white/8 rounded-full overflow-hidden">
              <motion.div
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="h-full bg-gradient-to-r from-primary to-purple-500 rounded-full"
              />
            </div>
            <p className="text-xs text-white/25 text-center">Do not close this tab while analyzing</p>
          </div>
        </div>
      ) : hasResults ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-display font-bold text-white">Analysis Complete</h2>
              <p className="text-white/40 text-sm mt-0.5">Here's what we found in your video</p>
            </div>
            <button onClick={handleReset} className="px-4 py-2 rounded-xl text-xs font-semibold text-white/60 border border-white/15 hover:border-white/30 hover:text-white transition-all flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5" />Analyze New Video
            </button>
          </div>

          {availableResultTabs.length > 0 && (
            <>
              <div className="flex gap-1 border-b border-white/8">
                {availableResultTabs.map(tab => {
                  const Icon = tab.icon;
                  const isActive = activeResultTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveResultTab(tab.id)}
                      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-all border-b-2 -mb-px ${isActive ? "text-primary border-primary" : "text-white/40 border-transparent hover:text-white/70"}`}
                    >
                      <Icon className="w-4 h-4" />{tab.label}
                    </button>
                  );
                })}
              </div>
              <AnimatePresence mode="wait">
                <motion.div key={activeResultTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                  {activeResultTab === "quality"    && <QualityPanel data={results.quality} />}
                  {activeResultTab === "editing"    && <EditingPanel data={results.editing} />}
                  {activeResultTab === "publish"    && <PublishPanel data={results.publish} platforms={selectedPlatforms} />}
                  {activeResultTab === "shortClips" && <ShortClipsPanel data={results.shortClips} />}
                </motion.div>
              </AnimatePresence>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
