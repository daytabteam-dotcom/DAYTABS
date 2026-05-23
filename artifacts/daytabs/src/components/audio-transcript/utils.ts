import type { TranscriptSegment, TranslatedSegment } from "./types";

export function parseSegments(value: unknown): TranscriptSegment[] {
  if (!Array.isArray(value)) return [];
  const out: TranscriptSegment[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const seg = item as any;
    if (typeof seg.id !== "number") continue;
    if (typeof seg.start_time !== "string" || typeof seg.end_time !== "string") continue;
    if (typeof seg.text !== "string") continue;
    out.push({ id: seg.id, start_time: seg.start_time, end_time: seg.end_time, text: seg.text });
  }
  return out;
}

export function parseTranslatedSegments(value: unknown): TranslatedSegment[] {
  if (!Array.isArray(value)) return [];
  const out: TranslatedSegment[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const seg = item as any;
    if (typeof seg.id !== "number") continue;
    if (typeof seg.start_time !== "string" || typeof seg.end_time !== "string") continue;
    if (typeof seg.translated_text !== "string") continue;
    out.push({
      id: seg.id,
      start_time: seg.start_time,
      end_time: seg.end_time,
      original_text: typeof seg.original_text === "string" ? seg.original_text : "",
      translated_text: seg.translated_text,
    });
  }
  return out;
}

function pad(n: number, w = 2) {
  return String(n).padStart(w, "0");
}

export function toSrtTime(ts: string) {
  // HH:MM:SS.mmm -> HH:MM:SS,mmm
  if (!ts) return "00:00:00,000";
  const [hms, ms = "000"] = ts.split(".");
  const parts = (hms || "00:00:00").split(":").map((p) => Number(p));
  const hh = pad(parts[0] ?? 0);
  const mm = pad(parts[1] ?? 0);
  const ss = pad(parts[2] ?? 0);
  return `${hh}:${mm}:${ss},${pad(Number(ms) || 0, 3)}`;
}

export function convertSegmentsToSRT(segments: Array<TranscriptSegment | TranslatedSegment>, kind: "original" | "translated") {
  const lines: string[] = [];
  segments.forEach((s, idx) => {
    const text = kind === "translated" ? (s as any).translated_text : (s as any).text;
    lines.push(String(idx + 1));
    lines.push(`${toSrtTime((s as any).start_time)} --> ${toSrtTime((s as any).end_time)}`);
    lines.push(String(text || "").trim());
    lines.push("");
  });
  return lines.join("\n").trim() + "\n";
}

