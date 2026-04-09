import fs from "fs/promises";
import os from "os";
import path from "path";
import { db } from "@workspace/db";
import { analysisJobsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { downloadFromB2 } from "../../lib/b2";
import {
  updateJob, transcribeAudio, extractAudio, extractFrames,
  analyzeVisuals, analyzeAudio, analyzeEditingPoints,
  generateSeo, generateShortClipIdeas, generateSrt, translateSegments,
  computeQualityScore, getMediaDuration, logger,
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
}

export async function runAnalysisPipeline(
  jobId: string,
  b2Key: string,
  options: PipelineOptions
): Promise<void> {
  const workDir = path.join(os.tmpdir(), "daytabs", jobId);
  const localVideoPath = path.join(workDir, "video.mp4");

  try {
    await fs.mkdir(workDir, { recursive: true });
    await downloadFromB2(b2Key, localVideoPath);
    return await runVideoAnalyzer(jobId, localVideoPath, options);
  } finally {
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

  try {
    await fs.mkdir(workDir, { recursive: true });
    await fs.mkdir(framesDir, { recursive: true });

    // Step 1: Extract audio
    await updateJob(jobId, { status: "extracting_audio", progress: 12, currentStep: "Extracting audio" });
    logger.info({ jobId, videoPath, audioPath }, "Calling extractAudio");
    await extractAudio(videoPath, audioPath);
    logger.info({ jobId, audioPath }, "Audio extraction complete");

    // Step 2: Duration check
    await updateJob(jobId, { status: "extracting_audio", progress: 18, currentStep: "Checking video duration" });
    const durationSec = await getMediaDuration(audioPath);
    if (durationSec > maxDuration) {
      const planLabels: Record<string, string> = {
        free: "Free (5 min)", creator: "Creator (15 min)", pro: "Pro (30 min)", studio: "Studio (60 min)",
        premium: "Creator (15 min)", professional: "Studio (60 min)",
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

    try {
      const transcription = await transcribeAudio(audioPath);
      transcriptText = transcription.text;
      transcriptSegments = transcription.segments;
      logger.info({ jobId, transcriptLength: transcriptText.length, segmentCount: transcriptSegments.length }, "Whisper transcription completed");
    } catch (err) {
      logger.error({ err, jobId }, "Transcription failed");
      await updateJob(jobId, { status: "error", error: `Transcription failed: ${err instanceof Error ? err.message : String(err)}` });
      return;
    }

    await updateJob(jobId, { result: { transcript: { segments: transcriptSegments, fullText: transcriptText } } });

    let progress = 35;
    const result: Record<string, unknown> = {
      mode: "video-analyzer",
      jobId,
      plan,
      platforms,
      modules,
      transcript: { segments: transcriptSegments, fullText: transcriptText },
    };

    const isFree = plan === "free";

    // Step 5: Quality module
    if (runQuality) {
      await updateJob(jobId, { status: "analyzing_visual", progress, currentStep: "Extracting video frames" });
      const frameCount = isFree ? 1 : 5;
      logger.info({ jobId, frameCount }, "Starting frame extraction");
      const frameBase64List = await withTimeout(
        extractFrames(videoPath, framesDir, frameCount),
        90000,
        "frame extraction",
        jobId,
      );
      logger.info({ jobId, frameCount: frameBase64List.length }, "Frame extraction completed");

      progress = 45;
      await updateJob(jobId, { status: "analyzing_visual", progress, currentStep: "Analyzing video quality" });
      const primaryPlatform = platforms[0] ?? "youtube_long";
      const visualAnalysis = await withTimeout(
        analyzeVisuals(frameBase64List, primaryPlatform, plan),
        90000,
        "visual analysis",
        jobId,
      );
      const audioAnalysis = await withTimeout(
        analyzeAudio(transcriptText, 0.9),
        90000,
        "audio analysis",
        jobId,
      );
      const qualityScore = computeQualityScore(visualAnalysis, audioAnalysis);

      result.quality = {
        score: qualityScore,
        ...visualAnalysis,
        ...audioAnalysis,
      };
      await updateJob(jobId, { result: { quality: result.quality } });
      progress = 55;
    }

    // Step 6: Editing module
    if (runEditing) {
      await updateJob(jobId, { status: "analyzing_content", progress, currentStep: "Analyzing editing points" });
      const editingData = await withTimeout(
        analyzeEditingPoints(transcriptText, transcriptSegments, audioPath, plan),
        90000,
        "editing analysis",
        jobId,
      );
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
            generateSeo(transcriptText, platform, transcriptSegments, plan),
            90000,
            `SEO generation for ${platform}`,
            jobId,
          );
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
              translateSegments(transcriptSegments, options.subtitleLanguage),
              90000,
              "subtitle translation",
              jobId,
            );
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
        generateShortClipIdeas(transcriptText, transcriptSegments, platforms, plan),
        90000,
        "short clip generation",
        jobId,
      );
      result.shortClips = shortClipsData;
      await updateJob(jobId, { result: { shortClips: shortClipsData } });
      progress = 95;
    }

    await updateJob(jobId, {
      status: "complete",
      progress: 100,
      currentStep: "Analysis complete",
      result,
    });

    await fs.rm(framesDir, { recursive: true, force: true }).catch(() => {});
  } catch (err) {
    logger.error({ err, jobId }, "Video analyzer pipeline error");
    await updateJob(jobId, { status: "error", error: err instanceof Error ? err.message : String(err) });
    await fs.unlink(videoPath).catch(() => {});
  }
}

