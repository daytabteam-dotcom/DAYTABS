import type { TranscriptSegment } from "./types";

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

export function convertSegmentsToSRT(segments: TranscriptSegment[]) {
  const lines: string[] = [];
  segments.forEach((s, idx) => {
    lines.push(String(idx + 1));
    lines.push(`${toSrtTime(s.start_time)} --> ${toSrtTime(s.end_time)}`);
    lines.push(s.text.trim());
    lines.push("");
  });
  return lines.join("\n").trim() + "\n";
}
