import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import { db } from "@workspace/db";
import { analysisJobsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../../lib/logger";
import { openai } from "@workspace/integrations-openai-ai-server";
import { speechToText, speechToTextVerbose } from "@workspace/integrations-openai-ai-server/audio";

export const execAsync = promisify(exec);

export async function updateJob(jobId: string, updates: Partial<typeof analysisJobsTable.$inferInsert>) {
  await db.update(analysisJobsTable)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(analysisJobsTable.id, jobId));
}

/**
 * Get the actual duration of an audio/video file via ffprobe.
 * Returns 0 on failure — callers should treat 0 as "unknown".
 */
export async function getMediaDuration(filePath: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}" 2>&1`
    );
    const d = parseFloat(stdout.trim());
    return isNaN(d) ? 0 : d;
  } catch {
    return 0;
  }
}

/**
 * Build approximate segments from plain text by splitting on sentence boundaries.
 * When actualDurationSec is provided (from ffprobe), timestamps are scaled
 * proportionally so they never exceed the real video length.
 */
export function buildApproximateSegments(
  text: string,
  actualDurationSec = 0
): Array<{ start: number; end: number; text: string }> {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const wordsPerSecond = 2.5;
  let currentTime = 0;
  const segs = sentences.map((sentence) => {
    const wordCount = sentence.trim().split(/\s+/).length;
    const duration = wordCount / wordsPerSecond;
    const start = currentTime;
    const end = currentTime + duration;
    currentTime = end;
    return { start: Math.round(start * 10) / 10, end: Math.round(end * 10) / 10, text: sentence.trim() };
  });

  // Scale proportionally so timestamps never exceed actual video length
  if (actualDurationSec > 0 && currentTime > 0 && Math.abs(currentTime - actualDurationSec) > 1) {
    const scale = actualDurationSec / currentTime;
    return segs.map(s => ({
      ...s,
      start: Math.round(s.start * scale * 10) / 10,
      end: Math.min(Math.round(s.end * scale * 10) / 10, actualDurationSec),
    }));
  }

  return segs;
}

export async function transcribeAudio(audioPath: string): Promise<{ text: string; segments: Array<{ start: number; end: number; text: string }> }> {
  const audioBuffer = await fs.readFile(audioPath);

  // Get real audio duration so approximate segments (fallback) are scaled correctly
  const actualDuration = await getMediaDuration(audioPath);

  try {
    const result = await speechToTextVerbose(audioBuffer, "mp3");
    if (result.segments.length > 0) {
      // Clamp Whisper timestamps to actual duration in case of edge-case overrun
      if (actualDuration > 0) {
        const clamped = result.segments
          .filter(s => s.start < actualDuration)
          .map(s => ({ ...s, end: Math.min(s.end, actualDuration) }));
        if (clamped.length > 0) return { text: result.text, segments: clamped };
      }
      return result;
    }
    return { text: result.text, segments: buildApproximateSegments(result.text, actualDuration) };
  } catch {
    const fullText = await speechToText(audioBuffer, "mp3");
    return { text: fullText, segments: buildApproximateSegments(fullText, actualDuration) };
  }
}

export async function extractAudio(videoPath: string, audioPath: string): Promise<void> {
  await execAsync(`ffmpeg -i "${videoPath}" -q:a 0 -map a "${audioPath}" -y`);
}

/**
 * Generate a compressed proxy video for heavy processing (transcription, audio analysis, etc.)
 * Scale to 640px wide, high CRF for fast encoding — not used for output, only for AI processing.
 */
export async function compressVideo(inputPath: string, outputPath: string): Promise<void> {
  await execAsync(
    `ffmpeg -i "${inputPath}" -vf scale=640:-2 -crf 32 -preset veryfast "${outputPath}" -y`
  );
}

/**
 * Extract the first 10 frames from the ORIGINAL (uncompressed) video for high-quality visual analysis.
 */
