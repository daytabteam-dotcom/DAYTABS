import fs from "fs/promises";
import path from "path";
import { db } from "@workspace/db";
import { analysisJobsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  updateJob, transcribeAudio, extractAudio, compressVideo, extractFrames,
  analyzeVisuals, analyzeAudio, analyzeScriptFeedback, analyzeEditingPoints,
  generateSeo, generateShortClipIdeas, generateSrt, translateSegments,
  computeQualityScore, getMediaDuration, logger,
} from "./services";

export type PipelineMode = "pre-edit" | "editing" | "publish" | "video-analyzer";

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
  videoPath: string,
  options: PipelineOptions
): Promise<void> {
  if (options.mode === "video-analyzer") {
    return runVideoAnalyzer(jobId, videoPath, options);
  }

  const workDir = path.join(path.dirname(videoPath), jobId);
  const compressedPath = path.join(workDir, "compressed.mp4");
  const audioPath = path.join(workDir, "audio.mp3");
  const plan = options.plan ?? "free";

  try {
    await fs.mkdir(workDir, { recursive: true });

    await updateJob(jobId, { status: "extracting_audio", progress: 5, currentStep: "Compressing video for processing" });
    await compressVideo(videoPath, compressedPath);

    await updateJob(jobId, { status: "extracting_audio", progress: 12, currentStep: "Extracting audio" });
    await extractAudio(compressedPath, audioPath);

    await updateJob(jobId, { status: "transcribing", progress: 22, currentStep: "Transcribing audio", audioPath });
    let transcriptText = "";
    let transcriptSegments: Array<{ start: number; end: number; text: string }> = [];
    let whisperConfidence = 0.85;

    try {
      const transcription = await transcribeAudio(audioPath);
      transcriptText = transcription.text;
      transcriptSegments = transcription.segments;
      whisperConfidence = 0.9;
    } catch (err) {
      logger.error({ err, jobId }, "Transcription failed");
      await updateJob(jobId, { status: "error", error: `Transcription failed: ${err instanceof Error ? err.message : String(err)}` });
      return;
    }

    const mode = options.mode;

    if (mode === "pre-edit") {
      await runPreEdit(jobId, videoPath, workDir, audioPath, transcriptText, transcriptSegments, whisperConfidence, plan);
    } else if (mode === "editing") {
      await runEditing(jobId, audioPath, transcriptText, transcriptSegments, plan);
    } else if (mode === "publish") {
      await runPublish(jobId, transcriptText, transcriptSegments, options, plan);
    }

    const savedVideoExt = path.extname(videoPath);
    const savedVideoPath = path.join(workDir, `original${savedVideoExt}`);
    await fs.rename(videoPath, savedVideoPath).catch(() => fs.unlink(videoPath).catch(() => {}));
    await fs.unlink(compressedPath).catch(() => {});
    await db.update(analysisJobsTable).set({ videoPath: savedVideoPath, updatedAt: new Date() }).where(eq(analysisJobsTable.id, jobId));

  } catch (err) {
    logger.error({ err, jobId }, "Pipeline error");
    await updateJob(jobId, { status: "error", error: err instanceof Error ? err.message : String(err) });
    await fs.unlink(videoPath).catch(() => {});
    await fs.unlink(compressedPath).catch(() => {});
  }
}

// ── Video Analyzer — unified pipeline ───────────────────────────────────────

