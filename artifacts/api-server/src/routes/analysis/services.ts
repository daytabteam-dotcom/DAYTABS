import { exec, spawn } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import { db } from "@workspace/db";
import { analysisJobsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../../lib/logger";
import { openai } from "../../lib/openai";
import { logTokenUsage, usageTokens } from "../../lib/logTokens";
import { toFile } from "openai";

export const execAsync = promisify(exec);

// ─── Deterministic Scoring Rubrics ───────────────────────────────────────────
//
// Numeric scores are computed here in TypeScript, not by the AI — EXCEPT for
// context-dependent judgments (e.g. "is this background appropriate for the
// topic?") which require semantic understanding and are returned as enums by the AI.

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
  // Background — now includes CONTEXT APPROPRIATENESS
  backgroundObjects: "none" | "minimal" | "moderate" | "cluttered";
  backgroundDistractsFromSubject: boolean;
  backgroundColorClashesWithSubject: boolean;
  depthOfFieldSeparation: "strong" | "moderate" | "weak" | "none";
  backgroundContextAppropriate: "yes" | "neutral" | "no"; // NEW: is BG appropriate for the video topic?
  backgroundContextIssue: string; // NEW: if "no", describe why (e.g. "kitchen appliances behind a business software demo")
  backgroundSuggestionContextual: string; // NEW: specific suggestion based on actual background content
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
  // Engagement signals — NEW
  facialEngagement: "high" | "medium" | "low"; // eye contact, expressiveness
  presenceOnCamera: "commanding" | "adequate" | "weak"; // energy, confidence
  visualVariety: "high" | "medium" | "low"; // any B-roll, cuts, graphics, or purely static talking head
}

// NEW: Pacing observations derived from transcript timing
interface PacingObservations {
  avgWordGapMs: number;           // average ms between words
  longPauseCount: number;         // pauses > 1.5s
  longPauseTimestamps: number[];  // when they occur (seconds into video)
  wordsPerMinute: number;
  pacingRating: "fast" | "good" | "slow" | "very_slow";
  engagementRiskTimestamps: Array<{ at: number; reason: string }>; // predicted drop-off moments
}

export type AnalysisMode = "talking_first" | "visual_first" | "mixed";

export interface SpeechAnalysis {
  mode: AnalysisMode;
  speechRatio: number;
  firstSpeechAt: number | null;
  lastSpeechAt: number | null;
  spokenSegmentCount: number;
  totalSpeechSeconds: number;
  totalWords: number;
  longestSpeechRun: number;
  hasMeaningfulSpeech: boolean;
  summary: string;
}

type ContentFormat =
  | "talking_head"
  | "tutorial_howto"
  | "art_process"
  | "cooking_recipe"
  | "chill_ambience"
  | "work_with_me"
  | "vlog_lifestyle"
  | "screen_demo"
  | "product_demo"
  | "cinematic_montage"
  | "gaming"
  | "performance_music"
  | "diy_craft"
  | "transformation"
  | "reaction_commentary"
  | "general_visual";

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
  // NEW: penalize context-inappropriate backgrounds heavily
  if (obs.backgroundContextAppropriate === "no") score -= 30;
  if (obs.backgroundContextAppropriate === "neutral") score -= 5;
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

// NEW: Score pacing/engagement
export function scorePacing(pacing: PacingObservations): number {
  let score = 100;
  if (pacing.pacingRating === "slow") score -= 20;
  if (pacing.pacingRating === "very_slow") score -= 40;
  if (pacing.pacingRating === "fast") score -= 5; // slight penalty for rushing
  // Each long pause is a viewer risk moment
  score -= Math.min(pacing.longPauseCount * 8, 40);
  if (pacing.wordsPerMinute < 100) score -= 15;
  if (pacing.wordsPerMinute > 200) score -= 10; // too fast = hard to follow
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
  return Math.round(Math.max(0, Math.min(100, whisperConfidence * 100)));
}

function scoreBackgroundNoise(noiseFloorDb: number): number {
  if (noiseFloorDb <= -50) return 100;
  if (noiseFloorDb <= -45) return 90;
  if (noiseFloorDb <= -40) return 80;
  if (noiseFloorDb <= -35) return 70;
  if (noiseFloorDb <= -30) return 55;
  if (noiseFloorDb <= -25) return 40;
  return 25;
}

function scoreFillerWords(fillerRatio: number): number {
  if (fillerRatio <= 0.02) return 100;
  if (fillerRatio <= 0.04) return 85;
  if (fillerRatio <= 0.06) return 70;
  if (fillerRatio <= 0.08) return 55;
  if (fillerRatio <= 0.12) return 40;
  return 25;
}

// ─── NEW: Pacing Analysis ──────────────────────────────────────────────────────

/**
 * Analyzes word-level timing data from Whisper to detect pacing issues.
 * Returns drop-off risk moments with explanations.
 */
export function analyzePacing(
  segments: Array<{ start: number; end: number; text: string }>,
  wordTimings?: Array<{ start: number; end: number; word: string }>
): PacingObservations {
  const totalDuration = segments[segments.length - 1]?.end ?? 0;
  const totalWords = segments.reduce((acc, s) => acc + s.text.split(/\s+/).filter(Boolean).length, 0);
  const wordsPerMinute = totalDuration > 0 ? Math.round((totalWords / totalDuration) * 60) : 130;

  const longPauseTimestamps: number[] = [];
  const longPauseCount_threshold = 1.5; // seconds
  const engagementRiskTimestamps: Array<{ at: number; reason: string }> = [];

  // Detect pauses between segments
  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i - 1]!;
    const curr = segments[i]!;
    const gap = curr.start - prev.end;
    if (gap >= longPauseCount_threshold) {
      longPauseTimestamps.push(prev.end);
      engagementRiskTimestamps.push({
        at: prev.end,
        reason: `${gap.toFixed(1)}s silence gap — viewer likely to disengage here`,
      });
    }
  }

  // Detect slow delivery sections (< 80 wpm within a segment)
  for (const seg of segments) {
    const segWords = seg.text.split(/\s+/).filter(Boolean).length;
    const segDur = seg.end - seg.start;
    if (segDur > 3 && segWords > 0) {
      const segWpm = (segWords / segDur) * 60;
      if (segWpm < 80) {
        engagementRiskTimestamps.push({
          at: seg.start,
          reason: `Very slow delivery (~${Math.round(segWpm)} wpm) — viewer attention likely drops`,
        });
      }
    }
  }

  // Detect if hook (first 15s) is weak on pacing
  const first15 = segments.filter(s => s.start < 15);
  const first15Words = first15.reduce((a, s) => a + s.text.split(/\s+/).filter(Boolean).length, 0);
  const first15Dur = first15[first15.length - 1]?.end ?? 15;
  const hookWpm = first15Dur > 0 ? (first15Words / first15Dur) * 60 : 130;
  if (hookWpm < 100 && first15Dur > 5) {
    engagementRiskTimestamps.push({
      at: 0,
      reason: `Hook delivery is slow (~${Math.round(hookWpm)} wpm in first 15s) — viewer may leave before the value is revealed`,
    });
  }

  // Avg word gap from word-level timings if available
  let avgWordGapMs = 300; // default assumption
  if (wordTimings && wordTimings.length > 1) {
    let totalGap = 0;
    for (let i = 1; i < wordTimings.length; i++) {
      totalGap += (wordTimings[i]!.start - wordTimings[i - 1]!.end) * 1000;
    }
    avgWordGapMs = Math.round(totalGap / (wordTimings.length - 1));
    // Flag conversations with unusually large word gaps
    if (avgWordGapMs > 600) {
      engagementRiskTimestamps.push({
        at: 0,
        reason: `Average gap between words is ${avgWordGapMs}ms — delivery feels hesitant throughout`,
      });
    }
  }

  let pacingRating: PacingObservations["pacingRating"] = "good";
  if (wordsPerMinute < 90) pacingRating = "very_slow";
  else if (wordsPerMinute < 120) pacingRating = "slow";
  else if (wordsPerMinute > 185) pacingRating = "fast";

  // Sort by time
  engagementRiskTimestamps.sort((a, b) => a.at - b.at);

  return {
    avgWordGapMs,
    longPauseCount: longPauseTimestamps.length,
    longPauseTimestamps,
    wordsPerMinute,
    pacingRating,
    engagementRiskTimestamps: engagementRiskTimestamps.slice(0, 10),
  };
}

// ─── NEW: Retention Forecasting ──────────────────────────────────────────────

export interface RetentionForecast {
  estimatedRetentionPct: number; // e.g. 42
  retentionGrade: "A" | "B" | "C" | "D" | "F";
  summary: string; // 2-sentence plain-language summary
  dropOffMoments: Array<{
    at: string;       // "00:08"
    atSec: number;
    severity: "high" | "medium" | "low";
    reason: string;   // specific, actionable
    fix: string;      // how to fix this specific moment
  }>;
  retentionCurvePoints: Array<{ sec: number; pct: number }>; // estimated curve for charting
}

export interface MediaMetadata {
  durationSec: number;
  width: number | null;
  height: number | null;
  aspectRatio: number | null;
  orientation: "vertical" | "horizontal" | "square" | "unknown";
  isVertical: boolean;
  isShortForm: boolean;
}

export interface FormatProfile {
  contentFormat: ContentFormat;
  formatConfidence: "high" | "medium" | "low";
  primarySubject: string;
  contentSummary: string;
  viewerIntent: string;
  successFactors: string[];
  ignoredSignals: string[];
  framingFocus: string;
  backgroundFocus: string;
}

