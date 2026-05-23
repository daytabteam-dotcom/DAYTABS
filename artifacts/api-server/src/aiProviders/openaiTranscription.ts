import { toFile } from "openai/uploads";
import { openai } from "../lib/openai";

export type TranscriptSegment = {
  id: number;
  start_time: string; // HH:MM:SS.mmm
  end_time: string; // HH:MM:SS.mmm
  text: string;
};

function pad(num: number, width = 2) {
  return String(num).padStart(width, "0");
}

function secsToTimestamp(seconds: number) {
  const s = Math.max(0, seconds);
  const ms = Math.round((s % 1) * 1000);
  const total = Math.floor(s);
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}.${pad(ms, 3)}`;
}

export function normalizeTranscriptSegments(raw: {
  segments?: Array<{ start: number; end: number; text: string }>;
  text?: string;
}): TranscriptSegment[] {
  const segments = (raw.segments ?? []).filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && typeof s.text === "string");
  if (segments.length) {
    return segments.map((s, idx) => ({
      id: idx + 1,
      start_time: secsToTimestamp(s.start),
      end_time: secsToTimestamp(s.end),
      text: s.text.trim(),
    })).filter((s) => s.text.length > 0);
  }

  const text = (raw.text ?? "").trim();
  if (!text) return [];

  // Fallback: split into ~2-3 sentence chunks without timestamps
  const parts = text.split(/\n{2,}|\.(\s+)|\?!?\s+/).map((p) => (typeof p === "string" ? p.trim() : "")).filter(Boolean);
  const merged: string[] = [];
  for (const p of parts) {
    if (!p) continue;
    const last = merged[merged.length - 1];
    if (!last) merged.push(p);
    else if (last.length < 220) merged[merged.length - 1] = `${last} ${p}`.trim();
    else merged.push(p);
  }
  return merged.map((t, i) => ({
    id: i + 1,
    start_time: "00:00:00.000",
    end_time: "00:00:00.000",
    text: t,
  }));
}

export function detectLanguageIfAvailable(raw: unknown): string | null {
  const lang = (raw as { language?: unknown })?.language;
  return typeof lang === "string" && lang.trim() ? lang.trim() : null;
}

export async function transcribeAudio(input: {
  audioBytes: Buffer;
  filename: string;
  sourceLanguage: string; // "auto" or ISO-ish; OpenAI expects language codes
}) {
  const file = await toFile(input.audioBytes, input.filename);
  const language = input.sourceLanguage && input.sourceLanguage !== "auto" ? input.sourceLanguage : undefined;

  const response = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
    ...(language ? { language } : {}),
  } as Parameters<typeof openai.audio.transcriptions.create>[0]);

  const raw = response as unknown as {
    text?: string;
    segments?: Array<{ start: number; end: number; text: string }>;
    language?: string;
  };

  const segments = normalizeTranscriptSegments({ segments: raw.segments, text: raw.text });
  return {
    fullText: (raw.text ?? "").trim(),
    segments,
    detectedLanguage: detectLanguageIfAvailable(raw),
    raw,
  };
}

