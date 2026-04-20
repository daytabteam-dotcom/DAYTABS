import fs from "fs/promises";
import os from "os";
import path from "path";
import { db } from "@workspace/db";
import { analysisJobsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { deleteFromB2, downloadFromB2 } from "../../lib/b2";
import {
  updateJob, transcribeAudio, extractAudio, extractFrames,
  analyzeVisuals, analyzeAudio, analyzeEditingPoints,
  generateSeo, generateShortClipIdeas, generateSrt, translateSegments,
  computeQualityScore, getMediaDuration, logger, generateVideoName, getTotalAnalysisScore,
  analyzePacing, analyzeSpeechPattern, buildRetentionForecast, scorePacing,
} from "./services";

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string, jobId: string): Promise<T> {
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

function getAnalysisTimeoutMs() {
  const configuredMinutes = Number(process.env.ANALYSIS_TIMEOUT_MINUTES);
  const minutes = Number.isFinite(configuredMinutes) && configuredMinutes > 0 ? configuredMinutes : 180;
  return minutes * 60 * 1000;
}

function getFrameExtractionTimeoutMs() {
  const configuredMs = Number(process.env.ANALYSIS_FRAME_EXTRACTION_TIMEOUT_MS);
  return Number.isFinite(configuredMs) && configuredMs > 0 ? Math.floor(configuredMs) : 180000;
}

function isAnalysisTimeoutError(err: unknown) {
  return err instanceof Error && err.message === "Analysis timed out";
}

async function runWithAnalysisDeadline<T>(jobId: string, promise: Promise<T>): Promise<T> {
  const timeoutMs = getAnalysisTimeoutMs();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Analysis timed out")), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } catch (err) {
    if (isAnalysisTimeoutError(err)) {
      const minutes = Math.round(timeoutMs / 60_000);
      logger.warn({ jobId, timeoutMs }, "Analysis exceeded maximum runtime");
      await updateJob(jobId, {
        status: "error",
        currentStep: "Analysis timed out",
        error: `Analysis took longer than ${minutes} minutes and was stopped. Try a shorter video or select fewer analysis modules.`,
      });
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function getPipelineErrorMessage(err: unknown): string {
  const fallback = err instanceof Error ? err.message : String(err);
  const code = typeof err === "object" && err !== null
    ? String((err as { Code?: unknown; code?: unknown; name?: unknown }).Code ?? (err as { code?: unknown }).code ?? (err as { name?: unknown }).name ?? "")
    : "";
  const statusCode = typeof err === "object" && err !== null
    ? (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
    : undefined;

  if (/cap exceeded|Class B|download bandwidth/i.test(fallback)) {
    return "Analysis failed because the Cloudflare R2 object could not be downloaded. Check the R2 bucket settings and try again.";
  }

  if (code === "AccessDenied" || statusCode === 403) {
    return "Analysis failed because the server could not read the uploaded video from Cloudflare R2. Please check the R2 bucket permissions and credentials, then upload the video again.";
  }

  if (isAnalysisTimeoutError(err)) {
    const minutes = Math.round(getAnalysisTimeoutMs() / 60_000);
    return `Analysis took longer than ${minutes} minutes and was stopped. Try a shorter video or select fewer analysis modules.`;
  }

  return fallback || "Analysis failed unexpectedly.";
}

async function isAnalysisCancelled(jobId: string) {
  const job = await db
    .select({ status: analysisJobsTable.status })
    .from(analysisJobsTable)
    .where(eq(analysisJobsTable.id, jobId))
    .limit(1);
  return job[0]?.status === "cancelled";
}

async function stopIfCancelled(jobId: string) {
  if (await isAnalysisCancelled(jobId)) {
    throw new Error("Analysis cancelled");
  }
}

function getMemorySoftLimitMb() {
  const configured = Number(process.env.ANALYSIS_MEMORY_SOFT_LIMIT_MB);
  return Number.isFinite(configured) && configured > 0 ? configured : 430;
}

function getMaxFrameCount(plan: string) {
  const configured = Number(process.env.ANALYSIS_MAX_FRAMES);
  const maxFrames = Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 2;
  return plan === "free" ? 1 : Math.max(1, Math.min(maxFrames, 5));
}

function getAdaptiveFrameCount(plan: string, mode: "talking_first" | "visual_first" | "mixed") {
  const base = getMaxFrameCount(plan);
  if (mode === "visual_first") return Math.min(plan === "free" ? 2 : 8, Math.max(base + 2, base));
  if (mode === "mixed") return Math.min(plan === "free" ? 2 : 6, Math.max(base + 1, base));
  return base;
}

async function stopIfMemoryHigh(jobId: string, label: string) {
  const limitMb = getMemorySoftLimitMb();
  const rssMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
  if (rssMb < limitMb) return;

  logger.warn({ jobId, rssMb, limitMb, label }, "Analysis stopped before Render memory limit");
  await updateJob(jobId, {
    status: "error",
    currentStep: "Analysis stopped to protect server memory",
    error: "This video needs more memory than the current server can safely use. Try a shorter/lower-resolution video, or run the analysis again with fewer modules selected.",
  });
  throw new Error(`Analysis stopped before memory limit at ${label}: ${rssMb}MB used`);
}

export type PipelineMode = "video-analyzer";

export interface PipelineOptions {
  mode: PipelineMode;
  platform?: string;
  translateSubtitles?: boolean;
  subtitleLanguage?: string;
  audioLanguage?: string;
  audioVoice?: string;
  plan?: string;
  modules?: string[];
  platforms?: string[];
  maxDurationSeconds?: number;
  originalFileName?: string;
}

export async function runAnalysisPipeline(
  jobId: string,
  b2Key: string,
  options: PipelineOptions,
  sourceVideoPath?: string,
): Promise<boolean> {
  const workDir = path.join(os.tmpdir(), "daytabs", jobId);
  const localVideoPath = path.join(workDir, "video.mp4");

  try {
    await fs.mkdir(workDir, { recursive: true });
    await stopIfCancelled(jobId);
    await stopIfMemoryHigh(jobId, "download start");
    if (sourceVideoPath) {
      logger.info({ jobId, sourceVideoPath, localVideoPath }, "Copying uploaded video from local storage for analysis");
      await fs.copyFile(sourceVideoPath, localVideoPath);
    } else {
      await downloadFromB2(b2Key, localVideoPath);
    }
    await stopIfCancelled(jobId);
    await stopIfMemoryHigh(jobId, "download complete");
    await runWithAnalysisDeadline(jobId, runVideoAnalyzer(jobId, localVideoPath, options));

    const job = await db
      .select({ status: analysisJobsTable.status })
      .from(analysisJobsTable)
      .where(eq(analysisJobsTable.id, jobId))
      .limit(1);

    return job[0]?.status === "complete";
  } catch (err) {
    logger.error({ err, jobId, b2Key }, "Analysis pipeline failed before completion");

    const job = await db
      .select({ status: analysisJobsTable.status, error: analysisJobsTable.error })
      .from(analysisJobsTable)
      .where(eq(analysisJobsTable.id, jobId))
      .limit(1)
      .catch(() => []);

    if (job[0]?.status !== "complete" && job[0]?.status !== "error" && job[0]?.status !== "cancelled") {
      await updateJob(jobId, {
        status: "error",
        currentStep: isAnalysisTimeoutError(err) ? "Analysis timed out" : "Analysis failed",
        error: getPipelineErrorMessage(err),
      }).catch((updateErr) => {
        logger.error({ err: updateErr, jobId }, "Failed to mark analysis job as errored");
      });
    }

    throw err;
  } finally {
    if (b2Key) {
      await deleteFromB2(b2Key).catch((err) => {
        logger.error({ err, jobId, b2Key }, "Analysis finished, but R2 video cleanup failed");
      });
    }
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function runVideoAnalyzer(
  jobId: string,
  videoPath: string,
  options: PipelineOptions
): Promise<void> {
  const workDir = path.dirname(videoPath);
  const audioPath = path.join(workDir, "audio.mp3");
  const framesDir = path.join(workDir, "frames");

  const plan = options.plan ?? "free";
  const modules = options.modules ?? ["quality", "editing"];
  const platforms = options.platforms ?? ["youtube_long"];
  const maxDuration = options.maxDurationSeconds ?? 300;

  const runQuality = modules.includes("quality");
  const runEditing = modules.includes("editing");
  const runPublish = modules.includes("publish");
  const runShortClips = modules.includes("shortClips");
  const [jobOwner] = await db
    .select({ userId: analysisJobsTable.userId })
    .from(analysisJobsTable)
    .where(eq(analysisJobsTable.id, jobId))
    .limit(1);
  const userId = jobOwner?.userId ?? undefined;

  try {
    await fs.mkdir(workDir, { recursive: true });
    await fs.mkdir(framesDir, { recursive: true });
    await stopIfCancelled(jobId);
    await stopIfMemoryHigh(jobId, "analysis start");

    // Step 1: Extract audio
    await updateJob(jobId, { status: "extracting_audio", progress: 12, currentStep: "Extracting audio" });
    logger.info({ jobId, videoPath, audioPath }, "Calling extractAudio");
    await extractAudio(videoPath, audioPath);
    await stopIfCancelled(jobId);
    await stopIfMemoryHigh(jobId, "audio extraction");
    logger.info({ jobId, audioPath }, "Audio extraction complete");

    // Step 2: Duration check
    await updateJob(jobId, { status: "extracting_audio", progress: 18, currentStep: "Checking video duration" });
    const durationSec = await getMediaDuration(audioPath);
    await stopIfCancelled(jobId);
    await stopIfMemoryHigh(jobId, "duration check");
    if (durationSec > maxDuration) {
      const planLabels: Record<string, string> = {
        free: "Free (5 min)", creator: "Creator (40 min)", pro: "Pro (2 hr)", studio: "Studio (3 hr)",
        premium: "Creator (40 min)", professional: "Studio (3 hr)",
      };
      const planLabel = planLabels[plan] ?? "your plan";
      await updateJob(jobId, {
        status: "error",
        error: `Video is ${Math.round(durationSec / 60)} minutes long, but the ${planLabel} plan allows up to ${Math.round(maxDuration / 60)} minutes. Upgrade your plan or trim your video.`,
      });
      await fs.unlink(videoPath).catch(() => {});
      await fs.unlink(audioPath).catch(() => {});
      return;
    }

    // Step 4: Transcribe (one Whisper call for all modules)
    await updateJob(jobId, { status: "transcribing", progress: 25, currentStep: "Transcribing audio", audioPath });
    logger.info({ jobId, audioPath }, "Calling transcribeAudio");
    let transcriptText = "";
    let transcriptSegments: Array<{ start: number; end: number; text: string }> = [];
    let wordTimings: Array<{ start: number; end: number; word: string }> | undefined;
    let whisperConfidence = 0.75;

    try {
      const transcription = await transcribeAudio(audioPath);
      await stopIfCancelled(jobId);
      await stopIfMemoryHigh(jobId, "transcription");
      transcriptText = transcription.text;
      transcriptSegments = transcription.segments;
      wordTimings = transcription.wordTimings;
      whisperConfidence = transcription.whisperConfidence;
      logger.info({ jobId, transcriptLength: transcriptText.length, segmentCount: transcriptSegments.length }, "Whisper transcription completed");
    } catch (err) {
      logger.error({ err, jobId }, "Transcription failed");
      await updateJob(jobId, { status: "error", error: `Transcription failed: ${err instanceof Error ? err.message : String(err)}` });
      return;
    }

    await updateJob(jobId, { status: "detecting_speech", progress: 32, currentStep: "Detecting speech pattern" });
    const speechAnalysis = analyzeSpeechPattern(durationSec, transcriptSegments, whisperConfidence);
    await updateJob(jobId, { result: { transcript: { segments: transcriptSegments, fullText: transcriptText } } });

    const videoName = await withTimeout(
      generateVideoName(transcriptText, options.originalFileName, userId),
      30000,
      "video name generation",
      jobId,
    ).catch((err) => {
      logger.warn({ err, jobId }, "Video name generation skipped");
      return options.originalFileName?.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Video analysis";
    });

    let progress = 35;
    const result: Record<string, unknown> = {
      mode: "video-analyzer",
      jobId,
      videoName,
      plan,
      platforms,
      modules,
      transcript: { segments: transcriptSegments, fullText: transcriptText },
      analysisProfile: speechAnalysis,
      analysisOptions: {
        mode: "video-analyzer",
        platform: platforms[0] ?? "youtube_long",
        platforms,
        modules,
        translateSubtitles: options.translateSubtitles,
        subtitleLanguage: options.subtitleLanguage,
        audioLanguage: options.audioLanguage,
        audioVoice: options.audioVoice,
        originalFileName: options.originalFileName,
        videoName,
        plan,
        maxDurationSeconds: maxDuration,
      },
    };
    await updateJob(jobId, { result: { videoName, analysisProfile: speechAnalysis, analysisOptions: result.analysisOptions } });

    const isFree = plan === "free";

    // Step 5: Quality module
    if (runQuality) {
      await updateJob(jobId, { status: "analyzing_visual", progress, currentStep: "Extracting video frames" });
      const frameCount = getAdaptiveFrameCount(plan, speechAnalysis.mode);
      logger.info({ jobId, frameCount }, "Starting frame extraction");
      const frameBase64List = await withTimeout(
        extractFrames(videoPath, framesDir, frameCount),
        getFrameExtractionTimeoutMs(),
        "frame extraction",
        jobId,
      );
      await stopIfCancelled(jobId);
      await stopIfMemoryHigh(jobId, "frame extraction");
      logger.info({ jobId, frameCount: frameBase64List.length }, "Frame extraction completed");

      progress = 45;
      await updateJob(jobId, { status: "analyzing_visual", progress, currentStep: "Analyzing video quality" });
      const primaryPlatform = platforms[0] ?? "youtube_long";
      const visualAnalysis = await withTimeout(
        analyzeVisuals(frameBase64List, primaryPlatform, plan, transcriptText, userId),
        90000,
        "visual analysis",
        jobId,
      );
      await stopIfCancelled(jobId);
      frameBase64List.length = 0;
      await fs.rm(framesDir, { recursive: true, force: true }).catch(() => {});
      await fs.mkdir(framesDir, { recursive: true }).catch(() => {});
      await stopIfMemoryHigh(jobId, "visual analysis");
      const audioAnalysis = await withTimeout(
        analyzeAudio(transcriptText, whisperConfidence, audioPath, userId),
        90000,
        "audio analysis",
        jobId,
      );
      await stopIfCancelled(jobId);
      await stopIfMemoryHigh(jobId, "audio analysis");
      const qualityScore = computeQualityScore(visualAnalysis, audioAnalysis);
      const pacing = speechAnalysis.hasMeaningfulSpeech ? analyzePacing(transcriptSegments, wordTimings) : null;
      const retention = !isFree ? buildRetentionForecast(
        Number((visualAnalysis as { overallVisualScore?: unknown }).overallVisualScore ?? 70),
        computeQualityScore({}, audioAnalysis),
        pacing ?? { wordsPerMinute: 120, longPauseCount: 0, engagementRiskTimestamps: [], avgWordGapMs: 300, longPauseTimestamps: [], pacingRating: "good" },
        (() => {
          const wordCount = transcriptText.split(/\s+/).filter(Boolean).length;
          const fillerWordCount = Number((audioAnalysis as { fillerWords?: { numeric?: unknown } }).fillerWords?.numeric ?? 0);
          return wordCount > 0 ? fillerWordCount / wordCount : 0;
        })(),
        transcriptSegments,
        ((visualAnalysis as { hookStrength?: "strong" | "moderate" | "weak" }).hookStrength ?? "moderate"),
        ((visualAnalysis as { background?: { contextAppropriate?: "yes" | "neutral" | "no" } }).background?.contextAppropriate ?? "neutral"),
        transcriptSegments[transcriptSegments.length - 1]?.end ?? await getMediaDuration(videoPath),
      ) : undefined;
      const pacingScore = pacing ? scorePacing(pacing) : null;

      if (!speechAnalysis.hasMeaningfulSpeech) {
        delete (audioAnalysis as Record<string, unknown>).fillerWords;
      }

      const formatProfile = (visualAnalysis as { formatProfile?: Record<string, unknown> }).formatProfile ?? null;
      result.quality = {
        score: qualityScore,
        ...visualAnalysis,
        ...audioAnalysis,
        ...(pacing ? {
          pacing: {
            level: pacing.pacingRating,
            numeric: pacingScore,
            assessment: `${Math.round(pacing.wordsPerMinute)} wpm with ${pacing.longPauseCount} silence gap${pacing.longPauseCount === 1 ? "" : "s"}.`,
            suggestions: pacing.longPauseCount > 0
              ? ["Cut silence gaps over 1.5 seconds and tighten slow sections before upload."]
              : ["Keep delivery tight; use B-roll or pattern breaks before attention drops."],
            severity: (pacingScore ?? 0) >= 95 ? "excellent" : (pacingScore ?? 0) >= 80 ? "good" : (pacingScore ?? 0) >= 60 ? "needs work" : "critical",
            wordsPerMinute: pacing.wordsPerMinute,
            longPauseCount: pacing.longPauseCount,
            engagementRisks: pacing.engagementRiskTimestamps,
          },
        } : {}),
        speechProfile: speechAnalysis,
        ...(retention ? { retention } : {}),
      };
      result.analysisProfile = {
        ...speechAnalysis,
        ...(formatProfile ? { formatProfile } : {}),
      };
      if (retention) result.retention = retention;
      result.totalScore = getTotalAnalysisScore(result);
      await updateJob(jobId, { result: { analysisProfile: result.analysisProfile, quality: result.quality, ...(retention ? { retention } : {}), totalScore: result.totalScore } });
      progress = 55;
    }

    // Step 6: Editing module
    if (runEditing) {
      await updateJob(jobId, { status: "analyzing_content", progress, currentStep: "Analyzing editing points" });
      const editingData = await withTimeout(
        analyzeEditingPoints(transcriptText, transcriptSegments, audioPath, plan, speechAnalysis, userId),
        90000,
        "editing analysis",
        jobId,
      );
      await stopIfCancelled(jobId);
      await stopIfMemoryHigh(jobId, "editing analysis");
      result.editing = editingData;
      await updateJob(jobId, { result: { editing: editingData } });
      progress = 68;
    }

    // Step 7: Publish module (SEO per platform)
    if (runPublish) {
      await updateJob(jobId, { status: "generating_seo", progress, currentStep: "Generating SEO content" });
      const publishResults: Record<string, unknown> = {};
      for (const platform of platforms) {
        try {
          const seoResult = await withTimeout(
            generateSeo(transcriptText, platform, transcriptSegments, plan, speechAnalysis, videoName, userId),
            90000,
            `SEO generation for ${platform}`,
            jobId,
          );
          await stopIfCancelled(jobId);
          await stopIfMemoryHigh(jobId, `SEO generation for ${platform}`);
          publishResults[platform] = seoResult;
        } catch (err) {
          logger.warn({ err, platform, jobId }, "SEO generation failed for platform");
          publishResults[platform] = { titles: [], description: "", hashtags: [], timestamps: [] };
        }
      }

      result.publish = publishResults;
      await updateJob(jobId, { result: { publish: publishResults } });

      // SRT only for paid users
      if (!isFree) {
        let subtitleSegments = transcriptSegments;
        if (options.translateSubtitles && options.subtitleLanguage) {
          try {
            subtitleSegments = await withTimeout(
              translateSegments(transcriptSegments, options.subtitleLanguage, userId),
              90000,
              "subtitle translation",
              jobId,
            );
            await stopIfCancelled(jobId);
            await stopIfMemoryHigh(jobId, "subtitle translation");
          } catch (err) {
            logger.warn({ err, jobId }, "Subtitle translation failed");
          }
        }
        const srtContent = generateSrt(subtitleSegments);
        result.subtitleFile = {
          format: "srt",
          language: options.translateSubtitles && options.subtitleLanguage ? options.subtitleLanguage : "original",
          content: srtContent,
        };
      }
      progress = 82;
    }

    // Step 8: Short clips module
    if (runShortClips) {
      await updateJob(jobId, { status: "analyzing_content", progress, currentStep: "Finding best short clip moments" });
      const shortClipsData = await withTimeout(
        generateShortClipIdeas(transcriptText, transcriptSegments, platforms, plan, userId),
        90000,
        "short clip generation",
        jobId,
      );
      await stopIfCancelled(jobId);
      await stopIfMemoryHigh(jobId, "short clip generation");
      result.shortClips = shortClipsData;
      await updateJob(jobId, { result: { shortClips: shortClipsData } });
      progress = 95;
    }

    if (!(await isAnalysisCancelled(jobId))) {
      await updateJob(jobId, {
        status: "complete",
        progress: 100,
        currentStep: "Analysis complete",
        result,
      });
    }

    await fs.rm(framesDir, { recursive: true, force: true }).catch(() => {});
  } catch (err) {
    logger.error({ err, jobId }, "Video analyzer pipeline error");
    if (isAnalysisTimeoutError(err)) {
      await updateJob(jobId, {
        status: "error",
        currentStep: "Analysis timed out",
        error: getPipelineErrorMessage(err),
      });
    } else {
      await updateJob(jobId, { status: "error", error: err instanceof Error ? err.message : String(err) });
    }
    await fs.unlink(videoPath).catch(() => {});
    throw err;
  }
}
