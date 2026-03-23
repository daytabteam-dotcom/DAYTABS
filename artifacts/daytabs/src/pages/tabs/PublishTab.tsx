import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { TrendingUp, Copy, Check, Download, Hash, Clock, FileText, Globe } from "lucide-react";
import { TabUpload } from "@/components/TabUpload";
import { ProgressIndicator } from "@/components/ProgressIndicator";
import { useAnalysisPolling, useAnalysisResults } from "@/hooks/use-analysis";
import { getUploadVideoUrl } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

const PLATFORMS = [
  { id: "youtube_long", label: "YouTube" },
  { id: "youtube_shorts", label: "YT Shorts" },
  { id: "tiktok", label: "TikTok" },
  { id: "instagram", label: "Instagram" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "x", label: "X (Twitter)" },
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

export default function PublishTab() {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [platform, setPlatform] = useState("youtube_long");
  const [translateSubs, setTranslateSubs] = useState(false);
  const [subLang, setSubLang] = useState("Spanish");

  const uploadMutation = useMutation({
    mutationFn: async (f: File) => {
      const form = new FormData();
      form.append("video", f);
      form.append("mode", "publish");
      form.append("platform", platform);
      form.append("translateSubtitles", String(translateSubs));
      if (translateSubs) form.append("subtitleLanguage", subLang);
      const res = await fetch(getUploadVideoUrl(), { method: "POST", body: form });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Upload failed"); }
      return res.json() as Promise<{ jobId: string }>;
    },
    onSuccess: (data) => { setJobId(data.jobId); toast({ title: "Optimizing for publishing…" }); },
    onError: (err: Error) => toast({ variant: "destructive", title: "Upload failed", description: err.message }),
  });

  const { data: statusData } = useAnalysisPolling(jobId);
  const isComplete = statusData?.status === "complete";
  const { data: rawResults } = useAnalysisResults(jobId, isComplete);
  const results = rawResults as any;
  const reset = () => { setJobId(null); setFile(null); uploadMutation.reset(); };

  const downloadSrt = () => {
    if (!results?.subtitleFile?.content) return;
    const blob = new Blob([results.subtitleFile.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `subtitles_${results.subtitleFile.language || "original"}.srt`; a.click();
    URL.revokeObjectURL(url);
  };

  if (!jobId) {
    return (
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold">📈 Publish Optimizer</h2>
          <p className="text-white/50">Generate titles, descriptions, hashtags, and subtitle files for your platform.</p>
        </div>
        <TabUpload onFile={setFile} isUploading={uploadMutation.isPending} file={file} />

        <div className="glass-card rounded-2xl p-5 border border-white/8 space-y-4">
          <div>
            <label className="text-sm font-medium text-white/60 mb-2 block">Target Platform</label>
            <div className="grid grid-cols-3 gap-2">
              {PLATFORMS.map(p => (
                <button key={p.id} onClick={() => setPlatform(p.id)}
                  className={`py-2 px-3 rounded-xl text-sm font-medium transition-all ${platform === p.id ? "bg-primary text-white shadow-lg shadow-primary/20" : "bg-secondary text-white/60 hover:bg-secondary/80"}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-white/8">
            <div className="flex items-center gap-2"><Globe className="w-4 h-4 text-white/40" /><span className="text-sm text-white/70">Translate Subtitles</span></div>
            <button onClick={() => setTranslateSubs(v => !v)} className={`w-11 h-6 rounded-full relative transition-colors ${translateSubs ? "bg-primary" : "bg-white/10"}`}>
              <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${translateSubs ? "left-6" : "left-1"}`} />
            </button>
          </div>
          {translateSubs && (
            <select value={subLang} onChange={e => setSubLang(e.target.value)} className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm">
              {["Spanish","French","German","Japanese","Portuguese","Arabic","Chinese","Korean"].map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          )}
        </div>

        <button onClick={() => file && uploadMutation.mutate(file)} disabled={!file || uploadMutation.isPending}
          className="w-full py-4 rounded-xl bg-gradient-to-r from-primary to-purple-500 text-white font-bold text-base disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/25">
          {uploadMutation.isPending ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Uploading…</> : <><TrendingUp className="w-5 h-5" />Optimize for Publishing</>}
        </button>
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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-bold">Publish Optimizer</h2><p className="text-white/40 text-sm mt-1 capitalize">{results.platform?.replace("_", " ")}</p></div>
        <button onClick={reset} className="px-4 py-2 text-sm font-medium bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-colors">Optimize Another</button>
      </div>

      {results.titles?.length > 0 && (
        <div className="glass-card rounded-2xl p-6 border border-white/8">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><FileText className="w-4 h-4 text-primary" />Title Options</h3>
          <div className="space-y-2">
            {results.titles.map((t: string, i: number) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-white/3 border border-white/8 rounded-xl hover:border-primary/20 transition-all group">
                <span className="text-xs text-primary/50 font-mono shrink-0">#{i + 1}</span>
                <p className="text-sm text-white/80 flex-1">{t}</p>
                <CopyButton text={t} />
              </div>
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
            <h3 className="font-semibold flex items-center gap-2"><Hash className="w-4 h-4 text-green-400" />Hashtags</h3>
            <CopyButton text={results.hashtags.map((h: any) => h.tag).join(" ")} />
          </div>
          <div className="flex flex-wrap gap-2">
            {results.hashtags.map((h: any, i: number) => (
              <div key={i} className="group relative">
                <span className="px-3 py-1.5 bg-green-400/10 border border-green-400/20 text-green-300 text-sm rounded-full font-mono cursor-default">{h.tag}</span>
                {h.effect && <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-background/95 border border-white/10 text-xs text-white/60 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">{h.effect}</div>}
              </div>
            ))}
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
              <div key={i} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                <span className="text-xs font-mono text-primary/70 w-14 shrink-0">{ts.time}</span>
                <span className="text-sm text-white/70">{ts.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {results.subtitleFile?.content && (
        <div className="glass-card rounded-2xl p-6 border border-violet-400/20">
          <div className="flex items-center justify-between">
            <div><h3 className="font-semibold flex items-center gap-2"><FileText className="w-4 h-4 text-violet-400" />Subtitle File</h3>
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
