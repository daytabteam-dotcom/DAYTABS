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
  const actualDuration = await getMediaDuration(audioPath);

  try {
    const result = await speechToTextVerbose(audioBuffer, "mp3");
    if (result.segments.length > 0) {
      if (actualDuration > 0) {
        result.segments = result.segments.map(s => ({
          ...s,
          start: Math.min(s.start, actualDuration),
          end: Math.min(s.end, actualDuration),
        }));
      }
      return result;
    }
    if (result.text) {
      return { text: result.text, segments: buildApproximateSegments(result.text, actualDuration) };
    }
  } catch (err) {
    logger.warn({ err }, "speechToTextVerbose failed, trying basic transcription");
  }

  try {
    const text = await speechToText(audioBuffer, "mp3");
    if (text) return { text, segments: buildApproximateSegments(text, actualDuration) };
  } catch (err) {
    logger.warn({ err }, "Basic speechToText also failed");
  }

  return { text: "", segments: [] };
}

export async function extractAudio(videoPath: string, outputPath: string): Promise<void> {
  await execAsync(`ffmpeg -i "${videoPath}" -vn -ar 16000 -ac 1 -c:a libmp3lame -q:a 4 "${outputPath}" -y`);
}

export async function compressVideo(inputPath: string, outputPath: string): Promise<void> {
  await execAsync(
    `ffmpeg -i "${inputPath}" -vf scale=640:-2 -crf 32 -preset veryfast "${outputPath}" -y`
  );
}

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

  const prompt = `You are a professional video quality consultant who has reviewed 10,000+ videos for YouTube and social media. You are direct, specific, and give zero generic advice.

Analyze these frames from a ${platform} video. For each dimension:
- Score 0-100 based on what you actually see
- Give one-line reasoning that references specifics (e.g. "overexposed top-right corner", "camera drifts left at frame 3", "subject too far from lens")
- For suggestions: give the exact fix, not vague advice. Say "Move the key light 45 degrees to camera right" not "improve your lighting"
- Lead your overall assessment with the SINGLE most important fix that will have the biggest viewer retention impact

Return STRICT JSON only (no markdown, no explanation):
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
    messages: [{ role: "user", content: `You are a professional audio engineer and presentation coach. Analyze this transcript for audio and delivery quality. Be specific — reference actual words or patterns you detect, not generic advice.

Transcript snippet: "${transcript.substring(0, 500)}"
Filler word count: ${fillerWordCount} out of ${wordCount} words (${Math.round(fillerRatio * 100)}%)
Whisper transcription confidence: ${clarityNumeric}%

Return STRICT JSON only:
{"audioVolume":{"level":"low/medium/high","numeric":0-100,"assessment":"...","suggestions":["..."],"effect":"..."},"audioClarity":{"level":"poor/acceptable/good","numeric":${clarityNumeric},"assessment":"...","suggestions":["..."],"effect":"..."},"backgroundNoise":{"level":"high/medium/low","numeric":0-100,"assessment":"...","suggestions":["..."],"effect":"..."},"fillerWords":{"level":"${fillerLevel}","numeric":${fillerWordCount},"assessment":"${fillerWordCount} filler words detected (${Math.round(fillerRatio * 100)}% of speech)","suggestions":["..."],"effect":"..."}}` }],
  });
  return parseJson(response.choices[0]?.message?.content ?? "{}", {
    audioVolume: { level: "medium", numeric: 72, assessment: "Adequate volume", suggestions: [], effect: "Clear dialogue" },
    audioClarity: { level: clarityNumeric > 80 ? "good" : "acceptable", numeric: clarityNumeric, assessment: "Intelligible speech", suggestions: [], effect: "Good comprehension" },
    backgroundNoise: { level: "low", numeric: 20, assessment: "Minimal noise", suggestions: [], effect: "Clear audio" },
    fillerWords: { level: fillerLevel, numeric: fillerWordCount, assessment: `${fillerWordCount} filler words detected`, suggestions: ["Pause instead of filler words"], effect: "Affects perceived expertise" },
  });
}

export async function analyzeScriptFeedback(transcript: string, segments: Array<{ start: number; end: number; text: string }>): Promise<object> {
  const first15sec = segments.filter(s => s.start <= 15).map(s => s.text).join(" ");
  const response = await callOpenAI({
    model: "gpt-4o",
    max_completion_tokens: 2000,
    messages: [{
      role: "user",
      content: `You are a senior YouTube consultant who has worked with 500+ creators across all niches. You give brutally honest, specific feedback. No filler. No encouragement. No "Great start!" No "You could try...". You say what needs to change and show exactly how to change it.