async function runVideoAnalyzer(
  jobId: string,
  videoPath: string,
  options: PipelineOptions
): Promise<void> {
  const workDir = path.join(path.dirname(videoPath), jobId);
  const compressedPath = path.join(workDir, "compressed.mp4");
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

    // ── Step 1: Compress ────────────────────────────────────────────────────
    await updateJob(jobId, { status: "extracting_audio", progress: 5, currentStep: "Compressing video" });
    await compressVideo(videoPath, compressedPath);

    // ── Step 2: Extract audio ───────────────────────────────────────────────
    await updateJob(jobId, { status: "extracting_audio", progress: 12, currentStep: "Extracting audio" });
    await extractAudio(compressedPath, audioPath);

    // ── Step 3: Duration check ──────────────────────────────────────────────
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
      await fs.unlink(compressedPath).catch(() => {});
      await fs.unlink(audioPath).catch(() => {});
      return;
    }

    // ── Step 4: Transcribe (one Whisper call for all modules) ───────────────
    await updateJob(jobId, { status: "transcribing", progress: 25, currentStep: "Transcribing audio", audioPath });
    let transcriptText = "";
    let transcriptSegments: Array<{ start: number; end: number; text: string }> = [];

    try {
      const transcription = await transcribeAudio(audioPath);
      transcriptText = transcription.text;
      transcriptSegments = transcription.segments;
    } catch (err) {
      logger.error({ err, jobId }, "Transcription failed");
      await updateJob(jobId, { status: "error", error: `Transcription failed: ${err instanceof Error ? err.message : String(err)}` });
      return;
    }

    let progress = 35;
    const result: Record<string, unknown> = {
      mode: "video-analyzer",
      jobId,
      plan,
      platforms,
      modules,
      transcript: { segments: transcriptSegments, fullText: transcriptText },
    };

    // ── Step 5: Quality module (visuals + audio) ─────────────────────────────
    if (runQuality) {
      await updateJob(jobId, { status: "analyzing_visual", progress, currentStep: "Extracting video frames" });
      const isFree = plan === "free";
      const frameCount = isFree ? 5 : 10;
      const frameBase64List = await extractFrames(videoPath, framesDir, frameCount);

      progress = 45;
      await updateJob(jobId, { status: "analyzing_visual", progress, currentStep: "Analyzing video quality" });
      const primaryPlatform = platforms[0] ?? "youtube_long";
      const visualAnalysis = await analyzeVisuals(frameBase64List, primaryPlatform);
      const audioAnalysis = await analyzeAudio(transcriptText, 0.9);
      const qualityScore = computeQualityScore(visualAnalysis, audioAnalysis);

      result.quality = {
        score: qualityScore,
        ...visualAnalysis,
        ...audioAnalysis,
      };
      progress = 55;
    }

    // ── Step 6: Editing module ───────────────────────────────────────────────
    if (runEditing) {
      await updateJob(jobId, { status: "analyzing_content", progress, currentStep: "Analyzing editing points" });
      const editingData = await analyzeEditingPoints(transcriptText, transcriptSegments, audioPath);
      result.editing = editingData;
      progress = 68;
    }

    // ── Step 7: Publish module (SEO per platform) ────────────────────────────
    if (runPublish) {
      await updateJob(jobId, { status: "generating_seo", progress, currentStep: "Generating SEO content" });
      const publishResults: Record<string, unknown> = {};
      for (const platform of platforms) {
        try {
          const seoResult = await generateSeo(transcriptText, platform, transcriptSegments);
          publishResults[platform] = seoResult;
        } catch (err) {
          logger.warn({ err, platform, jobId }, "SEO generation failed for platform");
          publishResults[platform] = { titles: [], description: "", hashtags: [], timestamps: [] };
        }
      }

      // Subtitle generation (SRT) for the first platform
      let subtitleSegments = transcriptSegments;
      if (plan !== "free" && options.translateSubtitles && options.subtitleLanguage) {
        try {
          subtitleSegments = await translateSegments(transcriptSegments, options.subtitleLanguage);
        } catch (err) {
          logger.warn({ err, jobId }, "Subtitle translation failed");
        }
      }
      const srtContent = generateSrt(subtitleSegments);

      result.publish = publishResults;
      result.subtitleFile = {
        format: "srt",
        language: plan !== "free" && options.translateSubtitles && options.subtitleLanguage ? options.subtitleLanguage : "original",
        content: srtContent,
      };
      progress = 82;
    }

    // ── Step 8: Short clips module ───────────────────────────────────────────
    if (runShortClips) {
      await updateJob(jobId, { status: "analyzing_content", progress, currentStep: "Finding best short clip moments" });
      const shortClipsData = await generateShortClipIdeas(transcriptText, transcriptSegments, platforms);
      result.shortClips = shortClipsData;
      progress = 95;
    }

    // ── Done ─────────────────────────────────────────────────────────────────
    await updateJob(jobId, {
      status: "complete",
      progress: 100,
      currentStep: "Analysis complete",
      result,
    });

    // Cleanup: keep original video path in db, remove compressed + audio
    const savedVideoExt = path.extname(videoPath);
    const savedVideoPath = path.join(workDir, `original${savedVideoExt}`);
    await fs.rename(videoPath, savedVideoPath).catch(() => fs.unlink(videoPath).catch(() => {}));
    await fs.unlink(compressedPath).catch(() => {});
    await fs.rm(framesDir, { recursive: true, force: true }).catch(() => {});
    await db.update(analysisJobsTable).set({ videoPath: savedVideoPath, updatedAt: new Date() }).where(eq(analysisJobsTable.id, jobId));

  } catch (err) {
    logger.error({ err, jobId }, "Video analyzer pipeline error");
    await updateJob(jobId, { status: "error", error: err instanceof Error ? err.message : String(err) });
    await fs.unlink(videoPath).catch(() => {});
    await fs.unlink(compressedPath).catch(() => {});
  }
}

