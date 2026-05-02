import { useCallback, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, FileVideo, Lock, Upload, Wand2, X } from "lucide-react";

type PlatformType = "youtube_long" | "youtube_shorts";
type ModuleId = "quality" | "editing" | "transcript" | "publish";

const PLATFORM_OPTIONS: Array<{ id: PlatformType; label: string; sub: string }> = [
  { id: "youtube_long", label: "Long Video", sub: "Podcast, talking head, tutorial" },
  { id: "youtube_shorts", label: "Short Video / Reels", sub: "Vertical, fast hook, short edits" },
];

const MODULES: Array<{ id: ModuleId; label: string; desc: string; freeIncluded: boolean }> = [
  { id: "quality", label: "Quality Check", desc: "Lighting, framing, audio, pacing", freeIncluded: true },
  { id: "editing", label: "Editing Suggestions", desc: "Hook notes, cut points, timeline fixes", freeIncluded: true },
  { id: "transcript", label: "Transcript", desc: "Transcript with timestamps for repurposing", freeIncluded: true },
  { id: "publish", label: "Publish Package", desc: "Titles, descriptions, tags, packaging", freeIncluded: false },
];

const ACCEPT_EXT = ".mp4,.mov,.avi,.webm,.mkv,.mpeg";

export function LandingVideoUploadPreview({
  defaultPlatform = "youtube_long",
  freeLimitsLabel = "Free plan includes 1 analysis and up to 5 min videos.",
  onStartAnalysis,
  compact,
}: {
  defaultPlatform?: PlatformType;
  freeLimitsLabel?: string;
  compact?: boolean;
  onStartAnalysis: (input: {
    fileName: string;
    platform: PlatformType;
    modules: ModuleId[];
  }) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformType>(defaultPlatform);
  const [selectedModules, setSelectedModules] = useState<ModuleId[]>(["quality", "editing"]);
  const [error, setError] = useState<string | null>(null);

  const lockedModules = useMemo(() => new Set<ModuleId>(["publish"]), []);

  const onPickFile = useCallback(() => inputRef.current?.click(), []);

  const onFileSelected = useCallback((file: File | null) => {
    setSelectedFile(file);
    setError(null);
  }, []);

  const toggleModule = useCallback((id: ModuleId) => {
    if (lockedModules.has(id)) return;
    setSelectedModules((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((m) => m !== id);
        return next.length ? next : prev;
      }
      return [...prev, id];
    });
  }, [lockedModules]);

  const containerClass = compact ? "p-5" : "p-6";

  return (
    <div className="mx-auto w-full max-w-[980px]">
      <div className={`relative rounded-3xl border border-white/10 bg-white/[0.03] shadow-2xl shadow-black/50 backdrop-blur-2xl ${containerClass}`}>
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -inset-8 rounded-[44px] bg-gradient-to-br from-violet-500/18 via-fuchsia-500/10 to-transparent blur-2xl"
          animate={{ opacity: [0.55, 0.9, 0.55], scale: [1, 1.02, 1] }}
          transition={{ duration: 6.5, repeat: Infinity, ease: "easeInOut" }}
        />

        <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-2xl md:text-3xl font-black tracking-tight text-white">Upload your video to start</p>
              <p className="mt-2 text-sm md:text-base text-white/55">
                Choose a video and see what DayTabs can analyze. You will sign up before the real upload and analysis begins.
              </p>
              <p className="mt-3 text-xs text-white/40">{freeLimitsLabel}</p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs font-semibold text-white/65">
              <Lock className="h-4 w-4 text-white/45" />
              No upload before signup
            </span>
          </div>

          <div
            className="mt-6 rounded-3xl border-2 border-dashed border-white/15 bg-black/30 p-6 hover:border-violet-400/40 transition-colors"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0] ?? null;
              if (file) onFileSelected(file);
            }}
            role="button"
            tabIndex={0}
            onClick={onPickFile}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onPickFile();
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT_EXT}
              className="hidden"
              onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)}
            />

            {selectedFile ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
                    <FileVideo className="h-5 w-5 text-white/70" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{selectedFile.name}</p>
                    <p className="mt-1 text-xs text-white/45">Stored locally in this page. Not uploaded.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(null);
                  }}
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/[0.06]"
                >
                  <X className="h-4 w-4" />
                  Remove
                </button>
              </div>
            ) : (
              <div className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl border border-violet-400/20 bg-violet-500/10">
                  <Upload className="h-7 w-7 text-violet-200" />
                </div>
                <p className="mt-4 text-sm font-semibold text-white/85">Drag and drop a video, or click to choose</p>
                <p className="mt-1 text-xs text-white/40">MP4, MOV, AVI, WebM, MKV</p>
              </div>
            )}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Platform type</p>
              <div className="mt-3 grid gap-2">
                {PLATFORM_OPTIONS.map((opt) => {
                  const active = selectedPlatform === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSelectedPlatform(opt.id)}
                      className={`rounded-2xl border px-4 py-3 text-left transition-all ${active ? "border-violet-400/35 bg-violet-500/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"}`}
                    >
                      <p className="text-sm font-semibold text-white">{opt.label}</p>
                      <p className="mt-1 text-xs text-white/45">{opt.sub}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Analysis modules</p>
              <div className="mt-3 grid gap-2">
                {MODULES.map((mod) => {
                  const active = selectedModules.includes(mod.id);
                  const locked = lockedModules.has(mod.id);
                  return (
                    <button
                      key={mod.id}
                      type="button"
                      onClick={() => toggleModule(mod.id)}
                      className={`rounded-2xl border px-4 py-3 text-left transition-all ${locked ? "cursor-not-allowed border-white/10 bg-white/[0.02] opacity-70" : active ? "border-emerald-400/25 bg-emerald-500/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white/90">{mod.label}</p>
                          <p className="mt-1 text-xs text-white/45">{mod.desc}</p>
                        </div>
                        <div className="mt-0.5">
                          {locked ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/20 bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-100">
                              <Lock className="h-3 w-3" />
                              Locked
                            </span>
                          ) : active ? (
                            <CheckCircle2 className="h-5 w-5 text-emerald-300" />
                          ) : (
                            <span className="h-5 w-5 rounded-full border border-white/15 bg-white/[0.03] block" />
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-white/40">Your video is not uploaded yet. Sign up first, then upload again securely inside the app.</p>
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (!selectedFile) {
                  setError("Choose a video first.");
                  return;
                }
                setError(null);
                onStartAnalysis({
                  fileName: selectedFile.name,
                  platform: selectedPlatform,
                  modules: selectedModules,
                });
              }}
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-black/25 hover:from-violet-500 hover:to-fuchsia-400"
            >
              <Wand2 className="h-4 w-4" />
              Start analysis
            </button>
            <p className="text-xs text-white/45">Your video is not uploaded until after signup.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

