import fs from "fs/promises";
import path from "path";
import { db } from "@workspace/db";
import { analysisJobsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  updateJob, transcribeAudio, extractAudio, compressVideo, extractFrames,
  analyzeVisuals, analyzeAudio, analyzeScriptFeedback, analyzeEditingPoints,
  generateSeo, generateSrt, translateSegments, computeQualityScore, logger,
} from "./services";

export type PipelineMode = "pre-edit" | "editing" | "publish" | "dubbing";

export interface PipelineOptions {
  mode: PipelineMode;
  platform?: string;
  translateSubtitles?: boolean;
  subtitleLanguage?: string;
  audioLanguage?: string;
  audioVoice?: string;
  /** User's subscription plan — controls AI depth and result scope */
  plan?: string;
}

export async function runAnalysisPipeline(
  jobId: string,
  videoPath: string,
  options: PipelineOptions
): Promise<void> {
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
    // dubbing is blocked at the route level — no pipeline handler needed

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

  // Free users: extract 5 frames (cost savings); paid: 10 frames for richer analysis
  await updateJob(jobId, { status: "extracting_frames", progress: 35, currentStep: "Extracting frames" });
  const frameBase64List = await extractFrames(originalVideoPath, framesDir, isFree ? 5 : 10);

  await updateJob(jobId, { status: "analyzing_visual", progress: 50, currentStep: "Analyzing visuals" });
  const visualAnalysis = await analyzeVisuals(frameBase64List, "youtube_long");

  await updateJob(jobId, { status: "analyzing_audio", progress: 65, currentStep: "Analyzing audio quality" });
  const audioAnalysis = await analyzeAudio(transcriptText, whisperConfidence);

  await updateJob(jobId, { status: "analyzing_content", progress: 80, currentStep: "Analyzing script" });
  // Free users: truncate transcript before sending to AI (saves tokens)
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
      quality: {
        score: qualityScore,
        ...visualAnalysis,
        ...audioAnalysis,
      },
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

  // Free users: truncate transcript to limit AI tokens
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
      transcript: transcriptSegments.map(s => ({
        time: formatTime(s.start),
        text: s.text,
      })),
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
  // Free users: subtitle translation is locked (also blocked on frontend)
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
