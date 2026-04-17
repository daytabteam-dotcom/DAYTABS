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

// ─── Deterministic Scoring Rubrics ───────────────────────────────────────────
//
// All numeric scores are computed here in TypeScript, not by the AI.
// The AI returns structured boolean/enum observations; this layer maps them
// to points. Same input → same score, every time.
//
// Each rubric is a list of { condition, points } rules applied to the
// structured observation object the AI returns.

interface VisualObservations {
  // Lighting
  lightSourceVisible: boolean;
  lightSourceSide: "front" | "side" | "back" | "overhead" | "unknown";
  catchLightsVisible: boolean;
  hardShadowsOnFace: boolean;
  colorTemperatureMismatch: boolean;
  // Brightness
  skinExposure: "clipped" | "correct" | "underexposed";
  blownRegions: boolean;
  // Contrast
  blacksCrushed: boolean;
  highlightsClipped: boolean;
  imageLooksFlat: boolean;
  // Background
  backgroundObjects: "none" | "minimal" | "moderate" | "cluttered";
  backgroundDistractsFromSubject: boolean;
  backgroundColorClashesWithSubject: boolean;
  depthOfFieldSeparation: "strong" | "moderate" | "weak" | "none";
  // Framing
  eyeLinePosition: "upper-third" | "center" | "lower-third" | "off-frame";
  excessiveHeadroom: boolean;
  shouldersCutAwkwardly: boolean;
  // Sharpness
  focusOnEyes: boolean;
  motionBlurPresent: boolean;
  // Stability
  microJitterVisible: boolean;
  driftVisible: boolean;
  stabilizationArtifacts: boolean;
  // Color temperature
  colorCast: "none" | "warm" | "cool" | "green" | "mixed";
  colorCastSeverity: "none" | "slight" | "moderate" | "strong";
}

function scoreLighting(obs: VisualObservations): number {
  let score = 100;
  if (!obs.lightSourceVisible) score -= 10;
  if (obs.lightSourceSide === "front") score -= 20;
  if (obs.lightSourceSide === "overhead") score -= 15;
  if (obs.lightSourceSide === "back") score -= 25;
  if (!obs.catchLightsVisible) score -= 10;
  if (obs.hardShadowsOnFace) score -= 15;
  if (obs.colorTemperatureMismatch) score -= 10;
  return Math.max(0, Math.min(100, score));
}

function scoreBrightness(obs: VisualObservations): number {
  let score = 100;
  if (obs.skinExposure === "clipped") score -= 30;
  if (obs.skinExposure === "underexposed") score -= 20;
  if (obs.blownRegions) score -= 15;
  return Math.max(0, Math.min(100, score));
}

function scoreContrast(obs: VisualObservations): number {
  let score = 100;
  if (obs.blacksCrushed) score -= 20;
  if (obs.highlightsClipped) score -= 20;
  if (obs.imageLooksFlat) score -= 25;
  return Math.max(0, Math.min(100, score));
}

function scoreBackground(obs: VisualObservations): number {
  let score = 100;
  if (obs.backgroundObjects === "moderate") score -= 15;
  if (obs.backgroundObjects === "cluttered") score -= 30;
  if (obs.backgroundDistractsFromSubject) score -= 20;
  if (obs.backgroundColorClashesWithSubject) score -= 10;
  if (obs.depthOfFieldSeparation === "weak") score -= 10;
  if (obs.depthOfFieldSeparation === "none") score -= 20;
  return Math.max(0, Math.min(100, score));
}

function scoreFraming(obs: VisualObservations): number {
  let score = 100;
  if (obs.eyeLinePosition === "center") score -= 10;
  if (obs.eyeLinePosition === "lower-third") score -= 20;
  if (obs.eyeLinePosition === "off-frame") score -= 40;
  if (obs.excessiveHeadroom) score -= 15;
  if (obs.shouldersCutAwkwardly) score -= 10;
  return Math.max(0, Math.min(100, score));
}

function scoreSharpness(obs: VisualObservations): number {
  let score = 100;
  if (!obs.focusOnEyes) score -= 30;
  if (obs.motionBlurPresent) score -= 25;
  return Math.max(0, Math.min(100, score));
}

function scoreStability(obs: VisualObservations): number {
  let score = 100;
  if (obs.microJitterVisible) score -= 20;
  if (obs.driftVisible) score -= 15;
  if (obs.stabilizationArtifacts) score -= 15;
  return Math.max(0, Math.min(100, score));
}