export async function extractFrames(videoPath: string, framesDir: string, count = 10): Promise<string[]> {
  await execAsync(
    `ffmpeg -i "${videoPath}" -vf "select=lt(n\\,${count})" -vsync vfr "${framesDir}/frame_%03d.jpg" -y`
  );
  const files = await fs.readdir(framesDir);
  const jpgs = files.filter(f => f.endsWith(".jpg")).sort().slice(0, count);
  return Promise.all(jpgs.map(async (f) => {
    const buf = await fs.readFile(path.join(framesDir, f));
    return buf.toString("base64");
  }));
}

export function generateSrt(segments: Array<{ start: number; end: number; text: string }>): string {
  const fmt = (s: number) => {
    const ms = Math.round((s % 1) * 1000);
    const secs = Math.floor(s) % 60;
    const mins = Math.floor(s / 60) % 60;
    const hrs = Math.floor(s / 3600);
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
  };
  return segments.map((seg, i) => `${i + 1}\n${fmt(seg.start)} --> ${fmt(seg.end)}\n${seg.text.trim()}`).join("\n\n");
}

async function callOpenAI(body: object): Promise<{ choices: Array<{ message: { content: string } }> }> {
  return openai.chat.completions.create(body as Parameters<typeof openai.chat.completions.create>[0]) as Promise<{ choices: Array<{ message: { content: string } }> }>;
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()) as T;
  } catch {
    return fallback;
  }
}

export async function analyzeVisuals(frameBase64List: string[], platform: string): Promise<object> {
  const imageContent = frameBase64List.map(b64 => ({
    type: "image_url",
    image_url: { url: `data:image/jpeg;base64,${b64}` },
  }));

  const prompt = `You are a professional video quality analyst. Analyze these video frames for a ${platform} video and return STRICT JSON only (no markdown, no explanation).
Return this exact JSON structure:
{
  "lighting": {"level": "low/medium/high", "numeric": 0-100, "assessment": "...", "suggestions": ["..."], "effect": "..."},
  "brightness": {"level": "low/medium/high", "numeric": 0-100, "assessment": "...", "suggestions": ["..."], "effect": "..."},
  "contrast": {"level": "low/medium/high", "numeric": 0-100, "assessment": "...", "suggestions": ["..."], "effect": "..."},
  "sharpness": {"level": "blurry/acceptable/sharp", "numeric": 0-100, "assessment": "...", "suggestions": ["..."], "effect": "..."},
  "stability": {"level": "shaky/acceptable/stable", "numeric": 0-100, "assessment": "...", "suggestions": ["..."], "effect": "..."},
  "colorBalance": {"level": "poor/acceptable/good", "numeric": 0-100, "assessment": "...", "suggestions": ["..."], "effect": "..."},
  "background": {"level": "distracting/normal/clean", "numeric": 0-100, "assessment": "...", "suggestions": ["..."], "effect": "..."},
  "framing": {"level": "poor/acceptable/good", "numeric": 0-100, "assessment": "...", "suggestions": ["..."], "effect": "..."},
  "pacing": {"level": "slow/moderate/fast", "numeric": 0-100, "assessment": "...", "suggestions": ["..."], "effect": "..."}
}`;

  const response = await callOpenAI({
    model: "gpt-4o",
    max_completion_tokens: 2000,
    messages: [{ role: "user", content: [{ type: "text", text: prompt }, ...imageContent] }],
  });
  return parseJson(response.choices[0]?.message?.content ?? "{}", {
    lighting: { level: "medium", numeric: 70, assessment: "Acceptable lighting", suggestions: [], effect: "Neutral" },
    brightness: { level: "medium", numeric: 65, assessment: "Good brightness", suggestions: [], effect: "Clear" },
    contrast: { level: "medium", numeric: 70, assessment: "Adequate contrast", suggestions: [], effect: "Readable" },
    sharpness: { level: "acceptable", numeric: 75, assessment: "Clear image", suggestions: [], effect: "Professional" },
    stability: { level: "stable", numeric: 80, assessment: "Stable footage", suggestions: [], effect: "Comfortable" },
    colorBalance: { level: "good", numeric: 75, assessment: "Natural colors", suggestions: [], effect: "Appealing" },
    background: { level: "normal", numeric: 70, assessment: "Background ok", suggestions: [], effect: "Not distracting" },
    framing: { level: "good", numeric: 78, assessment: "Good framing", suggestions: [], effect: "Professional" },
    pacing: { level: "moderate", numeric: 72, assessment: "Good pacing", suggestions: [], effect: "Maintains attention" },
  });
}

