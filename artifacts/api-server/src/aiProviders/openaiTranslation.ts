import { openai } from "../lib/openai";
import type { TranscriptSegment } from "./openaiTranscription";

export type TranslatedSegment = {
  id: number;
  start_time: string;
  end_time: string;
  original_text: string;
  translated_text: string;
};

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
  const system = `You are a professional subtitle translator.
Translate timestamped transcript segments while preserving:
- exact segment id
- exact start_time and end_time
- original meaning, tone, and context
Rules:
- Do NOT translate or modify timestamps.
- Do NOT merge or delete segments.
- Translate naturally (not robotic).
Return valid JSON only with keys: translated_full_text, translated_segments.`;

  const user = `Translate the following timestamped transcript from ${input.sourceLanguage} to ${input.targetLanguage}.

Segments JSON:
${JSON.stringify(input.segments.map((s) => ({
  id: s.id,
  start_time: s.start_time,
  end_time: s.end_time,
  text: s.text,
})), null, 2)}
`;

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
    translated_full_text: string;
    translated_segments: Array<{ id: number; start_time: string; end_time: string; original_text?: string; translated_text: string }>;
  };

  const byId = new Map(input.segments.map((s) => [s.id, s]));
  const translatedSegments: TranslatedSegment[] = (parsed.translated_segments ?? []).map((s) => {
    const orig = byId.get(s.id);
    return {
      id: s.id,
      start_time: s.start_time,
      end_time: s.end_time,
      original_text: orig?.text ?? (s.original_text ?? ""),
      translated_text: s.translated_text,
    };
  });

  const full = (parsed.translated_full_text ?? "").trim() || translatedSegments.map((s) => s.translated_text).join(" ").trim();
  return { translatedFullText: full, translatedSegments, raw: parsed };
}

