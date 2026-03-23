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

export function buildApproximateSegments(text: string): Array<{ start: number; end: number; text: string }> {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const wordsPerSecond = 2.5;
  let currentTime = 0;
  return sentences.map((sentence) => {
    const wordCount = sentence.trim().split(/\s+/).length;
    const duration = wordCount / wordsPerSecond;
    const start = currentTime;
    const end = currentTime + duration;
    currentTime = end;
    return { start: Math.round(start * 10) / 10, end: Math.round(end * 10) / 10, text: sentence.trim() };
  });
}

export async function transcribeAudio(audioPath: string): Promise<{ text: string; segments: Array<{ start: number; end: number; text: string }> }> {
  const audioBuffer = await fs.readFile(audioPath);
  try {
    const result = await speechToTextVerbose(audioBuffer, "mp3");
    if (result.segments.length > 0) return result;
    return { text: result.text, segments: buildApproximateSegments(result.text) };
  } catch {
    const fullText = await speechToText(audioBuffer, "mp3");
    return { text: fullText, segments: buildApproximateSegments(fullText) };
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
export async function extractFrames(videoPath: string, framesDir: string): Promise<string[]> {
  await execAsync(
    `ffmpeg -i "${videoPath}" -vf "select=lt(n\\,10)" -vsync vfr "${framesDir}/frame_%03d.jpg" -y`
  );
  const files = await fs.readdir(framesDir);
  const jpgs = files.filter(f => f.endsWith(".jpg")).sort().slice(0, 10);
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

export async function analyzeEditingPoints(transcript: string, segments: Array<{ start: number; end: number; text: string }>): Promise<object> {
  const fillerPattern = /\b(um+|uh+|er+|ah+|like|you know|basically)\b/gi;
  const lastSeg = segments[segments.length - 1];
  const totalDuration = lastSeg?.end ?? 0;

  const response = await callOpenAI({
    model: "gpt-4o",
    max_completion_tokens: 2500,
    messages: [{
      role: "user",
      content: `You are a professional video editor. Analyze this transcript with timestamps and return STRICT JSON only.

Transcript with timestamps (JSON array): ${JSON.stringify(segments.slice(0, 60))}
Full transcript: "${transcript.substring(0, 2000)}"
Total duration: ${Math.round(totalDuration)}s
Video is ${totalDuration > 90 ? "long-form (>90s)" : "short-form (≤90s)"}

Return:
{
  "hooks": [{"start":"MM:SS","end":"MM:SS","reason":"why this is a strong hook moment"}],
  "removeSections": [{"start":"MM:SS","end":"MM:SS","reason":"filler/pause/repetition/off-topic"}],
  "shortVideos": ${totalDuration > 90 ? '[{"start":"MM:SS","end":"MM:SS","title":"...","reason":"best standalone segment"}]' : '[]'},
  "editingSuggestions": ["actionable editing tip 1","tip 2","tip 3","tip 4","tip 5"]
}

Format timestamps as MM:SS (e.g. "01:23"). Only suggest real timestamps from the transcript.`,
    }],
  });
  const fallback = {
    hooks: segments.slice(0, 2).map(s => ({ start: "00:00", end: "00:05", reason: "Strong opening moment" })),
    removeSections: [],
    shortVideos: [],
    editingSuggestions: ["Cut any pauses longer than 2 seconds", "Start with the strongest hook", "Remove filler words", "End with a clear CTA", "Keep intro under 15 seconds"],
  };
  return parseJson(response.choices[0]?.message?.content ?? "{}", fallback);
}

export async function generateSeo(transcript: string, platform: string): Promise<object> {
  const hashtagCounts: Record<string, number> = {
    youtube_long: 15, youtube_shorts: 10, tiktok: 8, instagram: 12, linkedin: 5, x: 3,
  };
  const count = hashtagCounts[platform] || 8;

  const response = await callOpenAI({
    model: "gpt-4o",
    max_completion_tokens: 1500,
    messages: [{ role: "user", content: `SEO expert for ${platform}. Transcript: "${transcript.substring(0, 1500)}". Generate ${count} hashtags. Return STRICT JSON:
{"titles":["title 1","title 2","title 3"],"description":"full optimized description","hashtags":[{"tag":"#Tag","effect":"reaches X audience"}],"timestamps":[{"time":"00:00","label":"Introduction"}]}` }],
  });
  return parseJson(response.choices[0]?.message?.content ?? "{}", {
    titles: ["Engaging title for your video", "Alternative title with keywords", "Third option"],
    description: "Video description with keywords and call to action.",
    hashtags: [{ tag: "#VideoContent", effect: "Broad reach" }],
    timestamps: [{ time: "00:00", label: "Introduction" }],
  });
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