function fmtSecs(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/**
 * Builds a simulated retention curve based on all analysis signals.
 * This is an evidence-based estimate, not a random curve.
 */
export function buildRetentionForecast(
  visualScore: number,
  audioScore: number,
  pacingObs: PacingObservations,
  fillerRatio: number,
  segments: Array<{ start: number; end: number; text: string }>,
  hookStrength: "strong" | "moderate" | "weak", // determined by AI
  topicRelevanceOfBackground: "yes" | "neutral" | "no",
  totalDurationSec: number,
  formatProfile?: Partial<FormatProfile> | null,
): RetentionForecast {
  // Start from a conservative creator-content baseline. This is a professional
  // forecast, not a motivational score, so "average" should feel average.
  let baseRetention = totalDurationSec <= 90 ? 58 : 44;

  // Visual quality impact
  baseRetention += (visualScore - 70) * 0.15;

  // Audio quality impact (more important than visual)
  baseRetention += (audioScore - 70) * 0.2;

  // Hook strength (biggest single factor in retention)
  if (hookStrength === "strong") baseRetention += 10;
  else if (hookStrength === "weak") baseRetention -= 22;

  // Pacing
  if (pacingObs.pacingRating === "good") baseRetention += 2;
  if (pacingObs.pacingRating === "slow") baseRetention -= 10;
  if (pacingObs.pacingRating === "very_slow") baseRetention -= 20;

  // Filler words
  if (fillerRatio > 0.08) baseRetention -= 8;
  else if (fillerRatio > 0.04) baseRetention -= 4;

  // Background appropriateness
  if (topicRelevanceOfBackground === "no") baseRetention -= 8;

  // Long pauses
  baseRetention -= Math.min(pacingObs.longPauseCount * 4, 18);

  // Clamp
  const estimatedRetentionPct = Math.max(8, Math.min(82, Math.round(baseRetention)));

  const retentionGrade: RetentionForecast["retentionGrade"] =
    estimatedRetentionPct >= 72 ? "A" :
    estimatedRetentionPct >= 58 ? "B" :
    estimatedRetentionPct >= 43 ? "C" :
    estimatedRetentionPct >= 28 ? "D" : "F";

  // Build retention curve: starts at 100%, drops based on identified risk points
  const curvePoints: Array<{ sec: number; pct: number }> = [];
  let currentPct = 100;
  const step = Math.max(1, Math.floor(totalDurationSec / 20));

  // Initial cliff: first 5 seconds always has highest drop
  const initialDropFactor = hookStrength === "weak" ? 0.55 : hookStrength === "moderate" ? 0.75 : 0.88;
  curvePoints.push({ sec: 0, pct: 100 });
  curvePoints.push({ sec: 5, pct: Math.round(100 * initialDropFactor) });
  currentPct = Math.round(100 * initialDropFactor);

  for (let sec = 10; sec <= totalDurationSec; sec += step) {
    // Natural decay
    const decayRate = 0.985;
    currentPct = Math.round(currentPct * decayRate);

    // Extra drop at pacing risk moments
    if (pacingObs.longPauseTimestamps.some(t => Math.abs(t - sec) < step)) {
      currentPct = Math.round(currentPct * 0.93);
    }

    curvePoints.push({ sec, pct: Math.max(5, currentPct) });
  }

  // Normalize so the final retention matches our estimate
  const lastPoint = curvePoints[curvePoints.length - 1];
  if (lastPoint && lastPoint.pct !== estimatedRetentionPct) {
    const scale = estimatedRetentionPct / lastPoint.pct;
    for (const p of curvePoints) {
      if (p.sec > 5) {
        p.pct = Math.max(5, Math.min(100, Math.round(p.pct * scale)));
      }
    }
  }

  // Build drop-off moments from pacing observations
  const dropOffMoments: RetentionForecast["dropOffMoments"] = [];

  // Always add hook as the first drop-off point with context
  const contentFormat = formatProfile?.contentFormat ?? "general_visual";
  const viewerIntent = formatProfile?.viewerIntent ?? "understand the video quickly and stay for the payoff";
  const isProcessLedFormat = [
    "art_process",
    "cooking_recipe",
    "diy_craft",
    "transformation",
    "work_with_me",
    "chill_ambience",
    "cinematic_montage",
    "general_visual",
  ].includes(contentFormat);
  const hookRiskReason = isProcessLedFormat
    ? "The opening does not show enough meaningful visual change early, so viewers may not understand the payoff fast enough."
    : "Weak hook — the opening doesn't give the viewer a compelling reason to keep watching. Value is revealed too late.";
  const hookRiskFix = isProcessLedFormat
    ? "Open on the clearest visual transformation, strongest texture/detail moment, or the finished result before any slow setup."
    : "Open with your most surprising result or a specific problem your viewer already feels. The first sentence must answer 'why should I keep watching?'";
  const moderateHookReason = isProcessLedFormat
    ? "The opening communicates the topic, but the strongest visual payoff arrives too late to stop a fast scroll."
    : "Hook is present but not sharp enough to stop a scroll — it describes what the video is about rather than creating urgency.";
  const moderateHookFix = isProcessLedFormat
    ? "Replace the opening with a faster reveal of visible progress, a stronger before/after contrast, or a more satisfying first action."
    : "Replace the opening with a specific failure, surprising outcome, or bold claim that happens before any context-setting.";

  if (hookStrength === "weak") {
    dropOffMoments.push({
      at: "00:05",
      atSec: 5,
      severity: "high",
      reason: hookRiskReason,
      fix: hookRiskFix,
    });
  } else if (hookStrength === "moderate") {
    dropOffMoments.push({
      at: "00:05",
      atSec: 5,
      severity: "medium",
      reason: moderateHookReason,
      fix: moderateHookFix,
    });
  }

  // Add pacing risk moments
  for (const risk of pacingObs.engagementRiskTimestamps.slice(0, 5)) {
    if (risk.at > 3) { // skip if overlapping with hook
      dropOffMoments.push({
        at: fmtSecs(risk.at),
        atSec: risk.at,
        severity: risk.reason.includes("silence") ? "high" : "medium",
        reason: risk.reason,
        fix: risk.reason.includes("silence")
          ? "Cut this pause in post. If the pause is intentional for emphasis, shorten it to under 0.5s."
          : "Increase delivery speed for this section or cut to B-roll/graphic to maintain visual momentum.",
      });
    }
  }

  dropOffMoments.sort((a, b) => a.atSec - b.atSec);

  const summaryLines = [
    `Estimated ${estimatedRetentionPct}% average retention (${retentionGrade} grade).`,
    hookStrength === "weak"
      ? isProcessLedFormat
        ? "The opening visual payoff is the primary risk — viewers may leave before the transformation or satisfying moment becomes obvious."
        : "The hook is the primary risk — most viewers will leave in the first 8 seconds before the value is clear."
      : pacingObs.pacingRating === "very_slow" || pacingObs.pacingRating === "slow"
      ? `Pacing is the main retention killer — ${pacingObs.longPauseCount} silence gaps and ${Math.round(pacingObs.wordsPerMinute)} wpm delivery will cause mid-video drop-offs.`
      : isProcessLedFormat
      ? `Retention depends on how quickly you deliver visible progress toward the viewer's goal: ${viewerIntent}.`
      : "Retention is limited by a combination of pacing gaps and presentation energy. Fix the drop-off points before publishing.",
  ];

  return {
    estimatedRetentionPct,
    retentionGrade,
    summary: summaryLines.join(" "),
    dropOffMoments,
    retentionCurvePoints: curvePoints,
  };
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
      if (code === 0) { resolve(); return; }
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
    if (stat && stat.size > 0) jpgs.push(file);
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
  await db.update(analysisJobsTable).set(setData).where(eq(analysisJobsTable.id, jobId));
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

export async function getMediaMetadata(filePath: string): Promise<MediaMetadata> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries stream=width,height -show_entries format=duration -of json "${filePath}" 2>&1`
    );
    const parsed = JSON.parse(stdout || "{}") as {
      format?: { duration?: string };
      streams?: Array<{ width?: number; height?: number }>;
    };
    const stream = parsed.streams?.find((entry) => Number(entry.width) > 0 && Number(entry.height) > 0);
    const width = stream?.width ?? null;
    const height = stream?.height ?? null;
    const durationSec = Number.parseFloat(parsed.format?.duration ?? "0");
    const aspectRatio = width && height ? width / height : null;
    const orientation =
      width && height
        ? height > width
          ? "vertical"
          : width > height
          ? "horizontal"
          : "square"
        : "unknown";
    const isVertical = orientation === "vertical";
    const isShortForm = isVertical || (Number.isFinite(durationSec) && durationSec > 0 && durationSec <= 60);

    return {
      durationSec: Number.isFinite(durationSec) ? durationSec : 0,
      width,
      height,
      aspectRatio,
      orientation,
      isVertical,
      isShortForm,
    };
  } catch (err: any) {
    if (err.message?.includes("ENOENT") || err.code === "ENOENT") {
      throw new Error("ffmpeg is not installed on this server. Please install ffmpeg to process videos.");
    }
    logger.warn({ err, filePath }, "Failed to read media metadata, falling back to duration only");
    const durationSec = await getMediaDuration(filePath);
    return {
      durationSec,
      width: null,
      height: null,
      aspectRatio: null,
      orientation: "unknown",
      isVertical: false,
      isShortForm: durationSec > 0 && durationSec <= 60,
    };
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

export async function transcribeAudio(audioPath: string): Promise<{
  text: string;
  segments: Array<{ start: number; end: number; text: string }>;
  wordTimings?: Array<{ start: number; end: number; word: string }>;
  whisperConfidence: number;
}> {
  const actualDuration = await getMediaDuration(audioPath);
  logger.info({ audioPath, actualDuration }, "Starting transcription");
  const stats = await fs.stat(audioPath);
  const shouldChunk = actualDuration > 0 && (stats.size > 20 * 1024 * 1024 || actualDuration > 20 * 60);

  if (shouldChunk) {
    const chunkDir = path.join(path.dirname(audioPath), "transcript-chunks");
    const chunkSeconds = 10 * 60;
    await fs.mkdir(chunkDir, { recursive: true });
    try {
      const combinedText: string[] = [];
      const combinedSegments: Array<{ start: number; end: number; text: string }> = [];
      const combinedWords: Array<{ start: number; end: number; word: string }> = [];
      const confidences: number[] = [];
      const totalChunks = Math.max(1, Math.ceil(actualDuration / chunkSeconds));

      for (let i = 0; i < totalChunks; i++) {
        const startSec = i * chunkSeconds;
        const durationSec = Math.min(chunkSeconds, Math.max(actualDuration - startSec, 0));
        if (durationSec <= 0) continue;

        const chunkPath = path.join(chunkDir, `chunk_${String(i).padStart(3, "0")}.mp3`);
        await runMediaCommand(
          "ffmpeg",
          ["-nostdin", "-hide_banner", "-loglevel", "error", "-threads", "1", "-ss", String(startSec), "-t", String(durationSec), "-i", audioPath, "-ar", "16000", "-ac", "1", "-c:a", "libmp3lame", "-q:a", "5", chunkPath, "-y"],
          10 * 60 * 1000,
          `ffmpeg audio chunk ${i + 1}`
        );

        const chunk = await transcribeAudioSingleFile(chunkPath, durationSec, 180000);
        if (chunk.text) combinedText.push(chunk.text);
        confidences.push(chunk.whisperConfidence);
        combinedSegments.push(...chunk.segments.map(s => ({
          start: startSec + s.start,
          end: startSec + s.end,
          text: s.text,
        })));
        if (chunk.wordTimings?.length) {
          combinedWords.push(...chunk.wordTimings.map(w => ({
            start: startSec + w.start,
            end: startSec + w.end,
            word: w.word,
          })));
        }
      }

      const avgConfidence = confidences.length
        ? confidences.reduce((sum, n) => sum + n, 0) / confidences.length
        : 0;
      return {
        text: combinedText.join(" ").trim(),
        segments: combinedSegments,
        wordTimings: combinedWords.length ? combinedWords : undefined,
        whisperConfidence: Math.max(0, Math.min(1, avgConfidence)),
      };
    } catch (err) {
      logger.warn({ err, audioPath }, "Chunked transcription failed, falling back to single-file transcription");
    } finally {
      await fs.rm(chunkDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  return transcribeAudioSingleFile(audioPath, actualDuration, 120000);
}

async function transcribeAudioSingleFile(
  audioPath: string,
  actualDuration: number,
  timeoutMs: number
): Promise<{
  text: string;
  segments: Array<{ start: number; end: number; text: string }>;
  wordTimings?: Array<{ start: number; end: number; word: string }>;
  whisperConfidence: number;
}> {
  const audioBuffer = await fs.readFile(audioPath);
  try {
    const file = await toFile(audioBuffer, "audio.mp3");
    const response = await withTimeout(
      openai.audio.transcriptions.create({
        file,
        model: "whisper-1",
        response_format: "verbose_json",
        timestamp_granularities: ["word", "segment"],
      } as Parameters<typeof openai.audio.transcriptions.create>[0]),
      timeoutMs,
      "Whisper verbose transcription"
    );

    const r = response as unknown as {
      text: string;
      segments?: Array<{ start: number; end: number; text: string; avg_logprob?: number }>;
      words?: Array<{ start: number; end: number; word: string }>;
    };

    // Compute confidence from segment log probabilities
    const logProbs = (r.segments ?? []).map(s => s.avg_logprob ?? -0.5).filter(v => isFinite(v));
    const avgLogProb = logProbs.length > 0 ? logProbs.reduce((a, b) => a + b, 0) / logProbs.length : -0.5;
    // Convert log prob to 0-1 confidence (logprob of 0 = perfect, -1 = poor)
    const whisperConfidence = Math.max(0, Math.min(1, 1 + avgLogProb));

    const rawSegments = (r.segments ?? []).map(s => ({
      start: s.start,
      end: s.end,
      text: s.text.trim(),
    }));

    const wordTimings = (r.words ?? []).map(w => ({
      start: w.start,
      end: w.end,
      word: w.word,
    }));

    if (rawSegments.length > 0) {
      const segments = actualDuration > 0
        ? rawSegments.map(s => ({ ...s, start: Math.min(s.start, actualDuration), end: Math.min(s.end, actualDuration) }))
        : rawSegments;
      return { text: r.text || "", segments, wordTimings, whisperConfidence };
    }

    if (r.text) {
      return { text: r.text, segments: buildApproximateSegments(r.text, actualDuration), whisperConfidence };
    }
  } catch (err) {
    logger.warn({ err, audioPath }, "Whisper verbose transcription failed, falling back to basic");
  }

  try {
    const file = await toFile(audioBuffer, "audio.mp3");
    const response = await withTimeout(
      openai.audio.transcriptions.create({ file, model: "whisper-1" }),
      timeoutMs,
      "Whisper basic transcription"
    );
    if (response.text) {
      return { text: response.text, segments: buildApproximateSegments(response.text, actualDuration), whisperConfidence: 0.6 };
    }
  } catch (err) {
    logger.warn({ err, audioPath }, "Whisper basic transcription also failed");
  }

  return { text: "", segments: [], whisperConfidence: 0 };
}

export async function extractAudio(videoPath: string, outputPath: string): Promise<void> {
  await runMediaCommand(
    "ffmpeg",
    ["-nostdin", "-hide_banner", "-loglevel", "error", "-threads", "1", "-i", videoPath, "-vn", "-ar", "16000", "-ac", "1", "-c:a", "libmp3lame", "-q:a", "4", outputPath, "-y"],
    getConfiguredTimeoutMs("FFMPEG_AUDIO_EXTRACTION_TIMEOUT_MS", 30 * 60 * 1000),
    "ffmpeg audio extraction"
  );
}

export async function extractFrames(videoPath: string, framesDir: string, count = 5, maxWidth = 640): Promise<string[]> {
  const duration = await getMediaDuration(videoPath);
  const safeWidth = Math.max(320, Math.floor(maxWidth));
  const frameScaleFilter = `scale='min(${safeWidth},iw)':-2`;
  const seekTimeoutMs = getConfiguredTimeoutMs("FFMPEG_FRAME_SEEK_TIMEOUT_MS", 45000);
  const fallbackTimeoutMs = getConfiguredTimeoutMs("FFMPEG_FRAME_FALLBACK_TIMEOUT_MS", 90000);

  if (duration <= 0) {
    await runMediaCommand(
      "ffmpeg",
      ["-nostdin", "-hide_banner", "-loglevel", "error", "-threads", "1", "-i", videoPath, "-vf", `select=lt(n\\,${count}),${frameScaleFilter}`, "-vsync", "vfr", "-q:v", "8", path.join(framesDir, "frame_%03d.jpg"), "-y"],
      fallbackTimeoutMs,
      "ffmpeg frame extraction select"
    );
  } else {
    const interval = duration / (count + 1);
    for (let i = 1; i <= count; i++) {
      const ts = Math.min(Math.max(interval * i, 0.1), Math.max(duration - 0.1, 0.1)).toFixed(2);
      const outPath = path.join(framesDir, `frame_${String(i).padStart(3, "0")}.jpg`);
      try {
        await runMediaCommand(
          "ffmpeg",
          ["-nostdin", "-hide_banner", "-loglevel", "error", "-threads", "1", "-ss", ts, "-i", videoPath, "-frames:v", "1", "-vf", frameScaleFilter, "-q:v", "8", outPath, "-y"],
          seekTimeoutMs,
          `ffmpeg frame extraction ${i}`
        );
      } catch {
        try {
          await runMediaCommand(
            "ffmpeg",
            ["-nostdin", "-hide_banner", "-loglevel", "error", "-threads", "1", "-i", videoPath, "-ss", ts, "-frames:v", "1", "-vf", frameScaleFilter, "-q:v", "8", outPath, "-y"],
            fallbackTimeoutMs,
            `ffmpeg accurate frame extraction ${i}`
          );
        } catch (accurateSeekErr) {
          logger.warn({ err: accurateSeekErr, i, ts, outPath }, "Frame extraction retry failed");
          await fs.unlink(outPath).catch(() => {});
        }
      }
    }

    const jpgs = await listExtractedFrameJpegs(framesDir, count);
    if (jpgs.length === 0) {
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
    throw new Error("Could not extract any video frames from this file.");
  }

  const frameBase64List: string[] = [];
  for (const f of jpgs) {
    const buf = await fs.readFile(path.join(framesDir, f));
    frameBase64List.push(buf.toString("base64"));
  }
  return frameBase64List;
}

export async function measureAudioSignals(audioPath: string): Promise<{
  noiseFloorDb: number;
  peakVariationDb: number;
  hasDropouts: boolean;
}> {
  try {
    const { stderr } = await execAsync(
      `ffmpeg -i "${audioPath}" -af volumedetect -f null - 2>&1 || true`
    );
    const meanMatch = stderr.match(/mean_volume:\s*([-\d.]+)\s*dB/);
    const maxMatch = stderr.match(/max_volume:\s*([-\d.]+)\s*dB/);
    const meanDb = meanMatch ? parseFloat(meanMatch[1]!) : -30;
    const maxDb = maxMatch ? parseFloat(maxMatch[1]!) : -10;
    const peakVariationDb = Math.abs(maxDb - meanDb);
    const silences = await detectSilences(audioPath, 1.5, -40);
    const hasDropouts = silences.length > 2;
    const noiseFloorDb = meanDb - 20;
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
      const ratio = i / Math.max(lines.length, 1);
      const endRatio = Math.min(i + 2, lines.length) / Math.max(lines.length, 1);
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

async function callOpenAI(body: object, userId?: number): Promise<{ choices: Array<{ message: { content: string } }>; usage?: { prompt_tokens?: number | null; completion_tokens?: number | null } | null }> {
  const response = await openai.chat.completions.create(body as Parameters<typeof openai.chat.completions.create>[0]) as { choices: Array<{ message: { content: string } }>; usage?: { prompt_tokens?: number | null; completion_tokens?: number | null } | null };
  const model = typeof (body as { model?: unknown }).model === "string" ? (body as { model: string }).model : "gpt-4o";
  if (userId) {
    await logTokenUsage({
      userId,
      feature: "videoAnalysis",
      model,
      ...usageTokens(response.usage),
    }).catch((err) => logger.warn({ err, userId, model }, "Failed to log video analysis token usage"));
  }
  return response;
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()) as T;
  } catch {
    return fallback;
  }
}

function buildOutputLanguageInstruction(
  transcript: string,
  speechAnalysis?: SpeechAnalysis,
): string {
  if (!speechAnalysis?.hasMeaningfulSpeech) {
    return "Write all output in English only. Do not use any other language.";
  }

  const sample = transcript.slice(0, 1200);
  const hasKana = /[\u3040-\u30ff]/.test(sample);
  const hasHangul = /[\uac00-\ud7af]/.test(sample);
  const hasArabic = /[\u0600-\u06ff]/.test(sample);
  const hasCyrillic = /[\u0400-\u04ff]/.test(sample);
  const hasDevanagari = /[\u0900-\u097f]/.test(sample);
  const hasHan = /[\u4e00-\u9fff]/.test(sample);

  if (hasKana) return "Write all output in Japanese. Do not translate to English.";
  if (hasHangul) return "Write all output in Korean. Do not translate to English.";
  if (hasArabic) return "Write all output in Arabic. Do not translate to English.";
  if (hasCyrillic) return "Write all output in the same Cyrillic-script language used by the speaker in the transcript. Do not translate to English.";
  if (hasDevanagari) return "Write all output in the same Devanagari-script language used by the speaker in the transcript. Do not translate to English.";
  if (hasHan) return "Write all output in Simplified Chinese. Do not translate to English.";
  return "Write all output in the same language the speaker uses in the transcript. If the transcript is mainly English, write English. Do not translate unless asked.";
}

const BASE_SYSTEM_PROMPT = `You are an expert content strategist and video consultant. You have personally reviewed over 1,000 YouTube, TikTok, and Instagram videos. You give feedback the way a senior consultant would in a paid review session: specific, confident, and focused on what actually moves the needle.

Never use: "Great job!", "Consider trying", "You might want to", "As a content creator", "In conclusion", or any filler phrase. Every sentence must contain a specific observation or action. Write in second person ("your video", "you open with"). Be direct but not harsh. Lead every section with the most important insight first. If something is genuinely good, say so in one word and move on.`;

const EDITING_SYSTEM_PROMPT = `You are a senior video editor and YouTube strategist with 10 years experience. You give feedback like a professional editor reviewing a client's rough cut: specific, direct, actionable.

Rules:
- Always reference exact timestamps or quote exact words
- Only suggest cutting genuinely redundant content
- When suggesting a cut, explain what value is lost vs gained in one sentence
- Reference platform-specific best practices
- Never say "consider" or "you might want to"`;

// UPDATED: Now asks the AI for context-aware background judgment and engagement signals
const VISUAL_OBSERVATIONS_SCHEMA = `
Return STRICT JSON only (no markdown). Do NOT include any numeric scores — only the observations below.

CRITICAL for backgroundContextAppropriate: Judge whether the background matches the VIDEO'S TOPIC AND BRAND. A kitchen for a business software demo = "no". A home office for a productivity app = "yes". A cluttered living room for a luxury brand = "no". Be specific about WHY in backgroundContextIssue.

CRITICAL for FORMAT DETECTION:
- Detect what kind of video this actually is before judging it.
- Choose one contentFormat from: talking_head, tutorial_howto, art_process, cooking_recipe, chill_ambience, work_with_me, vlog_lifestyle, screen_demo, product_demo, cinematic_montage, gaming, performance_music, diy_craft, transformation, reaction_commentary, general_visual
- If the video is process-led, hands-on, overhead, screen-based, ambience-led, or subject-led, do NOT judge it like a presenter video.
- For art/craft/cooking/process videos, framing means subject visibility and work-surface readability, not eye-line.
- For chill/work-with-me/ambience videos, success is atmosphere, consistency, and low distraction, not presenter urgency.
- For screen demos, success is readability, cursor focus, and task clarity.

{
  "formatProfile": {
    "contentFormat": "one of the allowed values",
    "formatConfidence": "high" | "medium" | "low",
    "primarySubject": "what the viewer is mainly supposed to watch",
    "contentSummary": "one sentence on what this video is actually about based on visuals, not noisy transcript fragments",
    "viewerIntent": "why someone would choose to watch this type of video",
    "successFactors": ["3 to 5 concrete things that matter most for this format"],
    "ignoredSignals": ["signals that should NOT be emphasized for this format"],
    "framingFocus": "how framing should be judged for this format",
    "backgroundFocus": "how environment fit should be judged for this format"
  },
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
    "backgroundContextAppropriate": "yes" | "neutral" | "no",
    "backgroundContextIssue": "describe exactly what is wrong with background context, or empty string if fine",
    "eyeLinePosition": "upper-third" | "center" | "lower-third" | "off-frame",
    "excessiveHeadroom": true/false,
    "shouldersCutAwkwardly": true/false,
    "focusOnEyes": true/false,
    "motionBlurPresent": true/false,
    "microJitterVisible": true/false,
    "driftVisible": true/false,
    "stabilizationArtifacts": true/false,
    "colorCast": "none" | "warm" | "cool" | "green" | "mixed",
    "colorCastSeverity": "none" | "slight" | "moderate" | "strong",
    "facialEngagement": "high" | "medium" | "low",
    "presenceOnCamera": "commanding" | "adequate" | "weak",
    "visualVariety": "high" | "medium" | "low"
  },
  "assessments": {
    "overallTopFix": "the single most impactful fix — specific, measurable",
    "colorGradingRecommendation": "one specific color grading suggestion with a concrete value",
    "lighting": "specific observation referencing light source, shadows, catch lights",
    "lightingSuggestion": "Fix now: exact post-production or edit fix. Next video: exact production fix.",
    "brightness": "specific note on skin exposure, blown regions, or underexposed areas",
    "brightnessSuggestion": "Fix now: exact exposure adjustment in editing software. Next video: exact production fix.",
    "contrast": "specific note on crushed blacks, clipped highlights, or flat image — reference face, background, clothing",
    "contrastSuggestion": "Fix now: exact contrast fix in post. Next video: exact production fix.",
    "colorTemperature": "name the specific cast and where it is most visible",
    "colorTemperatureSuggestion": "Fix now: specific color correction value. Next video: exact lighting or white balance fix.",
    "background": "describe exactly what objects are visible AND whether they are appropriate for the video topic — name the topic explicitly",
    "backgroundSuggestion": "Fix now: contextual post or crop fix that references what is visible. Next video: what background to shoot against instead.",
    "framing": "headroom, eye-line position, shoulder crop — be exact",
    "framingSuggestion": "Fix now: exact crop or reframe adjustment. Next video: exact camera or posture adjustment.",
    "sharpness": "focus plane location, any motion blur, background sharpness relative to subject",
    "sharpnessSuggestion": "Fix now: exact sharpening or cleanup move. Next video: exact focus, shutter, or lens fix.",
    "stability": "note micro-jitter, drift, or stabilization artifacts and when they occur",
    "stabilitySuggestion": "Fix now: exact stabilization edit fix. Next video: exact support or camera movement fix.",
    "presenceFeedback": "direct feedback on eye contact, energy, confidence on camera",
    "presenceSuggestion": "one specific actionable improvement for on-camera presence",
    "hookStrength": "strong" | "moderate" | "weak",
    "hookStrengthReason": "why the hook is or isn't working — reference the actual opening seconds"
  }
}`;

function buildVisualResult(
  obs: VisualObservations,
  assessments: Record<string, string>,
  plan: string,
  formatProfile = getDefaultFormatProfile(),
) {
  const lightingScore = scoreLighting(obs);
  const brightnessScore = scoreBrightness(obs);
  const contrastScore = scoreContrast(obs);
  const backgroundScore = scoreBackground(obs); // now context-aware
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
    if (score >= 95) return "excellent";
    if (score >= 80) return "good";
    if (score >= 60) return "needs work";
    return "critical";
  };

  const base = {
    formatProfile,
    overallVisualScore,
    topFix: assessments.overallTopFix ?? "",
    colorGradingRecommendation: assessments.colorGradingRecommendation ?? "",
    hookStrength: (assessments.hookStrength as "strong" | "moderate" | "weak") ?? "moderate",
    hookStrengthReason: assessments.hookStrengthReason ?? "",
    presence: {
      level: obs.presenceOnCamera,
      facialEngagement: obs.facialEngagement,
      visualVariety: obs.visualVariety,
      assessment: assessments.presenceFeedback ?? "",
      suggestion: assessments.presenceSuggestion ?? "",
    },
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
      contextAppropriate: obs.backgroundContextAppropriate,
      contextIssue: obs.backgroundContextIssue ?? "",
      assessment: assessments.background ?? "",
      // Use the AI's contextual suggestion instead of a generic one
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
    const { brightness, contrast, colorTemperature, background, framing, sharpness, stability, presence, ...freeBase } = base;
    return freeBase;
  }

  return base;
}

function getDefaultFormatProfile(): FormatProfile {
  return {
    contentFormat: "general_visual",
    formatConfidence: "low",
    primarySubject: "the main action on screen",
    contentSummary: "A visual-first video centered on the main subject and its progression toward a clear payoff.",
    viewerIntent: "understand the visual idea quickly and stay for a clear payoff",
    successFactors: ["clear subject visibility", "steady progression", "strong opening", "clear payoff"],
    ignoredSignals: ["presenter eye-line scoring when the subject is not a face"],
    framingFocus: "Judge framing by how easy it is to read the main subject, not by presenter eye-line unless a face is the clear focal point.",
    backgroundFocus: "Judge the environment by whether it supports the actual video topic and keeps attention on the subject.",
  };
}

interface VisualAnalysisRequestOptions {
  detail?: "low" | "high";
  focus?: "understanding" | "quality" | "balanced";
}

interface VisualAnalysisParts {
  observations: VisualObservations;
  assessments: Record<string, string>;
  formatProfile: FormatProfile;
}

function getDefaultVisualObservations(): VisualObservations {
  return {
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
    backgroundContextAppropriate: "neutral",
    backgroundContextIssue: "",
    backgroundSuggestionContextual: "",
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
    facialEngagement: "medium",
    presenceOnCamera: "adequate",
    visualVariety: "low",
  };
}

function getDefaultVisualAssessments(): Record<string, string> {
  return {
    overallTopFix: "Ensure the main subject becomes obvious earlier and stays visually clear throughout the video.",
    colorGradingRecommendation: "Add +10 warmth to counteract any cool daylight cast and make skin tones more natural.",
    lighting: "Key light positioning needs review — front-facing light eliminates facial depth.",
    lightingSuggestion: "Fix now: Add a gentle exposure mask or shadow lift to separate the subject from the background. Next video: Shift the key light 40 degrees to the right to create natural dimensionality.",
    brightness: "Check for exposure inconsistency between subject and background.",
    brightnessSuggestion: "Fix now: Lower highlights slightly and raise exposure only until the subject reads clearly without clipping. Next video: Confirm highlights are not clipping by checking the histogram before recording.",
    contrast: "Image may appear slightly flat — blacks should be seated properly.",
    contrastSuggestion: "Fix now: Lower blacks by about 10 points and add a small midtone contrast bump in the grade. Next video: Light the subject and background separately so the image has depth before grading.",
    colorTemperature: "Check for any mixed light sources causing color cast.",
    colorTemperatureSuggestion: "Fix now: Add roughly +5 warmth and rebalance tint until neutrals stop drifting. Next video: Set white balance manually instead of letting mixed light sources fight each other.",
    background: "Background needs to be evaluated for topic appropriateness, not just visual cleanliness.",
    backgroundSuggestion: "Fix now: Crop tighter or darken the background slightly so distracting objects pull less attention. Next video: Choose a backdrop that signals credibility and matches your video topic — a clean wall, bookshelf, or branded setup works for most content categories.",
    framing: "Frame the actual subject so the viewer can understand what matters without searching around the image.",
    framingSuggestion: "Fix now: Reframe the shot so the main subject fills more of the frame and dead space is reduced. Next video: Set camera height and distance before recording so the viewer never has to search for the subject.",
    sharpness: "Confirm focus is locked on the main subject during setup.",
    sharpnessSuggestion: "Fix now: Add only light sharpening and avoid pushing clarity so far that edges look brittle. Next video: Use manual focus or focus lock on the key subject area before recording.",
    stability: "Use a locking tripod to eliminate any movement.",
    stabilitySuggestion: "Fix now: Stabilize lightly in post and trim the moments where drift is most visible. Next video: Use a locking ballhead to eliminate drift common with fluid heads on static shots.",
    presenceFeedback: "Evaluate whether the visible subject has enough visual energy and clarity to hold attention.",
    presenceSuggestion: "Increase visual intention in the opening so the main subject reads instantly.",
    hookStrength: "moderate",
    hookStrengthReason: "The opening needs to create more urgency in the first 5 seconds.",
  };
}

function normalizeFormatProfile(
  raw: Partial<FormatProfile> | undefined,
  fallback = getDefaultFormatProfile(),
): FormatProfile {
  return {
    ...fallback,
    ...(raw ?? {}),
    successFactors: Array.isArray(raw?.successFactors) && raw.successFactors.length
      ? raw.successFactors.slice(0, 5)
      : fallback.successFactors,
    ignoredSignals: Array.isArray(raw?.ignoredSignals) && raw.ignoredSignals.length
      ? raw.ignoredSignals.slice(0, 4)
      : fallback.ignoredSignals,
  };
}

async function requestVisualAnalysisParts(
  frameBase64List: string[],
  platform: string,
  plan = "free",
  transcript?: string,
  userId?: number,
  options: VisualAnalysisRequestOptions = {},
): Promise<VisualAnalysisParts> {
  const detail = options.detail ?? "high";
  const focus = options.focus ?? "balanced";
  const imageContent = frameBase64List.map((b64) => ({
    type: "image_url",
    image_url: { url: `data:image/jpeg;base64,${b64}`, detail },
  }));
  const isFree = plan === "free";
  const transcriptContext = transcript
    ? `\n\nVIDEO TOPIC CONTEXT (secondary evidence only): "${transcript.substring(0, 400)}"\nUse transcript text only as weak context. If sparse words conflict with the visuals, trust the visuals.`
    : "";
  const focusInstruction = focus === "understanding"
    ? `PRIMARY GOAL: Understand what this video is actually about from visuals across the timeline.
- Identify the real format, primary subject, progression, and payoff.
- Write contentSummary from what is visibly happening, not from noisy transcript fragments.
- If this looks like art, craft, cooking, ambience, or process content, say so directly.
- Do not overclaim fine-detail issues unless they are obvious across the set of frames.`
    : focus === "quality"
    ? `PRIMARY GOAL: Judge quality-critical details using these higher-resolution frames.
- Focus on sharpness, lighting, framing, color accuracy, texture detail, and text readability.
- Keep the video topic aligned with the visible subject already understood from the broader visual pass.
- Do not rename the topic based on isolated transcript words or random objects in the frame.`
    : `PRIMARY GOAL: Balance topic understanding with quality judgment, but keep packaging aligned with the visible subject.`;

  const prompt = `${BASE_SYSTEM_PROMPT}

Analyze these ${frameBase64List.length} ${detail}-detail frame(s) from a ${platform} video.${transcriptContext}

${focusInstruction}

For EACH dimension, write exactly as a professional video producer giving paid notes:
- Reference where in the frame or when in the video the issue occurs
- Never use vague praise without a specific physical observation
- If something scores above 85, name the ONE thing that would push it to 100
- Suggest a concrete, measurable fix
- Every suggestion field must use this format exactly: "Fix now: ... Next video: ..."

CRITICAL RULE: Never reference frame numbers. Reference approximate time positions.

BACKGROUND CONTEXT RULE: Judge background against the VIDEO'S TOPIC. If the creator is discussing a business app but is standing in a kitchen with appliances visible — that is "no" for backgroundContextAppropriate, even if the shot is technically clean. Explain what is wrong and suggest a specific alternative that fits the topic.

FORMAT RULE: If this is not mainly a face-to-camera presenter video, avoid presenter-specific language like eye-line, headroom, and on-camera presence unless it is genuinely relevant to what the viewer is watching.

TOPIC LOCK RULE: Never invent a different niche just because a sparse transcript fragment mentions unrelated words. Packaging and summary must stay anchored to what is visibly happening in the frames.

${VISUAL_OBSERVATIONS_SCHEMA}`;

  const defaultObs = getDefaultVisualObservations();
  const defaultAssessments = getDefaultVisualAssessments();
  const defaultFormatProfile = getDefaultFormatProfile();

  const response = await callOpenAI({
    model: isFree ? "gpt-4o-mini" : "gpt-4o",
    max_completion_tokens: isFree ? 1200 : 2500,
    messages: [{ role: "user", content: [{ type: "text", text: prompt }, ...imageContent] }],
  }, userId);

  const raw = parseJson<{ formatProfile?: Partial<FormatProfile>; observations?: Partial<VisualObservations>; assessments?: Record<string, string> }>(
    response.choices[0]?.message?.content ?? "{}",
    {},
  );

  return {
    observations: { ...defaultObs, ...(raw.observations ?? {}) },
    assessments: { ...defaultAssessments, ...(raw.assessments ?? {}) },
    formatProfile: normalizeFormatProfile(raw.formatProfile, defaultFormatProfile),
  };
}

const HIGH_DETAIL_ASSESSMENT_KEYS = [
  "lighting",
  "lightingSuggestion",
  "brightness",
  "brightnessSuggestion",
  "contrast",
  "contrastSuggestion",
  "colorTemperature",
  "colorTemperatureSuggestion",
  "framing",
  "framingSuggestion",
  "sharpness",
  "sharpnessSuggestion",
  "stability",
  "stabilitySuggestion",
  "colorGradingRecommendation",
] as const;

const HIGH_DETAIL_OBSERVATION_KEYS: Array<keyof VisualObservations> = [
  "lightSourceVisible",
  "lightSourceSide",
  "catchLightsVisible",
  "hardShadowsOnFace",
  "colorTemperatureMismatch",
  "skinExposure",
  "blownRegions",
  "blacksCrushed",
  "highlightsClipped",
  "imageLooksFlat",
  "eyeLinePosition",
  "excessiveHeadroom",
  "shouldersCutAwkwardly",
  "focusOnEyes",
  "motionBlurPresent",
  "microJitterVisible",
  "driftVisible",
  "stabilizationArtifacts",
  "colorCast",
  "colorCastSeverity",
];

export async function analyzeVisualsHybrid(
  lowDetailFrames: string[],
  highDetailFrames: string[],
  platform: string,
  plan = "free",
  transcript?: string,
  userId?: number,
): Promise<object> {
  const fallbackProfile = getDefaultFormatProfile();
  const defaultObs = getDefaultVisualObservations();
  const defaultAssessments = getDefaultVisualAssessments();

  try {
    const understandingPromise = requestVisualAnalysisParts(lowDetailFrames, platform, plan, transcript, userId, {
      detail: "low",
      focus: "understanding",
    });
    const qualityPromise = requestVisualAnalysisParts(highDetailFrames, platform, plan, transcript, userId, {
      detail: "high",
      focus: "quality",
    });

    const [understanding, quality] = await Promise.all([understandingPromise, qualityPromise]);

    const mergedObservations: VisualObservations = {
      ...defaultObs,
      ...understanding.observations,
    };
    for (const key of HIGH_DETAIL_OBSERVATION_KEYS) {
      if (quality.observations[key] !== undefined) {
        (mergedObservations as unknown as Record<string, unknown>)[key] = quality.observations[key];
      }
    }

    const mergedAssessments: Record<string, string> = {
      ...defaultAssessments,
      ...understanding.assessments,
    };
    for (const key of HIGH_DETAIL_ASSESSMENT_KEYS) {
      if (quality.assessments[key] !== undefined) {
        mergedAssessments[key] = quality.assessments[key];
      }
    }

    if (quality.assessments.overallTopFix && /sharp|light|frame|color|text|texture/i.test(quality.assessments.overallTopFix)) {
      mergedAssessments.overallTopFix = quality.assessments.overallTopFix;
    }

    return buildVisualResult(
      mergedObservations,
      mergedAssessments,
      plan,
      understanding.formatProfile ?? fallbackProfile,
    );
  } catch (err) {
    logger.warn({ err }, "Hybrid visual analysis failed, falling back to single-pass visual analysis");
    return analyzeVisuals(highDetailFrames.length ? highDetailFrames : lowDetailFrames, platform, plan, transcript, userId, {
      detail: "high",
      focus: "balanced",
    });
  }
}

export async function analyzeVisuals(
  frameBase64List: string[],
  platform: string,
  plan = "free",
  transcript?: string,
  userId?: number,
  options: VisualAnalysisRequestOptions = {},
): Promise<object> {
  try {
    const parts = await requestVisualAnalysisParts(frameBase64List, platform, plan, transcript, userId, options);
    return buildVisualResult(parts.observations, parts.assessments, plan, parts.formatProfile);
  } catch (err) {
    logger.warn({ err }, "Visual analysis failed, using defaults");
    return buildVisualResult(getDefaultVisualObservations(), getDefaultVisualAssessments(), plan, getDefaultFormatProfile());
  }
}

export async function analyzeAudio(
  transcript: string,
  whisperConfidence: number,
  audioPath?: string,
  speechAnalysis?: SpeechAnalysis,
  userId?: number,
): Promise<object> {
  // Expanded filler word list
  const fillerWordPattern = /\b(um+|uh+|er+|ah+|like|you know|basically|literally|actually|so|right\?|kind of|sort of|I mean|you see|hmm+|well|anyway)\b/gi;
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

  let audioSignals = { noiseFloorDb: -35, peakVariationDb: 6, hasDropouts: false };
  if (audioPath) {
    audioSignals = await measureAudioSignals(audioPath);
  }

  const initialClarityScore = scoreAudioClarity(whisperConfidence);
  const initialVolumeScore = scoreAudioVolume(audioSignals.peakVariationDb, audioSignals.hasDropouts);
  const initialNoiseScore = scoreBackgroundNoise(audioSignals.noiseFloorDb);
  const fillerScore = scoreFillerWords(fillerRatio);

  const languageInstruction = buildOutputLanguageInstruction(transcript, speechAnalysis);
  const response = await callOpenAI({
    model: "gpt-4o-mini",
    max_completion_tokens: 800,
    messages: [{ role: "user", content: `You are a professional audio engineer and presentation coach. Write assessment text only — do NOT produce any numeric scores.

${languageInstruction}

Rules:
- Reference actual words, patterns, or moments — never generic advice
- For volume: identify specific moments where it dips or spikes
- For clarity: note consonant clipping, room reverb, proximity effect, or compression artifacts
- For background noise: identify the TYPE of noise (HVAC hum, street noise, keyboard, breathing) and when most noticeable
- For filler words: name the most distracting one to fix first and give a specific replacement strategy
- Do not add reassurance or motivational praise
- If you identify an audible flaw, state the flaw directly and explain the consequence
- Never say "excellent", "decent", "good", "acceptable", or "generally" without a specific observation that justifies it

Transcript snippet: "${transcript.substring(0, 500)}"
Filler words detected: ${fillerBreakdownStr || "none"} (${fillerWordCount} total — ${Math.round(fillerRatio * 100)}% of speech)
Whisper transcription confidence: ${initialClarityScore}%
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
  }, userId);

  const txt = parseJson<Record<string, string>>(response.choices[0]?.message?.content ?? "{}", {});

  const severityFor = (score: number): string => {
    if (score >= 95) return "excellent";
    if (score >= 80) return "good";
    if (score >= 60) return "needs work";
    return "critical";
  };

  const capScoreForEvidence = (score: number, text: string): number => {
    const lower = text.toLowerCase();
    const severe = /\b(noticeable|clipping|clips|muffled|unclear|hard to hear|dropout|dropouts|distort|distortion|distract|distracting|echo|reverb|hum|hiss|room noise|background noise|spike|dip|plosive|sibilance)\b/.test(lower);
    const minor = /\b(slight|minor|small|subtle|occasional)\b/.test(lower);
    if (severe) return Math.min(score, 72);
    if (minor) return Math.min(score, 84);
    return score;
  };

  const volumeScore = capScoreForEvidence(initialVolumeScore, `${txt.volumeAssessment ?? ""} ${txt.volumeSuggestion ?? ""} ${txt.volumeEffect ?? ""}`);
  const clarityScore = capScoreForEvidence(initialClarityScore, `${txt.clarityAssessment ?? ""} ${txt.claritySuggestion ?? ""} ${txt.clarityEffect ?? ""}`);
  const noiseScore = capScoreForEvidence(initialNoiseScore, `${txt.noiseAssessment ?? ""} ${txt.noiseSuggestion ?? ""} ${txt.noiseEffect ?? ""}`);

  return {
    audioVolume: {
      level: volumeScore >= 75 ? "high" : volumeScore >= 50 ? "medium" : "low",
      numeric: volumeScore,
      assessment: txt.volumeAssessment ?? `Peak variation of ${audioSignals.peakVariationDb.toFixed(1)} dB — aim for under 4 dB`,
      suggestions: [txt.volumeSuggestion ?? "Normalize to -14 LUFS and add a limiter ceiling at -1 dBTP"],
      effect: txt.volumeEffect ?? "Inconsistent volume forces viewers to adjust their device mid-watch",
      severity: severityFor(volumeScore),
    },
    audioClarity: {
      level: clarityScore >= 75 ? "good" : clarityScore >= 50 ? "acceptable" : "poor",
      numeric: clarityScore,
      assessment: txt.clarityAssessment ?? `Whisper confidence at ${initialClarityScore}%`,
      suggestions: [txt.claritySuggestion ?? "Record closer to the mic or in a treated space"],
      effect: txt.clarityEffect ?? "Low clarity reduces comprehension and viewer retention",
      severity: severityFor(clarityScore),
    },
    backgroundNoise: {
      level: noiseScore >= 75 ? "low" : noiseScore >= 50 ? "medium" : "high",
      numeric: noiseScore,
      assessment: txt.noiseAssessment ?? `Noise floor at ${audioSignals.noiseFloorDb.toFixed(1)} dBFS`,
      suggestions: [txt.noiseSuggestion ?? "Run a noise reduction pass using a 0.5s room tone sample"],
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
      effect: txt.fillerEffect ?? "Filler words reduce perceived expertise and slow delivery pace",
      severity: severityFor(fillerScore),
    },
  };
}

