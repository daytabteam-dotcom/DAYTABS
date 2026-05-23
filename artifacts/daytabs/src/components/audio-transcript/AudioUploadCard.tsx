import React, { useMemo, useRef, useState } from "react";
import { PanelCard, PanelCardSoft, PanelEyebrow, PanelHeader, PanelSubtitle, PanelTitle } from "@/components/panel-system";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createAudioTranscriptProject } from "./audioTranscriptApi";
import { LanguageSelector, SOURCE_LANG_OPTIONS } from "./LanguageSelector";
import type { AudioTranscriptProject } from "./types";
import { AudioLines, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

const ALLOWED_EXT = /\.(mp3|wav|m4a|ogg)$/i;
const MAX_MB = 200;

export function AudioUploadCard({ onCreated }: { onCreated: (p: AudioTranscriptProject) => void }) {
  const [title, setTitle] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState("auto");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
      setError("Unsupported file type. Upload mp3, wav, m4a, or ogg.");
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
    if (!title.trim()) {
      const base = next.name.replace(/\.[^.]+$/, "");
      setTitle(base.slice(0, 80));
    }
  }

  return (
    <PanelCard className="p-6 md:p-8">
      <PanelHeader className="justify-between gap-6">
        <div className="space-y-1">
          <PanelEyebrow>Upload workspace</PanelEyebrow>
          <PanelTitle className="text-2xl">Upload Audio</PanelTitle>
          <PanelSubtitle>Drag & drop a file, set language, then generate a timestamped transcript.</PanelSubtitle>
        </div>
      </PanelHeader>

      {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div
          className={cn(
            "relative overflow-hidden rounded-3xl border bg-[linear-gradient(180deg,rgba(236,72,153,0.12),transparent_38%),rgba(255,255,255,0.03)] p-6 transition-all",
            dragOver ? "border-pink-500/40 bg-pink-500/10" : "border-white/10 hover:border-white/18",
          )}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            onPickFile(e.dataTransfer.files?.[0] ?? null);
          }}
        >
          <div className="absolute inset-0 pointer-events-none opacity-50">
            <div className="absolute -top-24 -left-24 h-64 w-64 rounded-full bg-pink-500/20 blur-3xl" />
            <div className="absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-violet-500/20 blur-3xl" />
          </div>

          <div className="relative z-10 flex flex-col items-center justify-center text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
              {file ? <AudioLines className="h-6 w-6 text-pink-200" /> : <UploadCloud className="h-6 w-6 text-white/70" />}
            </div>
            <h3 className="mt-4 text-lg font-semibold text-white/90">
              {file ? "Ready to transcribe" : "Drag & drop audio"}
            </h3>
            <p className="mt-1 text-sm text-white/55">
              {file ? `${file.name} · ${(file.size / (1024 * 1024)).toFixed(1)} MB` : "Upload mp3, wav, m4a, ogg"}
            </p>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                Choose audio file
              </Button>
              {file ? (
                <Button
                  variant="ghost"
                  onClick={() => onPickFile(null)}
                >
                  Remove
                </Button>
              ) : null}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".mp3,.wav,.m4a,.ogg,audio/*"
              onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />

            <div className="mt-5 w-full max-w-md">
              <PanelCardSoft className="p-4 text-left">
                <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/35">Tip</div>
                <div className="mt-2 text-sm text-white/65">
                  For best timestamps, upload clean audio (low noise) and pick the correct source language when you know it.
                </div>
              </PanelCardSoft>
            </div>
          </div>
        </div>

        <PanelCardSoft className="p-6">
          <div className="space-y-1">
            <PanelEyebrow>Transcript settings</PanelEyebrow>
            <PanelTitle className="text-xl">Settings</PanelTitle>
            <PanelSubtitle className="text-sm">Controls for the transcription job.</PanelSubtitle>
          </div>

          <div className="mt-5 space-y-4">
            <div className="space-y-2">
              <label className="block text-xs text-white/50">Title</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Episode 12 raw audio"
                className="panel-input"
              />
            </div>

            <LanguageSelector
              label="Source language"
              value={sourceLanguage}
              onChange={setSourceLanguage}
              options={SOURCE_LANG_OPTIONS}
            />

            <div className="pt-2">
              <Button
                onClick={onSubmit}
                disabled={loading || !canSubmit}
                className="w-full border-pink-400/35 bg-pink-500 text-white hover:bg-pink-400"
              >
                {loading ? "Transcribing…" : "Generate Transcript"}
              </Button>
              <div className="mt-2 text-xs text-white/40">
                Max file size: {MAX_MB}MB · Supported: mp3, wav, m4a, ogg
              </div>
            </div>
          </div>
        </PanelCardSoft>
      </div>
    </PanelCard>
  );
}