Full transcript: "${transcript.substring(0, 2500)}"
First 15 seconds: "${first15sec}"

Evaluate:
1. HOOK (first 30 seconds): Does it create a curiosity gap, pattern interrupt, or bold claim? Call out exactly what fails and why. Give 3 alternative hooks that would outperform it.
2. WEAK SECTIONS: Find 2-4 moments where the viewer would drop off. Quote the exact phrase. Give a direct replacement, not a suggestion.
3. IMPROVED SCRIPT: Rewrite the full script keeping the creator's authentic voice. Cut every word that doesn't earn its place. Strengthen every transition. Make the hook land harder.

Return STRICT JSON only:
{
  "hookSuggestions": ["hook 1 — opens with a curiosity gap or pattern interrupt", "hook 2", "hook 3"],
  "weakSections": [
    {"text": "exact quote from transcript", "reason": "specific reason viewer drops off here", "replacement": "improved version that keeps them watching"}
  ],
  "improvedScript": "full rewritten script with stronger hook, tighter flow, no filler"
}`,
    }],
  });
  return parseJson(response.choices[0]?.message?.content ?? "{}", {
    hookSuggestions: ["Open with the most surprising result or outcome", "Ask a question the viewer is already thinking", "Make a bold claim that challenges conventional wisdom"],
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

export async function analyzeEditingPoints(
  transcript: string,
  segments: Array<{ start: number; end: number; text: string }>,
  audioPath?: string
): Promise<object> {
  const lastSeg = segments[segments.length - 1];
  const totalDuration = lastSeg?.end ?? 0;

  const hookResponse = await callOpenAI({
    model: "gpt-4o",
    max_completion_tokens: 1000,
    messages: [{
      role: "user",
      content: `You are a professional video editor who has cut 3,000+ YouTube videos. You are surgical and specific.

Read this transcript. Identify 2-4 moments that would stop a scroll — your strongest openings, unexpected reveals, punchlines, or contrarian takes. Copy the EXACT text from the transcript.

Then give 5 specific editing suggestions. Not "improve pacing". Give actionable notes like "The setup at 0:45 is 30 seconds longer than it needs to be — cut to the punchline immediately" or "Hook lands too late — move the reveal at 2:10 to the first 15 seconds". Reference platform best practices where relevant (TikTok hooks in 2 seconds, YouTube retention cliff at 30%).

CRITICAL: Copy text EXACTLY as written. Do NOT invent timestamps.

Transcript: "${transcript.substring(0, 3000)}"

Return STRICT JSON only:
{
  "hookTexts": ["exact sentence from transcript", "another exact phrase"],
  "editingSuggestions": ["specific tip referencing the actual content","tip 2","tip 3","tip 4","tip 5"]
}`,
    }],
  });

  const hookData = parseJson<{ hookTexts: string[]; editingSuggestions: string[] }>(
    hookResponse.choices[0]?.message?.content ?? "{}",
    { hookTexts: [], editingSuggestions: [] }
  );

  const hooks = hookData.hookTexts
    .map((hookText) => {
      const match = matchTextToSegment(hookText, segments);
      if (!match) return null;
      return {
        text: hookText,
        start: fmtSecs(match.segment.start),
        end: fmtSecs(match.segment.end),
        reason: "High-value hook moment",
        confidence: match.confidence,
      };
    })
    .filter(Boolean);

  const removeSections: Array<{ start: string; end: string; reason: string }> = [];

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

  if (audioPath) {
    const silences = await detectSilences(audioPath);
    for (const s of silences) {
      if (!removeSections.some(r => r.start === fmtSecs(s.start))) {
        removeSections.push({
          start: fmtSecs(s.start),
          end: fmtSecs(s.end),
          reason: `Dead air / silence gap (${(s.end - s.start).toFixed(1)}s)`,
        });
      }
    }
  }

  const shortVideos: Array<{ start: string; end: string; title?: string; reason: string; confidence: string }> = [];
  const CHUNK_SEC = 60;

  if (segments.length >= 2) {
    type Chunk = { start: number; end: number; texts: string[]; index: number };
    const chunks: Chunk[] = [];
    let chunkStart = segments[0]!.start;
    let chunkEnd = segments[0]!.start;
    let chunkTexts: string[] = [];

    for (const seg of segments) {
      if (seg.start - chunkStart >= CHUNK_SEC && chunkTexts.length > 0) {
        chunks.push({ start: chunkStart, end: chunkEnd, texts: chunkTexts, index: chunks.length });
        chunkStart = seg.start;
        chunkEnd = seg.start;
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
          content: `You are a short-form video strategist. Review these ${CHUNK_SEC}-second transcript chunks. Identify which ones work as standalone short videos (complete idea, natural start/end, no abrupt cut).