export async function analyzeAudio(transcript: string, whisperConfidence: number): Promise<object> {
  const fillerWordPattern = /\b(um+|uh+|er+|ah+|like|you know|basically|literally|actually|so|right\?)\b/gi;
  const fillerWordMatches = transcript.match(fillerWordPattern) || [];
  const fillerWordCount = fillerWordMatches.length;
  const wordCount = transcript.split(/\s+/).filter(w => w.length > 0).length;
  const fillerRatio = wordCount > 0 ? fillerWordCount / wordCount : 0;
  const fillerLevel = fillerRatio > 0.1 ? "high" : fillerRatio > 0.05 ? "medium" : "low";
  const clarityNumeric = Math.round(whisperConfidence * 100);

  const response = await callOpenAI({
    model: "gpt-4o-mini",
    max_completion_tokens: 800,
    messages: [{ role: "user", content: `Audio quality analyst. Transcript snippet: "${transcript.substring(0, 500)}" Filler words: ${fillerWordCount}/${wordCount}. Whisper confidence: ${clarityNumeric}%. Return STRICT JSON:
{"audioVolume":{"level":"low/medium/high","numeric":0-100,"assessment":"...","suggestions":["..."],"effect":"..."},"audioClarity":{"level":"poor/acceptable/good","numeric":${clarityNumeric},"assessment":"...","suggestions":["..."],"effect":"..."},"backgroundNoise":{"level":"high/medium/low","numeric":0-100,"assessment":"...","suggestions":["..."],"effect":"..."},"fillerWords":{"level":"${fillerLevel}","numeric":${fillerWordCount},"assessment":"${fillerWordCount} filler words (${Math.round(fillerRatio * 100)}% of speech)","suggestions":["..."],"effect":"..."}}` }],
  });
  return parseJson(response.choices[0]?.message?.content ?? "{}", {
    audioVolume: { level: "medium", numeric: 72, assessment: "Adequate volume", suggestions: [], effect: "Clear dialogue" },
    audioClarity: { level: clarityNumeric > 80 ? "good" : "acceptable", numeric: clarityNumeric, assessment: "Intelligible speech", suggestions: [], effect: "Good comprehension" },
    backgroundNoise: { level: "low", numeric: 20, assessment: "Minimal noise", suggestions: [], effect: "Clear audio" },
    fillerWords: { level: fillerLevel, numeric: fillerWordCount, assessment: `${fillerWordCount} filler words detected`, suggestions: ["Practice pausing instead of filler words"], effect: "Affects perceived expertise" },
  });
}

export async function analyzeScriptFeedback(transcript: string, segments: Array<{ start: number; end: number; text: string }>): Promise<object> {
  const first15sec = segments.filter(s => s.start <= 15).map(s => s.text).join(" ");
  const response = await callOpenAI({
    model: "gpt-4o",
    max_completion_tokens: 2000,
    messages: [{
      role: "user",
      content: `You are a professional video script coach. Analyze this transcript and return STRICT JSON only.

Full transcript: "${transcript.substring(0, 2500)}"
Opening (first 15s): "${first15sec}"

Return:
{
  "hookSuggestions": ["3 alternative opening hooks that grab attention in the first 3 seconds"],
  "weakSections": [
    {"text": "exact quote from transcript", "reason": "why it's weak", "replacement": "improved version"}
  ],
  "improvedScript": "rewritten version of the full script with stronger hook, better flow, and removed filler"
}`,
    }],
  });
  return parseJson(response.choices[0]?.message?.content ?? "{}", {
    hookSuggestions: ["Start with a bold question", "Show the end result first", "Use a surprising statistic"],
    weakSections: [],
    improvedScript: transcript,
  });
}

