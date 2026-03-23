import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Scissors, Clock, Zap, Film, Lightbulb, MessageSquare } from "lucide-react";
import { TabUpload } from "@/components/TabUpload";
import { ProgressIndicator } from "@/components/ProgressIndicator";
import { useAnalysisPolling, useAnalysisResults } from "@/hooks/use-analysis";
import { getUploadVideoUrl } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

export default function EditingTab() {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: async (f: File) => {
      const form = new FormData();
      form.append("video", f);
      form.append("mode", "editing");
      form.append("platform", "youtube_long");
      const res = await fetch(getUploadVideoUrl(), { method: "POST", body: form });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Upload failed"); }
      return res.json() as Promise<{ jobId: string }>;
    },
    onSuccess: (data) => { setJobId(data.jobId); toast({ title: "Finding editing points…" }); },
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
          <h2 className="text-3xl font-bold">✂️ Editing Assistant</h2>
          <p className="text-white/50">Find the best hooks, detect what to cut, and identify short-form segments.</p>
        </div>
        <TabUpload onFile={setFile} isUploading={uploadMutation.isPending} file={file} />
        <button
          onClick={() => file && uploadMutation.mutate(file)}
          disabled={!file || uploadMutation.isPending}
          className="w-full py-4 rounded-xl bg-gradient-to-r from-primary to-purple-500 hover:from-primary/90 hover:to-purple-400 text-white font-bold text-base disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/25"
        >
          {uploadMutation.isPending ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Uploading…</> : <><Scissors className="w-5 h-5" /> Analyze for Editing</>}
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
        <div><h2 className="text-2xl font-bold">Editing Assistant</h2><p className="text-white/40 text-sm mt-1">AI-powered cut suggestions and highlights</p></div>
        <button onClick={reset} className="px-4 py-2 text-sm font-medium bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-colors">Analyze Another</button>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {results.hooks?.length > 0 && (
          <div className="glass-card rounded-2xl p-6 border border-yellow-400/20">
            <div className="flex items-center gap-2 mb-4"><Zap className="w-4 h-4 text-yellow-400" /><h3 className="font-semibold">Strong Hooks</h3><span className="ml-auto text-xs bg-yellow-400/10 text-yellow-400 px-2 py-0.5 rounded-full">{results.hooks.length}</span></div>
            <div className="space-y-3">
              {results.hooks.map((h: any, i: number) => (
                <div key={i} className="p-3 bg-yellow-400/5 border border-yellow-400/15 rounded-xl">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Clock className="w-3.5 h-3.5 text-yellow-400" />
                    <span className="text-xs font-mono text-yellow-300">{h.start} → {h.end}</span>
                  </div>
                  <p className="text-sm text-white/70">{h.reason}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {results.removeSections?.length > 0 && (
          <div className="glass-card rounded-2xl p-6 border border-red-400/20">
            <div className="flex items-center gap-2 mb-4"><Scissors className="w-4 h-4 text-red-400" /><h3 className="font-semibold">Cut These Sections</h3><span className="ml-auto text-xs bg-red-400/10 text-red-400 px-2 py-0.5 rounded-full">{results.removeSections.length}</span></div>
            <div className="space-y-3">
              {results.removeSections.map((s: any, i: number) => (
                <div key={i} className="p-3 bg-red-400/5 border border-red-400/15 rounded-xl">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Clock className="w-3.5 h-3.5 text-red-400" />
                    <span className="text-xs font-mono text-red-300">{s.start} → {s.end}</span>
                  </div>
                  <p className="text-sm text-white/70">{s.reason}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {results.shortVideos?.length > 0 && (
        <div className="glass-card rounded-2xl p-6 border border-violet-400/20">
          <div className="flex items-center gap-2 mb-4"><Film className="w-4 h-4 text-violet-400" /><h3 className="font-semibold">Short-Form Segments</h3></div>
          <div className="grid md:grid-cols-2 gap-3">
            {results.shortVideos.map((sv: any, i: number) => (
              <div key={i} className="p-4 bg-violet-400/5 border border-violet-400/15 rounded-xl">
                <div className="flex items-center gap-2 mb-2"><Clock className="w-3.5 h-3.5 text-violet-400" /><span className="text-xs font-mono text-violet-300">{sv.start} → {sv.end}</span></div>
                {sv.title && <p className="text-sm font-medium text-white/80 mb-1">{sv.title}</p>}
                <p className="text-xs text-white/50">{sv.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {results.editingSuggestions?.length > 0 && (
        <div className="glass-card rounded-2xl p-6 border border-white/8">
          <div className="flex items-center gap-2 mb-4"><Lightbulb className="w-4 h-4 text-blue-400" /><h3 className="font-semibold">Editing Tips</h3></div>
          <div className="space-y-2">
            {results.editingSuggestions.map((tip: string, i: number) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-blue-400/5 border border-blue-400/10 rounded-xl">
                <span className="text-blue-400 font-bold shrink-0 text-sm">{i + 1}.</span>
                <p className="text-sm text-white/70">{tip}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {results.transcript?.length > 0 && (
        <div className="glass-card rounded-2xl p-6 border border-white/8">
          <div className="flex items-center gap-2 mb-4"><MessageSquare className="w-4 h-4 text-white/40" /><h3 className="font-semibold">Transcript</h3></div>
          <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
            {results.transcript.map((seg: any, i: number) => (
              <div key={i} className="flex gap-3 py-1.5 border-b border-white/5 last:border-0">
                <span className="text-xs font-mono text-primary/60 shrink-0 w-12">{seg.time}</span>
                <p className="text-sm text-white/70">{seg.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