Chunks: ${JSON.stringify(chunkSummaries)}

Return STRICT JSON using ONLY the provided index numbers — no invented timestamps:
{"goodChunks":[{"index":0,"title":"short punchy title","reason":"why this works as a standalone short"}]}`,
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
          "Cut pauses longer than 1.5 seconds for tighter pacing",
          "Move your strongest moment to within the first 30 seconds",
          "Remove filler word segments shown in the cut list above",
          "End with a clear CTA — tell them exactly what to do next",
          "Your hook needs to land before 15 seconds on YouTube",
        ],
  };
}

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

  const chapterPoints = buildChapterPoints(segments, 10);
  const chapterHint = chapterPoints.length
    ? `\n\nReal chapter timestamps (use EXACTLY these times, only write short labels):\n${chapterPoints.map(c => `${c.time} - "${c.text}"`).join("\n")}`
    : "";

  const platformGuide: Record<string, string> = {
    youtube_long: "YouTube long-form: titles 60-70 chars, curiosity gap required, keyword in first 3 words",
    youtube_shorts: "YouTube Shorts: punchy titles under 50 chars, high-energy action verbs",
    tiktok: "TikTok: trend-aware, conversational, 3-5 hashtags from trending niches",
    instagram: "Instagram Reels: lifestyle-forward, mix of niche and broad hashtags",
    linkedin: "LinkedIn: professional framing, thought leadership angle, low hashtag count",
    x: "X/Twitter: max 2-3 hashtags, punchy and opinionated",
  };

  const guide = platformGuide[platform] ?? "";

  const response = await callOpenAI({
    model: "gpt-4o",
    max_completion_tokens: 1800,
    messages: [{ role: "user", content: `You are a ${platform} SEO expert who has helped channels grow from 0 to 100K through search. You write titles that create curiosity gaps, not summaries.

Platform rules: ${guide}

Transcript: "${transcript.substring(0, 1500)}"${chapterHint}

Title rules:
- NEVER write generic titles like "How to [thing]" or "My experience with [topic]"
- Every title must contain the primary keyword naturally in the first 3 words
- Format: [keyword] + curiosity gap, contrarian angle, or specific outcome

Tag rules:
- 40% high-volume tags (broad niche, 1M+ searches)
- 40% mid-volume tags (specific subtopic, 100K-1M)
- 20% niche/long-tail tags (very specific, 10K-100K)