// ─── Timestamp helpers ────────────────────────────────────────────────────────

function fmtSecs(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function normText(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Find the transcript segment whose text best matches a given AI-returned snippet.
 * Returns the segment and a confidence level based on word-overlap score.
 */
function matchTextToSegment(
  snippet: string,
  segments: Array<{ start: number; end: number; text: string }>
): { segment: typeof segments[0]; confidence: "high" | "medium" | "low" } | null {
  const normSnippet = normText(snippet);
  if (!normSnippet || segments.length === 0) return null;

  let bestScore = 0;
  let bestSeg: typeof segments[0] | null = null;

  for (const seg of segments) {
    const normSeg = normText(seg.text);
    let score = 0;

    if (normSeg.includes(normSnippet) || normSnippet.includes(normSeg)) {
      score = Math.min(normSnippet.length, normSeg.length) / Math.max(normSnippet.length, normSeg.length);
    } else {
      const snippetWords = new Set(normSnippet.split(/\s+/).filter(Boolean));
      const segWords = normSeg.split(/\s+/).filter(Boolean);
      const overlap = segWords.filter(w => snippetWords.has(w)).length;
      score = overlap / Math.max(snippetWords.size, segWords.length);
    }

    if (score > bestScore) {
      bestScore = score;
      bestSeg = seg;
    }
  }

  if (!bestSeg || bestScore < 0.3) return null;
  const confidence: "high" | "medium" | "low" = bestScore >= 0.8 ? "high" : bestScore >= 0.5 ? "medium" : "low";
  return { segment: bestSeg, confidence };
}

/**
 * Detect silences in an audio file using ffmpeg's silencedetect filter.
 * Returns an array of {start, end} in seconds. Silent errors return [].
 */
async function detectSilences(
  audioPath: string,
  minDurationSec = 0.8,
  noiseDb = -30
): Promise<Array<{ start: number; end: number }>> {
  try {
    const { stderr } = await execAsync(
      `ffmpeg -i "${audioPath}" -af silencedetect=n=${noiseDb}dB:d=${minDurationSec} -f null - 2>&1 || true`
    );
    const silences: Array<{ start: number; end: number }> = [];
    const endMatches = [...stderr.matchAll(/silence_end: ([\d.]+)/g)];
    let ei = 0;
    for (const m of stderr.matchAll(/silence_start: ([\d.]+)/g)) {
      const start = parseFloat(m[1]);
      const end = parseFloat(endMatches[ei]?.[1] ?? "0");
      if (end > start) silences.push({ start, end });
      ei++;
    }
    return silences;
  } catch {
    return [];
  }
}

/**
 * Analyze editing points — hooks, removable sections, short clips, and tips.
 *
 * Key rule: OpenAI NEVER generates timestamps. All timestamps come from:
 *   - Whisper segment data (hooks matched by text, filler words by segment)
 *   - ffmpeg silence detection (remove sections)
 *   - Grouped Whisper chunks (short video candidates)
 */
export async function analyzeEditingPoints(
  transcript: string,
  segments: Array<{ start: number; end: number; text: string }>,
  audioPath?: string
): Promise<object> {
  const lastSeg = segments[segments.length - 1];
  const totalDuration = lastSeg?.end ?? 0;

  // ── STEP 1: AI returns hook TEXT snippets (NOT timestamps) ────────────────
  const hookResponse = await callOpenAI({
    model: "gpt-4o",
    max_completion_tokens: 1000,
    messages: [{
      role: "user",
      content: `You are a video editor identifying attention-grabbing moments. Read this transcript and copy 2–4 exact sentences or phrases that work best as hooks (attention-grabbing, surprising, or high-value).

IMPORTANT: Copy the text EXACTLY as it appears in the transcript. Do NOT invent timestamps.

Transcript: "${transcript.substring(0, 3000)}"

Return STRICT JSON only:
{
  "hookTexts": ["exact sentence from transcript", "another exact phrase"],
  "editingSuggestions": ["specific editing tip 1","tip 2","tip 3","tip 4","tip 5"]
}`,
    }],
  });

  const hookData = parseJson<{ hookTexts: string[]; editingSuggestions: string[] }>(
    hookResponse.choices[0]?.message?.content ?? "{}",
    { hookTexts: [], editingSuggestions: [] }
  );

  // Map AI text snippets → real Whisper timestamps
  const hooks = hookData.hookTexts
    .map((hookText) => {
      const match = matchTextToSegment(hookText, segments);
      if (!match) return null;
      return {
        text: hookText,
        start: fmtSecs(match.segment.start),
        end: fmtSecs(match.segment.end),
        reason: "Strong hook moment identified from transcript",
        confidence: match.confidence,
      };
    })
    .filter(Boolean);

  // ── STEP 2: Remove sections — real data only, no AI timestamps ────────────
  const removeSections: Array<{ start: string; end: string; reason: string }> = [];

  // 2a: Filler-word segments from Whisper timestamps
  const fillerRx = /\b(um+|uh+|er+|ah+|hmm+|like|you know|basically)\b/gi;
  for (const seg of segments) {
    fillerRx.lastIndex = 0;
    if (fillerRx.test(seg.text) && seg.end - seg.start <= 4) {
      removeSections.push({
        start: fmtSecs(seg.start),
        end: fmtSecs(seg.end),
        reason: `Filler words: "${seg.text.trim()}"`,
      });
    }
  }

  // 2b: Silence gaps from ffmpeg (only if audio file path is provided)
  if (audioPath) {
    const silences = await detectSilences(audioPath);
    for (const s of silences) {
      if (!removeSections.some(r => r.start === fmtSecs(s.start))) {
        removeSections.push({
          start: fmtSecs(s.start),
          end: fmtSecs(s.end),
          reason: "Silence gap detected",
        });
      }
    }
    // Sort by start time
    removeSections.sort((a, b) => a.start.localeCompare(b.start));
  }

  // ── STEP 3: Short video candidates — chunk-based, timestamps from Whisper ──
  const shortVideos: Array<{ start: string; end: string; title?: string; reason: string; confidence: string }> = [];

  if (totalDuration > 90 && segments.length > 0) {
    const CHUNK_SEC = 22; // ~20-25 second chunks
    const chunks: Array<{ start: number; end: number; texts: string[]; index: number }> = [];
    let chunkStart = segments[0].start;
    let chunkTexts: string[] = [];
    let chunkEnd = segments[0].end;

    for (const seg of segments) {
      if (seg.start - chunkStart > CHUNK_SEC && chunkTexts.length > 0) {
        chunks.push({ start: chunkStart, end: chunkEnd, texts: chunkTexts, index: chunks.length });
        chunkStart = seg.start;
        chunkTexts = [];
      }
      chunkTexts.push(seg.text);
      chunkEnd = seg.end;
    }
    if (chunkTexts.length > 0) {
      chunks.push({ start: chunkStart, end: chunkEnd, texts: chunkTexts, index: chunks.length });
    }

    if (chunks.length >= 2) {
      const chunkSummaries = chunks.map(c => ({
        index: c.index,
        durationSec: Math.round(c.end - c.start),
        text: c.texts.join(" ").substring(0, 200),
      }));

      const shortVideoResponse = await callOpenAI({
        model: "gpt-4o-mini",
        max_completion_tokens: 600,
        messages: [{
          role: "user",
          content: `You are a short-form video editor. Review these ${CHUNK_SEC}-second transcript chunks and identify which ones would work well as standalone short videos (complete idea, engaging, no abrupt start/end).

Chunks: ${JSON.stringify(chunkSummaries)}

Return STRICT JSON — only use the provided index numbers, do NOT invent timestamps:
{"goodChunks":[{"index":0,"title":"short title","reason":"why it works as a short video"}]}`,
        }],
      });

      const shortData = parseJson<{ goodChunks: Array<{ index: number; title?: string; reason: string }> }>(
        shortVideoResponse.choices[0]?.message?.content ?? "{}",
        { goodChunks: [] }
      );

      for (const gc of shortData.goodChunks) {
        const chunk = chunks[gc.index];
        if (!chunk) continue;
        shortVideos.push({
          start: fmtSecs(chunk.start),
          end: fmtSecs(chunk.end),
          title: gc.title,
          reason: gc.reason,
          confidence: "high",
        });
      }
    }
  }

  // ── FINAL SAFETY CLAMP — filter/fix anything beyond actual video length ──────
  function parseTs(ts: string): number {
    const parts = ts.split(":").map(Number);
    return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
  }

  function clampTs(ts: string): string {
    if (!totalDuration) return ts;
    const secs = Math.min(parseTs(ts), totalDuration);
    return fmtSecs(secs);
  }

  const clampedHooks = totalDuration
    ? hooks.filter(h => h && parseTs(h!.start) < totalDuration)
        .map(h => h ? { ...h, start: clampTs(h.start), end: clampTs(h.end) } : h)
    : hooks;

  const clampedRemovals = totalDuration
    ? removeSections.filter(s => parseTs(s.start) < totalDuration)
        .map(s => ({ ...s, end: clampTs(s.end) }))
    : removeSections;

  const clampedShortVideos = totalDuration
    ? shortVideos.filter(sv => parseTs(sv.start) < totalDuration)
        .map(sv => ({ ...sv, end: clampTs(sv.end) }))
    : shortVideos;

  return {
    hooks: clampedHooks,
    removeSections: clampedRemovals.slice(0, 12),
    shortVideos: clampedShortVideos,
    editingSuggestions: hookData.editingSuggestions?.length
      ? hookData.editingSuggestions
      : [
          "Cut pauses longer than 1.5 seconds",
          "Start with the strongest hook",
          "Remove filler word segments shown above",
          "End with a clear call to action",
          "Keep intro under 15 seconds",
        ],
  };
}

/**
 * Generate real chapter timestamps from Whisper segments by sampling at ~10 evenly-spaced
 * points across the video — avoids AI hallucinating times beyond video length.
 */
function buildChapterPoints(
  segments: Array<{ start: number; end: number; text: string }>,
  maxChapters = 10
): Array<{ time: string; text: string; start: number }> {
  if (!segments.length) return [];
  const totalDur = segments[segments.length - 1]!.end;
  const interval = totalDur / Math.min(maxChapters, segments.length);
  const chapters: Array<{ time: string; text: string; start: number }> = [];
  let nextTarget = 0;

  for (const seg of segments) {
    if (seg.start >= nextTarget) {
      chapters.push({
        start: seg.start,
        time: fmtSecs(seg.start),
        text: seg.text.trim().substring(0, 80),
      });
      nextTarget = seg.start + interval;
    }
    if (chapters.length >= maxChapters) break;
  }
  // Ensure first chapter is always 00:00
  if (chapters.length && chapters[0]!.start > 0) {
    chapters.unshift({ start: 0, time: "0:00", text: segments[0]!.text.trim().substring(0, 80) });
  }
  return chapters;
}

export async function generateSeo(
  transcript: string,
  platform: string,
  segments: Array<{ start: number; end: number; text: string }> = []
): Promise<object> {
  const hashtagCounts: Record<string, number> = {
    youtube_long: 15, youtube_shorts: 10, tiktok: 8, instagram: 12, linkedin: 5, x: 3,
  };
  const count = hashtagCounts[platform] || 8;

  // Build chapter points from REAL segment timestamps (no hallucination)
  const chapterPoints = buildChapterPoints(segments, 10);
  const chapterHint = chapterPoints.length
    ? `\n\nReal chapter timestamps (use EXACTLY these times, only change "label"):\n${chapterPoints.map(c => `${c.time} — "${c.text}"`).join("\n")}`
    : "";

  const response = await callOpenAI({
    model: "gpt-4o",
    max_completion_tokens: 1800,
    messages: [{ role: "user", content: `SEO expert for ${platform}. Transcript: "${transcript.substring(0, 1500)}". Generate ${count} hashtags.${chapterHint}

Return STRICT JSON — use the EXACT times provided above for timestamps, only write short labels:
{"titles":["title 1","title 2","title 3"],"description":"full optimized description","hashtags":[{"tag":"#Tag","effect":"reaches X audience"}],"timestamps":[{"time":"0:00","label":"Introduction"}]}` }],
  });

  const parsed = parseJson<{ titles: string[]; description: string; hashtags: object[]; timestamps: Array<{ time: string; label: string }> }>(
    response.choices[0]?.message?.content ?? "{}",
    {
      titles: ["Engaging title for your video", "Alternative title with keywords", "Third option"],
      description: "Video description with keywords and call to action.",
      hashtags: [{ tag: "#VideoContent", effect: "Broad reach" }],
      timestamps: [{ time: "0:00", label: "Introduction" }],
    }
  );

  // Override timestamps with real positions — AI may have ignored our hint
  if (chapterPoints.length) {
    parsed.timestamps = parsed.timestamps.map((t, i) => ({
      time: chapterPoints[i]?.time ?? t.time,
      label: t.label,
    }));
  }

  return parsed;
}

export async function translateSegments(
  segments: Array<{ start: number; end: number; text: string }>,
  targetLanguage: string
): Promise<Array<{ start: number; end: number; text: string }>> {
  const texts = segments.map(s => s.text).join("\n---\n");
  const response = await callOpenAI({
    model: "gpt-4o-mini",
    max_completion_tokens: 4000,
    messages: [{ role: "user", content: `Translate to ${targetLanguage}. Keep segments separated by ---. Return ONLY translated text:\n\n${texts}` }],
  });
  const content = response.choices[0]?.message?.content ?? "";
  const translated = content.split("---").map(t => t.trim()).filter(Boolean);
  return segments.map((seg, i) => ({ start: seg.start, end: seg.end, text: translated[i] || seg.text }));
}

export function computeQualityScore(visualAnalysis: object, audioAnalysis: object): number {
  const visual = visualAnalysis as Record<string, { numeric?: number }>;
  const audio = audioAnalysis as Record<string, { numeric?: number }>;
  const metrics = [
    visual.lighting?.numeric ?? 70, visual.brightness?.numeric ?? 70,
    visual.sharpness?.numeric ?? 70, visual.stability?.numeric ?? 70,
    visual.background?.numeric ?? 70, visual.framing?.numeric ?? 70,
    audio.audioClarity?.numeric ?? 70, audio.audioVolume?.numeric ?? 70,
  ];
  metrics.push(Math.max(0, 100 - (audio.fillerWords?.numeric ?? 0) * 5));
  metrics.push(Math.max(0, 100 - (audio.backgroundNoise?.numeric ?? 20)));
  return Math.round(Math.max(0, Math.min(100, metrics.reduce((a, b) => a + b, 0) / metrics.length)));
}

export { logger };