function scoreColorTemperature(obs: VisualObservations): number {
  let score = 100;
  if (obs.colorCast === "mixed") score -= 30;
  if (obs.colorCastSeverity === "strong") score -= 25;
  else if (obs.colorCastSeverity === "moderate") score -= 15;
  else if (obs.colorCastSeverity === "slight") score -= 5;
  return Math.max(0, Math.min(100, score));
}

// Audio scoring is fully deterministic — no AI involved in the numbers
function scoreAudioVolume(peakVariationDb: number, hasDropouts: boolean): number {
  let score = 100;
  if (peakVariationDb > 12) score -= 30;
  else if (peakVariationDb > 8) score -= 20;
  else if (peakVariationDb > 4) score -= 10;
  if (hasDropouts) score -= 20;
  return Math.max(0, Math.min(100, score));
}

function scoreAudioClarity(whisperConfidence: number): number {
  // whisperConfidence is 0–1; map directly to 0–100
  // Whisper confidence is itself a reliable signal of intelligibility
  return Math.round(Math.max(0, Math.min(100, whisperConfidence * 100)));
}

function scoreBackgroundNoise(noiseFloorDb: number): number {
  // noiseFloorDb is negative (e.g. -50 = quiet, -20 = loud hum)
  // quieter = higher score
  if (noiseFloorDb <= -50) return 100;
  if (noiseFloorDb <= -45) return 90;
  if (noiseFloorDb <= -40) return 80;
  if (noiseFloorDb <= -35) return 70;
  if (noiseFloorDb <= -30) return 55;
  if (noiseFloorDb <= -25) return 40;
  return 25;
}

function scoreFillerWords(fillerRatio: number): number {
  // fillerRatio = fillerCount / wordCount
  if (fillerRatio <= 0.02) return 100;
  if (fillerRatio <= 0.04) return 85;
  if (fillerRatio <= 0.06) return 70;
  if (fillerRatio <= 0.08) return 55;
  if (fillerRatio <= 0.12) return 40;
  return 25;
}

// ─── End of scoring rubrics ───────────────────────────────────────────────────

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
      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
      reject(new Error(`${label} timed out after ${timeoutMs}ms${stderr ? `: ${stderr}` : ""}`));
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

