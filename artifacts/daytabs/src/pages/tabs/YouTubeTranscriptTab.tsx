import { FormEvent, useMemo, useState } from "react";
import { Download, ExternalLink, Loader2, Upload, Youtube } from "lucide-react";
import { PanelCard, PanelHeader, PanelPage, PanelSubtitle, PanelTitle } from "@/components/panel-system";
import { Button } from "@/components/ui/button";
import { usePlan } from "@/hooks/use-plan";
import { DAYTABS_LOCALE_STORAGE_KEY } from "@/lib/i18n";

type TranscriptSegment = { start: number; end: number; text: string };

type EditableTranscriptResponse = {
  editableTranscript: {
    videoId: string;
    canonicalUrl: string;
    captions: {
      available: boolean;
      downloadable: boolean;
      source: "manual" | "auto" | null;
      language: string | null;
      languages: string[];
    };
    transcript: {
      available: boolean;
      source: "manual" | "auto" | "transcribed_audio" | null;
      language: string | null;
      text: string | null;
      segments: TranscriptSegment[];
    };
    needsUploadFallback: boolean;
  };
};

type TranscriptTranscribeResponse = {
  transcript: {
    available: boolean;
    source: "transcribed_audio";
    language: string | null;
    text: string;
    segments: TranscriptSegment[];
  };
};

type TranscriptTranslation = {
  targetLanguage: string;
  sourceLanguage: string | null;
  fullText: string;
  segments: TranscriptSegment[];
  createdAt: string;
};

type TranslateResponse = { translation: TranscriptTranslation };

type TranslationAudioResponse = { downloadUrl: string; filename: string; voice: string };
type TranslationVideoDirectResponse = {
  audio: { downloadUrl: string; filename: string };
  video: { downloadUrl: string; filename: string };
  voice: string;
  gender: "male" | "female";
};

const TRANSLATION_LANGUAGES = [
  "Turkish",
  "Spanish",
  "French",
  "German",
  "Italian",
  "Portuguese",
  "Arabic",
  "Hindi",
  "Japanese",
  "Korean",
  "Dutch",
  "Russian",
];

const OPENAI_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;
const OPENAI_VOICE_GENDER: Record<(typeof OPENAI_VOICES)[number], "male" | "female"> = {
  alloy: "male",
  echo: "male",
  onyx: "male",
  fable: "female",
  nova: "female",
  shimmer: "female",
};

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("daytabs_token");
  const locale = localStorage.getItem(DAYTABS_LOCALE_STORAGE_KEY);
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(locale ? { "Accept-Language": locale } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || "Request failed");
  }
  return data as T;
}

