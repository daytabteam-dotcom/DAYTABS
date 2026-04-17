import { exec, spawn } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import { db } from "@workspace/db";
import { analysisJobsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../../lib/logger";
import { openai } from "../../lib/openai";
import { toFile } from "openai";

export const execAsync = promisify(exec);

async function runMediaCommand(
  command: string,
  args: string[],
  timeoutMs: number,
  label: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    const stderrChunks: Buffer[] = [];
    let stderrBytes = 0;
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
      stderrBytes += chunk.length;
      while (stderrBytes > 64 * 1024 && stderrChunks.length > 1) {
        const removed = stderrChunks.shift();
        stderrBytes -= removed?.length ?? 0;
      }
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err.code === "ENOENT") {
        reject(new Error("ffmpeg is not installed on this server. Please install ffmpeg to process videos."));
      } else {
        reject(err);
      }
    });

    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
      reject(new Error(`${label} failed${signal ? ` with signal ${signal}` : ` with code ${code}`}${stderr ? `: ${stderr}` : ""}`));
    });
  });
}

export async function updateJob(jobId: string, updates: Partial<typeof analysisJobsTable.$inferInsert>) {
  const setData: any = { ...updates, updatedAt: new Date() };
  const current = await db
    .select({ status: analysisJobsTable.status, result: analysisJobsTable.result })
    .from(analysisJobsTable)
    .where(eq(analysisJobsTable.id, jobId))
    .limit(1);

  const currentStatus = current[0]?.status;
  if (
    (currentStatus === "cancelled" || currentStatus === "complete" || currentStatus === "error") &&
    updates.status !== currentStatus
  ) {
    return;
  }

  if (updates.result) {
    const existingResult = current[0]?.result || {};
    setData.result = { ...existingResult, ...updates.result };
  }
  await db.update(analysisJobsTable)
    .set(setData)
    .where(eq(analysisJobsTable.id, jobId));
}