function getConfiguredTimeoutMs(envName: string, defaultMs: number): number {
  const value = Number(process.env[envName]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : defaultMs;
}

async function listExtractedFrameJpegs(framesDir: string, count: number): Promise<string[]> {
  const files = await fs.readdir(framesDir);
  const jpgs: string[] = [];
  for (const file of files.filter(f => f.endsWith(".jpg")).sort()) {
    const stat = await fs.stat(path.join(framesDir, file)).catch(() => null);
    if (stat && stat.size > 0) {
      jpgs.push(file);
    }
    if (jpgs.length >= count) break;
  }
  return jpgs;
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
  const seekTimeoutMs = getConfiguredTimeoutMs("FFMPEG_FRAME_SEEK_TIMEOUT_MS", 45000);
  const fallbackTimeoutMs = getConfiguredTimeoutMs("FFMPEG_FRAME_FALLBACK_TIMEOUT_MS", 90000);
  if (duration <= 0) {
    logger.info({ videoPath, count }, "Extracting frames with select filter");
    await runMediaCommand(
      "ffmpeg",
      ["-nostdin", "-hide_banner", "-loglevel", "error", "-threads", "1", "-i", videoPath, "-vf", `select=lt(n\\,${count}),${frameScaleFilter}`, "-vsync", "vfr", "-q:v", "8", path.join(framesDir, "frame_%03d.jpg"), "-y"],
      fallbackTimeoutMs,
      "ffmpeg frame extraction select"
    );
  } else {
    const interval = duration / (count + 1);
    logger.info({ videoPath, count, duration, interval }, "Extracting frames at intervals");
    for (let i = 1; i <= count; i++) {
      const ts = Math.min(Math.max(interval * i, 0.1), Math.max(duration - 0.1, 0.1)).toFixed(2);
      const outPath = path.join(framesDir, `frame_${String(i).padStart(3, "0")}.jpg`);
      logger.info({ i, ts, outPath }, "Extracting frame");
      try {
        await runMediaCommand(
          "ffmpeg",
          ["-nostdin", "-hide_banner", "-loglevel", "error", "-threads", "1", "-ss", ts, "-i", videoPath, "-frames:v", "1", "-vf", frameScaleFilter, "-q:v", "8", outPath, "-y"],
          seekTimeoutMs,
          `ffmpeg frame extraction ${i}`
        );
      } catch (fastSeekErr) {
        logger.warn({ err: fastSeekErr, i, ts, outPath }, "Fast frame extraction failed, retrying with accurate seek");
        try {
          await runMediaCommand(
            "ffmpeg",
            ["-nostdin", "-hide_banner", "-loglevel", "error", "-threads", "1", "-i", videoPath, "-ss", ts, "-frames:v", "1", "-vf", frameScaleFilter, "-q:v", "8", outPath, "-y"],
            fallbackTimeoutMs,
            `ffmpeg accurate frame extraction ${i}`
          );
        } catch (accurateSeekErr) {
          logger.warn({ err: accurateSeekErr, i, ts, outPath }, "Frame extraction retry failed, continuing with remaining frames");
          await fs.unlink(outPath).catch(() => {});
        }
      }
    }

    const jpgs = await listExtractedFrameJpegs(framesDir, count);
    if (jpgs.length === 0) {
      logger.warn({ videoPath, count, duration }, "No interval frames extracted, falling back to first decodable frames");
      await runMediaCommand(
        "ffmpeg",
        ["-nostdin", "-hide_banner", "-loglevel", "error", "-threads", "1", "-i", videoPath, "-vf", `select=lt(n\\,${count}),${frameScaleFilter}`, "-vsync", "vfr", "-q:v", "8", path.join(framesDir, "frame_%03d.jpg"), "-y"],
        fallbackTimeoutMs,
        "ffmpeg frame extraction fallback"
      );
    }
  }
  const jpgs = await listExtractedFrameJpegs(framesDir, count);
  if (jpgs.length === 0) {
    throw new Error("Could not extract any video frames from this file. The video may use an unsupported codec or be corrupted.");
  }
  logger.info({ framesDir, extractedCount: jpgs.length }, "Frame extraction completed");
  const frameBase64List: string[] = [];
  for (const f of jpgs) {
    const buf = await fs.readFile(path.join(framesDir, f));
    frameBase64List.push(buf.toString("base64"));
  }
  return frameBase64List;
}

// Measure audio noise floor and peak variation using ffmpeg/ffprobe
export async function measureAudioSignals(audioPath: string): Promise<{
  noiseFloorDb: number;
  peakVariationDb: number;
  hasDropouts: boolean;
}> {
  try {
    // Use ffmpeg's volumedetect filter to get mean/max volume
    const { stderr } = await execAsync(
      `ffmpeg -i "${audioPath}" -af volumedetect -f null - 2>&1 || true`
    );
    const meanMatch = stderr.match(/mean_volume:\s*([-\d.]+)\s*dB/);
    const maxMatch = stderr.match(/max_volume:\s*([-\d.]+)\s*dB/);
    const meanDb = meanMatch ? parseFloat(meanMatch[1]!) : -30;
    const maxDb = maxMatch ? parseFloat(maxMatch[1]!) : -10;
    const peakVariationDb = Math.abs(maxDb - meanDb);

    // Detect silences to find dropouts (gaps > 1.5s mid-speech)
    const silences = await detectSilences(audioPath, 1.5, -40);
    const hasDropouts = silences.length > 2;

    // Estimate noise floor: run silencedetect at a quiet threshold to find the floor
    const noiseFloorDb = meanDb - 20; // conservative approximation

    return { noiseFloorDb, peakVariationDb, hasDropouts };
  } catch {
    return { noiseFloorDb: -35, peakVariationDb: 6, hasDropouts: false };
  }
}

export function generateSrt(segments: Array<{ start: number; end: number; text: string }>): string {
  const fmt = (s: number) => {
    const ms = Math.round((s % 1) * 1000);
    const secs = Math.floor(s) % 60;
    const mins = Math.floor(s / 60) % 60;
    const hrs = Math.floor(s / 3600);
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
  };

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

const VISUAL_DIMENSION_INSTRUCTIONS = `
For EACH dimension, write exactly as a professional video producer giving paid notes to a client. Rules:
- Reference where in the frame or when in the video the issue occurs (e.g. "upper-right corner", "your face in the closing segment", "the left edge throughout")
- Never use vague praise like "decent", "balanced", "good", "acceptable" without backing it up with a specific physical observation
- If something scores above 85, still name the ONE thing that would push it to 100
- Suggest a concrete, measurable fix where possible (e.g. "drop highlights by 15%", "raise the camera 3 inches so the eyeline hits the upper third")
- Tone: confident, direct, zero hedging.

Dimension-specific guidance:
- lighting: Identify light source direction, shadow placement on face/background, any color temperature mismatch, and whether catch lights are visible in the eyes
- brightness: Note whether the subject's skin is properly exposed or clipped, flag any region significantly darker/brighter than the subject
- contrast: State whether blacks are crushed, highlights clipped, or the image looks flat/washed. Reference specific areas
- background: Note exactly what objects are visible, whether any are distracting or off-brand, depth of field separation, background color vs clothing
- framing: Describe headroom, exact eye-line position relative to the rule of thirds, whether shoulders are cut awkwardly
- sharpness: State whether focus is on the eyes specifically, note any motion blur, background sharpness relative to subject
- stability: Identify micro-jitter, drift, or stabilization artifacts and when they occur
- colorTemperature: Name the cast (e.g. "blue daylight spill", "orange tungsten glow", "mixed sources creating green shadow") and a correction value`;

// The AI now returns structured boolean/enum observations ONLY — no numeric scores.
// Scores are computed deterministically by the rubric functions above.
const VISUAL_OBSERVATIONS_SCHEMA = `
Return STRICT JSON only (no markdown). Do NOT include any numeric scores — only the observations below:
{
  "observations": {
    "lightSourceVisible": true/false,
    "lightSourceSide": "front" | "side" | "back" | "overhead" | "unknown",
    "catchLightsVisible": true/false,
    "hardShadowsOnFace": true/false,
    "colorTemperatureMismatch": true/false,
    "skinExposure": "clipped" | "correct" | "underexposed",
    "blownRegions": true/false,
    "blacksCrushed": true/false,
    "highlightsClipped": true/false,
    "imageLooksFlat": true/false,
    "backgroundObjects": "none" | "minimal" | "moderate" | "cluttered",
    "backgroundDistractsFromSubject": true/false,
    "backgroundColorClashesWithSubject": true/false,
    "depthOfFieldSeparation": "strong" | "moderate" | "weak" | "none",
    "eyeLinePosition": "upper-third" | "center" | "lower-third" | "off-frame",
    "excessiveHeadroom": true/false,
    "shouldersCutAwkwardly": true/false,
    "focusOnEyes": true/false,
    "motionBlurPresent": true/false,
    "microJitterVisible": true/false,
    "driftVisible": true/false,
    "stabilizationArtifacts": true/false,
    "colorCast": "none" | "warm" | "cool" | "green" | "mixed",
    "colorCastSeverity": "none" | "slight" | "moderate" | "strong"
  },
  "assessments": {
    "overallTopFix": "the single most impactful fix — specific, measurable",
    "colorGradingRecommendation": "one specific color grading suggestion with a concrete value",
    "lighting": "specific observation referencing light source, shadows, catch lights",
    "lightingSuggestion": "exact measurable fix",
    "brightness": "specific note on skin exposure, blown regions, or underexposed areas",
    "brightnessSuggestion": "exact exposure adjustment",
    "contrast": "specific note on crushed blacks, clipped highlights, or flat image — reference face, background, clothing",
    "contrastSuggestion": "exact fix",
    "colorTemperature": "name the specific cast and where it is most visible",
    "colorTemperatureSuggestion": "specific correction value",
    "background": "list exactly what objects are visible, note anything distracting or off-brand",
    "backgroundSuggestion": "exact change",
    "framing": "headroom, eye-line position, shoulder crop — be exact",
    "framingSuggestion": "specific camera or posture adjustment",
    "sharpness": "focus plane location, any motion blur, background sharpness relative to subject",
    "sharpnessSuggestion": "exact fix",
    "stability": "note micro-jitter, drift, or stabilization artifacts and when they occur",
    "stabilitySuggestion": "exact fix"
  }
}`;

function buildVisualResult(obs: VisualObservations, assessments: Record<string, string>, plan: string) {
  const lightingScore = scoreLighting(obs);
  const brightnessScore = scoreBrightness(obs);
  const contrastScore = scoreContrast(obs);
  const backgroundScore = scoreBackground(obs);
  const framingScore = scoreFraming(obs);
  const sharpnessScore = scoreSharpness(obs);
  const stabilityScore = scoreStability(obs);
  const colorTempScore = scoreColorTemperature(obs);

  const overallVisualScore = Math.round(
    (lightingScore * 0.18) +
    (brightnessScore * 0.12) +
    (contrastScore * 0.10) +
    (backgroundScore * 0.12) +
    (framingScore * 0.14) +
    (sharpnessScore * 0.14) +
    (stabilityScore * 0.12) +
    (colorTempScore * 0.08)
  );

  const severityFor = (score: number): string => {
    if (score >= 90) return "excellent";
    if (score >= 75) return "good";
    if (score >= 55) return "needs work";
    return "critical";
  };

  const base = {
    overallVisualScore,
    topFix: assessments.overallTopFix ?? "",
    colorGradingRecommendation: assessments.colorGradingRecommendation ?? "",
    lighting: {
      level: lightingScore >= 75 ? "high" : lightingScore >= 50 ? "medium" : "low",
      numeric: lightingScore,
      assessment: assessments.lighting ?? "",
      suggestions: [assessments.lightingSuggestion ?? ""],
      severity: severityFor(lightingScore),
    },
    brightness: {
      level: brightnessScore >= 75 ? "high" : brightnessScore >= 50 ? "medium" : "low",
      numeric: brightnessScore,
      assessment: assessments.brightness ?? "",
      suggestions: [assessments.brightnessSuggestion ?? ""],
      severity: severityFor(brightnessScore),
    },
    contrast: {
      level: contrastScore >= 75 ? "high" : contrastScore >= 50 ? "medium" : "low",
      numeric: contrastScore,
      assessment: assessments.contrast ?? "",
      suggestions: [assessments.contrastSuggestion ?? ""],
      severity: severityFor(contrastScore),
    },
    colorTemperature: {
      value: obs.colorCast === "warm" ? "warm" : obs.colorCast === "cool" ? "cool" : "neutral",
      assessment: assessments.colorTemperature ?? "",
      suggestions: [assessments.colorTemperatureSuggestion ?? ""],
      severity: severityFor(colorTempScore),
    },
    background: {
      level: backgroundScore >= 75 ? "clean" : backgroundScore >= 50 ? "normal" : "distracting",
      numeric: backgroundScore,
      assessment: assessments.background ?? "",
      suggestions: [assessments.backgroundSuggestion ?? ""],
      severity: severityFor(backgroundScore),
    },
    framing: {
      level: framingScore >= 75 ? "good" : framingScore >= 50 ? "acceptable" : "poor",
      numeric: framingScore,
      assessment: assessments.framing ?? "",
      suggestions: [assessments.framingSuggestion ?? ""],
      severity: severityFor(framingScore),
    },
    sharpness: {
      level: sharpnessScore >= 75 ? "sharp" : sharpnessScore >= 50 ? "acceptable" : "blurry",
      numeric: sharpnessScore,
      assessment: assessments.sharpness ?? "",
      suggestions: [assessments.sharpnessSuggestion ?? ""],
      severity: severityFor(sharpnessScore),
    },
    stability: {
      level: stabilityScore >= 75 ? "stable" : stabilityScore >= 50 ? "acceptable" : "shaky",
      numeric: stabilityScore,
      assessment: assessments.stability ?? "",
      suggestions: [assessments.stabilitySuggestion ?? ""],
      severity: severityFor(stabilityScore),
    },
  };

  if (plan === "free") {
    // Free plan: only return lighting + overall
    const { brightness, contrast, colorTemperature, background, framing, sharpness, stability, ...freeBase } = base;
    return freeBase;
  }

  return base;
}

export async function analyzeVisuals(frameBase64List: string[], platform: string, plan = "free"): Promise<object> {
  const imageContent = frameBase64List.map(b64 => ({
    type: "image_url",
    image_url: { url: `data:image/jpeg;base64,${b64}` },
  }));

  const isFree = plan === "free";

  const prompt = `${BASE_SYSTEM_PROMPT}

Analyze these ${frameBase64List.length} frame(s) from a ${platform} video.

${VISUAL_DIMENSION_INSTRUCTIONS}

CRITICAL RULE: Never reference frame numbers (frame 1, frame 2, etc.) in your output. Reference approximate time positions (e.g. "in the opening segment", "around the midpoint") or describe what is happening on screen. Always write as if describing what the viewer sees in the final video.

${VISUAL_OBSERVATIONS_SCHEMA}`;

  const defaultObs: VisualObservations = {
    lightSourceVisible: true,
    lightSourceSide: "front",
    catchLightsVisible: false,
    hardShadowsOnFace: false,
    colorTemperatureMismatch: false,
    skinExposure: "correct",
    blownRegions: false,
    blacksCrushed: false,
    highlightsClipped: false,
    imageLooksFlat: false,
    backgroundObjects: "minimal",
    backgroundDistractsFromSubject: false,
    backgroundColorClashesWithSubject: false,
    depthOfFieldSeparation: "moderate",
    eyeLinePosition: "center",
    excessiveHeadroom: false,
    shouldersCutAwkwardly: false,
    focusOnEyes: true,
    motionBlurPresent: false,
    microJitterVisible: false,
    driftVisible: false,
    stabilizationArtifacts: false,
    colorCast: "none",
    colorCastSeverity: "none",
  };

  const defaultAssessments = {
    overallTopFix: "Move your key light 40 degrees to camera right — the current front-on placement is flattening your face and removing all depth.",
    colorGradingRecommendation: "Add +10 warmth to counteract the cool daylight cast and make skin tones more natural.",
    lighting: "Key light is front-facing, eliminating facial shadow and depth",
    lightingSuggestion: "Shift key light 40 degrees to the right to create natural dimensionality",
    brightness: "Exposure looks correct on the face but check for hot spots near any windows",
    brightnessSuggestion: "Confirm highlights are not clipping by checking the histogram before recording",
    contrast: "Image looks slightly flat — blacks are not fully seated",
    contrastSuggestion: "Lower blacks by 10 points in your color grade to add depth without crushing shadow detail",
    colorTemperature: "Neutral with a slight cool cast in the shadows",
    colorTemperatureSuggestion: "Add +5 warmth to neutralize the shadow cast",
    background: "Background is visible but not distracting — check for off-brand items",
    backgroundSuggestion: "Move 2 feet forward from the background to increase depth-of-field separation",
    framing: "Eyes sit at mid-frame rather than the upper third",
    framingSuggestion: "Lower the camera or raise your seat so eyes land at the upper-third line",
    sharpness: "Focus appears to be on the face — confirm it is locked on the eyes specifically",
    sharpnessSuggestion: "Use manual focus and zoom in on the eyes during setup to confirm sharpness",
    stability: "Footage appears stable — check for any drift at the start of each take",
    stabilitySuggestion: "Use a locking ballhead to eliminate the subtle drift common with fluid heads on static shots",
  };

  try {
    const response = await callOpenAI({
      model: "gpt-4o",
      max_completion_tokens: isFree ? 1000 : 2000,
      messages: [{ role: "user", content: [{ type: "text", text: prompt }, ...imageContent] }],
    });

    const raw = parseJson<{ observations?: Partial<VisualObservations>; assessments?: Record<string, string> }>(
      response.choices[0]?.message?.content ?? "{}",
      {}
    );

    const obs: VisualObservations = { ...defaultObs, ...(raw.observations ?? {}) };
    const assessments = { ...defaultAssessments, ...(raw.assessments ?? {}) };

    return buildVisualResult(obs, assessments, plan);
  } catch (err) {
    logger.warn({ err }, "Visual analysis failed, using defaults");
    return buildVisualResult(defaultObs, defaultAssessments, plan);
  }
}

export async function analyzeAudio(
  transcript: string,
  whisperConfidence: number,
  audioPath?: string
): Promise<object> {
  const fillerWordPattern = /\b(um+|uh+|er+|ah+|like|you know|basically|literally|actually|so|right\?)\b/gi;
  const fillerWordMatches = transcript.match(fillerWordPattern) || [];
  const fillerWordCount = fillerWordMatches.length;

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

  // Measure audio signals deterministically if audioPath is available
  let audioSignals = { noiseFloorDb: -35, peakVariationDb: 6, hasDropouts: false };
  if (audioPath) {
    audioSignals = await measureAudioSignals(audioPath);
  }

  // Compute all numeric scores deterministically
  const clarityScore = scoreAudioClarity(whisperConfidence);
  const volumeScore = scoreAudioVolume(audioSignals.peakVariationDb, audioSignals.hasDropouts);
  const noiseScore = scoreBackgroundNoise(audioSignals.noiseFloorDb);
  const fillerScore = scoreFillerWords(fillerRatio);

  // AI is only asked to write the assessment text, never the numbers
  const response = await callOpenAI({
    model: "gpt-4o-mini",
    max_completion_tokens: 800,
    messages: [{ role: "user", content: `You are a professional audio engineer and presentation coach. Write assessment text only — do NOT produce any numeric scores.

Rules:
- Reference actual words, patterns, or moments you detect — never generic advice
- For volume: identify specific moments where it dips or spikes
- For clarity: note consonant clipping, room reverb, proximity effect, or compression artifacts
- For background noise: identify the TYPE of noise (HVAC hum, street noise, keyboard, breathing) and when it is most noticeable
- For filler words: name the most distracting one to fix first and give a specific replacement strategy
- Never say "decent", "good", "acceptable", "generally" without a specific observation backing it up

Transcript snippet: "${transcript.substring(0, 500)}"
Filler words detected: ${fillerBreakdownStr || "none"} (${fillerWordCount} total — ${Math.round(fillerRatio * 100)}% of speech)
Whisper transcription confidence: ${clarityScore}%
Volume peak variation: ${audioSignals.peakVariationDb.toFixed(1)} dB
Noise floor estimate: ${audioSignals.noiseFloorDb.toFixed(1)} dBFS

Return STRICT JSON only — assessment strings, NO numbers:
{
  "volumeAssessment": "...",
  "volumeSuggestion": "...",
  "volumeEffect": "...",
  "clarityAssessment": "...",
  "claritySuggestion": "...",
  "clarityEffect": "...",
  "noiseAssessment": "...",
  "noiseSuggestion": "...",
  "noiseEffect": "...",
  "fillerSuggestion": "...",
  "fillerEffect": "..."
}` }],
  });

  const txt = parseJson<Record<string, string>>(response.choices[0]?.message?.content ?? "{}", {});

  const severityFor = (score: number): string => {
    if (score >= 90) return "excellent";
    if (score >= 75) return "good";
    if (score >= 55) return "needs work";
    return "critical";
  };

  return {
    audioVolume: {
      level: volumeScore >= 75 ? "high" : volumeScore >= 50 ? "medium" : "low",
      numeric: volumeScore,
      assessment: txt.volumeAssessment ?? `Peak variation of ${audioSignals.peakVariationDb.toFixed(1)} dB detected — aim for under 4 dB for broadcast-level consistency`,
      suggestions: [txt.volumeSuggestion ?? "Normalize to -14 LUFS and add a limiter ceiling at -1 dBTP"],
      effect: txt.volumeEffect ?? "Inconsistent volume forces viewers to adjust their device mid-watch",
      severity: severityFor(volumeScore),
    },
    audioClarity: {
      level: clarityScore >= 75 ? "good" : clarityScore >= 50 ? "acceptable" : "poor",
      numeric: clarityScore,
      assessment: txt.clarityAssessment ?? `Whisper confidence at ${clarityScore}% — speech is ${clarityScore >= 80 ? "highly intelligible" : "partially unclear"}`,
      suggestions: [txt.claritySuggestion ?? "Record in a treated space or closer to the mic to improve intelligibility"],
      effect: txt.clarityEffect ?? "Low clarity reduces comprehension and viewer retention",
      severity: severityFor(clarityScore),
    },
    backgroundNoise: {
      level: noiseScore >= 75 ? "low" : noiseScore >= 50 ? "medium" : "high",
      numeric: noiseScore,
      assessment: txt.noiseAssessment ?? `Noise floor estimated at ${audioSignals.noiseFloorDb.toFixed(1)} dBFS`,
      suggestions: [txt.noiseSuggestion ?? "Run a noise reduction pass using a 0.5s room tone sample as the noise profile"],
      effect: txt.noiseEffect ?? "Audible background noise undermines production quality",
      severity: severityFor(noiseScore),
    },
    fillerWords: {
      level: fillerLevel,
      numeric: fillerWordCount,
      score: fillerScore,
      breakdown: fillerBreakdown,
      assessment: `${fillerWordCount} filler words detected (${Math.round(fillerRatio * 100)}% of speech)${fillerBreakdownStr ? `: ${fillerBreakdownStr}` : ""}`,
      suggestions: [txt.fillerSuggestion ?? "Replace the most frequent filler with a deliberate pause"],
      effect: txt.fillerEffect ?? "Filler words at this frequency reduce perceived expertise and slow delivery pace",
      severity: severityFor(fillerScore),
    },
  };
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
- Before suggesting to cut any line, ask yourself: does this line create tension, establish a problem, or advance the story? If yes, do NOT suggest cutting it — suggest repositioning it instead.
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
  segments: Array<{ start: number; end: number; text: string }> = [],
  plan = "free"
): Promise<object> {
  const isFree = plan === "free";
  const chapterPoints = buildChapterPoints(segments, 10);

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

You are a ${platform} SEO expert. Generate ONE strong title using a curiosity gap strategy (keyword in first 3 words, under 70 chars). Write TWO compelling sentences for the description hook. Generate 3 high-relevance tags.

Platform rules: ${guide}

Transcript: "${transcript.substring(0, 800)}"

TAGS RULE: YouTube tags must NOT include the # symbol. Output plain tag text only.

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

Description rules:
- First 2 lines must clearly state what the video is about and who it's for. No hype, no fluff.
- Use the primary keyword naturally in the first sentence.
- Include a ## Chapters section with complete, descriptive labels — never fragments.
- Include a links section: "🔗 [Add your links here]"
- End with ONE genuine call to action. One sentence only.
- 150-400 words total. Never end with generic motivational closers.

TAGS RULE: No # symbols. Plain text only, 25-30 tags.

Return STRICT JSON — use EXACT times from chapter list. Chapter labels must be complete phrases:
{"titles":["title 1","title 2","title 3","title 4","title 5"],"description":"full description","hashtags":[{"tag":"Tag","effect":"audience"}],"timestamps":[{"time":"0:00","label":"complete label"}],"titleStrategies":["curiosity gap","how-to","number-based","problem/solution","bold claim"]}` }],
  });

  const parsed = parseJson<{ titles: string[]; description: string; hashtags: object[]; timestamps: Array<{ time: string; label: string }>; titleStrategies?: string[] }>(
    response.choices[0]?.message?.content ?? "{}",
    {
      titles: ["Engaging title for your video", "How-to title with keywords", "5 Things About Your Topic", "The Problem Solved in One Video", "The Result You Actually Get"],
      description: "Your video description with chapters and call to action.\n\n## Chapters\n0:00 Introduction\n\n[Links]\nSubscribe: ",
      hashtags: [{ tag: "VideoContent", effect: "Broad reach" }],
      timestamps: [{ time: "0:00", label: "Introduction" }],
    }
  );

  if (chapterPoints.length) {
    parsed.timestamps = parsed.timestamps.map((t, i) => ({
      time: chapterPoints[i]?.time ?? t.time,
      label: t.label,
    }));
  }

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

  const clipCount = isFree ? 1 : 3;

  const response = await callOpenAI({
    model: "gpt-4o",
    max_completion_tokens: isFree ? 600 : 2000,
    messages: [{
      role: "user",
      content: `${BASE_SYSTEM_PROMPT}

You are a short-form content strategist who has helped 500+ creators repurpose long videos into viral clips.

Target platforms: ${targetPlatformList}
Total video duration: ${Math.round(totalDuration)}s

Identify the best ${clipCount} clip(s). For each:
- Quote the exact opening line from the transcript
- State which platforms fit and WHY
${!isFree ? `- ONE tactical production note
- Engagement potential: High / Medium / Low with a one-sentence reason` : ""}

CRITICAL: Use ONLY the provided index numbers.

Chunks: ${JSON.stringify(chunkSummaries)}

Return STRICT JSON:
{
  "clips": [
    {
      "chunkIndex": 0,
      "startSec": 45,
      "endSec": 105,
      "title": "punchy clip title",
      "hook": "exact opening words",
      "whyItWorks": "one sentence",
      "platforms": ["TikTok"],
      "platformReason": "why"${!isFree ? `,
      "tacticalNote": "one production tip",
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
  const audio = audioAnalysis as Record<string, { numeric?: number; score?: number }>;

  // All inputs here are already deterministically computed — this remains stable
  const metrics = [
    visual.lighting?.numeric ?? 70,
    visual.brightness?.numeric ?? 70,
    visual.sharpness?.numeric ?? 70,
    visual.stability?.numeric ?? 70,
    visual.background?.numeric ?? 70,
    visual.framing?.numeric ?? 70,
    audio.audioClarity?.numeric ?? 70,
    audio.audioVolume?.numeric ?? 70,
    audio.fillerWords?.score ?? 70,
    audio.backgroundNoise?.numeric ?? 70,
  ];

  return Math.round(Math.max(0, Math.min(100, metrics.reduce((a, b) => a + b, 0) / metrics.length)));
}

export { logger };
