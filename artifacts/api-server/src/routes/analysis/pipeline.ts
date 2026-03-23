import fs from "fs/promises";
import path from "path";
import os from "os";
import { promisify } from "util";
import { exec } from "child_process";
import { db } from "@workspace/db";
import { analysisJobsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  updateJob, transcribeAudio, extractAudio, extractFrames,
  analyzeVisuals, analyzeAudio, analyzeScriptFeedback, analyzeEditingPoints,
  generateSeo, generateSrt, translateSegments, computeQualityScore, logger,
} from "./services";
import { openai } from "@workspace/integrations-openai-ai-server";
import { textToSpeech } from "@workspace/integrations-openai-ai-server/audio";

const execAsync = promisify(exec);

export type PipelineMode = "pre-edit" | "editing" | "publish" | "dubbing";

export interface PipelineOptions {
  mode: PipelineMode;
  platform?: string;
  translateSubtitles?: boolean;
  subtitleLanguage?: string;
  audioLanguage?: string;
  audioVoice?: string;
}

export async function runAnalysisPipeline(
  jobId: string,
  videoPath: string,
  options: PipelineOptions
): Promise<void> {
  const workDir = path.join(path.dirname(videoPath), jobId);
  const audioPath = path.join(workDir, "audio.mp3");

  try {
    await fs.mkdir(workDir, { recursive: true });

    await updateJob(jobId, { status: "extracting_audio", progress: 8, currentStep: "Extracting audio" });
    await extractAudio(videoPath, audioPath);

    await updateJob(jobId, { status: "transcribing", progress: 20, currentStep: "Transcribing audio", audioPath });
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
      await runPreEdit(jobId, videoPath, workDir, audioPath, transcriptText, transcriptSegments, whisperConfidence);
    } else if (mode === "editing") {
      await runEditing(jobId, videoPath, transcriptText, transcriptSegments);
    } else if (mode === "publish") {
      await runPublish(jobId, videoPath, transcriptText, transcriptSegments, options);
    } else if (mode === "dubbing") {
      await runDubbing(jobId, videoPath, workDir, transcriptText, transcriptSegments, options);
    }

    const savedVideoExt = path.extname(videoPath);
    const savedVideoPath = path.join(workDir, `original${savedVideoExt}`);
    await fs.rename(videoPath, savedVideoPath).catch(() => fs.unlink(videoPath).catch(() => {}));
    await db.update(analysisJobsTable).set({ videoPath: savedVideoPath, updatedAt: new Date() }).where(eq(analysisJobsTable.id, jobId));

  } catch (err) {
    logger.error({ err, jobId }, "Pipeline error");
    await updateJob(jobId, { status: "error", error: err instanceof Error ? err.message : String(err) });
    await fs.unlink(videoPath).catch(() => {});
  }
}