async function downloadAuthenticatedFile(url: string, filename: string) {
  const token = localStorage.getItem("daytabs_token");
  const locale = localStorage.getItem(DAYTABS_LOCALE_STORAGE_KEY);
  const response = await fetch(url, {
    headers: {
      ...(locale ? { "Accept-Language": locale } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error((payload as { error?: string }).error || "Download failed");
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

function formatTimestamp(seconds: number) {
  const rounded = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours > 0) return `${String(hours)}:${String(remMins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${String(remMins)}:${String(secs).padStart(2, "0")}`;
}

function sanitizeSegments(segments: TranscriptSegment[]) {
  return segments
    .map((segment) => ({
      start: Number.isFinite(segment.start) ? Math.max(0, segment.start) : 0,
      end: Number.isFinite(segment.end) ? Math.max(0, segment.end) : 0,
      text: segment.text.trim(),
    }))
    .filter((segment) => segment.text)
    .map((segment) => ({
      ...segment,
      end: segment.end > segment.start ? segment.end : segment.start + 0.8,
    }));
}

export default function YouTubeTranscriptTab() {
  const { plan, loading: planLoading } = usePlan();
  const [videoUrl, setVideoUrl] = useState("");
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [editable, setEditable] = useState<EditableTranscriptResponse["editableTranscript"] | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);

  const [translationLanguage, setTranslationLanguage] = useState("Turkish");
  const [translationWorking, setTranslationWorking] = useState(false);
  const [translation, setTranslation] = useState<TranscriptTranslation | null>(null);
  const [translatedSegments, setTranslatedSegments] = useState<TranscriptSegment[]>([]);

  const [voice, setVoice] = useState<(typeof OPENAI_VOICES)[number]>("alloy");
  const [audioWorking, setAudioWorking] = useState(false);
  const [audioResult, setAudioResult] = useState<TranslationAudioResponse | null>(null);
  const [videoWorking, setVideoWorking] = useState(false);
  const [videoResult, setVideoResult] = useState<TranslationVideoDirectResponse | null>(null);

  const isStudio = plan.isStudio;
  const sourceLanguage = editable?.transcript.language ?? editable?.captions.language ?? null;

  const exportBaseName = useMemo(() => {
    const base = editable?.videoId ? `youtube-${editable.videoId}` : "youtube-transcript";
    return base.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "youtube-transcript";
  }, [editable?.videoId]);

  const normalizedSegments = useMemo(() => sanitizeSegments(segments), [segments]);
  const normalizedTranslatedSegments = useMemo(() => sanitizeSegments(translatedSegments), [translatedSegments]);

  async function handleFetchTranscript(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setTranslation(null);
    setTranslatedSegments([]);
    setAudioResult(null);
    setVideoResult(null);
    setEditable(null);
    setSegments([]);
    setLoadingTranscript(true);
    try {
      const payload = await jsonFetch<EditableTranscriptResponse>("/api/youtube/transcript", {
        method: "POST",
        body: JSON.stringify({ videoUrl }),
      });
      setEditable(payload.editableTranscript);
      setSegments(payload.editableTranscript.transcript.segments || []);
      if (!payload.editableTranscript.transcript.available) {
        setError(payload.editableTranscript.needsUploadFallback
          ? "Captions exist, but YouTube did not allow downloading them. Upload audio/video to generate a transcript."
          : "Transcript not available. Upload audio/video to generate a transcript.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch transcript");
    } finally {
      setLoadingTranscript(false);
    }
  }

  async function handleUpload(file: File) {
    setError(null);
    setUploading(true);
    setTranslation(null);
    setTranslatedSegments([]);
    setAudioResult(null);
    setVideoResult(null);
    try {
      const token = localStorage.getItem("daytabs_token");
      const locale = localStorage.getItem(DAYTABS_LOCALE_STORAGE_KEY);
      const body = new FormData();
      body.append("media", file);
      const response = await fetch("/api/youtube/transcript-transcribe", {
        method: "POST",
        headers: {
          ...(locale ? { "Accept-Language": locale } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error((data as { error?: string }).error || "Upload failed");
      const payload = data as TranscriptTranscribeResponse;
      setSegments(payload.transcript.segments || []);
      setEditable((prev) => prev ? ({
        ...prev,
        transcript: {
          ...prev.transcript,
          available: true,
          source: "transcribed_audio",
          language: null,
          text: payload.transcript.text,
          segments: payload.transcript.segments,
        },
        needsUploadFallback: false,
      }) : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to transcribe upload");
    } finally {
      setUploading(false);
    }
  }

  async function handleTranslate() {
    setError(null);
    setTranslationWorking(true);
    setTranslation(null);
    setTranslatedSegments([]);
    setAudioResult(null);
    setVideoResult(null);
    try {
      const payload = await jsonFetch<TranslateResponse>("/api/youtube/transcript-translate", {
        method: "POST",
        body: JSON.stringify({
          targetLanguage: translationLanguage,
          sourceLanguage,
          segments: normalizedSegments,
        }),
      });
      setTranslation(payload.translation);
      setTranslatedSegments(payload.translation.segments || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to translate transcript");
    } finally {
      setTranslationWorking(false);
    }
  }

  async function handleGenerateAudio() {
    setError(null);
    setAudioWorking(true);
    setAudioResult(null);
    try {
      const payload = await jsonFetch<TranslationAudioResponse>("/api/youtube/transcript-translation-audio", {
        method: "POST",
        body: JSON.stringify({
          voice,
          title: exportBaseName,
          targetLanguage: translationLanguage,
          segments: normalizedTranslatedSegments,
        }),
      });
      setAudioResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate audio");
    } finally {
      setAudioWorking(false);
    }
  }

  async function handleGenerateVideoDirect() {
    setError(null);
    setVideoWorking(true);
    setVideoResult(null);
    try {
      const payload = await jsonFetch<TranslationVideoDirectResponse>("/api/youtube/transcript-translation-video-direct", {
        method: "POST",
        body: JSON.stringify({
          voice,
          gender: OPENAI_VOICE_GENDER[voice],
          title: exportBaseName,
          targetLanguage: translationLanguage,
          segments: normalizedTranslatedSegments,
        }),
      });
      setVideoResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate video");
    } finally {
      setVideoWorking(false);
    }
  }

  if (planLoading) {
    return (
      <PanelPage className="max-w-6xl">
        <PanelCard className="p-8 text-white/60">Loading plan…</PanelCard>
      </PanelPage>
    );
  }

  if (!isStudio) {
    return (
      <PanelPage className="max-w-4xl">
        <PanelHeader>
          <div>
            <PanelTitle>YouTube Transcript</PanelTitle>
            <PanelSubtitle>Fetch a YouTube transcript, edit timestamps, translate, and generate audio/video.</PanelSubtitle>
          </div>
        </PanelHeader>
        <PanelCard className="border-pink-500/20 bg-pink-500/8 p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-pink-400/20 bg-pink-500/10">
            <Youtube className="h-5 w-5 text-pink-300" />
          </div>
          <h3 className="mt-4 text-xl font-semibold text-white">Studio-only feature</h3>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-white/65">
            Transcript fetching/editing + translation audio/video generation is enabled on the Studio plan.
          </p>
          <a
            href="/pricing?highlight=studio"
            className="mt-6 inline-flex rounded-xl border border-pink-400/25 bg-pink-500/12 px-4 py-2 text-sm font-semibold text-pink-200 transition-colors hover:bg-pink-500/18"
          >
            Upgrade to Studio
          </a>
        </PanelCard>
      </PanelPage>
    );
  }

  return (
    <PanelPage className="max-w-6xl space-y-6">
      <PanelHeader>
        <div>
          <PanelTitle>YouTube Transcript</PanelTitle>
          <PanelSubtitle>Paste a YouTube URL to get an editable timestamped transcript, then translate + generate audio/video.</PanelSubtitle>
        </div>
      </PanelHeader>

      <PanelCard className="p-5">
        <form onSubmit={handleFetchTranscript} className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <input
              value={videoUrl}
              onChange={(event) => setVideoUrl(event.target.value)}
              placeholder="Paste a YouTube video URL"
              className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 text-sm text-white outline-none transition-colors placeholder:text-white/30 focus:border-primary/35"
            />
          </div>
          <button
            type="submit"
            disabled={loadingTranscript || !videoUrl.trim()}
            className="inline-flex h-12 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingTranscript ? <Loader2 className="h-4 w-4 animate-spin" /> : "Fetch Transcript"}
          </button>
        </form>
        {editable?.canonicalUrl ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-white/45">
            <a
              href={editable.canonicalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-white/70 hover:text-white"
            >
              Open on YouTube <ExternalLink className="h-3 w-3" />
            </a>
            <span>
              Captions: {editable.captions.available ? "available" : "none"}
              {editable.captions.language ? ` · ${editable.captions.language}` : ""}
              {editable.captions.source ? ` · ${editable.captions.source}` : ""}
              {editable.needsUploadFallback ? " · upload required" : ""}
            </span>
          </div>
        ) : null}
        {error ? (
          <div className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}
      </PanelCard>

      <PanelCard className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Transcript segments</h3>
            <p className="mt-1 text-xs text-white/45">Edit text per timestamp. Start/end times are preserved for translation audio alignment.</p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-white/70 hover:text-white">
            <Upload className="h-4 w-4" />
            {uploading ? "Uploading…" : "Upload audio/video"}
            <input
              type="file"
              className="hidden"
              disabled={uploading}
              accept=".mp3,.m4a,.wav,.webm,.mp4,.mov,.avi,.mkv"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                void handleUpload(file);
                event.target.value = "";
              }}
            />
          </label>
        </div>

        {!normalizedSegments.length ? (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-white/55">
            No transcript loaded yet.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {segments.map((segment, index) => (
              <div key={`${segment.start}-${segment.end}-${index}`} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-semibold text-white/70">
                    {formatTimestamp(segment.start)} → {formatTimestamp(segment.end)}
                  </div>
                  <div className="text-[11px] text-white/35">#{index + 1}</div>
                </div>
                <textarea
                  value={segment.text}
                  onChange={(event) => {
                    const next = [...segments];
                    next[index] = { ...segment, text: event.target.value };
                    setSegments(next);
                  }}
                  rows={3}
                  className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-background/50 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-primary/35"
                />
              </div>
            ))}
          </div>
        )}
      </PanelCard>

      <PanelCard className="p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Translate</h3>
            <p className="mt-1 text-xs text-white/45">Creates a translated timestamped transcript you can further edit.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={translationLanguage}
              onChange={(event) => setTranslationLanguage(event.target.value)}
              className="h-10 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-sm text-white outline-none"
            >
              {TRANSLATION_LANGUAGES.map((lang) => (
                <option key={lang} value={lang} className="bg-slate-950">
                  {lang}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void handleTranslate()}
              disabled={translationWorking || !normalizedSegments.length}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {translationWorking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Translate"}
            </button>
          </div>
        </div>

        {translation ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="text-xs text-white/55">
              {translation.targetLanguage} translation · {new Date(translation.createdAt).toLocaleString()}
            </div>
            <div className="mt-3 space-y-3">
              {translatedSegments.map((segment, index) => (
                <div key={`${segment.start}-${segment.end}-${index}`} className="rounded-2xl border border-white/10 bg-background/40 p-4">
                  <div className="text-xs font-semibold text-white/70">
                    {formatTimestamp(segment.start)} → {formatTimestamp(segment.end)}
                  </div>
                  <textarea
                    value={segment.text}
                    onChange={(event) => {
                      const next = [...translatedSegments];
                      next[index] = { ...segment, text: event.target.value };
                      setTranslatedSegments(next);
                    }}
                    rows={3}
                    className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-background/50 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-primary/35"
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-white/55">
            No translation yet.
          </div>
        )}
      </PanelCard>

      <PanelCard className="p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Audio + AI character video</h3>
            <p className="mt-1 text-xs text-white/45">Generates spoken audio (OpenAI voice) and an AI character video reading it.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={voice}
              onChange={(event) => setVoice(event.target.value as (typeof OPENAI_VOICES)[number])}
              className="h-10 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-sm text-white outline-none"
            >
              {OPENAI_VOICES.map((item) => (
                <option key={item} value={item} className="bg-slate-950">
                  {item}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void handleGenerateAudio()}
              disabled={audioWorking || !normalizedTranslatedSegments.length}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-4 text-sm font-semibold text-white/80 transition-colors hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {audioWorking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Generate audio"}
            </button>
            <Button
              type="button"
              onClick={() => void handleGenerateVideoDirect()}
              disabled={videoWorking || !normalizedTranslatedSegments.length}
              className="h-10"
            >
              {videoWorking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Generate video"}
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="text-xs font-semibold text-white/70">Audio</div>
            {audioResult ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void downloadAuthenticatedFile(audioResult.downloadUrl, audioResult.filename).catch((err) => setError(err instanceof Error ? err.message : "Download failed"))}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/[0.05]"
                >
                  <Download className="h-4 w-4" />
                  Download MP3
                </button>
                <div className="text-xs text-white/45">voice: {audioResult.voice}</div>
              </div>
            ) : (
              <div className="mt-2 text-sm text-white/55">Generate audio after translating.</div>
            )}
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="text-xs font-semibold text-white/70">Video</div>
            {videoResult ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void downloadAuthenticatedFile(videoResult.video.downloadUrl, videoResult.video.filename).catch((err) => setError(err instanceof Error ? err.message : "Download failed"))}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/[0.05]"
                >
                  <Download className="h-4 w-4" />
                  Download MP4
                </button>
                <div className="text-xs text-white/45">
                  {videoResult.voice} · {videoResult.gender}
                </div>
              </div>
            ) : (
              <div className="mt-2 text-sm text-white/55">Generate video after translating.</div>
            )}
          </div>
        </div>
      </PanelCard>
    </PanelPage>
  );
}

