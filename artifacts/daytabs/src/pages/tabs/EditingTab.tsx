import React, { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { useDropzone } from "react-dropzone";
import { motion } from "framer-motion";
import { Scissors, Clock, Zap, Film, Lightbulb, MessageSquare, Upload } from "lucide-react";
import { ProgressIndicator } from "@/components/ProgressIndicator";
import { useAnalysisPolling, useAnalysisResults } from "@/hooks/use-analysis";
import { getUploadVideoUrl } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

function UploadZone({ onFile, isPending }: { onFile: (f: File) => void; isPending: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const onDrop = useCallback((accepted: File[]) => {
    const f = accepted[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    onFile(f);
  }, [onFile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { "video/*": [".mp4", ".mov", ".avi", ".webm"] }, maxFiles: 1, disabled: isPending,
  });

  return (
    <div
      {...getRootProps()}
      className={`relative overflow-hidden rounded-2xl cursor-pointer transition-all duration-300 border-2 ${
        isDragActive ? "border-yellow-400 bg-yellow-400/10 scale-[1.01]" : "border-white/10 hover:border-yellow-400/40 bg-yellow-400/3 hover:bg-yellow-400/6"
      } ${file ? "min-h-[200px] p-2" : "p-10"}`}
    >
      <input {...getInputProps()} />
      {file && preview ? (
        <div className="relative w-full min-h-[180px] rounded-xl overflow-hidden bg-black/50">
          <video src={preview} className="w-full h-full object-cover opacity-40" autoPlay loop muted playsInline />
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-gradient-to-t from-black/80 via-transparent to-transparent">
            <Film className="w-8 h-8 text-yellow-400 mb-2" />
            <p className="text-white font-semibold text-sm text-center truncate max-w-full px-4">{file.name}</p>
            <p className="text-white/50 text-xs mt-1">{(file.size / (1024 * 1024)).toFixed(1)} MB</p>
            <span className="mt-3 px-3 py-1 bg-white/15 backdrop-blur-md rounded-full text-xs text-white">Click to replace</span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-yellow-400/15 border border-yellow-400/20 flex items-center justify-center">
              <Scissors className="w-9 h-9 text-yellow-400/70" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-yellow-400/30 border border-yellow-400/40 flex items-center justify-center">
              <Upload className="w-3.5 h-3.5 text-yellow-400" />
            </div>
          </div>
          <div className="text-center space-y-1">
            <p className="font-bold text-white text-base">{isDragActive ? "Drop it here!" : "Drop your video here"}</p>
            <p className="text-sm text-white/40">We'll find hooks, cuts, and short-form segments</p>
            <p className="text-xs text-white/25 mt-2">MP4, MOV, AVI, WebM · up to 2 GB</p>
          </div>
          <div className="px-5 py-2 bg-yellow-400/10 border border-yellow-400/20 rounded-full text-sm font-medium text-yellow-400/80">
            Browse Files
          </div>
        </div>
      )}
    </div>
  );
}

export default function EditingTab() {
  const { toast } = useToast();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
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
  const reset = () => { setJobId(null); setSelectedFile(null); uploadMutation.reset(); };

  if (!jobId) {
    return (
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold">Editing Assistant</h2>
          <p className="text-white/50 text-sm">Find the best hooks, detect what to cut, and identify short-form opportunities.</p>
        </div>
        <UploadZone onFile={(f) => setSelectedFile(f)} isPending={uploadMutation.isPending} />
        <button
          onClick={() => selectedFile && uploadMutation.mutate(selectedFile)}
          disabled={!selectedFile || uploadMutation.isPending}
          className="w-full py-4 rounded-xl bg-gradient-to-r from-yellow-500 to-amber-400 hover:from-yellow-400 hover:to-amber-300 text-black font-bold text-base disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-lg shadow-yellow-500/20"
        >
          {uploadMutation.isPending
            ? <><div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> Uploading…</>
            : <><Scissors className="w-5 h-5" /> Analyze for Editing</>}
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
        <div><h2 className="text-2xl font-bold">Editing Results</h2><p className="text-white/40 text-sm mt-1">AI-powered cut suggestions and highlights</p></div>
        <button onClick={reset} className="px-4 py-2 text-sm font-medium bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-colors">Analyze Another</button>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {results.hooks?.length > 0 && (
          <div className="glass-card rounded-2xl p-6 border border-yellow-400/20">
            <div className="flex items-center gap-2 mb-4"><Zap className="w-4 h-4 text-yellow-400" /><h3 className="font-semibold">Strong Hooks</h3><span className="ml-auto text-xs bg-yellow-400/10 text-yellow-400 px-2 py-0.5 rounded-full">{results.hooks.length}</span></div>
            <div className="space-y-3">
              {results.hooks.map((h: any, i: number) => (
                <div key={i} className="p-3 bg-yellow-400/5 border border-yellow-400/15 rounded-xl">
                  <div className="flex items-center gap-2 mb-1.5"><Clock className="w-3.5 h-3.5 text-yellow-400" /><span className="text-xs font-mono text-yellow-300">{h.start} → {h.end}</span></div>
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
                  <div className="flex items-center gap-2 mb-1.5"><Clock className="w-3.5 h-3.5 text-red-400" /><span className="text-xs font-mono text-red-300">{s.start} → {s.end}</span></div>
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
                <span className="text-xs font-mono text-yellow-400/60 shrink-0 w-12">{seg.time}</span>
                <p className="text-sm text-white/70">{seg.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
