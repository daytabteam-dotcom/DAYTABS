import { openai } from "../lib/openai";
import type { TranscriptSegment } from "./openaiTranscription";

export type TranslatedSegment = {
  id: number;
  start_time: string;
  end_time: string;
  original_text: string;
  translated_text: string;
};

function chunkSegments(segments: TranscriptSegment[], maxChars: number, maxSegments: number) {
  const chunks: TranscriptSegment[][] = [];
  let current: TranscriptSegment[] = [];
  let currentChars = 0;
  for (const seg of segments) {
    const segChars = (seg.text || "").length + 40;
    const wouldOverflow =
      current.length >= maxSegments || (currentChars + segChars > maxChars && current.length > 0);
    if (wouldOverflow) {
      chunks.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(seg);
    currentChars += segChars;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

function stripJsonFence(raw: string) {
  const trimmed = raw.trim();
  return trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");
}

function extractJsonObject(raw: string) {
  const text = raw.trim();
  const start = text.indexOf("{");
  if (start < 0) return text;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const c = text[i]!;
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (c === "\\") {
        escaped = true;
        continue;
      }
      if (c === "\"") inString = false;
      continue;
    }
    if (c === "\"") {
      inString = true;
      continue;
    }
    if (c === "{") depth += 1;
    if (c === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return text.slice(start);
}

export async function translateTranscriptSegments(input: {
  segments: TranscriptSegment[];
  sourceLanguage: string;
  targetLanguage: string;
}) {
  const system =
    "You translate subtitle segments. Preserve each segment's id, start_time, and end_time exactly. " +
    "Translate text naturally (contextual, not robotic). Do not merge or delete segments. " +
    "Return JSON only: { translated_segments: [{ id, start_time, end_time, translated_text }] }";

  // Use compact keys to keep prompts cheaper.
  const user =
    `Translate from ${input.sourceLanguage} to ${input.targetLanguage}.\n\n` +
    "Segments JSON (keys: id, s=start_time, e=end_time, t=text):\n" +
    JSON.stringify(
      input.segments.map((seg) => ({
        id: seg.id,
        s: seg.start_time,
        e: seg.end_time,
        t: seg.text,
      })),
    );

  const res = await openai.chat.completions.create({
    model: process.env.AUDIO_TRANSLATION_MODEL ?? "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const content = res.choices[0]?.message?.content ?? "";
  const parsed = JSON.parse(extractJsonObject(stripJsonFence(content))) as {
    translated_segments: Array<{
      id: number;
      start_time: string;
      end_time: string;
      // tolerate older keys in case models echo them
      s?: string;
      e?: string;
      original_text?: string;
      translated_text: string;
    }>;
  };

  const byId = new Map(input.segments.map((s) => [s.id, s]));
  const translatedSegments: TranslatedSegment[] = (parsed.translated_segments ?? []).map((s) => {
    const orig = byId.get(s.id);
    return {
      id: s.id,
      start_time: s.start_time ?? s.s ?? orig?.start_time ?? "00:00:00.000",
      end_time: s.end_time ?? s.e ?? orig?.end_time ?? "00:00:00.000",
      original_text: orig?.text ?? (s.original_text ?? ""),
      translated_text: s.translated_text,
    };
  });

  const full = translatedSegments.map((s) => s.translated_text).join(" ").replace(/\s+/g, " ").trim();
  return { translatedFullText: full, translatedSegments, raw: parsed };
}

export async function translateTranscriptSegmentsBatched(input: {
  segments: TranscriptSegment[];
  sourceLanguage: string;
  targetLanguage: string;
}) {
  const maxChars = Number(process.env.AUDIO_TRANSLATION_MAX_CHARS ?? "24000");
  const maxSegments = Number(process.env.AUDIO_TRANSLATION_MAX_SEGMENTS ?? "80");
  const concurrency = Number(process.env.AUDIO_TRANSLATION_CONCURRENCY ?? "3");
  const chunks = chunkSegments(input.segments, Number.isFinite(maxChars) ? maxChars : 12000, Number.isFinite(maxSegments) ? maxSegments : 40);

  const safeConcurrency = Number.isFinite(concurrency) && concurrency > 0 ? Math.min(8, Math.floor(concurrency)) : 3;

  type ChunkResult = { idx: number; translatedSegments: TranslatedSegment[] };
  const results: ChunkResult[] = [];
  let nextIdx = 0;

  async function worker() {
    for (;;) {
      const idx = nextIdx;
      nextIdx += 1;
      const chunk = chunks[idx];
      if (!chunk) return;
      const res = await translateTranscriptSegments({
        segments: chunk,
        sourceLanguage: input.sourceLanguage,
        targetLanguage: input.targetLanguage,
      });
      results.push({ idx, translatedSegments: res.translatedSegments });
    }
  }

  await Promise.all(Array.from({ length: Math.min(safeConcurrency, chunks.length) }, () => worker()));

  results.sort((a, b) => a.idx - b.idx);
  const stitched = results.flatMap((r) => r.translatedSegments);
  const full = stitched.map((s) => s.translated_text).join(" ").replace(/\s+/g, " ").trim();
  return { translatedFullText: full, translatedSegments: stitched };
}
