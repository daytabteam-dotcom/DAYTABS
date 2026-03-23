import React, { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { motion } from "framer-motion";
import { TrendingUp, Copy, Check, Download, Hash, Clock, FileText, Globe, Film, Upload, FileDown, Lock, Crown } from "lucide-react";
import { ProgressIndicator } from "@/components/ProgressIndicator";
import { useAnalysisPolling, useAnalysisResults } from "@/hooks/use-analysis";
import { usePdfExport } from "@/hooks/use-pdf-export";
import { useVideoUpload } from "@/hooks/use-video-upload";
import { useToast } from "@/hooks/use-toast";
import { usePlan } from "@/hooks/use-plan";
import { LockedContent, LockedBadge } from "@/components/LockedContent";

interface TabProps {
  onDataReady: () => void;
  onDataReset: () => void;
  onRegisterExport: (fn: (() => Promise<void>) | null) => void;
}

const PLATFORMS = [
  { id: "youtube_long", label: "YouTube", freeAllowed: false },
  { id: "youtube_shorts", label: "YT Shorts", freeAllowed: true },
  { id: "tiktok", label: "TikTok", freeAllowed: true },
  { id: "instagram", label: "Instagram", freeAllowed: true },
  { id: "linkedin", label: "LinkedIn", freeAllowed: true },
  { id: "x", label: "X (Twitter)", freeAllowed: true },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <button onClick={copy} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white/70 transition-all">
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function UploadZone({ onFile, isPending, platform }: { onFile: (f: File) => void; isPending: boolean; platform: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const label = PLATFORMS.find(p => p.id === platform)?.label || "your platform";
  const onDrop = useCallback((accepted: File[]) => { const f = accepted[0]; if (!f) return; setFile(f); setPreview(URL.createObjectURL(f)); onFile(f); }, [onFile]);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { "video/*": [".mp4", ".mov", ".avi", ".webm"] }, maxFiles: 1, disabled: isPending });
  return (
    <div {...getRootProps()} className={`relative overflow-hidden rounded-2xl cursor-pointer transition-all duration-300 border-2 ${isDragActive ? "border-emerald-400 bg-emerald-400/10 scale-[1.01]" : "border-white/10 hover:border-emerald-400/40 bg-emerald-400/3 hover:bg-emerald-400/6"} ${file ? "min-h-[200px] p-2" : "p-10"}`}>
      <input {...getInputProps()} />
      {file && preview ? (
        <div className="relative w-full min-h-[180px] rounded-xl overflow-hidden bg-black/50">
          <video src={preview} className="w-full h-full object-cover opacity-40" autoPlay loop muted playsInline />
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-gradient-to-t from-black/80 via-transparent to-transparent">
            <Film className="w-8 h-8 text-emerald-400 mb-2" />
            <p className="text-white font-semibold text-sm text-center truncate max-w-full px-4">{file.name}</p>
            <p className="text-white/50 text-xs mt-1">{(file.size / (1024 * 1024)).toFixed(1)} MB</p>
            <span className="mt-3 px-3 py-1 bg-white/15 backdrop-blur-md rounded-full text-xs text-white">Click to replace</span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-emerald-400/15 border border-emerald-400/20 flex items-center justify-center"><TrendingUp className="w-9 h-9 text-emerald-400/70" /></div>
            <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-emerald-400/30 border border-emerald-400/40 flex items-center justify-center"><Upload className="w-3.5 h-3.5 text-emerald-400" /></div>
          </div>
          <div className="text-center space-y-1">
            <p className="font-bold text-white text-base">{isDragActive ? "Drop it here!" : "Drop your video here"}</p>
            <p className="text-sm text-white/40">We'll generate SEO content & subtitles for <span className="text-emerald-400/80">{label}</span></p>
            <p className="text-xs text-white/25 mt-2">MP4, MOV, AVI, WebM · up to 2 GB</p>
          </div>
          <div className="px-5 py-2 bg-emerald-400/10 border border-emerald-400/20 rounded-full text-sm font-medium text-emerald-400/80">Browse Files</div>
        </div>
      )}
    </div>
  );
}

export default function PublishTab({ onDataReady, onDataReset, onRegisterExport }: TabProps) {
  const { toast } = useToast();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [platform, setPlatform] = useState("youtube_shorts");
  const [translateSubs, setTranslateSubs] = useState(false);
  const [subLang, setSubLang] = useState("Spanish");

  const { plan, getModeLimits } = usePlan();
  const isFree = !plan.isPaid;
  const { uploadsRemaining, uploadUsed, uploadLimit } = getModeLimits("publish");

  // If free user had youtube_long selected, reset to youtube_shorts
  useEffect(() => {
    if (isFree && platform === "youtube_long") setPlatform("youtube_shorts");
  }, [isFree, platform]);

  const { ref, exportPdf, isExporting: isPdfExporting } = usePdfExport("daytabs-publish.pdf");
  const { upload, isPending: isUploading, uploadProgress, resetUpload, error: uploadError } = useVideoUpload();

  useEffect(() => {
    if (uploadError) toast({ variant: "destructive", title: "Upload failed", description: uploadError.message });
  }, [uploadError]);

  const { data: statusData } = useAnalysisPolling(jobId);
  const isComplete = statusData?.status === "complete";
  const { data: rawResults } = useAnalysisResults(jobId, isComplete);
  const results = rawResults as any;

  useEffect(() => {
    if (isComplete && results) { onDataReady(); onRegisterExport(exportPdf); }
  }, [isComplete, results]);

  const reset = () => { setJobId(null); setSelectedFile(null); resetUpload(); onDataReset(); onRegisterExport(null); };

  const downloadSrt = () => {
    if (!results?.subtitleFile?.content) return;
    const blob = new Blob([results.subtitleFile.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `subtitles_${results.subtitleFile.language || "original"}.srt`; a.click();
    URL.revokeObjectURL(url);
  };

  if (!jobId) {
    const limitReached = uploadLimit !== -1 && uploadsRemaining <= 0;
    return (
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold">Publish Optimizer</h2>
          <p className="text-white/50 text-sm">Generate platform-specific titles, descriptions, hashtags, and subtitle files.</p>
        </div>

        {uploadLimit !== -1 && (
          <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-white/3 border border-white/8">
            <span className="text-xs text-white/50">Monthly uploads</span>
            <span className={`text-xs font-semibold ${uploadsRemaining === 0 ? "text-red-400" : "text-emerald-400"}`}>
              {uploadUsed} / {uploadLimit} used
            </span>
          </div>
        )}

        {limitReached ? (
          <div className="text-center py-8 space-y-3">
            <div className="w-12 h-12 rounded-full bg-red-400/10 border border-red-400/20 flex items-center justify-center mx-auto"><Lock className="w-6 h-6 text-red-400" /></div>
            <p className="text-white/60 text-sm">You've used all {uploadLimit} publish uploads for this month.</p>
            <LockedBadge />
          </div>
        ) : (
          <>
            <div className="glass-card rounded-2xl p-5 border border-white/8 space-y-4">
              <div>
                <label className="text-sm font-medium text-white/60 mb-2 block">Target Platform</label>
                <div className="grid grid-cols-3 gap-2">
                  {PLATFORMS.map(p => {
                    const isLocked = isFree && !p.freeAllowed;
                    return (
                      <button
                        key={p.id}
                        onClick={() => !isLocked && setPlatform(p.id)}
                        disabled={isLocked}
                        title={isLocked ? "YouTube Long requires Premium" : undefined}
                        className={`py-2 px-3 rounded-xl text-sm font-medium transition-all relative ${
                          platform === p.id ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : isLocked ? "bg-secondary/50 text-white/30 border border-transparent cursor-not-allowed"
                          : "bg-secondary text-white/60 hover:bg-secondary/80 border border-transparent"
                        }`}
                      >
                        {p.label}
                        {isLocked && <Crown className="w-2.5 h-2.5 text-amber-400/70 absolute top-1 right-1" />}
                      </button>
                    );
                  })}
                </div>
                {isFree && (
                  <p className="text-xs text-white/30 mt-2 flex items-center gap-1">
                    <Crown className="w-3 h-3 text-amber-400/50" />YouTube Long requires Premium
                  </p>
                )}
              </div>

              {/* Translate Subtitles — locked for free */}
              <div className="flex items-center justify-between pt-3 border-t border-white/8">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-white/40" />
                  <span className="text-sm text-white/70">Translate Subtitles</span>
                  {isFree && <LockedBadge />}
                </div>
                <button
                  onClick={() => !isFree && setTranslateSubs(v => !v)}
                  disabled={isFree}
                  className={`w-11 h-6 rounded-full relative transition-colors ${translateSubs && !isFree ? "bg-emerald-500" : "bg-white/10"} ${isFree ? "opacity-40 cursor-not-allowed" : ""}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${translateSubs && !isFree ? "left-6" : "left-1"}`} />
                </button>
              </div>
              {translateSubs && !isFree && (
                <select value={subLang} onChange={e => setSubLang(e.target.value)} className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm">
                  {["Spanish","French","German","Japanese","Portuguese","Arabic","Chinese","Korean"].map(l => <option key={l}>{l}</option>)}
                </select>
              )}
            </div>

            <UploadZone onFile={(f) => setSelectedFile(f)} isPending={isUploading} platform={platform} />
            {isUploading && uploadProgress > 0 && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-white/50">
                  <span>{uploadProgress < 95 ? "Uploading to cloud…" : "Starting analysis…"}</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-emerald-600 to-green-500 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                </div>
              </div>
            )}
            <button
              onClick={() => selectedFile && upload({ file: selectedFile, options: { mode: "publish", platform, translateSubtitles: translateSubs && !isFree, subtitleLanguage: translateSubs && !isFree ? subLang : undefined } }, { onSuccess: (d) => { setJobId(d.jobId); toast({ title: "Optimizing for publishing…" }); } })}
              disabled={!selectedFile || isUploading}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-500 hover:to-green-400 text-white font-bold text-base disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
            >
              {isUploading
                ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Uploading…</>
                : <><TrendingUp className="w-5 h-5" />Optimize for Publishing</>}
            </button>
          </>
        )}
      </motion.div>
    );
  }

  if (!isComplete || !results) {
    return (
      <div className="max-w-2xl mx-auto">
        {statusData && <ProgressIndicator currentStep={statusData.status} progress={statusData.progress} />}
        {statusData?.status === "error" && (
          <div className="text-center mt-8 space-y-4">
            <p className="text-red-400">{statusData.error || "Analysis failed"}</p>
            <button onClick={reset} className="px-6 py-2.5 bg-secondary rounded-xl text-sm font-medium">Try Again</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <motion.div ref={ref} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div><h2 className="text-2xl font-bold">Publish Results</h2><p className="text-white/40 text-sm mt-1 capitalize">{results.platform?.replace(/_/g, " ")}</p></div>
        <div className="flex items-center gap-2">
          <LockedContent locked={isFree} label="PDF export requires Premium" className="rounded-xl">
            <button
              onClick={exportPdf}
              disabled={isPdfExporting || isFree}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-emerald-400/10 hover:bg-emerald-400/20 border border-emerald-400/25 text-emerald-300 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPdfExporting ? <><div className="w-3.5 h-3.5 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />Exporting…</> : <><FileDown className="w-3.5 h-3.5" />Download PDF</>}
            </button>
          </LockedContent>
          <button onClick={reset} className="px-4 py-2 text-sm font-medium bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-colors">Optimize Another</button>
        </div>
      </div>

      {results.titles?.length > 0 && (
        <div className="glass-card rounded-2xl p-6 border border-white/8">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><FileText className="w-4 h-4 text-emerald-400" />Title Options</h3>
          <div className="space-y-2">
            {results.titles.map((t: string, i: number) => (
              i === 0 || !isFree
                ? <div key={i} className="flex items-center gap-3 p-3 bg-white/3 border border-white/8 rounded-xl hover:border-emerald-400/20 transition-all">
                    <span className="text-xs text-emerald-400/50 font-mono shrink-0">#{i + 1}</span>
                    <p className="text-sm text-white/80 flex-1">{t}</p>
                    <CopyButton text={t} />
                  </div>
                : <LockedContent key={i} locked label="Upgrade to see all title options">
                    <div className="flex items-center gap-3 p-3 bg-white/3 border border-white/8 rounded-xl">
                      <span className="text-xs text-emerald-400/50 font-mono shrink-0">#{i + 1}</span>
                      <p className="text-sm text-white/80 flex-1">{t}</p>
                    </div>
                  </LockedContent>
            ))}
          </div>
        </div>
      )}

      {results.description && (
        <div className="glass-card rounded-2xl p-6 border border-white/8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2"><FileText className="w-4 h-4 text-blue-400" />Description</h3>
            <CopyButton text={results.description} />
          </div>
          <p className="text-sm text-white/70 whitespace-pre-wrap leading-relaxed">{results.description}</p>
        </div>
      )}

      {results.hashtags?.length > 0 && (
        <div className="glass-card rounded-2xl p-6 border border-white/8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2"><Hash className="w-4 h-4 text-emerald-400" />Hashtags</h3>
            <CopyButton text={results.hashtags.slice(0, isFree ? 3 : undefined).map((h: any) => h.tag).join(" ")} />
          </div>
          <div className="flex flex-wrap gap-2">
            {results.hashtags.map((h: any, i: number) => (
              i < 3 || !isFree
                ? <div key={i} className="group relative">
                    <span className="px-3 py-1.5 bg-emerald-400/10 border border-emerald-400/20 text-emerald-300 text-sm rounded-full font-mono cursor-default">{h.tag}</span>
                    {h.effect && <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-background/95 border border-white/10 text-xs text-white/60 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">{h.effect}</div>}
                  </div>
                : i === 3 && isFree
                  ? <LockedBadge key={i} />
                  : null
            ))}
            {isFree && results.hashtags.length > 3 && (
              <span className="text-xs text-white/30 self-center">+{results.hashtags.length - 3} more with Premium</span>
            )}
          </div>
        </div>
      )}

      {results.timestamps?.length > 0 && (
        <div className="glass-card rounded-2xl p-6 border border-white/8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2"><Clock className="w-4 h-4 text-purple-400" />Timestamps</h3>
            <CopyButton text={results.timestamps.map((t: any) => `${t.time} ${t.label}`).join("\n")} />
          </div>
          <div className="space-y-1.5">
            {results.timestamps.map((ts: any, i: number) => (
              i === 0 || !isFree
                ? <div key={i} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                    <span className="text-xs font-mono text-emerald-400/70 w-14 shrink-0">{ts.time}</span>
                    <span className="text-sm text-white/70">{ts.label}</span>
                  </div>
                : i === 1 && isFree
                  ? <LockedContent key={i} locked label="Upgrade to see all timestamps" className="rounded-xl">
                      <div className="flex items-center gap-3 py-2">
                        <span className="text-xs font-mono text-emerald-400/70 w-14 shrink-0">{ts.time}</span>
                        <span className="text-sm text-white/70">{ts.label}</span>
                      </div>
                    </LockedContent>
                  : null
            ))}
          </div>
        </div>
      )}

      {results.subtitleFile?.content && (
        isFree
          ? <LockedContent locked label="Subtitle file download requires Premium" className="rounded-2xl">
              <div className="glass-card rounded-2xl p-6 border border-violet-400/20">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold flex items-center gap-2"><FileText className="w-4 h-4 text-violet-400" />Subtitle File</h3>
                    <p className="text-xs text-white/40 mt-1">SRT format · {results.subtitleFile.language} · {results.subtitleFile.content.split("\n\n").length} segments</p>
                  </div>
                  <button className="flex items-center gap-2 px-4 py-2.5 bg-violet-600/20 text-violet-300 border border-violet-400/20 rounded-xl text-sm font-medium">
                    <Download className="w-4 h-4" />Download .srt
                  </button>
                </div>
              </div>
            </LockedContent>
          : <div className="glass-card rounded-2xl p-6 border border-violet-400/20">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold flex items-center gap-2"><FileText className="w-4 h-4 text-violet-400" />Subtitle File</h3>
                  <p className="text-xs text-white/40 mt-1">SRT format · {results.subtitleFile.language} · {results.subtitleFile.content.split("\n\n").length} segments</p>
                </div>
                <button onClick={downloadSrt} className="flex items-center gap-2 px-4 py-2.5 bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 border border-violet-400/20 rounded-xl text-sm font-medium transition-colors">
                  <Download className="w-4 h-4" />Download .srt
                </button>
              </div>
            </div>
      )}
    </motion.div>
  );
}
