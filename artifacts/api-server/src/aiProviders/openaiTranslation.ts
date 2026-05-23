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

async function translateChunkCompact(input: {
  segments: TranscriptSegment[];
  sourceLanguage: string;
  targetLanguage: string;
  model: string;
}) {
  const system = `You are a professional subtitle translator.
Translate each item from ${input.sourceLanguage} to ${input.targetLanguage}.
Rules:
- Preserve the id exactly.
- Return JSON only in this shape: {"translations":[{"id":1,"tr":"..."}]}.
- Do not include timestamps. Do not include original text.
- Do not summarize. Translate naturally and contextually.`;

  const user = JSON.stringify({
    segments: input.segments.map((s) => ({ id: s.id, t: s.text })),
  });

  const res = await openai.chat.completions.create({
    model: input.model,
    temperature: 0.2,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const content = res.choices[0]?.message?.content ?? "";
  const parsed = JSON.parse(extractJsonObject(stripJsonFence(content))) as {
    translations?: Array<{ id: number; tr: string }>;
  };

  const map = new Map<number, string>();
  for (const t of parsed.translations ?? []) {
    if (typeof t?.id === "number" && typeof t?.tr === "string") map.set(t.id, t.tr);
  }
  return { translationsById: map, raw: parsed };
}

export async function translateTranscriptSegmentsBatched(input: {
  segments: TranscriptSegment[];
  sourceLanguage: string;
  targetLanguage: string;
}) {
  const startedAt = Date.now();
  const model = process.env.AUDIO_TRANSLATION_MODEL ?? "gpt-4o-mini";

  const maxChars = Number(process.env.AUDIO_TRANSLATION_MAX_CHARS ?? "50000");
  const maxSegments = Number(process.env.AUDIO_TRANSLATION_MAX_SEGMENTS ?? "180");
  const concurrency = Number(process.env.AUDIO_TRANSLATION_CONCURRENCY ?? "5");

  const effectiveMaxChars = Number.isFinite(maxChars) ? maxChars : 50000;
  const effectiveMaxSegments = Number.isFinite(maxSegments) ? maxSegments : 180;
  const chunks = chunkSegments(input.segments, effectiveMaxChars, effectiveMaxSegments);

  const safeConcurrency = Number.isFinite(concurrency) && concurrency > 0 ? Math.min(8, Math.floor(concurrency)) : 3;

  const totalChars = input.segments.reduce((acc, s) => acc + (s.text?.length ?? 0), 0);
  // eslint-disable-next-line no-console
  console.info("[audio-transcript] translation start", {
    segments: input.segments.length,
    sourceChars: totalChars,
    chunks: chunks.length,
    model,
    concurrency: safeConcurrency,
    maxChars: effectiveMaxChars,
    maxSegments: effectiveMaxSegments,
  });

  type ChunkResult = { idx: number; translationsById: Map<number, string> };
  const results: ChunkResult[] = [];
  let nextIdx = 0;

  async function worker() {
    for (;;) {
      const idx = nextIdx;
      nextIdx += 1;
      const chunk = chunks[idx];
      if (!chunk) return;

      const t0 = Date.now();
      const res = await translateChunkCompact({
        segments: chunk,
        sourceLanguage: input.sourceLanguage,
        targetLanguage: input.targetLanguage,
        model,
      });

      const expectedIds = new Set(chunk.map((s) => s.id));
      const missing = [...expectedIds].filter((id) => !res.translationsById.has(id));
      if (missing.length) {
        // Retry once with only missing ids (small & cheap) to improve completeness.
        const retrySegments = chunk.filter((s) => missing.includes(s.id));
        const retry = await translateChunkCompact({
          segments: retrySegments,
          sourceLanguage: input.sourceLanguage,
          targetLanguage: input.targetLanguage,
          model,
        });
        for (const [id, tr] of retry.translationsById.entries()) res.translationsById.set(id, tr);
      }

      // eslint-disable-next-line no-console
      console.info("[audio-transcript] translation chunk done", {
        idx,
        segments: chunk.length,
        chars: chunk.reduce((a, s) => a + (s.text?.length ?? 0), 0),
        ms: Date.now() - t0,
        missingAfterRetry: chunk.filter((s) => !res.translationsById.has(s.id)).length,
      });

      results.push({ idx, translationsById: res.translationsById });
    }
  }

  await Promise.all(Array.from({ length: Math.min(safeConcurrency, chunks.length) }, () => worker()));

  // Stitch translations into a single map (later chunks win, but ids are unique anyway).
  results.sort((a, b) => a.idx - b.idx);
  const translationMap = new Map<number, string>();
  for (const r of results) for (const [id, tr] of r.translationsById.entries()) translationMap.set(id, tr);

  const translatedSegments: TranslatedSegment[] = input.segments.map((seg) => ({
    id: seg.id,
    start_time: seg.start_time,
    end_time: seg.end_time,
    original_text: seg.text,
    translated_text: translationMap.get(seg.id) ?? "",
  }));

  const stillMissing = translatedSegments.filter((s) => !s.translated_text.trim()).length;
  const full = translatedSegments.map((s) => s.translated_text).join(" ").replace(/\s+/g, " ").trim();

  // eslint-disable-next-line no-console
  console.info("[audio-transcript] translation done", {
    segments: input.segments.length,
    chunks: chunks.length,
    model,
    missing: stillMissing,
    ms: Date.now() - startedAt,
  });

  return { translatedFullText: full, translatedSegments };
}