// ── Legacy pipeline modes ────────────────────────────────────────────────────

async function runPreEdit(
  jobId: string,
  originalVideoPath: string,
  workDir: string,
  audioPath: string,
  transcriptText: string,
  transcriptSegments: Array<{ start: number; end: number; text: string }>,
  whisperConfidence: number,
  plan: string
) {
  const isFree = plan === "free";
  const framesDir = path.join(workDir, "frames");
  await fs.mkdir(framesDir, { recursive: true });

  await updateJob(jobId, { status: "extracting_frames", progress: 35, currentStep: "Extracting frames" });
  const frameBase64List = await extractFrames(originalVideoPath, framesDir, isFree ? 5 : 10);

  await updateJob(jobId, { status: "analyzing_visual", progress: 50, currentStep: "Analyzing visuals" });
  const visualAnalysis = await analyzeVisuals(frameBase64List, "youtube_long");

  await updateJob(jobId, { status: "analyzing_audio", progress: 65, currentStep: "Analyzing audio quality" });
  const audioAnalysis = await analyzeAudio(transcriptText, whisperConfidence);

  await updateJob(jobId, { status: "analyzing_content", progress: 80, currentStep: "Analyzing script" });
  const transcriptForAI = isFree ? transcriptText.slice(0, 1500) : transcriptText;
  const scriptFeedback = await analyzeScriptFeedback(transcriptForAI, transcriptSegments);

  const qualityScore = computeQualityScore(visualAnalysis, audioAnalysis);

  await updateJob(jobId, {
    status: "complete",
    progress: 100,
    currentStep: "Analysis complete",
    result: {
      mode: "pre-edit",
      jobId,
      plan,
      quality: { score: qualityScore, ...visualAnalysis, ...audioAnalysis },
      scriptFeedback,
      transcript: { segments: transcriptSegments, fullText: transcriptText },
    },
  });
}

async function runEditing(
  jobId: string,
  audioPath: string,
  transcriptText: string,
  transcriptSegments: Array<{ start: number; end: number; text: string }>,
  plan: string
) {
  const isFree = plan === "free";
  await updateJob(jobId, { status: "analyzing_content", progress: 50, currentStep: "Identifying editing points" });
  const transcriptForAI = isFree ? transcriptText.slice(0, 2000) : transcriptText;
  const editingData = await analyzeEditingPoints(transcriptForAI, transcriptSegments, audioPath);

  await updateJob(jobId, {
    status: "complete",
    progress: 100,
    currentStep: "Analysis complete",
    result: {
      mode: "editing",
      jobId,
      plan,
      ...(editingData as object),
      transcript: transcriptSegments.map(s => ({ time: formatTime(s.start), text: s.text })),
    },
  });
}

async function runPublish(
  jobId: string,
  transcriptText: string,
  transcriptSegments: Array<{ start: number; end: number; text: string }>,
  options: PipelineOptions,
  plan: string
) {
  const isFree = plan === "free";
  const platform = options.platform || "youtube_long";

  await updateJob(jobId, { status: "generating_seo", progress: 50, currentStep: "Generating SEO content" });
  const transcriptForAI = isFree ? transcriptText.slice(0, 2000) : transcriptText;
  const seoResult = await generateSeo(transcriptForAI, platform, transcriptSegments);

  await updateJob(jobId, { status: "generating_subtitles", progress: 75, currentStep: "Generating subtitle file" });

  let subtitleSegments = transcriptSegments;
  if (!isFree && options.translateSubtitles && options.subtitleLanguage) {
    try {
      subtitleSegments = await translateSegments(transcriptSegments, options.subtitleLanguage);
    } catch (err) {
      logger.warn({ err, jobId }, "Subtitle translation failed, using original");
    }
  }

  const srtContent = generateSrt(subtitleSegments);

  await updateJob(jobId, {
    status: "complete",
    progress: 100,
    currentStep: "Analysis complete",
    result: {
      mode: "publish",
      jobId,
      plan,
      platform,
      ...(seoResult as object),
      subtitleFile: {
        format: "srt",
        language: !isFree && options.translateSubtitles && options.subtitleLanguage ? options.subtitleLanguage : "original",
        content: srtContent,
      },
      transcript: { segments: transcriptSegments, fullText: transcriptText },
    },
  });
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