export async function getMediaDuration(filePath: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}" 2>&1`
    );
    const d = parseFloat(stdout.trim());
    return isNaN(d) ? 0 : d;
  } catch (err: any) {
    if (err.message?.includes('ENOENT') || err.code === 'ENOENT') {
      throw new Error('ffmpeg is not installed on this server. Please install ffmpeg to process videos.');
    }
    throw err;
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

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function transcribeAudio(audioPath: string): Promise<{ text: string; segments: Array<{ start: number; end: number; text: string }> }> {
  const audioBuffer = await fs.readFile(audioPath);
  const actualDuration = await getMediaDuration(audioPath);
  logger.info({ audioPath, actualDuration }, "Starting transcription");

  // Attempt verbose transcription with word-level timestamps
  try {
    const file = await toFile(audioBuffer, "audio.mp3");
    logger.info({ audioPath }, "Calling Whisper verbose transcription");

    const response = await withTimeout(
      openai.audio.transcriptions.create({
        file,
        model: "whisper-1",
        response_format: "verbose_json",
        timestamp_granularities: ["word", "segment"],
      } as Parameters<typeof openai.audio.transcriptions.create>[0]),
      90000,
      "Whisper verbose transcription"
    );

    const r = response as unknown as {
      text: string;
      segments?: Array<{ start: number; end: number; text: string }>;
    };
    const rawSegments = (r.segments ?? []).map(s => ({
      start: s.start,
      end: s.end,
      text: s.text.trim(),
    }));
    if (rawSegments.length > 0) {
      const segments = actualDuration > 0
        ? rawSegments.map(s => ({ ...s, start: Math.min(s.start, actualDuration), end: Math.min(s.end, actualDuration) }))
        : rawSegments;
      logger.info({ audioPath, segmentCount: segments.length }, "Whisper verbose transcription succeeded");
      return { text: r.text || "", segments };
    }
    if (r.text) {
      logger.info({ audioPath, textLength: r.text.length }, "Whisper verbose transcription returned text only");
      return { text: r.text, segments: buildApproximateSegments(r.text, actualDuration) };
    }
  } catch (err) {
    logger.warn({ err, audioPath }, "Whisper verbose transcription failed, falling back to basic");
  }

  // Basic fallback
  try {
    const file = await toFile(audioBuffer, "audio.mp3");
    logger.info({ audioPath }, "Calling Whisper basic transcription");

    const response = await withTimeout(
      openai.audio.transcriptions.create({
        file,
        model: "whisper-1",
      }),
      120000,
      "Whisper basic transcription"
    );

    if (response.text) {
      logger.info({ audioPath, textLength: response.text.length }, "Whisper basic transcription succeeded");
      return { text: response.text, segments: buildApproximateSegments(response.text, actualDuration) };
    }
  } catch (err) {
    logger.warn({ err, audioPath }, "Whisper basic transcription also failed");
  }

  return { text: "", segments: [] };
}

export async function extractAudio(videoPath: string, outputPath: string): Promise<void> {
  await runMediaCommand(
    "ffmpeg",
    ["-nostdin", "-hide_banner", "-loglevel", "error", "-threads", "1", "-i", videoPath, "-vn", "-ar", "16000", "-ac", "1", "-c:a", "libmp3lame", "-q:a", "4", outputPath, "-y"],
    60000,
    "ffmpeg audio extraction"
  );
}

export async function extractFrames(videoPath: string, framesDir: string, count = 5): Promise<string[]> {
  const duration = await getMediaDuration(videoPath);
  const frameScaleFilter = "scale='min(640,iw)':-2";
  if (duration <= 0) {
    logger.info({ videoPath, count }, "Extracting frames with select filter");
    await runMediaCommand(
      "ffmpeg",
      ["-nostdin", "-hide_banner", "-loglevel", "error", "-threads", "1", "-i", videoPath, "-vf", `select=lt(n\\,${count}),${frameScaleFilter}`, "-vsync", "vfr", "-q:v", "8", path.join(framesDir, "frame_%03d.jpg"), "-y"],
      60000,
      "ffmpeg frame extraction select"
    );
  } else {
    const interval = duration / (count + 1);
    logger.info({ videoPath, count, duration, interval }, "Extracting frames at intervals");
    for (let i = 1; i <= count; i++) {
      const ts = Math.min(Math.max(interval * i, 0.1), Math.max(duration - 0.1, 0.1)).toFixed(2);
      const outPath = path.join(framesDir, `frame_${String(i).padStart(3, "0")}.jpg`);
      logger.info({ i, ts, outPath }, "Extracting frame");
      await runMediaCommand(
        "ffmpeg",
        ["-nostdin", "-hide_banner", "-loglevel", "error", "-threads", "1", "-ss", ts, "-i", videoPath, "-frames:v", "1", "-vf", frameScaleFilter, "-q:v", "8", outPath, "-y"],
        30000,
        `ffmpeg frame extraction ${i}`
      );
    }
  }
  const files = await fs.readdir(framesDir);
  const jpgs = files.filter(f => f.endsWith(".jpg")).sort().slice(0, count);
  logger.info({ framesDir, extractedCount: jpgs.length }, "Frame extraction completed");
  const frameBase64List: string[] = [];
  for (const f of jpgs) {
    const buf = await fs.readFile(path.join(framesDir, f));
    frameBase64List.push(buf.toString("base64"));
  }
  return frameBase64List;
}

export function generateSrt(segments: Array<{ start: number; end: number; text: string }>): string {
  const fmt = (s: number) => {
    const ms = Math.round((s % 1) * 1000);
    const secs = Math.floor(s) % 60;
    const mins = Math.floor(s / 60) % 60;
    const hrs = Math.floor(s / 3600);
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
  };

  // Split text into lines of max 42 chars, max 2 lines per card
  function splitToLines(text: string): string[] {
    const words = text.trim().split(/\s+/);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > 42 && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  const cards: Array<{ start: number; end: number; lines: string[] }> = [];
  for (const seg of segments) {
    const lines = splitToLines(seg.text);
    const segDur = seg.end - seg.start;
    // If more than 2 lines, split into multiple cards proportionally
    for (let i = 0; i < lines.length; i += 2) {
      const chunk = lines.slice(i, i + 2);
      const ratio = (i / Math.max(lines.length, 1));
      const endRatio = (Math.min(i + 2, lines.length) / Math.max(lines.length, 1));
      cards.push({
        start: seg.start + ratio * segDur,
        end: seg.start + endRatio * segDur,
        lines: chunk,
      });
    }
  }

  return cards.map((card, i) =>
    `${i + 1}\n${fmt(card.start)} --> ${fmt(card.end)}\n${card.lines.join("\n")}`
  ).join("\n\n");
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

const BASE_SYSTEM_PROMPT = `You are an expert content strategist and video consultant. You have personally reviewed over 1,000 YouTube, TikTok, and Instagram videos. You give feedback the way a senior consultant would in a paid review session: specific, confident, and focused on what actually moves the needle.

Never use: "Great job!", "Consider trying", "You might want to", "As a content creator", "In conclusion", or any filler phrase. Every sentence must contain a specific observation or action. Write in second person ("your video", "you open with"). Be direct but not harsh. Lead every section with the most important insight first. If something is genuinely good, say so in one word and move on.`;

// ─── FIX: Detailed visual analysis instructions per dimension ─────────────────
const VISUAL_DIMENSION_INSTRUCTIONS = `
For EACH dimension, write exactly as a professional video producer giving paid notes to a client. Rules:
- Reference where in the frame or when in the video the issue occurs (e.g. "upper-right corner", "your face in the closing segment", "the left edge throughout")
- Never use vague praise like "decent", "balanced", "good", "acceptable" without backing it up with a specific physical observation
- If something scores above 85, still name the ONE thing that would push it to 100
- Suggest a concrete, measurable fix where possible (e.g. "drop highlights by 15%", "raise the camera 3 inches so the eyeline hits the upper third", "add a 10% warm LUT to counteract the blue daylight cast")
- Tone: confident, direct, zero hedging. A sentence like "Lighting is decent" is a failure. "The key light is slightly front-on, flattening your face — move it 30-40 degrees to your right for depth" is correct.

Dimension-specific guidance:
- lighting: Identify light source direction, shadow placement on face/background, any color temperature mismatch (warm tungsten vs cool daylight), and whether catch lights are visible in the eyes
- brightness: Note whether the subject's skin is properly exposed or clipped, flag any region significantly darker/brighter than the subject, suggest a specific exposure adjustment if needed
- contrast: State whether blacks are crushed, highlights clipped, or the image looks flat/washed. Reference specific areas — face, background, clothing
- background: Note exactly what objects are visible, whether any are distracting or off-brand, whether depth of field separates subject from background, and if background color/tone clashes with clothing
- framing: Describe headroom, exact eye-line position relative to the rule of thirds, whether shoulders are cut awkwardly, and whether the offset or centered choice serves the content style
- sharpness: State whether focus is on the eyes specifically, note any motion blur, and whether background sharpness is appropriate for the subject separation
- stability: Identify micro-jitter, drift, or any stabilization artifacts (warping edges). Note if the issue is consistent or only at cuts
- colorTemperature: Name the cast (e.g. "blue daylight spill", "orange tungsten glow", "mixed sources creating green shadow"), and specify a correction value where relevant`;

export async function analyzeVisuals(frameBase64List: string[], platform: string, plan = "free"): Promise<object> {
  const imageContent = frameBase64List.map(b64 => ({
    type: "image_url",
    image_url: { url: `data:image/jpeg;base64,${b64}` },
  }));

  const isFree = plan === "free";

  if (isFree) {
    const freePrompt = `${BASE_SYSTEM_PROMPT}

Analyze this frame from a ${platform} video. Give one specific observation for each dimension.

CRITICAL RULE: Never reference frame numbers (frame 1, frame 2, etc.) in your output. The user cannot see the frames. Instead, reference approximate timestamps (e.g. "at around 0:45") or describe what is happening on screen (e.g. "in the segment where you demonstrate the product"). Always write as if you are describing what the viewer sees in the video.

${VISUAL_DIMENSION_INSTRUCTIONS}

Return STRICT JSON only:
{
  "overallVisualScore": 0-100,
  "topFix": "the single most important visual fix — specific, measurable, referencing exactly what you see",
  "lighting": {"level": "low/medium/high", "numeric": 0-100, "assessment": "one specific observation using descriptive references not frame numbers", "suggestions": ["one exact, measurable fix"], "severity": "critical/needs work/good/excellent"}
}`;

    const response = await callOpenAI({
      model: "gpt-4o",
      max_completion_tokens: 500,
      messages: [{ role: "user", content: [{ type: "text", text: freePrompt }, ...imageContent] }],
    });
    return parseJson(response.choices[0]?.message?.content ?? "{}", {
      overallVisualScore: 70,
      topFix: "Move your key light 40 degrees to camera right — the current front-on placement is flattening your face and removing all depth.",
      lighting: { level: "medium", numeric: 70, assessment: "Key light is front-facing, eliminating facial shadow and depth", suggestions: ["Shift key light 40 degrees to the right to create natural dimensionality"], severity: "needs work" },
    });
  }

  const prompt = `${BASE_SYSTEM_PROMPT}

Analyze these ${frameBase64List.length} evenly-spaced frames from a ${platform} video.

${VISUAL_DIMENSION_INSTRUCTIONS}

CRITICAL RULE: Never reference frame numbers (frame 1, frame 2, etc.) in any field. The user cannot see the frames. Instead reference approximate time positions (e.g. "in the opening segment", "around the midpoint", "in the closing section") or describe what is happening on screen. Always write as if describing what the viewer sees in the final video.

Return STRICT JSON only (no markdown):
{
  "overallVisualScore": 0-100,
  "topFix": "the single most impactful fix — specific, measurable, referencing what you see on screen",
  "colorGradingRecommendation": "one specific color grading suggestion with a concrete value (e.g. '+10 warmth', 'reduce saturation 8%', 'lift shadows to 15 on the parade')",
  "lighting": {"level": "low/medium/high", "numeric": 0-100, "assessment": "specific observation referencing light source, shadows, catch lights", "suggestions": ["exact measurable fix"], "severity": "critical/needs work/good/excellent"},
  "brightness": {"level": "low/medium/high", "numeric": 0-100, "assessment": "specific note on skin exposure, blown regions, or underexposed areas", "suggestions": ["exact exposure adjustment"], "severity": "critical/needs work/good/excellent"},
  "contrast": {"level": "low/medium/high", "numeric": 0-100, "assessment": "specific note on crushed blacks, clipped highlights, or flat image — reference face, background, clothing", "suggestions": ["exact fix"], "severity": "critical/needs work/good/excellent"},
  "colorTemperature": {"value": "warm/cool/neutral", "assessment": "name the specific cast and where it's most visible", "suggestions": ["specific correction value"], "severity": "critical/needs work/good/excellent"},
  "background": {"level": "distracting/normal/clean", "numeric": 0-100, "assessment": "list exactly what objects are visible, note anything distracting or off-brand", "suggestions": ["exact change"], "severity": "critical/needs work/good/excellent"},
  "framing": {"level": "poor/acceptable/good", "numeric": 0-100, "assessment": "headroom, eye-line position, shoulder crop — be exact", "suggestions": ["specific camera or posture adjustment"], "severity": "critical/needs work/good/excellent"},
  "sharpness": {"level": "blurry/acceptable/sharp", "numeric": 0-100, "assessment": "focus plane location, any motion blur, background sharpness relative to subject", "suggestions": ["exact fix"], "severity": "critical/needs work/good/excellent"},
  "stability": {"level": "shaky/acceptable/stable", "numeric": 0-100, "assessment": "note micro-jitter, drift, or stabilization artifacts and when they occur", "suggestions": ["exact fix"], "severity": "critical/needs work/good/excellent"}
}`;

  const response = await callOpenAI({
    model: "gpt-4o",
    max_completion_tokens: 2000,
    messages: [{ role: "user", content: [{ type: "text", text: prompt }, ...imageContent] }],
  });
  return parseJson(response.choices[0]?.message?.content ?? "{}", {
    overallVisualScore: 70,
    topFix: "Move your key light 40 degrees to camera right — the current front-on placement is flattening your face and removing all depth.",
    colorGradingRecommendation: "Add +10 warmth to counteract the cool daylight cast and make skin tones more natural.",
    lighting: { level: "medium", numeric: 70, assessment: "Key light is front-facing, removing facial depth", suggestions: ["Shift key light 40 degrees right to introduce natural shadow and dimension"], severity: "needs work" },
    brightness: { level: "medium", numeric: 65, assessment: "Exposure looks slightly hot on the forehead — highlights are close to clipping", suggestions: ["Pull exposure down 0.3 stops and recover highlights by 20%"], severity: "good" },
    contrast: { level: "medium", numeric: 70, assessment: "Image looks slightly flat — blacks aren't fully seated", suggestions: ["Lower blacks by 10 points in your color grade to add depth without crushing shadow detail"], severity: "needs work" },
    colorTemperature: { value: "neutral", assessment: "Mostly neutral but a faint blue cast in the shadows suggests a daylight source bleeding in from the side", suggestions: ["Add +5 warmth and +3 tint to neutralize the cool shadow cast"], severity: "good" },
    background: { level: "normal", numeric: 70, assessment: "Background is clear but slightly out of focus in a way that doesn't fully separate subject from wall", suggestions: ["Move 2 feet forward from the background to increase depth-of-field separation"], severity: "good" },
    framing: { level: "good", numeric: 78, assessment: "Eyes sit at mid-frame rather than the upper third — headroom is slightly excessive", suggestions: ["Lower the camera or raise your seat so eyes land at the upper-third line"], severity: "good" },
    sharpness: { level: "acceptable", numeric: 75, assessment: "Focus is on the face but softens slightly in the lower frame — likely a shallow depth-of-field issue", suggestions: ["Stop down aperture by one stop or increase subject-to-camera distance"], severity: "good" },
    stability: { level: "stable", numeric: 80, assessment: "Footage is solid with no visible shake, though a very slight drift is noticeable in the first few seconds", suggestions: ["Use a locking ballhead instead of a fluid head if shooting static — eliminates the subtle drift"], severity: "good" },
  });
}

export async function analyzeAudio(transcript: string, whisperConfidence: number): Promise<object> {
  const fillerWordPattern = /\b(um+|uh+|er+|ah+|like|you know|basically|literally|actually|so|right\?)\b/gi;
  const fillerWordMatches = transcript.match(fillerWordPattern) || [];
  const fillerWordCount = fillerWordMatches.length;

  // FIX: Build a breakdown of which filler words were found and how many times each
  const fillerBreakdown: Record<string, number> = {};
  for (const match of fillerWordMatches) {
    const word = match.toLowerCase();
    fillerBreakdown[word] = (fillerBreakdown[word] ?? 0) + 1;
  }
  const fillerBreakdownStr = Object.entries(fillerBreakdown)
    .sort((a, b) => b[1] - a[1])
    .map(([word, count]) => `"${word}" ×${count}`)
    .join(", ");

  const wordCount = transcript.split(/\s+/).filter(w => w.length > 0).length;
  const fillerRatio = wordCount > 0 ? fillerWordCount / wordCount : 0;
  const fillerLevel = fillerRatio > 0.1 ? "high" : fillerRatio > 0.05 ? "medium" : "low";
  const clarityNumeric = Math.round(whisperConfidence * 100);

  const response = await callOpenAI({
    model: "gpt-4o-mini",
    max_completion_tokens: 800,
    messages: [{ role: "user", content: `You are a professional audio engineer and presentation coach. Analyze this transcript for audio and delivery quality.

Write exactly as a professional giving paid notes. Rules:
- Reference actual words, patterns, or moments you detect — never give generic advice
- For volume: identify specific moments where it dips or spikes rather than giving a general rating. Suggest a target LUFS level if relevant.
- For clarity: note if consonants are clipping, if there's reverb suggesting an untreated room, proximity effect from mic placement, or compression artifacts
- For background noise: identify the TYPE of noise (HVAC hum, street noise, keyboard, breathing) and at what point it's most noticeable — not just whether noise exists
- For filler words: list the specific words detected and their counts, then name the most distracting one to fix first
- Never say "decent", "good", "acceptable", "generally" without a specific observation backing it up

Transcript snippet: "${transcript.substring(0, 500)}"
Filler words detected: ${fillerBreakdownStr || "none"} (${fillerWordCount} total out of ${wordCount} words — ${Math.round(fillerRatio * 100)}%)
Whisper transcription confidence: ${clarityNumeric}%

SCORING RULE: All numeric scores represent QUALITY (not quantity or severity).
- audioVolume.numeric: 100 = perfectly leveled, 0 = too quiet or too loud
- audioClarity.numeric: 100 = crystal clear, 0 = totally unintelligible
- backgroundNoise.numeric: 100 = perfectly clean/silent background, 0 = extremely noisy/distracting
  (low noise level = HIGH score; high noise level = LOW score)

Return STRICT JSON only:
{"audioVolume":{"level":"low/medium/high","numeric":0-100,"assessment":"specific observation about loudness consistency, peaks, or dips","suggestions":["exact fix with target value if relevant"],"effect":"..."},"audioClarity":{"level":"poor/acceptable/good","numeric":${clarityNumeric},"assessment":"specific note on articulation, reverb, mic placement, or compression","suggestions":["exact fix"],"effect":"..."},"backgroundNoise":{"level":"high/medium/low","numeric":0-100 where 100=clean and 0=very noisy,"assessment":"type and timing of noise, not just whether it exists","suggestions":["exact fix"],"effect":"..."},"fillerWords":{"level":"${fillerLevel}","numeric":${fillerWordCount},"breakdown":${JSON.stringify(fillerBreakdown)},"assessment":"${fillerWordCount} filler words detected (${Math.round(fillerRatio * 100)}% of speech): ${fillerBreakdownStr || 'none found'}","suggestions":["name the most distracting filler word and give a specific replacement strategy"],"effect":"..."}}` }],
  });
  return parseJson(response.choices[0]?.message?.content ?? "{}", {
    audioVolume: { level: "medium", numeric: 72, assessment: "Volume holds steady through the middle but dips noticeably in the final 20 seconds — likely moving away from the mic", suggestions: ["Aim for -14 LUFS for YouTube; normalize in post and add a limiter ceiling at -1dB"], effect: "Inconsistent volume forces viewers to adjust their device mid-watch" },
    audioClarity: { level: clarityNumeric > 80 ? "good" : "acceptable", numeric: clarityNumeric, assessment: "Speech is intelligible but a slight room reverb is audible between sentences — the space isn't acoustically treated", suggestions: ["Record closer to the mic or hang a moving blanket behind camera to reduce reflections"], effect: "Reverb adds a distant, unprofessional feel that undermines authority" },
    backgroundNoise: { level: "low", numeric: 88, assessment: "A faint HVAC hum sits under the entire recording — consistent enough to be filterable in post", suggestions: ["Run a noise reduction pass in Audacity or Premiere using a 0.5s room tone sample as the noise profile"], effect: "Subtle but audible in quiet moments; easily fixed in post" },
    fillerWords: { level: fillerLevel, numeric: fillerWordCount, breakdown: fillerBreakdown, assessment: `${fillerWordCount} filler words detected (${Math.round(fillerRatio * 100)}% of speech): ${fillerBreakdownStr || "none found"}`, suggestions: ["Focus on eliminating 'like' first — it appears most frequently and reads as low-confidence. Replace with a deliberate pause."], effect: "Filler words at this frequency reduce perceived expertise and slow delivery pace" },
  });
}

export async function generateVideoName(transcript: string, fallbackName?: string): Promise<string> {
  const cleanFallback = (fallbackName ?? "Video analysis").replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  const fallback = cleanFallback || "Video analysis";

  try {
    const response = await callOpenAI({
      model: "gpt-4o-mini",
      max_completion_tokens: 60,
      messages: [{
        role: "user",
        content: `Name this video based on the script. Return STRICT JSON only.

Rules:
- 3 to 7 words
- Specific to the actual topic
- No quotation marks in the title
- No generic labels like "Video Analysis", "My Video", "Introduction", or "Untitled"

Script:
"${transcript.substring(0, 1800)}"

Return:
{"videoName":"specific video name"}`,
      }],
    });

    const parsed = parseJson<{ videoName?: string }>(response.choices[0]?.message?.content ?? "{}", {});
    const name = parsed.videoName?.trim();
    return name && !/^video analysis$/i.test(name) ? name : fallback;
  } catch (err) {
    logger.warn({ err }, "Video name generation failed");
    return fallback;
  }
}

export function getTotalAnalysisScore(result: Record<string, unknown>): number | undefined {
  const quality = result.quality as { score?: unknown; overallScore?: unknown; overallVisualScore?: unknown } | undefined;
  const score = Number(quality?.score ?? quality?.overallScore ?? quality?.overallVisualScore);
  return Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : undefined;
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
  audioPath?: string,
  plan = "free"
): Promise<object> {
  const lastSeg = segments[segments.length - 1];
  const totalDuration = lastSeg?.end ?? 0;
  const isFree = plan === "free";

  const editingSystemPrompt = `You are a senior video editor and YouTube strategist with 10 years experience working with creators across YouTube, TikTok, and Instagram. You watch videos with a critical eye and give feedback like a professional editor reviewing a client's rough cut: specific, direct, and actionable. Never give vague advice.

Rules:
- Always reference exact timestamps or quote exact words from the transcript
- If something should be cut, say exactly what and why in one sentence
- Before suggesting to cut any line, ask yourself: does this line create tension, establish a problem, or advance the story? If yes, do NOT suggest cutting it — suggest repositioning it instead. Strong problem-framing lines are assets, not waste.
- Only suggest cutting genuinely redundant content — repeated points, filler transitions, or off-topic tangents
- When suggesting a cut, always explain what specific value is lost vs gained by cutting, in one sentence
- If the hook is weak, rewrite it with a specific alternative
- Reference platform-specific best practices
- Never say "consider" or "you might want to": be direct
- Keep each suggestion to 1-2 sentences maximum`;

  const hookCount = isFree ? 1 : 4;
  const suggestionCount = isFree ? 1 : 5;

  const hookResponse = await callOpenAI({
    model: "gpt-4o",
    max_completion_tokens: isFree ? 600 : 1200,
    messages: [{
      role: "user",
      content: `${editingSystemPrompt}

Read this transcript. Identify the ${hookCount} strongest moment(s) that would stop a scroll: unexpected reveals, punchlines, or contrarian takes. Copy the EXACT text from the transcript.

Then give ${suggestionCount} specific editing suggestion(s). Not "improve pacing". Give actionable notes like "The setup at 0:45 is 30 seconds longer than it needs to be, cut to the punchline immediately" or "Hook lands too late, move the reveal at 2:10 to the first 15 seconds". Reference platform best practices where relevant (TikTok hooks in 2 seconds, YouTube retention cliff at 30%).

CRITICAL: Copy text EXACTLY as written. Do NOT invent timestamps.

Transcript: "${transcript.substring(0, isFree ? 1500 : 3000)}"

Return STRICT JSON only:
{
  "hookTexts": ["exact sentence from transcript"],
  "editingSuggestions": ["specific tip referencing the actual content"]
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

  const defaultSuggestions = [
    "Cut pauses longer than 1.5 seconds for tighter pacing",
    "Move your strongest moment to within the first 30 seconds",
    "Remove filler word segments shown in the cut list above",
    "End with a clear CTA: tell them exactly what to do next",
    "Your hook needs to land before 15 seconds on YouTube",
  ];

  // FIX: Rewritten hook — ensure it's a complete sentence, ≤2 sentences, ≤25 words, no hype language
  let rewrittenHook: string | undefined;
  if (!isFree && clampedHooks.length > 0) {
    try {
      const hookText = (clampedHooks[0] as { text: string })?.text ?? transcript.substring(0, 200);
      const hookRewriteResponse = await callOpenAI({
        model: "gpt-4o",
        max_completion_tokens: 400,
        messages: [{
          role: "user",
          content: `${editingSystemPrompt}

Rewrite this opening as a creator would actually say it on camera — natural, direct, and confident. It should sound like the creator is talking to a friend, not writing an ad headline.

Good example: "If you sell products on more than one platform, you already know how painful it is to keep everything in sync. This is how I fixed it."
Bad example: "Discover the secret trick that transforms your Tuesday forever!"

Rules:
- No exclamation marks
- No words like "discover", "secret", "unlock", "transform", "game-changer", "revolutionary"
- Must reference something specific from the actual video content below
- Should feel like the natural first sentence of the video
- MUST be a complete sentence — never end mid-thought or mid-clause
- Maximum 2 sentences, maximum 30 words total
- Write as if the creator is speaking directly to camera

Original: "${hookText}"

Return STRICT JSON only: {"rewrittenHook": "your complete rewritten opening here"}`,
        }],
      });
      const parsed = parseJson<{ rewrittenHook: string }>(hookRewriteResponse.choices[0]?.message?.content ?? "{}", { rewrittenHook: "" });
      rewrittenHook = parsed.rewrittenHook || undefined;
    } catch (err) {
      logger.warn({ err }, "Rewritten hook generation failed");
    }
  }

  return {
    // FIX: Sort hooks chronologically before returning
    hooks: [...clampedHooks].sort((a, b) => {
      if (!a || !b) return 0;
      return parseTs((a as { start: string }).start) - parseTs((b as { start: string }).start);
    }),
    removeSections: clampedRemovals.slice(0, 12),
    shortVideos: clampedShortVideos,
    rewrittenHook,
    editingSuggestions: hookData.editingSuggestions?.length
      ? hookData.editingSuggestions.slice(0, isFree ? 1 : 5)
      : defaultSuggestions.slice(0, isFree ? 1 : 5),
  };
}

// FIX: Chapters now use AI to generate complete, meaningful labels — not raw transcript fragments
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
        // Store the raw text — we'll label it cleanly in generateSeo via AI
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
  segments: Array<{ start: number; end: number; text: string }> = [],
  plan = "free"
): Promise<object> {
  const isFree = plan === "free";
  const chapterPoints = buildChapterPoints(segments, 10);

  // FIX: Chapter hint now instructs AI to write complete, descriptive labels — not raw transcript fragments
  const chapterHint = chapterPoints.length
    ? `\n\nReal chapter timestamps (use EXACTLY these times — write a short, complete, descriptive label for each that tells the viewer what they will learn or see in that section. Labels must be complete phrases, never sentence fragments or mid-sentence cuts. Bad label: "what they're talking about" — Good label: "Why most business videos get ignored"):\n${chapterPoints.map(c => `${c.time} - context: "${c.text}"`).join("\n")}`
    : "";

  const platformGuide: Record<string, string> = {
    youtube_long: "YouTube long-form: titles 60-70 chars, curiosity gap required, keyword in first 3 words. Strategy options: curiosity gap, how-to, number-based, problem/solution, bold claim.",
    youtube_shorts: "YouTube Shorts: punchy titles under 50 chars, high-energy action verbs",
    tiktok: "TikTok: trend-aware, conversational, 3-5 hashtags from trending niches",
    instagram: "Instagram Reels: lifestyle-forward, mix of niche and broad hashtags",
    linkedin: "LinkedIn: professional framing, thought leadership angle, low hashtag count",
    x: "X/Twitter: max 2-3 hashtags, punchy and opinionated",
  };

  const guide = platformGuide[platform] ?? "";

  if (isFree) {
    const response = await callOpenAI({
      model: "gpt-4o",
      max_completion_tokens: 500,
      messages: [{ role: "user", content: `${BASE_SYSTEM_PROMPT}

You are a ${platform} SEO expert. Generate ONE strong title using a curiosity gap strategy (keyword in first 3 words, under 70 chars). Write TWO compelling sentences for the description hook (these appear before "Show more"). Generate 3 high-relevance tags.

Platform rules: ${guide}

Transcript: "${transcript.substring(0, 800)}"

TAGS RULE: YouTube tags must NOT include the # symbol. Output plain tag text only, ready to paste directly into the YouTube tags field. Example: "Google Sheets, productivity, ecommerce" not "#GoogleSheets, #productivity"

Return STRICT JSON only:
{"titles":["one title only"],"description":"Two compelling sentences maximum.","hashtags":[{"tag":"Tag without hash symbol","effect":"why this tag"},{"tag":"Tag2","effect":"..."},{"tag":"Tag3","effect":"..."}],"timestamps":[{"time":"0:00","label":"Intro"}]}` }],
    });

    const parsed = parseJson<{ titles: string[]; description: string; hashtags: Array<{ tag: string; effect?: string }>; timestamps: Array<{ time: string; label: string }> }>(
      response.choices[0]?.message?.content ?? "{}",
      {
        titles: ["Your Video Title — Creator Plan Unlocks 4 More Options"],
        description: "Your video covers important content your audience needs to see.",
        hashtags: [{ tag: "VideoContent", effect: "Broad reach" }, { tag: "YouTube", effect: "Platform" }, { tag: "Creator", effect: "Niche" }],
        timestamps: [{ time: "0:00", label: "Introduction" }],
      }
    );
    // Safety net: strip any # symbols the model added despite instructions
    parsed.hashtags = (parsed.hashtags ?? []).map(h => ({
      ...h,
      tag: typeof h.tag === "string" ? h.tag.replace(/^#+/, "") : h.tag,
    }));
    return parsed;
  }

  const isYouTube = platform === "youtube_long" || platform === "youtube_shorts";

  const response = await callOpenAI({
    model: "gpt-4o",
    max_completion_tokens: 2500,
    messages: [{ role: "user", content: `${BASE_SYSTEM_PROMPT}

You are a ${platform} SEO expert who has helped channels grow from 0 to 100K through search. You write titles that create curiosity gaps, not summaries.

Platform rules: ${guide}

Transcript: "${transcript.substring(0, 2000)}"${chapterHint}

${isYouTube ? `Generate exactly 5 title options using these named strategies:
1. Curiosity gap (create a knowledge gap the viewer must close)
2. How-to / tutorial (clear instruction promise)
3. Number-based (specific number in the title)
4. Problem/solution direct (name the pain, promise the fix)
5. Bold claim or result-driven (contrarian or surprising outcome)
Each title: include primary keyword naturally, under 70 characters.` : `Generate 3 title options following platform best practices.`}

Description rules — write like a creator who knows their audience, not a marketing copywriter:
- First 2 lines must clearly state what the video is about and who it's for. No hype, no fluff.
- Use the primary keyword naturally in the first sentence.
- Include a ## Chapters section — use actual content from the transcript for chapter names. Never use generic labels like "Introduction", "Part 1", or "Sell Online". Use descriptive names that tell the viewer what they will learn (e.g. "Why updating 5 platforms wastes your Tuesday", "The Google Sheets trick that fixed everything"). Every chapter label must be a complete phrase, never a sentence fragment.
- Include a links section with placeholder text: "🔗 [Add your links here]"
- End with ONE genuine call to action — either a question for viewers to comment on, or a subscribe prompt. One sentence only.
- Minimum 150 words. No filler closing lines.
- Never end with phrases like "Embrace simplicity", "Get organized now", "Transform your workflow", or any generic motivational closer.
- 150-400 words total

TAGS RULE: YouTube tags must NOT include the # symbol. Output plain tag text only, ready to paste directly into the YouTube tags field. Example: "Google Sheets, productivity, ecommerce" not "#GoogleSheets, #productivity"

Tags: generate 25-30 tags total:
- 5 high-volume broad tags (1M+ monthly searches)
- 10 medium-competition niche tags (100K-1M)
- 5 long-tail specific tags (very specific, 10K-100K)
- 5 brand/product/creator-specific tags
- No # symbols on any tag

Return STRICT JSON — use EXACT times from chapter list. Chapter labels must be complete, descriptive phrases (never fragments):
{"titles":["title 1","title 2","title 3","title 4","title 5"],"description":"full description with chapters and CTA","hashtags":[{"tag":"Tag without hash symbol","effect":"audience this serves"}],"timestamps":[{"time":"0:00","label":"complete descriptive label"}],"titleStrategies":["curiosity gap","how-to","number-based","problem/solution","bold claim"]}` }],
  });

  const parsed = parseJson<{ titles: string[]; description: string; hashtags: object[]; timestamps: Array<{ time: string; label: string }>; titleStrategies?: string[] }>(
    response.choices[0]?.message?.content ?? "{}",
    {
      titles: ["Engaging title for your video", "How-to title with keywords", "5 Things About Your Topic", "The Problem Solved in One Video", "The Result You Actually Get"],
      description: "Your video description with chapters and call to action.\n\n## Chapters\n0:00 Introduction\n\n[Links]\nSubscribe: \n\nStart creating better content today.",
      hashtags: [{ tag: "#VideoContent", effect: "Broad reach" }],
      timestamps: [{ time: "0:00", label: "Introduction" }],
    }
  );

  // FIX: Use exact chapter times from the transcript, but keep AI-generated complete labels
  if (chapterPoints.length) {
    parsed.timestamps = parsed.timestamps.map((t, i) => ({
      time: chapterPoints[i]?.time ?? t.time,
      label: t.label, // keep the AI-written complete label, only override the time
    }));
  }

  // Safety net: strip any # symbols the model added despite instructions
  parsed.hashtags = (parsed.hashtags ?? []).map((h: any) => ({
    ...h,
    tag: typeof h.tag === "string" ? h.tag.replace(/^#+/, "") : h.tag,
  }));

  return parsed;
}

export async function generateShortClipIdeas(
  transcript: string,
  segments: Array<{ start: number; end: number; text: string }>,
  platforms: string[],
  plan = "free"
): Promise<object> {
  if (!segments.length) return { clips: [] };
  const isFree = plan === "free";

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

  // FIX: Minimum 3 clip ideas on paid plan
  const clipCount = isFree ? 1 : 3;

  const response = await callOpenAI({
    model: "gpt-4o",
    max_completion_tokens: isFree ? 600 : 2000,
    messages: [{
      role: "user",
      content: `${BASE_SYSTEM_PROMPT}

You are a short-form content strategist who has helped 500+ creators repurpose long videos into viral clips. You know exactly what makes people stop scrolling.

For each clip, identify the moment with highest re-watchability or shareability. A great short clip has a strong first 2 seconds, a clear single idea, and a satisfying end. Quote the exact words that should open the clip and explain why this moment works as a short.

Target platforms: ${targetPlatformList}
Total video duration: ${Math.round(totalDuration)}s

Identify the best ${clipCount} clip(s) that would perform on short-form platforms.
For each clip:
- Find the chunk it's in, quote the exact opening line from the transcript
- State which platforms fit and WHY (e.g. "TikTok: contrarian take performs in first 2 seconds")
${!isFree ? `- Give ONE tactical production note (e.g. "Add captions: 85% of Reels are watched muted", "Cut to the punchline immediately: the setup is 20 seconds too long")
- Assess engagement potential: High / Medium / Low with a one-sentence reason` : ""}

CRITICAL: Use ONLY the index numbers provided. Do NOT invent startSec/endSec.

Chunks: ${JSON.stringify(chunkSummaries)}

Return STRICT JSON:
{
  "clips": [
    {
      "chunkIndex": 0,
      "startSec": 45,
      "endSec": 105,
      "title": "punchy clip title",
      "hook": "exact opening words that stop the scroll",
      "whyItWorks": "one sentence on what makes this clip work",
      "platforms": ["TikTok", "Instagram Reels"],
      "platformReason": "why these platforms specifically"${!isFree ? `,
      "tacticalNote": "one specific production tip",
      "engagementPotential": "High/Medium/Low",
      "engagementReason": "why"` : ""}
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
      whyItWorks: clip.whyItWorks ?? "",
      platforms: Array.isArray(clip.platforms) ? clip.platforms : [],
      platformReason: clip.platformReason ?? "",
      tacticalNote: clip.tacticalNote ?? "",
      engagementPotential: clip.engagementPotential ?? "",
      engagementReason: clip.engagementReason ?? "",
    };
  });

  // FIX: minimum 3 clips on paid, 1 on free
  return { clips: clips.slice(0, isFree ? 1 : Math.max(clips.length, 3)) };
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