Return STRICT JSON — use EXACT times from chapter list above:
{"titles":["title 1","title 2","title 3"],"description":"2-line hook + body + CTA. First 2 lines must be the hook (visible in search preview).","hashtags":[{"tag":"#Tag","effect":"target audience or reach this tag serves"}],"timestamps":[{"time":"0:00","label":"short label"}]}` }],
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

  if (chapterPoints.length) {
    parsed.timestamps = parsed.timestamps.map((t, i) => ({
      time: chapterPoints[i]?.time ?? t.time,
      label: t.label,
    }));
  }

  return parsed;
}

export async function generateShortClipIdeas(
  transcript: string,
  segments: Array<{ start: number; end: number; text: string }>,
  platforms: string[]
): Promise<object> {
  if (!segments.length) return { clips: [] };

  const totalDuration = segments[segments.length - 1]!.end;

  const platformLabels: Record<string, string> = {
    youtube_long: "YouTube Long",
    youtube_shorts: "YouTube Shorts",
    tiktok: "TikTok",
    instagram: "Instagram Reels",
    linkedin: "LinkedIn",
    x: "X/Twitter",
  };

  const targetPlatformList = platforms.map(p => platformLabels[p] ?? p).join(", ");

  const CHUNK_SEC = 90;
  type Chunk = { start: number; end: number; text: string; index: number };
  const chunks: Chunk[] = [];
  let chunkStart = segments[0]!.start;
  let chunkEnd = segments[0]!.start;
  let chunkText = "";

  for (const seg of segments) {
    if (seg.start - chunkStart >= CHUNK_SEC && chunkText) {
      chunks.push({ start: chunkStart, end: chunkEnd, text: chunkText, index: chunks.length });
      chunkStart = seg.start;
      chunkEnd = seg.start;
      chunkText = "";
    }
    chunkText += " " + seg.text;
    chunkEnd = seg.end;
  }
  if (chunkText) {
    chunks.push({ start: chunkStart, end: chunkEnd, text: chunkText.trim(), index: chunks.length });
  }

  const chunkSummaries = chunks.map(c => ({
    index: c.index,
    startSec: Math.round(c.start),
    endSec: Math.round(c.end),
    durationSec: Math.round(c.end - c.start),
    preview: c.text.trim().substring(0, 250),
  }));

  const response = await callOpenAI({
    model: "gpt-4o",
    max_completion_tokens: 1500,
    messages: [{
      role: "user",
      content: `You are a short-form content strategist who has helped 500+ creators repurpose long videos into viral clips. You know exactly what makes people stop scrolling.

Target platforms: ${targetPlatformList}
Total video duration: ${Math.round(totalDuration)}s

Below are the video chunks. For each high-value clip moment:
- Identify the best 3-5 clips that would perform on short-form platforms
- For each clip: find the chunk it's in, identify the first line that would work as an on-screen hook
- State which platforms fit and WHY (e.g. "TikTok: contrarian take performs in first 2 seconds")
- Give ONE tactical production note that increases performance (e.g. "Add captions — 85% of Reels are watched muted", "Cut to the punchline at 1:23 — the setup is 20 seconds too long")

CRITICAL: Use ONLY the index numbers provided. Do NOT invent startSec/endSec — use the provided values.

Chunks: ${JSON.stringify(chunkSummaries)}

Return STRICT JSON:
{
  "clips": [
    {
      "chunkIndex": 0,
      "startSec": 45,
      "endSec": 105,
      "title": "punchy title for this clip",
      "hook": "first line / on-screen text that stops the scroll",
      "platforms": ["TikTok", "Instagram Reels"],
      "platformReason": "why these platforms specifically",
      "tacticalNote": "one specific production tip to increase performance",
      "rewatchability": "high/medium/low"
    }
  ]
}`,
    }],
  });

  const raw = parseJson<{ clips: Array<Record<string, unknown>> }>(
    response.choices[0]?.message?.content ?? "{}",
    { clips: [] }
  );

  function fmtSec(s: number): string {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }

  const clips = (raw.clips ?? []).map(clip => {
    const chunkIdx = typeof clip.chunkIndex === "number" ? clip.chunkIndex : 0;
    const chunk = chunks[chunkIdx];
    const startSec = typeof clip.startSec === "number" ? Math.max(chunk?.start ?? 0, clip.startSec) : (chunk?.start ?? 0);
    const endSec = typeof clip.endSec === "number" ? Math.min(chunk?.end ?? totalDuration, clip.endSec) : (chunk?.end ?? totalDuration);
    return {
      start: fmtSec(Math.min(startSec, totalDuration)),
      end: fmtSec(Math.min(endSec, totalDuration)),
      title: clip.title ?? "",
      hook: clip.hook ?? "",
      platforms: Array.isArray(clip.platforms) ? clip.platforms : [],
      platformReason: clip.platformReason ?? "",
      tacticalNote: clip.tacticalNote ?? "",
      rewatchability: clip.rewatchability ?? "medium",
    };
  });

  return { clips };
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
