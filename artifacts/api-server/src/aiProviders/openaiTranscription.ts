import { toFile } from "openai/uploads";
import { openai } from "../lib/openai";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";

export type TranscriptSegment = {
  id: number;
  start_time: string; // HH:MM:SS.mmm
  end_time: string; // HH:MM:SS.mmm
  text: string;
};

const execFileAsync = promisify(execFile);

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

async function transcribeSingle(input: {
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

function bumpSegments(segments: TranscriptSegment[], offsetSeconds: number, idOffset: number) {
  if (!offsetSeconds && !idOffset) return segments;
  const toSec = (ts: string) => {
    const m = /^(\d+):(\d+):(\d+)(?:\.(\d+))?$/.exec(ts.trim());
    if (!m) return 0;
    const hh = Number(m[1] ?? 0);
    const mm = Number(m[2] ?? 0);
    const ss = Number(m[3] ?? 0);
    const ms = Number((m[4] ?? "0").padEnd(3, "0").slice(0, 3));
    return hh * 3600 + mm * 60 + ss + ms / 1000;
  };
  return segments.map((s) => {
    const start = toSec(s.start_time) + offsetSeconds;
    const end = toSec(s.end_time) + offsetSeconds;
    return {
      ...s,
      id: s.id + idOffset,
      start_time: secsToTimestamp(start),
      end_time: secsToTimestamp(end),
    };
  });
}

/**
 * Whisper file uploads can fail around ~25MB. This helper auto-chunks large audio by
 * transcoding into low-bitrate mp3 segments and stitching timestamp offsets.
 */
export async function transcribeAudio(input: {
  audioBytes: Buffer;
  filename: string;
  sourceLanguage: string;
}) {
  const MAX_OPENAI_BYTES = 24 * 1024 * 1024; // stay below 25MB-ish limit
  if (input.audioBytes.byteLength <= MAX_OPENAI_BYTES) {
    return await transcribeSingle(input);
  }

  const jobId = randomUUID();
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `daytabs-a2t-${jobId}-`));
  const inPath = path.join(tmpDir, "input");
  const outPattern = path.join(tmpDir, "chunk-%03d.mp3");

  try {
    await fs.writeFile(inPath, input.audioBytes);

    // Transcode and segment to keep chunk sizes small and consistent.
    // - mono 16k
    // - 64kbps mp3
    // - 7min segments
    await execFileAsync("ffmpeg", [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      inPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "64k",
      "-f",
      "segment",
      "-segment_time",
      "420",
      "-reset_timestamps",
      "1",
      outPattern,
    ], { timeout: 10 * 60 * 1000 });

    const files = (await fs.readdir(tmpDir))
      .filter((f) => f.startsWith("chunk-") && f.endsWith(".mp3"))
      .sort()
      .map((f) => path.join(tmpDir, f));

    if (!files.length) {
      return await transcribeSingle({ ...input, audioBytes: input.audioBytes, filename: input.filename });
    }

    let offsetSeconds = 0;
    let idOffset = 0;
    const stitchedSegments: TranscriptSegment[] = [];
    const textParts: string[] = [];
    let detectedLanguage: string | null = null;

    for (const fp of files) {
      const bytes = await fs.readFile(fp);
      if (bytes.byteLength > MAX_OPENAI_BYTES) {
        // As a final fallback, transcribe this chunk without timestamps.
        const single = await transcribeSingle({ audioBytes: bytes.slice(0, MAX_OPENAI_BYTES), filename: path.basename(fp), sourceLanguage: input.sourceLanguage });
        const bumped = bumpSegments(single.segments, offsetSeconds, idOffset);
        stitchedSegments.push(...bumped);
        textParts.push(single.fullText);
        detectedLanguage = detectedLanguage ?? single.detectedLanguage;
        idOffset = stitchedSegments.length;
        offsetSeconds += 420;
        continue;
      }

      const single = await transcribeSingle({ audioBytes: bytes, filename: path.basename(fp), sourceLanguage: input.sourceLanguage });
      const bumped = bumpSegments(single.segments, offsetSeconds, idOffset);
      stitchedSegments.push(...bumped);
      textParts.push(single.fullText);
      detectedLanguage = detectedLanguage ?? single.detectedLanguage;
      idOffset = stitchedSegments.length;
      // Better offset: use last segment end time in seconds if parseable; else fallback to 7min.
      const approx = (() => {
        const s = single.segments[single.segments.length - 1];
        if (!s) return 420;
        const m = /^(\d+):(\d+):(\d+)(?:\.(\d+))?$/.exec(s.end_time);
        if (!m) return 420;
        const hh = Number(m[1] ?? 0);
        const mm = Number(m[2] ?? 0);
        const ss = Number(m[3] ?? 0);
        const ms = Number((m[4] ?? "0").padEnd(3, "0").slice(0, 3));
        const sec = hh * 3600 + mm * 60 + ss + ms / 1000;
        return sec > 0 ? sec : 420;
      })();
      offsetSeconds += approx;
    }

    const fullText = textParts.join(" ").replace(/\s+/g, " ").trim();
    return { fullText, segments: stitchedSegments, detectedLanguage, raw: { chunked: true, chunks: files.length } };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
