import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Wand2, CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronUp, Lightbulb, Zap } from "lucide-react";
import { TabUpload } from "@/components/TabUpload";
import { ProgressIndicator } from "@/components/ProgressIndicator";
import { useAnalysisPolling, useAnalysisResults } from "@/hooks/use-analysis";
import { getUploadVideoUrl } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

function MetricCard({ title, metric }: { title: string; metric: any }) {
  if (!metric) return null;
  const numVal = metric.numeric ?? 0;
  const color = numVal >= 70 ? "text-green-400 border-green-400/20 bg-green-400/5" : numVal >= 45 ? "text-yellow-400 border-yellow-400/20 bg-yellow-400/5" : "text-red-400 border-red-400/20 bg-red-400/5";
  const Icon = numVal >= 70 ? CheckCircle2 : numVal >= 45 ? AlertTriangle : XCircle;
  return (
    <div className="bg-background/60 rounded-xl p-4 border border-white/8 hover:border-primary/20 transition-all">
      <div className="flex justify-between items-start mb-3">
        <div>
          <p className="text-xs text-white/40 uppercase tracking-wider mb-0.5">{title.replace(/([A-Z])/g, " $1").trim()}</p>
          <span className="text-2xl font-bold font-mono">{numVal}</span>
          <span className="text-xs text-white/40 ml-1">/ 100</span>
        </div>
        <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold border ${color}`}>
          <Icon className="w-3.5 h-3.5" />{metric.level}
        </div>
      </div>
      <p className="text-xs text-white/60 mb-2">{metric.assessment}</p>
      {metric.suggestions?.length > 0 && (
        <p className="text-xs text-primary/80">→ {metric.suggestions[0]}</p>
      )}
    </div>
  );
}

export default function PreEditTab() {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [showScript, setShowScript] = useState(false);

  const uploadMutation = useMutation({
    mutationFn: async (f: File) => {
      const form = new FormData();
      form.append("video", f);
      form.append("mode", "pre-edit");
      form.append("platform", "youtube_long");
      const res = await fetch(getUploadVideoUrl(), { method: "POST", body: form });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Upload failed"); }
      return res.json() as Promise<{ jobId: string }>;
    },
    onSuccess: (data) => { setJobId(data.jobId); toast({ title: "Analyzing video…" }); },
    onError: (err: Error) => toast({ variant: "destructive", title: "Upload failed", description: err.message }),
  });

  const { data: statusData } = useAnalysisPolling(jobId);
  const isComplete = statusData?.status === "complete";
  const { data: rawResults } = useAnalysisResults(jobId, isComplete);
  const results = rawResults as any;

  const reset = () => { setJobId(null); setFile(null); uploadMutation.reset(); };

  if (!jobId) {
    return (
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold">🧠 Pre-Edit Analysis</h2>
          <p className="text-white/50">Check video quality and get script improvement suggestions before you edit.</p>
        </div>
        <TabUpload onFile={setFile} isUploading={uploadMutation.isPending} file={file} />
        <button
          onClick={() => file && uploadMutation.mutate(file)}
          disabled={!file || uploadMutation.isPending}
          className="w-full py-4 rounded-xl bg-gradient-to-r from-primary to-purple-500 hover:from-primary/90 hover:to-purple-400 text-white font-bold text-base disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/25"
        >
          {uploadMutation.isPending ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Uploading…</> : <><Wand2 className="w-5 h-5" /> Run Pre-Edit Analysis</>}
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

  const { quality, scriptFeedback } = results;
  const visualKeys = ["lighting", "brightness", "contrast", "sharpness", "stability", "colorBalance", "background", "framing"];
  const audioKeys = ["audioVolume", "audioClarity", "backgroundNoise", "fillerWords"];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-10">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Pre-Edit Analysis</h2>
          <p className="text-white/40 text-sm mt-1">Overall score: <span className="text-primary font-bold text-xl">{quality?.score ?? "—"}</span> / 100</p>
        </div>
        <button onClick={reset} className="px-4 py-2 text-sm font-medium bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-colors">Analyze Another</button>
      </div>

      <section>
        <h3 className="text-lg font-semibold mb-4 text-white/70">Visual Quality</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {visualKeys.map(k => <MetricCard key={k} title={k} metric={quality?.[k]} />)}
        </div>
      </section>

      <section>
        <h3 className="text-lg font-semibold mb-4 text-white/70">Audio Quality</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {audioKeys.map(k => <MetricCard key={k} title={k} metric={quality?.[k]} />)}
        </div>
      </section>

      {scriptFeedback && (
        <section className="space-y-4">
          <h3 className="text-lg font-semibold text-white/70">Script Feedback</h3>

          {scriptFeedback.hookSuggestions?.length > 0 && (
            <div className="glass-card rounded-2xl p-6 border border-white/8">
              <div className="flex items-center gap-2 mb-4"><Zap className="w-4 h-4 text-yellow-400" /><h4 className="font-semibold">Hook Suggestions</h4></div>
              <div className="space-y-2">
                {scriptFeedback.hookSuggestions.map((s: string, i: number) => (
                  <div key={i} className="flex gap-3 p-3 bg-yellow-400/5 border border-yellow-400/15 rounded-xl">
                    <span className="text-yellow-400 font-bold shrink-0">{i + 1}.</span>
                    <p className="text-sm text-white/80">{s}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {scriptFeedback.weakSections?.length > 0 && (
            <div className="glass-card rounded-2xl p-6 border border-white/8">
              <div className="flex items-center gap-2 mb-4"><AlertTriangle className="w-4 h-4 text-red-400" /><h4 className="font-semibold">Weak Sections</h4></div>
              <div className="space-y-3">
                {scriptFeedback.weakSections.map((ws: any, i: number) => (
                  <div key={i} className="p-4 bg-red-400/5 border border-red-400/15 rounded-xl space-y-2">
                    <p className="text-xs text-red-300 font-medium">{ws.reason}</p>
                    <p className="text-sm text-white/50 line-through">"{ws.text}"</p>
                    {ws.replacement && <p className="text-sm text-green-300">→ "{ws.replacement}"</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {scriptFeedback.improvedScript && (
            <div className="glass-card rounded-2xl p-6 border border-white/8">
              <button onClick={() => setShowScript(s => !s)} className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2"><Lightbulb className="w-4 h-4 text-violet-400" /><h4 className="font-semibold">Improved Script</h4></div>
                {showScript ? <ChevronUp className="w-4 h-4 text-white/40" /> : <ChevronDown className="w-4 h-4 text-white/40" />}
              </button>
              {showScript && (
                <div className="mt-4 p-4 bg-violet-400/5 border border-violet-400/15 rounded-xl">
                  <p className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed">{scriptFeedback.improvedScript}</p>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </motion.div>
  );
}