export async function generateVideoName(transcript: string, fallbackName?: string, userId?: number): Promise<string> {
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
- No generic labels

Script: "${transcript.substring(0, 1800)}"

Return: {"videoName":"specific video name"}`,
      }],
    }, userId);

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

export async function analyzeContentAndPackaging(
  transcript: string,
  segments: Array<{ start: number; end: number; text: string }>,
  platforms: string[],
  requestedSections: { includeEditing: boolean; includePublish: boolean },
  audioPath?: string,
  plan = "free",
  speechAnalysis?: SpeechAnalysis,
  videoName?: string,
  formatProfile?: Partial<FormatProfile> | null,
  userId?: number,
): Promise<{ editing?: Record<string, unknown>; seo?: Record<string, Record<string, unknown>> }> {
  const includeEditing = requestedSections.includeEditing;
  const includePublish = requestedSections.includePublish;
  if (!includeEditing && !includePublish) return {};

  const lastSeg = segments[segments.length - 1];
  const totalDuration = lastSeg?.end ?? 0;
  const isFree = plan === "free";
  const isVisualFirst = speechAnalysis?.mode === "visual_first" || !speechAnalysis?.hasMeaningfulSpeech;
  const languageInstruction = buildOutputLanguageInstruction(transcript, speechAnalysis);
  const strategyContext = segments.length
    ? segments
        .slice(0, Math.min(segments.length, 10))
        .map((seg) => `${fmtSecs(seg.start)}-${fmtSecs(seg.end)} ${seg.text}`)
        .join("\n")
    : transcript.substring(0, 1200);
  const formatHint = formatProfile
    ? `Detected format: ${formatProfile.contentFormat ?? "general_visual"}.
Primary subject: ${formatProfile.primarySubject ?? "the main subject on screen"}.
Visual summary: ${formatProfile.contentSummary ?? "A visual-first video centered on the main subject and payoff"}.
Viewer intent: ${formatProfile.viewerIntent ?? "get the promised payoff quickly"}.
Success factors: ${(formatProfile.successFactors ?? []).join(", ") || "clarity, pacing, payoff"}.
Ignored signals: ${(formatProfile.ignoredSignals ?? []).join(", ") || "none"}.`
    : "";

  const defaultEditing = {
    mode: isVisualFirst ? "visual_first" : speechAnalysis?.mode ?? "talking_first",
    topic: videoName ?? (isVisualFirst ? "Visual process / payoff video" : "Speaker-led informational video"),
    audienceGoal: isVisualFirst
      ? "See the visual payoff quickly and understand why the result is worth staying for."
      : "Get the main idea quickly and stay because the delivery feels tight, useful, and easy to follow.",
    viewPotential: isVisualFirst
      ? "This can earn views if the payoff becomes obvious early and the middle keeps showing visible progress."
      : "This can earn views if the value proposition lands early and the pacing stays tighter than the average niche upload.",
    editingStyle: isVisualFirst
      ? "Use progression-first editing: open on the strongest visual state, cut repetition hard, and let each cut reveal clear progress."
      : "Use clarity-first editing: remove throat-clearing, open on the strongest claim, and keep every cut moving the viewer toward the takeaway.",
    introGuidance: "Skip a long branded intro. Open on the strongest promise, result, or tension point before any setup.",
    pacingGuidance: isVisualFirst
      ? "Keep visual momentum high. If progress is not visible for more than a few seconds, add a cut, zoom, overlay, or time jump."
      : "Front-load the point, cut pauses aggressively, and treat every slow sentence as a candidate for tightening or visual support.",
    motionGuidance: isVisualFirst
      ? "Use motion only when it helps the viewer read progress: punch-ins, speed ramps, reframes, and overlays should clarify the work, not decorate it."
      : "Use moderate motion. Podcasts, commentary, and educational videos usually perform better with intentional punch-ins, angle swaps, captions, and selective B-roll than with constant movement.",
    hookApproach: "Make the first 5-15 seconds prove why this video is worth a click by showing the payoff, conflict, or strongest line immediately.",
    packagingAngle: "Package the video around the clearest viewer outcome, not a vague summary of what happens on screen.",
    nowFixes: [
      "Trim the slowest setup lines before the main payoff or thesis appears.",
      "Move the clearest outcome, strongest quote, or best visual moment into the opening.",
      "Use pattern breaks where attention is likely to dip: B-roll, punch-ins, captions, or a cleaner cut point.",
    ],
    nextVideoFixes: [
      "Plan the opening around the payoff before recording so the first 10 seconds do more work.",
      "Record cleaner pickup lines or alternate angles for sections that usually drag.",
      "Design the shoot so every minute creates a visible change, proof point, or emotional turn.",
    ],
    editorNotes: [
      "Match editing intensity to the format. Podcasts and educational videos usually want restraint plus clarity, not hyperactive motion.",
      "If the topic is niche or technical, on-screen text should clarify the takeaway rather than repeat every spoken sentence.",
    ],
    rewrittenHook: undefined,
    editingSuggestions: isVisualFirst
      ? [
          "Open on the strongest visual change before any slow setup so the first three seconds communicate the payoff immediately.",
        ]
      : [
          "Cut pauses longer than 1.5 seconds for tighter pacing",
        ],
  };

  const defaultSeoForPlatform = (platform: string) => ({
    titles: [platform === "youtube_shorts" ? "Short-form title" : "Your Video Title"],
    description: platform === "youtube_shorts" ? "Two sentences." : "Description.",
    hashtags: [],
    timestamps: [{ time: "0:00", label: "Introduction" }],
    titleStrategies: platform === "youtube_long" || platform === "youtube_shorts"
      ? ["curiosity gap", "how-to", "number-based", "problem/solution", "bold claim"]
      : undefined,
    algorithmFit: "",
    packagingStrategy: "",
    nicheReferences: [],
    audiencePromise: "",
  });

  const chapterPoints = buildChapterPoints(segments, 10);
  const platformGuide: Record<string, string> = {
    youtube_long: "YouTube long-form: titles 60-70 chars, curiosity gap required, keyword in first 3 words.",
    youtube_shorts: "YouTube Shorts: punchy titles under 50 chars, high-energy action verbs",
    tiktok: "TikTok: trend-aware, conversational, 3-5 hashtags from trending niches",
    instagram: "Instagram Reels: lifestyle-forward, mix of niche and broad hashtags",
    linkedin: "LinkedIn: professional framing, thought leadership angle, low hashtag count",
    x: "X/Twitter: max 2-3 hashtags, punchy and opinionated",
  };

  const sectionList = [
    includeEditing ? `"editing"` : null,
    includePublish ? `"seo"` : null,
  ].filter(Boolean).join(", ");

  const editingInstructions = includeEditing
    ? `
[EDITING SECTION]
Video name: "${videoName ?? "Video analysis"}"
Speech profile: ${speechAnalysis?.summary ?? "Speech data not available."}
${formatHint}

Return an "editing" object only if editing was requested.
- Name the topic or angle as specifically as the evidence allows.
- Explain the editing style this format actually wants.
- Say whether this video needs an intro, how fast the pacing should feel, and whether the edit should be simple, moderate, or motion-heavy.
- Separate "fix now on this cut" from "fix in the next shoot".
- Ground every recommendation in real editing techniques, not generic motivation.
- Include a blunt viewPotential sentence.
- Identify the strongest hook moments that would stop a scroll. Copy exact transcript text when speech is available.
- Give specific editing suggestions referencing actual content and platform best practices.
- If you return a rewritten hook, it must be a complete sentence, max 30 words, natural, direct, and confident.`
    : "";

  const publishInstructions = includePublish
    ? `
[PUBLISH SECTION]
Return a "seo" object keyed by requested platform id only.
- Generate packaging using the platform rules below and the same transcript evidence.
- If transcript signal is limited, prefer accurate format-aware packaging over specific nouns from sparse or noisy transcript fragments.
- Never infer cooking, food, dessert, recipe, or kitchen themes unless the detected format or transcript clearly supports that topic.
- Only include fields the UI uses: titles, description, hashtags, timestamps, titleStrategies, algorithmFit, packagingStrategy, nicheReferences, audiencePromise.`
    : "";

  const responseShape = `{
${includeEditing ? `  "editing": {
    "topic": "specific topic or angle",
    "audienceGoal": "what the viewer wants from this video",
    "viewPotential": "one sentence",
    "editingStyle": "best editing style for this format and topic",
    "introGuidance": "does this need an intro or should it cold open",
    "pacingGuidance": "how fast or restrained the pacing should be",
    "motionGuidance": "how much motion, punch-ins, captions, or visual movement this format wants",
    "hookApproach": "what the opening should do",
    "packagingAngle": "what the title/thumbnail/packaging should sell",
    "nowFixes": ["3 direct instructions for this current cut"],
    "nextVideoFixes": ["3 direct instructions for the next shoot"],
    "editorNotes": ["2 to 4 short format-aware editing truths for this creator"],
    "hookTexts": ["exact sentence from transcript"],
    "editingSuggestions": ["specific tip referencing actual content"],
    "rewrittenHook": "optional rewritten opening"
  }${includePublish ? "," : ""}` : ""}
${includePublish ? `  "seo": {
    "${platforms[0] ?? "youtube_long"}": {
      "titles": ["title options"],
      "description": "full description",
      "hashtags": [{"tag":"Tag","effect":"audience"}],
      "timestamps": [{"time":"0:00","label":"complete label"}],
      "titleStrategies": ["curiosity gap","how-to","number-based","problem/solution","bold claim"],
      "algorithmFit": "why this packaging matches platform behavior",
      "packagingStrategy": "what audience promise these titles are selling",
      "nicheReferences": ["notes"],
      "audiencePromise": "core promise"
    }
  }` : ""}
}`;

  try {
    const response = await callOpenAI({
      model: isFree ? "gpt-4o-mini" : "gpt-4o",
      response_format: { type: "json_object" },
      max_completion_tokens: isFree ? 1800 : 4200,
      messages: [{
        role: "system",
        content: `${BASE_SYSTEM_PROMPT}

${EDITING_SYSTEM_PROMPT}

${languageInstruction}

You are analyzing one video transcript and must return a single JSON object with only these top-level key(s): ${sectionList}.

${editingInstructions}
${publishInstructions}

Return STRICT JSON only.`,
      }, {
        role: "user",
        content: `Transcript / timed context:
${strategyContext}

Full transcript:
${transcript || "(no transcript)"}

Requested platforms:
${platforms.map((platform) => `- ${platform}: ${platformGuide[platform] ?? ""}`).join("\n") || "none"}

Real chapter timestamps:
${chapterPoints.map((c) => `${c.time} - context: "${c.text}"`).join("\n") || "none"}

Return JSON in this shape:
${responseShape}`,
      }],
    }, userId);

    const parsed = parseJson<{
      editing?: Partial<typeof defaultEditing> & { hookTexts?: string[]; editingSuggestions?: string[] };
      seo?: Record<string, Record<string, unknown>>;
    }>(response.choices[0]?.message?.content ?? "{}", {});

    const output: { editing?: Record<string, unknown>; seo?: Record<string, Record<string, unknown>> } = {};

    if (includeEditing) {
      const editingFields = { ...(parsed.editing ?? {}) } as Record<string, unknown>;
      delete editingFields.hookTexts;
      delete editingFields.editingSuggestions;
      const hookTexts = Array.isArray(parsed.editing?.hookTexts) ? parsed.editing?.hookTexts : [];
      const hooks = hookTexts
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
        for (const silence of silences) {
          if (!removeSections.some((section) => section.start === fmtSecs(silence.start))) {
            removeSections.push({
              start: fmtSecs(silence.start),
              end: fmtSecs(silence.end),
              reason: `Dead air / silence gap (${(silence.end - silence.start).toFixed(1)}s) — viewer likely to disengage`,
            });
          }
        }
      }

      output.editing = {
        ...defaultEditing,
        ...editingFields,
        hooks,
        removeSections: removeSections.slice(0, 12),
        shortVideos: [],
        editingSuggestions: Array.isArray(parsed.editing?.editingSuggestions) && parsed.editing.editingSuggestions.length
          ? parsed.editing.editingSuggestions.slice(0, isFree ? 1 : 5)
          : defaultEditing.editingSuggestions,
      };
    }

    if (includePublish) {
      const seo: Record<string, Record<string, unknown>> = {};
      for (const platform of platforms) {
        const base = defaultSeoForPlatform(platform);
        const merged: any = { ...base, ...(parsed.seo?.[platform] ?? {}) };
        const hashtags = Array.isArray(merged.hashtags)
          ? merged.hashtags as Array<{ tag?: string; effect?: string }>
          : [];
        merged.hashtags = hashtags
          .map((tag) => ({ ...tag, tag: typeof tag.tag === "string" ? tag.tag.replace(/^#+/, "") : "" }))
          .filter((tag) => tag.tag);
        if (chapterPoints.length) {
          merged.timestamps = (merged.timestamps ?? base.timestamps).map((timestamp: { time: string; label: string }, index: number) => ({
            time: chapterPoints[index]?.time ?? timestamp.time,
            label: timestamp.label,
          }));
        }
        seo[platform] = merged as unknown as Record<string, unknown>;
      }
      output.seo = seo;
    }

    return output;
  } catch (err) {
    logger.warn({ err }, "Merged content and packaging analysis failed");
    const fallback: { editing?: Record<string, unknown>; seo?: Record<string, Record<string, unknown>> } = {};
    if (includeEditing) fallback.editing = { ...defaultEditing, hooks: [], removeSections: [], shortVideos: [] };
    if (includePublish) {
      fallback.seo = {};
      for (const platform of platforms) {
        fallback.seo[platform] = defaultSeoForPlatform(platform) as unknown as Record<string, unknown>;
      }
    }
    return fallback;
  }
}

export async function analyzeScriptFeedback(
  transcript: string,
  segments: Array<{ start: number; end: number; text: string }>,
  userId?: number,
): Promise<object> {
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
1. HOOK (first 30 seconds): Does it create a curiosity gap, pattern interrupt, or bold claim? Call out exactly what fails and why. Give 3 alternative hooks.
2. WEAK SECTIONS: Find 2-4 moments where the viewer would drop off. Quote the exact phrase. Give a direct replacement.
3. IMPROVED SCRIPT: Rewrite the full script keeping the creator's authentic voice. Cut every word that doesn't earn its place.

Return STRICT JSON only:
{
  "hookSuggestions": ["hook 1", "hook 2", "hook 3"],
  "weakSections": [
    {"text": "exact quote", "reason": "specific reason viewer drops off", "replacement": "improved version"}
  ],
  "improvedScript": "full rewritten script"
}`,
    }],
  }, userId);
  return parseJson(response.choices[0]?.message?.content ?? "{}", {
    hookSuggestions: [],
    weakSections: [],
    improvedScript: transcript,
  });
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
    if (score > bestScore) { bestScore = score; bestSeg = seg; }
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

