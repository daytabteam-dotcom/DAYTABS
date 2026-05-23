import React, { useMemo, useState } from "react";
import { PanelCard, PanelEyebrow, PanelSubtitle, PanelTitle } from "@/components/panel-system";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createAudioTranscriptProject } from "./audioTranscriptApi";
import { LanguageSelector, SOURCE_LANG_OPTIONS } from "./LanguageSelector";
import type { AudioTranscriptProject } from "./types";

const ALLOWED_EXT = /\.(mp3|wav|m4a|mp4|webm|ogg)$/i;
const MAX_MB = 200;

export function AudioUploadCard({ onCreated }: { onCreated: (p: AudioTranscriptProject) => void }) {
  const [title, setTitle] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState("auto");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => title.trim() && file, [title, file]);

  async function onSubmit() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const res = await createAudioTranscriptProject({
        title: title.trim(),
        source_language: sourceLanguage,
        file,
      });
      if (res.project) onCreated(res.project);
      setTitle("");
      setFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  function onPickFile(next: File | null) {
    if (!next) {
      setFile(null);
      return;
    }
    if (!ALLOWED_EXT.test(next.name)) {
      setError("Unsupported file type. Upload mp3, wav, m4a, mp4, webm, or ogg.");
      setFile(null);
      return;
    }
    if (next.size > MAX_MB * 1024 * 1024) {
      setError(`File too large. Max ${MAX_MB}MB.`);
      setFile(null);
      return;
    }
    setError(null);
    setFile(next);
  }

  return (
    <PanelCard className="p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <PanelEyebrow>Upload</PanelEyebrow>
          <PanelTitle className="text-2xl">Audio 2 Transcript</PanelTitle>
          <PanelSubtitle>Upload audio, get accurate transcripts, and translate them with timestamps.</PanelSubtitle>
        </div>
        <Button onClick={onSubmit} disabled={loading || !canSubmit}>
          {loading ? "Transcribing…" : "Generate Transcript"}
        </Button>
      </div>

      {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <label className="block text-xs text-white/50">Title</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Episode 12 raw audio" className="panel-input" />
          <LanguageSelector label="Source language" value={sourceLanguage} onChange={setSourceLanguage} options={SOURCE_LANG_OPTIONS} />
        </div>
        <div className="space-y-3">
          <label className="block text-xs text-white/50">Audio file</label>
          <Input type="file" accept=".mp3,.wav,.m4a,.mp4,.webm,.ogg,audio/*,video/*" onChange={(e) => onPickFile(e.target.files?.[0] ?? null)} className="panel-input" />
          <div className="text-xs text-white/45">
            {file ? `${file.name} · ${(file.size / (1024 * 1024)).toFixed(1)} MB` : "Supported: mp3, wav, m4a, mp4, webm, ogg"}
          </div>
        </div>
      </div>
    </PanelCard>
  );
}

