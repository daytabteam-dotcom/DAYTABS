import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Globe, Download, Mic, Play, Pause } from "lucide-react";
import { TabUpload } from "@/components/TabUpload";
import { ProgressIndicator } from "@/components/ProgressIndicator";
import { useAnalysisPolling, useAnalysisResults } from "@/hooks/use-analysis";
import { getUploadVideoUrl } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

const LANGUAGES = ["Spanish","French","German","Japanese","Portuguese","Arabic","Chinese (Simplified)","Korean","Italian","Russian","Hindi","Turkish"];
const VOICES = [
  { id: "alloy", label: "Alloy", desc: "Neutral & balanced" },
  { id: "echo", label: "Echo", desc: "Soft & measured" },
  { id: "fable", label: "Fable", desc: "Warm & expressive" },
  { id: "onyx", label: "Onyx", desc: "Deep & authoritative" },
  { id: "nova", label: "Nova", desc: "Bright & energetic" },
  { id: "shimmer", label: "Shimmer", desc: "Clear & friendly" },
];

export default function DubbingTab() {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [language, setLanguage] = useState("Spanish");
  const [voice, setVoice] = useState("alloy");
  const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: async (f: File) => {
      const form = new FormData();
      form.append("video", f);
      form.append("mode", "dubbing");
      form.append("platform", "youtube_long");
      form.append("audioLanguage", language);
      form.append("audioVoice", voice);
      const res = await fetch(getUploadVideoUrl(), { method: "POST", body: form });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Upload failed"); }
      return res.json() as Promise<{ jobId: string }>;
    },
    onSuccess: (data) => { setJobId(data.jobId); toast({ title: `Dubbing to ${language}…` }); },
    onError: (err: Error) => toast({ variant: "destructive", title: "Upload failed", description: err.message }),
  });

  const { data: statusData } = useAnalysisPolling(jobId);
  const isComplete = statusData?.status === "complete";
  const { data: rawResults } = useAnalysisResults(jobId, isComplete);
  const results = rawResults as any;
  const reset = () => { setJobId(null); setFile(null); uploadMutation.reset(); previewAudio?.pause(); };

  const toggleVoicePreview = async (voiceId: string) => {
    if (playingVoice === voiceId) {
      previewAudio?.pause();
      setPlayingVoice(null);
      return;
    }
    previewAudio?.pause();
    const audio = new Audio(`/api/analysis/voice-preview/${voiceId}`);
    audio.onended = () => setPlayingVoice(null);
    setPreviewAudio(audio);
    setPlayingVoice(voiceId);
    await audio.play().catch(() => setPlayingVoice(null));
  };

  if (!jobId) {
    return (
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold">🌍 AI Dubbing</h2>
          <p className="text-white/50">Translate and replace your video's audio with a natural AI voice in any language.</p>
        </div>
        <TabUpload onFile={setFile} isUploading={uploadMutation.isPending} file={file} />

        <div className="glass-card rounded-2xl p-5 border border-white/8 space-y-5">
          <div>
            <label className="text-sm font-medium text-white/60 mb-2 block">Target Language</label>
            <select value={language} onChange={e => setLanguage(e.target.value)} className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
              {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-white/60 mb-3 block">AI Voice</label>
            <div className="grid grid-cols-2 gap-2">
              {VOICES.map(v => (
                <div key={v.id} onClick={() => setVoice(v.id)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${voice === v.id ? "border-primary/50 bg-primary/10" : "border-white/8 bg-white/3 hover:border-white/20"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold">{v.label}</span>
                    <button onClick={e => { e.stopPropagation(); toggleVoicePreview(v.id); }}
                      className="p-1 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">
                      {playingVoice === v.id ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                    </button>
                  </div>
                  <p className="text-xs text-white/40">{v.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <button onClick={() => file && uploadMutation.mutate(file)} disabled={!file || uploadMutation.isPending}
          className="w-full py-4 rounded-xl bg-gradient-to-r from-primary to-purple-500 text-white font-bold text-base disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/25">
          {uploadMutation.isPending ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Uploading…</> : <><Globe className="w-5 h-5" />Dub to {language}</>}
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
            <p className="text-red-400">{statusData.error || "Dubbing failed"}</p>
            <button onClick={reset} className="px-6 py-2.5 bg-secondary rounded-xl text-sm font-medium">Try Again</button>
          </div>
        )}
      </div>
    );
  }

  const downloadUrl = results.downloadUrl ?? null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-2xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-bold">Dubbing Complete</h2><p className="text-white/40 text-sm mt-1">AI voice in {results.translatedLanguage}</p></div>
        <button onClick={reset} className="px-4 py-2 text-sm font-medium bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-colors">Dub Another</button>
      </div>

      <div className="glass-card rounded-2xl p-8 border border-primary/20 text-center space-y-6">
        <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center mx-auto">
          <Mic className="w-10 h-10 text-primary" />
        </div>
        <div>
          <h3 className="text-xl font-bold mb-1">{results.translatedLanguage} Dub Ready</h3>
          <p className="text-white/40 text-sm">Voice: {VOICES.find(v => v.id === results.voice)?.label || results.voice}</p>
        </div>

        {downloadUrl ? (
          <a href={downloadUrl} download={results.filename || "dubbed_video.mp4"}
            className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-primary to-purple-500 hover:from-primary/90 hover:to-purple-400 text-white font-bold rounded-xl shadow-lg shadow-primary/25 transition-all">
            <Download className="w-5 h-5" />Download Dubbed Video
          </a>
        ) : (
          <p className="text-red-400 text-sm">Download link unavailable</p>
        )}

        <p className="text-xs text-white/30">File will be available for download for a limited time.</p>
      </div>
    </motion.div>
  );
}