export function analyzeSpeechPattern(
  durationSec: number,
  segments: Array<{ start: number; end: number; text: string }>,
  whisperConfidence: number
): SpeechAnalysis {
  const cleanedSegments = segments
    .map((segment) => {
      const text = segment.text.trim();
      const wordCount = text.split(/\s+/).filter(Boolean).length;
      return { ...segment, text, wordCount };
    })
    .filter((segment) => segment.wordCount > 0 && segment.end > segment.start);

  const totalWords = cleanedSegments.reduce((sum, segment) => sum + segment.wordCount, 0);
  const totalSpeechSeconds = cleanedSegments.reduce((sum, segment) => sum + Math.max(0, segment.end - segment.start), 0);
  const firstSpeechAt = cleanedSegments[0]?.start ?? null;
  const lastSpeechAt = cleanedSegments.length ? cleanedSegments[cleanedSegments.length - 1]!.end : null;
  const longestSpeechRun = cleanedSegments.reduce((max, segment) => Math.max(max, segment.end - segment.start), 0);
  const speechRatio = durationSec > 0 ? Math.min(1, totalSpeechSeconds / durationSec) : 0;
  const hasMeaningfulSpeech = totalWords >= 25 && totalSpeechSeconds >= 8 && whisperConfidence >= 0.35;

  let mode: AnalysisMode = "mixed";
  if (!hasMeaningfulSpeech || speechRatio < 0.08) {
    mode = "visual_first";
  } else if (speechRatio >= 0.35 && totalWords >= 80 && longestSpeechRun >= 20) {
    mode = "talking_first";
  } else {
    mode = "mixed";
  }

  if (mode !== "talking_first" && durationSec > 0 && firstSpeechAt !== null && firstSpeechAt >= durationSec * 0.45 && speechRatio < 0.2) {
    mode = "visual_first";
  }

  const firstSpeechLabel = firstSpeechAt === null ? "none" : fmtSecs(firstSpeechAt);
  const lastSpeechLabel = lastSpeechAt === null ? "none" : fmtSecs(lastSpeechAt);
  const summary = mode === "visual_first"
    ? `Limited spoken content detected. Speech covers ${Math.round(speechRatio * 100)}% of the video, first appearing at ${firstSpeechLabel}.`
    : mode === "talking_first"
      ? `Speech drives this video. Spoken content covers ${Math.round(speechRatio * 100)}% of the runtime from ${firstSpeechLabel} to ${lastSpeechLabel}.`
      : `This video mixes visuals and speech. Spoken content covers ${Math.round(speechRatio * 100)}% of the runtime, first appearing at ${firstSpeechLabel}.`;

  return {
    mode,
    speechRatio,
    firstSpeechAt,
    lastSpeechAt,
    spokenSegmentCount: cleanedSegments.length,
    totalSpeechSeconds,
    totalWords,
    longestSpeechRun,
    hasMeaningfulSpeech,
    summary,
  };
}