async function runPreEdit(
  jobId: string,
  videoPath: string,
  workDir: string,
  audioPath: string,
  transcriptText: string,
  transcriptSegments: Array<{ start: number; end: number; text: string }>,
  whisperConfidence: number
) {
  const framesDir = path.join(workDir, "frames");
  await fs.mkdir(framesDir, { recursive: true });

  await updateJob(jobId, { status: "extracting_frames", progress: 35, currentStep: "Extracting frames" });
  const frameBase64List = await extractFrames(videoPath, framesDir, 5);

  await updateJob(jobId, { status: "analyzing_visual", progress: 50, currentStep: "Analyzing visuals" });
  const visualAnalysis = await analyzeVisuals(frameBase64List, "youtube_long");

  await updateJob(jobId, { status: "analyzing_audio", progress: 65, currentStep: "Analyzing audio quality" });
  const audioAnalysis = await analyzeAudio(transcriptText, whisperConfidence);

  await updateJob(jobId, { status: "analyzing_content", progress: 80, currentStep: "Analyzing script" });
  const scriptFeedback = await analyzeScriptFeedback(transcriptText, transcriptSegments);

  const qualityScore = computeQualityScore(visualAnalysis, audioAnalysis);

  await updateJob(jobId, {
    status: "complete",
    progress: 100,
    currentStep: "Analysis complete",
    result: {
      mode: "pre-edit",
      jobId,
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
  videoPath: string,
  transcriptText: string,
  transcriptSegments: Array<{ start: number; end: number; text: string }>
) {
  await updateJob(jobId, { status: "analyzing_content", progress: 50, currentStep: "Identifying editing points" });
  const editingData = await analyzeEditingPoints(transcriptText, transcriptSegments);

  await updateJob(jobId, {
    status: "complete",
    progress: 100,
    currentStep: "Analysis complete",
    result: {
      mode: "editing",
      jobId,
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
  videoPath: string,
  transcriptText: string,
  transcriptSegments: Array<{ start: number; end: number; text: string }>,
  options: PipelineOptions
) {
  const platform = options.platform || "youtube_long";

  await updateJob(jobId, { status: "generating_seo", progress: 50, currentStep: "Generating SEO content" });
  const seoResult = await generateSeo(transcriptText, platform);

  await updateJob(jobId, { status: "generating_subtitles", progress: 75, currentStep: "Generating subtitle file" });

  let subtitleSegments = transcriptSegments;
  if (options.translateSubtitles && options.subtitleLanguage) {
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
      platform,
      ...(seoResult as object),
      subtitleFile: {
        format: "srt",
        language: options.translateSubtitles && options.subtitleLanguage ? options.subtitleLanguage : "original",
        content: srtContent,
      },
      transcript: { segments: transcriptSegments, fullText: transcriptText },
    },
  });
}

async function runDubbing(
  jobId: string,
  videoPath: string,
  workDir: string,
  transcriptText: string,
  transcriptSegments: Array<{ start: number; end: number; text: string }>,
  options: PipelineOptions
) {
  const targetLanguage = options.audioLanguage || "Spanish";
  const voice = (options.audioVoice as "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer") || "alloy";
  const exportDir = path.join(os.tmpdir(), "daytabs-exports");
  await fs.mkdir(exportDir, { recursive: true });

  await updateJob(jobId, { status: "translating", progress: 35, currentStep: `Translating to ${targetLanguage}` });

  let translatedScript = transcriptText;
  try {
    const transResp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: `Professional translator. Translate to ${targetLanguage}. Preserve tone and style. Return only translated text.` },
        { role: "user", content: transcriptText },
      ],
      max_completion_tokens: 4000,
    } as Parameters<typeof openai.chat.completions.create>[0]);
    translatedScript = (transResp.choices[0]?.message?.content ?? translatedScript).trim();
  } catch (err) {
    logger.warn({ err, jobId }, "Translation failed, using original");
  }

  await updateJob(jobId, { status: "generating_audio", progress: 55, currentStep: "Generating AI voice" });

  const MAX_CHUNK = 4000;
  const chunks: string[] = [];
  if (translatedScript.length <= MAX_CHUNK) {
    chunks.push(translatedScript);
  } else {
    let remaining = translatedScript;
    while (remaining.length > MAX_CHUNK) {
      const slice = remaining.slice(0, MAX_CHUNK);
      const lastBreak = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "), slice.lastIndexOf("\n"));
      const cutAt = lastBreak > MAX_CHUNK / 2 ? lastBreak + 1 : MAX_CHUNK;
      chunks.push(remaining.slice(0, cutAt).trim());
      remaining = remaining.slice(cutAt).trim();
    }
    if (remaining) chunks.push(remaining);
  }

  const chunkBuffers = await Promise.all(chunks.map(async (chunk) => {
    const speech = await openai.audio.speech.create({
      model: "tts-1", voice, input: chunk, response_format: "mp3",
    } as Parameters<typeof openai.audio.speech.create>[0]);
    return Buffer.from(await speech.arrayBuffer());
  }));

  await updateJob(jobId, { status: "merging_video", progress: 75, currentStep: "Merging audio with video" });

  const dubId = jobId.slice(0, 8);
  const chunkFiles: string[] = [];
  let ttsPath: string;

  if (chunkBuffers.length === 1) {
    ttsPath = path.join(workDir, `tts_${dubId}.mp3`);
    await fs.writeFile(ttsPath, chunkBuffers[0]);
    chunkFiles.push(ttsPath);
  } else {
    for (let ci = 0; ci < chunkBuffers.length; ci++) {
      const p = path.join(workDir, `tts_chunk_${dubId}_${ci}.mp3`);
      await fs.writeFile(p, chunkBuffers[ci]);
      chunkFiles.push(p);
    }
    const concatList = path.join(workDir, `concat_${dubId}.txt`);
    await fs.writeFile(concatList, chunkFiles.map(f => `file '${f}'`).join("\n"));
    ttsPath = path.join(workDir, `tts_${dubId}.mp3`);
    await execAsync(`ffmpeg -f concat -safe 0 -i "${concatList}" -c copy "${ttsPath}" -y`);
    await fs.unlink(concatList).catch(() => {});
    for (const f of chunkFiles) await fs.unlink(f).catch(() => {});
  }

  const outputFilename = `daytabs_dubbed_${targetLanguage.toLowerCase()}_${dubId}.mp4`;
  const outputPath = path.join(exportDir, outputFilename);

  await execAsync(
    `ffmpeg -i "${videoPath}" -i "${ttsPath}" ` +
    `-map 0:v:0 -map 1:a:0 ` +
    `-c:v copy -c:a aac -b:a 192k -shortest "${outputPath}" -y`
  );
  await fs.unlink(ttsPath).catch(() => {});

  await updateJob(jobId, {
    status: "complete",
    progress: 100,
    currentStep: "Dubbing complete",
    result: {
      mode: "dubbing",
      jobId,
      translatedLanguage: targetLanguage,
      voice,
      downloadUrl: `/api/analysis/download/${outputFilename}`,
      filename: outputFilename,
    },
  });
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