export async function analyzeEditingPoints(
  transcript: string,
  segments: Array<{ start: number; end: number; text: string }>,
  audioPath?: string,
  plan = "free",
  speechAnalysis?: SpeechAnalysis,
  videoName?: string,
  formatProfile?: Partial<FormatProfile> | null,
  userId?: number,
): Promise<object> {
  const lastSeg = segments[segments.length - 1];
  const totalDuration = lastSeg?.end ?? 0;
  const isFree = plan === "free";
  const isVisualFirst = speechAnalysis?.mode === "visual_first" || !speechAnalysis?.hasMeaningfulSpeech;
  const languageInstruction = buildOutputLanguageInstruction(transcript, speechAnalysis);
  const formatHint = formatProfile
    ? `Detected format: ${formatProfile.contentFormat ?? "general_visual"}.
Primary subject: ${formatProfile.primarySubject ?? "the main subject on screen"}.
Visual summary: ${formatProfile.contentSummary ?? "A visual-first video centered on the main subject and payoff"}.
Viewer intent: ${formatProfile.viewerIntent ?? "get the promised payoff quickly"}.
Success factors: ${(formatProfile.successFactors ?? []).join(", ") || "clarity, pacing, payoff"}.`
    : "";

  const editingSystemPrompt = `You are a senior video editor and YouTube strategist with 10 years experience. You give feedback like a professional editor reviewing a client's rough cut: specific, direct, actionable.

Rules:
- Always reference exact timestamps or quote exact words
- Only suggest cutting genuinely redundant content
- When suggesting a cut, explain what value is lost vs gained in one sentence
- Reference platform-specific best practices
- Never say "consider" or "you might want to"`;

  const defaultStrategy = {
    topic: videoName ?? (isVisualFirst ? "Visual process / payoff video" : "Speaker-led informational video"),
    audienceGoal: isVisualFirst
      ? "See the visual payoff quickly and understand why the result is worth staying for."
      : "Get the main idea quickly and stay because the delivery feels tight, useful, and easy to follow.",
    viewPotential: isVisualFirst
      ? "This can earn views if the payoff becomes obvious early and the middle keeps showing visible progress."
      : "This can earn views if the value proposition lands early and the pacing stays tighter than the average niche upload.",
    editingStyle: isVisualFirst
      ? "Use progression-first editing: open on the strongest visual state, cut repetition hard, and let each cut reveal clear progress."
      : "Use clarity-first editing: remove throat-clearing, open on the strongest claim, and keep every cut moving the viewer toward the takeaway.",
    introGuidance: "Skip a long branded intro. Open on the strongest promise, result, or tension point before any setup.",
    pacingGuidance: isVisualFirst
      ? "Keep visual momentum high. If progress is not visible for more than a few seconds, add a cut, zoom, overlay, or time jump."
      : "Front-load the point, cut pauses aggressively, and treat every slow sentence as a candidate for tightening or visual support.",
    motionGuidance: isVisualFirst
      ? "Use motion only when it helps the viewer read progress: punch-ins, speed ramps, reframes, and overlays should clarify the work, not decorate it."
      : "Use moderate motion. Podcasts, commentary, and educational videos usually perform better with intentional punch-ins, angle swaps, captions, and selective B-roll than with constant movement.",
    hookApproach: "Make the first 5-15 seconds prove why this video is worth a click by showing the payoff, conflict, or strongest line immediately.",
    packagingAngle: "Package the video around the clearest viewer outcome, not a vague summary of what happens on screen.",
    nowFixes: [
      "Trim the slowest setup lines before the main payoff or thesis appears.",
      "Move the clearest outcome, strongest quote, or best visual moment into the opening.",
      "Use pattern breaks where attention is likely to dip: B-roll, punch-ins, captions, or a cleaner cut point.",
    ],
    nextVideoFixes: [
      "Plan the opening around the payoff before recording so the first 10 seconds do more work.",
      "Record cleaner pickup lines or alternate angles for sections that usually drag.",
      "Design the shoot so every minute creates a visible change, proof point, or emotional turn.",
    ],
    editorNotes: [
      "Match editing intensity to the format. Podcasts and educational videos usually want restraint plus clarity, not hyperactive motion.",
      "If the topic is niche or technical, on-screen text should clarify the takeaway rather than repeat every spoken sentence.",
    ],
  };

  const strategyContext = segments.length
    ? segments
        .slice(0, Math.min(segments.length, 10))
        .map((seg) => `${fmtSecs(seg.start)}-${fmtSecs(seg.end)} ${seg.text}`)
        .join("\n")
    : transcript.substring(0, 1200);

  let editingStrategy = defaultStrategy;
  try {
    const strategyResponse = await callOpenAI({
      model: isFree ? "gpt-4o-mini" : "gpt-4o",
      max_completion_tokens: isFree ? 700 : 1400,
      messages: [{
        role: "user",
        content: `${editingSystemPrompt}

${languageInstruction}

You are building an editor brief for this specific video.

Video name: "${videoName ?? "Video analysis"}"
Speech profile: ${speechAnalysis?.summary ?? "Speech data not available."}
${formatHint}

Use only what is supported by the transcript, timing, and detected format. Write this like a working editor telling a creator how to make this cut more watchable and more competitive for views.

Requirements:
- Name the topic or angle as specifically as the evidence allows.
- Explain the editing style this format actually wants.
- Say whether this video needs an intro, how fast the pacing should feel, and whether the edit should be simple, moderate, or motion-heavy.
- Separate "fix now on this cut" from "fix in the next shoot".
- Ground every recommendation in real editing techniques, not generic motivation.
- Include a blunt viewPotential sentence that answers whether the current structure gives this a chance to pull views.

Transcript / timed context:
${strategyContext}

Return STRICT JSON only:
{
  "topic": "specific topic or angle",
  "audienceGoal": "what the viewer wants from this video",
  "viewPotential": "one sentence on whether this can pull views in its current state and why",
  "editingStyle": "best editing style for this format and topic",
  "introGuidance": "does this need an intro or should it cold open",
  "pacingGuidance": "how fast or restrained the pacing should be",
  "motionGuidance": "how much motion, punch-ins, captions, or visual movement this format wants",
  "hookApproach": "what the opening should do",
  "packagingAngle": "what the title/thumbnail/packaging should sell",
  "nowFixes": ["3 direct instructions for this current cut"],
  "nextVideoFixes": ["3 direct instructions for the next shoot"],
  "editorNotes": ["2 to 4 short format-aware editing truths for this creator"]
}`,
      }],
    }, userId);

    editingStrategy = {
      ...defaultStrategy,
      ...parseJson<typeof defaultStrategy>(
        strategyResponse.choices[0]?.message?.content ?? "{}",
        defaultStrategy,
      ),
    };
  } catch (err) {
    logger.warn({ err }, "Editing strategy generation failed");
  }

  const hookCount = isFree ? 1 : 4;
  const suggestionCount = isFree ? 1 : 5;
  const defaultHookData: { hookTexts: string[]; editingSuggestions: string[] } = { hookTexts: [], editingSuggestions: [] };
  let hookData = defaultHookData;

  if (!isVisualFirst) {
    const hookResponse = await callOpenAI({
      model: isFree ? "gpt-4o-mini" : "gpt-4o",
      max_completion_tokens: isFree ? 600 : 1200,
      messages: [{
        role: "user",
        content: `${editingSystemPrompt}

${languageInstruction}

Read this transcript. Identify the ${hookCount} strongest moment(s) that would stop a scroll. Copy EXACT text from the transcript.

Give ${suggestionCount} specific editing suggestion(s) referencing actual content and platform best practices.

CRITICAL: Copy text EXACTLY. Do NOT invent timestamps.

Transcript: "${transcript.substring(0, isFree ? 1500 : 3000)}"

Return STRICT JSON only:
{
  "hookTexts": ["exact sentence from transcript"],
  "editingSuggestions": ["specific tip referencing actual content"]
}`,
      }],
    }, userId);

    hookData = parseJson<{ hookTexts: string[]; editingSuggestions: string[] }>(
      hookResponse.choices[0]?.message?.content ?? "{}",
      defaultHookData
    );
  }

  const hooks = hookData.hookTexts
    .map(hookText => {
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
          reason: `Dead air / silence gap (${(s.end - s.start).toFixed(1)}s) — viewer likely to disengage`,
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
          content: `You are a short-form video strategist. Which of these chunks work as standalone short videos?

Chunks: ${JSON.stringify(chunkSummaries)}

Return STRICT JSON using ONLY the provided index numbers:
{"goodChunks":[{"index":0,"title":"short punchy title","reason":"why this works standalone"}]}`,
        }],
      }, userId);

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
    return fmtSecs(Math.min(parseTs(ts), totalDuration));
  }

  const clampedHooks = totalDuration
    ? hooks.filter(h => h && parseTs((h as { start: string }).start) < totalDuration)
        .map(h => h ? { ...h, start: clampTs((h as { start: string }).start), end: clampTs((h as { end: string }).end) } : h)
    : hooks;

  const clampedRemovals = totalDuration
    ? removeSections.filter(s => parseTs(s.start) < totalDuration).map(s => ({ ...s, end: clampTs(s.end) }))
    : removeSections;

  const clampedShortVideos = totalDuration
    ? shortVideos.filter(sv => parseTs(sv.start) < totalDuration).map(sv => ({ ...sv, end: clampTs(sv.end) }))
    : shortVideos;

  const defaultSuggestions = isVisualFirst
    ? [
        "Open on the strongest visual change before any slow setup so the first three seconds communicate the payoff immediately.",
        "Use every silence gap in the cut list as a place to tighten pacing, add a shot change, or bring in on-screen text.",
        "If the first spoken line arrives late, add visual context early so viewers know what they are watching before dialogue begins.",
        "Break static stretches with zooms, B-roll, captions, or screen movement before attention drops.",
        "End on the clearest payoff frame rather than fading out on a low-information shot.",
      ]
    : [
        "Cut pauses longer than 1.5 seconds for tighter pacing",
        "Move your strongest moment to within the first 30 seconds",
        "Remove filler word segments shown in the cut list above",
        "End with a clear CTA: tell them exactly what to do next",
        "Your hook needs to land before 15 seconds on YouTube",
      ];

  let rewrittenHook: string | undefined;
  if (!isFree && !isVisualFirst && clampedHooks.length > 0) {
    try {
      const hookText = (clampedHooks[0] as { text: string })?.text ?? transcript.substring(0, 200);
      const hookRewriteResponse = await callOpenAI({
        model: "gpt-4o",
        max_completion_tokens: 400,
        messages: [{
          role: "user",
        content: `${editingSystemPrompt}

${languageInstruction}

Rewrite this opening as a creator would say it on camera — natural, direct, confident.

Rules:
- No exclamation marks
- No words like "discover", "secret", "unlock", "transform", "game-changer"
- Must reference something specific from the actual video content
- Should feel like the natural first sentence of the video
- MUST be a complete sentence — never end mid-thought
- Maximum 2 sentences, maximum 30 words total

Original: "${hookText}"

Return STRICT JSON only: {"rewrittenHook": "your complete rewritten opening here"}`,
        }],
      }, userId);
      const parsed = parseJson<{ rewrittenHook: string }>(hookRewriteResponse.choices[0]?.message?.content ?? "{}", { rewrittenHook: "" });
      rewrittenHook = parsed.rewrittenHook || undefined;
    } catch (err) {
      logger.warn({ err }, "Rewritten hook generation failed");
    }
  }

  return {
    mode: isVisualFirst ? "visual_first" : speechAnalysis?.mode ?? "talking_first",
    ...editingStrategy,
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
      chapters.push({ start: seg.start, time: fmtSecs(seg.start), text: seg.text.trim().substring(0, 80) });
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
  plan = "free",
  speechAnalysis?: SpeechAnalysis,
  videoName?: string,
  formatProfile?: Partial<FormatProfile> | null,
  userId?: number,
): Promise<object> {
  const isFree = plan === "free";
  const chapterPoints = buildChapterPoints(segments, 10);
  const isVisualFirst = speechAnalysis?.mode === "visual_first" || !speechAnalysis?.hasMeaningfulSpeech;
  const languageInstruction = buildOutputLanguageInstruction(transcript, speechAnalysis);
  const formatHint = formatProfile
    ? `Detected format: ${formatProfile.contentFormat ?? "general_visual"}.
Primary subject: ${formatProfile.primarySubject ?? "the main subject on screen"}.
Visual summary: ${formatProfile.contentSummary ?? "A visual-first video centered on the main subject and its payoff."}.
Viewer intent: ${formatProfile.viewerIntent ?? "stay for the core payoff"}.
Success factors: ${(formatProfile.successFactors ?? []).join(", ") || "clear subject visibility, strong payoff"}.
Ignored signals: ${(formatProfile.ignoredSignals ?? []).join(", ") || "none"}.`
    : "";

  const chapterHint = !isVisualFirst && chapterPoints.length
    ? `\n\nReal chapter timestamps:\n${chapterPoints.map(c => `${c.time} - context: "${c.text}"`).join("\n")}`
    : "";

  const platformGuide: Record<string, string> = {
    youtube_long: "YouTube long-form: titles 60-70 chars, curiosity gap required, keyword in first 3 words.",
    youtube_shorts: "YouTube Shorts: punchy titles under 50 chars, high-energy action verbs",
    tiktok: "TikTok: trend-aware, conversational, 3-5 hashtags from trending niches",
    instagram: "Instagram Reels: lifestyle-forward, mix of niche and broad hashtags",
    linkedin: "LinkedIn: professional framing, thought leadership angle, low hashtag count",
    x: "X/Twitter: max 2-3 hashtags, punchy and opinionated",
  };

  const guide = platformGuide[platform] ?? "";
  const contentHint = isVisualFirst
    ? `Transcript signal is limited for this upload. Build packaging from the visual premise and detected format, not from sparse transcript fragments. Video name: "${videoName ?? "Video analysis"}". ${speechAnalysis?.summary ?? ""} ${formatHint}`
    : `Transcript signal is strong enough to drive platform packaging. ${speechAnalysis?.summary ?? ""}`;

  if (isFree) {
    const response = await callOpenAI({
      model: "gpt-4o-mini",
      max_completion_tokens: 500,
      messages: [{ role: "user", content: `${BASE_SYSTEM_PROMPT}

${languageInstruction}

Generate ONE strong title, TWO description sentences, and 3 tags.
Platform: ${guide}
Context: ${contentHint}
Transcript: "${transcript.substring(0, 800)}"
Hard rule: never infer cooking, food, dessert, recipe, or kitchen themes unless the detected format or transcript clearly supports that topic.
Make the packaging algorithm-aware for this platform: strong topic clarity, clear audience promise, and wording that matches how high-performing creators in this niche package similar videos without copying anyone directly.
TAGS: No # symbol.

Return STRICT JSON:
{"titles":["one title"],"description":"Two sentences.","hashtags":[{"tag":"Tag","effect":"why"},{"tag":"Tag2","effect":"..."},{"tag":"Tag3","effect":"..."}],"timestamps":[{"time":"0:00","label":"Intro"}],"algorithmFit":"one sentence on why this packaging can attract clicks in this niche","packagingStrategy":"one sentence on the angle this title and description are selling"}` }],
    }, userId);

    const parsed = parseJson<{ titles: string[]; description: string; hashtags: Array<{ tag: string; effect?: string }>; timestamps: Array<{ time: string; label: string }>; algorithmFit?: string; packagingStrategy?: string }>(
      response.choices[0]?.message?.content ?? "{}",
      { titles: ["Your Video Title"], description: "Your video content.", hashtags: [{ tag: "VideoContent", effect: "Broad reach" }], timestamps: [{ time: "0:00", label: "Introduction" }], algorithmFit: "", packagingStrategy: "" }
    );
    parsed.hashtags = (parsed.hashtags ?? []).map(h => ({ ...h, tag: typeof h.tag === "string" ? h.tag.replace(/^#+/, "") : h.tag }));
    return parsed;
  }

  const isYouTube = platform === "youtube_long" || platform === "youtube_shorts";
  const response = await callOpenAI({
    model: "gpt-4o",
    max_completion_tokens: 2500,
    messages: [{ role: "user", content: `${BASE_SYSTEM_PROMPT}

${languageInstruction}

You are a ${platform} SEO expert. Platform rules: ${guide}
Context: ${contentHint}
Transcript: "${transcript.substring(0, 2000)}"${chapterHint}
Hard rule: never infer cooking, food, dessert, recipe, or kitchen themes unless the detected format or transcript clearly supports that topic.
If transcript signal is limited, prefer accurate format-aware packaging over specific nouns from sparse or noisy transcript fragments.
Act like a strategist who studies viral creators in the same niche. Do not copy them or name them unless the evidence is obvious. Instead, extract the style patterns that make similar videos clickable: audience promise, tension, payoff clarity, specificity, and search intent.

${isYouTube ? `Generate exactly 5 title options (curiosity gap, how-to, number-based, problem/solution, bold claim). Under 70 chars each.` : `Generate 3 title options.`}

Description: First 2 lines state what the video is about. Use primary keyword naturally. Include ## Chapters. End with ONE CTA. 150-400 words. No hype.

TAGS: No # symbols. Generate 10-15 focused tags.

Return STRICT JSON:
{"titles":["t1","t2","t3","t4","t5"],"description":"full description","hashtags":[{"tag":"Tag","effect":"audience"}],"timestamps":[{"time":"0:00","label":"complete label"}],"titleStrategies":["curiosity gap","how-to","number-based","problem/solution","bold claim"],"algorithmFit":"2 sentences on why this packaging matches platform behavior and niche click patterns","packagingStrategy":"2 sentences on what audience promise these titles are selling","nicheReferences":["3 short notes describing the kind of viral packaging patterns being used"],"audiencePromise":"one sentence on the core promise that should win the click"}` }],
  }, userId);

  const parsed = parseJson<{ titles: string[]; description: string; hashtags: object[]; timestamps: Array<{ time: string; label: string }>; titleStrategies?: string[]; algorithmFit?: string; packagingStrategy?: string; nicheReferences?: string[]; audiencePromise?: string }>(
    response.choices[0]?.message?.content ?? "{}",
    { titles: ["Engaging title"], description: "Description.", hashtags: [], timestamps: [{ time: "0:00", label: "Introduction" }], algorithmFit: "", packagingStrategy: "", nicheReferences: [], audiencePromise: "" }
  );

  if (chapterPoints.length) {
    parsed.timestamps = parsed.timestamps.map((t, i) => ({ time: chapterPoints[i]?.time ?? t.time, label: t.label }));
  }

  parsed.hashtags = (parsed.hashtags ?? [])
    .map((h: any) => ({ ...h, tag: typeof h.tag === "string" ? h.tag.replace(/^#+/, "") : h.tag }))
    .filter((h: any) => typeof h.tag === "string" && h.tag.trim())
    .slice(0, 15);
  return parsed;
}

export async function generateShortClipIdeas(
  transcript: string,
  segments: Array<{ start: number; end: number; text: string }>,
  platforms: string[],
  plan = "free",
  speechAnalysis?: SpeechAnalysis,
  formatProfile?: Partial<FormatProfile> | null,
  userId?: number,
): Promise<object> {
  if (!segments.length) return { clips: [] };
  const isFree = plan === "free";
  const totalDuration = segments[segments.length - 1]!.end;
  const languageInstruction = buildOutputLanguageInstruction(transcript, speechAnalysis);
  const isVisualFirst = speechAnalysis?.mode === "visual_first" || !speechAnalysis?.hasMeaningfulSpeech;

  const platformLabels: Record<string, string> = {
    youtube_long: "YouTube Long", youtube_shorts: "YouTube Shorts",
    tiktok: "TikTok", instagram: "Instagram Reels", linkedin: "LinkedIn", x: "X/Twitter",
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
      chunkStart = seg.start; chunkEnd = seg.start; chunkText = "";
    }
    chunkText += " " + seg.text;
    chunkEnd = seg.end;
  }
  if (chunkText) chunks.push({ start: chunkStart, end: chunkEnd, text: chunkText.trim(), index: chunks.length });

  const chunkSummaries = chunks.map(c => ({
    index: c.index,
    startSec: Math.round(c.start),
    endSec: Math.round(c.end),
    durationSec: Math.round(c.end - c.start),
    preview: isVisualFirst ? "" : c.text.trim().substring(0, 250),
  }));

  const formatHint = formatProfile
    ? `Detected format: ${formatProfile.contentFormat ?? "general_visual"}.
Primary subject: ${formatProfile.primarySubject ?? "the main subject on screen"}.
Visual summary: ${formatProfile.contentSummary ?? "A visual-first video centered on the main subject and its payoff."}.
Viewer intent: ${formatProfile.viewerIntent ?? "stay for the payoff"}.
Success factors: ${(formatProfile.successFactors ?? []).join(", ") || "clear payoff"}.`
    : "";

  const clipCount = isFree ? 1 : 3;
  const response = await callOpenAI({
    model: "gpt-4o",
    max_completion_tokens: isFree ? 600 : 2000,
    messages: [{
      role: "user",
      content: `${BASE_SYSTEM_PROMPT}

${languageInstruction}

Identify the best ${clipCount} clip(s) for: ${targetPlatformList}
Total duration: ${Math.round(totalDuration)}s
${formatHint}
${isVisualFirst ? "Transcript signal is limited. Do not rely on sparse transcript nouns when naming the clip. Base clips on the detected format and likely visual payoff moments." : ""}
Hard rule: never infer cooking, food, dessert, recipe, or kitchen themes unless the detected format or transcript clearly supports that topic.

Chunks: ${JSON.stringify(chunkSummaries)}

Return STRICT JSON using ONLY the provided index numbers:
{"clips":[{"chunkIndex":0,"startSec":45,"endSec":105,"title":"punchy title","hook":"exact opening words","whyItWorks":"one sentence","platforms":["TikTok"],"platformReason":"why"${!isFree ? `,"tacticalNote":"one tip","engagementPotential":"High/Medium/Low","engagementReason":"why"` : ""}}]}`,
    }],
  }, userId);

  const raw = parseJson<{ clips: Array<Record<string, unknown>> }>(response.choices[0]?.message?.content ?? "{}", { clips: [] });

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
      title: clip.title ?? "", hook: clip.hook ?? "", whyItWorks: clip.whyItWorks ?? "",
      platforms: Array.isArray(clip.platforms) ? clip.platforms : [],
      platformReason: clip.platformReason ?? "", tacticalNote: clip.tacticalNote ?? "",
      engagementPotential: clip.engagementPotential ?? "", engagementReason: clip.engagementReason ?? "",
    };
  });

  return { clips: clips.slice(0, isFree ? 1 : Math.max(clips.length, 3)) };
}

export async function translateSegments(
  segments: Array<{ start: number; end: number; text: string }>,
  targetLanguage: string,
  userId?: number,
): Promise<Array<{ start: number; end: number; text: string }>> {
  const texts = segments.map(s => s.text).join("\n---\n");
  const response = await callOpenAI({
    model: "gpt-4o-mini",
    max_completion_tokens: 4000,
    messages: [{ role: "user", content: `Translate to ${targetLanguage}. Keep segments separated by ---. Return ONLY translated text:\n\n${texts}` }],
  }, userId);
  const content = response.choices[0]?.message?.content ?? "";
  const translated = content.split("---").map(t => t.trim()).filter(Boolean);
  return segments.map((seg, i) => ({ start: seg.start, end: seg.end, text: translated[i] || seg.text }));
}

export function computeQualityScore(visualAnalysis: object, audioAnalysis: object): number {
  const visual = visualAnalysis as Record<string, { numeric?: number }>;
  const audio = audioAnalysis as Record<string, { numeric?: number; score?: number }>;

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

// ─── USAGE NOTES FOR CALLERS ─────────────────────────────────────────────────
//
// To integrate retention forecasting, after running analyzeVisuals + analyzeAudio:
//
//   const pacing = analyzePacing(segments, wordTimings);
//   const visual = await analyzeVisuals(frames, platform, plan, transcript);
//   const hookStrength = (visual as any).hookStrength ?? "moderate";
//   const bgContext = (visual as any).background?.contextAppropriate ?? "neutral";
//   const audioScore = computeQualityScore({}, audioAnalysis);
//   const visualScore = (visual as any).overallVisualScore ?? 70;
//
//   const retention = buildRetentionForecast(
//     visualScore, audioScore, pacing,
//     fillerRatio, segments, hookStrength, bgContext, totalDurationSec
//   );
//
//   // Then include in the job result:
//   result.retention = retention;
//   result.pacing = {
//     wordsPerMinute: pacing.wordsPerMinute,
//     pacingRating: pacing.pacingRating,
//     longPauseCount: pacing.longPauseCount,
//     engagementRisks: pacing.engagementRiskTimestamps,
//     score: scorePacing(pacing),
//   };
//
// The retention object includes:
// - estimatedRetentionPct: number (e.g. 42)
// - retentionGrade: "A" | "B" | "C" | "D" | "F"
// - summary: string
// - dropOffMoments: Array<{ at, atSec, severity, reason, fix }>
// - retentionCurvePoints: Array<{ sec, pct }> — use this to render a chart
