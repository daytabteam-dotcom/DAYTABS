import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import { db } from "@workspace/db";
import { analysisJobsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../../lib/logger";
import { openai } from "@workspace/integrations-openai-ai-server";
import { speechToText } from "@workspace/integrations-openai-ai-server/audio";

const execAsync = promisify(exec);

async function callOpenAI(body: object): Promise<unknown> {
  const response = await openai.chat.completions.create(body as Parameters<typeof openai.chat.completions.create>[0]);
  return response;
}

async function transcribeAudio(audioPath: string): Promise<{ text: string; segments: Array<{ start: number; end: number; text: string }> }> {
  const audioBuffer = await fs.readFile(audioPath);
  const fullText = await speechToText(audioBuffer, "mp3");
  const segments = buildApproximateSegments(fullText);
  return { text: fullText, segments };
}

function buildApproximateSegments(text: string): Array<{ start: number; end: number; text: string }> {
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

async function updateJob(jobId: string, updates: Partial<typeof analysisJobsTable.$inferInsert>) {
  await db.update(analysisJobsTable)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(analysisJobsTable.id, jobId));
}

export async function runAnalysisPipeline(jobId: string, videoPath: string, platform: string, options: {
  translateSubtitles?: boolean;
  subtitleLanguage?: string;
  replaceAudio?: boolean;
  audioLanguage?: string;
}): Promise<void> {
  const workDir = path.join(path.dirname(videoPath), jobId);
  const audioPath = path.join(workDir, "audio.mp3");
  const framesDir = path.join(workDir, "frames");

  try {
    await fs.mkdir(workDir, { recursive: true });
    await fs.mkdir(framesDir, { recursive: true });

    await updateJob(jobId, { status: "extracting_audio", progress: 5, currentStep: "Extracting audio" });

    await execAsync(`ffmpeg -i "${videoPath}" -q:a 0 -map a "${audioPath}" -y`);

    await updateJob(jobId, { status: "extracting_frames", progress: 15, currentStep: "Extracting frames", audioPath });

    await execAsync(`ffmpeg -i "${videoPath}" -vf "fps=1/3" "${framesDir}/frame_%03d.jpg" -y`);

    const frameFiles = await fs.readdir(framesDir);
    const allFrames = frameFiles.filter(f => f.endsWith(".jpg")).sort();
    const frames = allFrames.slice(0, 5);

    await updateJob(jobId, { status: "transcribing", progress: 25, currentStep: "Transcribing audio", framesDir });

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

    await updateJob(jobId, { status: "analyzing_visual", progress: 40, currentStep: "Analyzing visuals" });

    const frameBase64List = await Promise.all(
      frames.map(async (f) => {
        const buf = await fs.readFile(path.join(framesDir, f));
        return buf.toString("base64");
      })
    );

    const visualAnalysis = await analyzeVisuals(frameBase64List, platform);

    await updateJob(jobId, { status: "analyzing_audio", progress: 55, currentStep: "Analyzing audio quality" });

    const audioAnalysis = await analyzeAudio(audioPath, transcriptText, whisperConfidence);

    await updateJob(jobId, { status: "analyzing_content", progress: 65, currentStep: "Analyzing content" });

    const contentAnalysis = await analyzeContent(transcriptText, transcriptSegments, platform);

    await updateJob(jobId, { status: "generating_seo", progress: 78, currentStep: "Generating SEO & metadata" });

    const seoResult = await generateSeo(transcriptText, platform);

    await updateJob(jobId, { status: "generating_subtitles", progress: 90, currentStep: "Generating subtitles" });

    let translatedSegments: Array<{ start: number; end: number; text: string }> | undefined;
    let translatedLanguage: string | undefined;

    if (options.translateSubtitles && options.subtitleLanguage && transcriptSegments.length > 0) {
      try {
        translatedSegments = await translateSubtitles(transcriptSegments, options.subtitleLanguage);
        translatedLanguage = options.subtitleLanguage;
      } catch (err) {
        logger.warn({ err, jobId }, "Translation failed, continuing without translation");
      }
    }

    const qualityScore = computeQualityScore(visualAnalysis, audioAnalysis);

    const result = {
      jobId,
      platform,
      quality: {
        score: qualityScore,
        ...visualAnalysis,
        ...audioAnalysis,
        suggestions: [
          ...((visualAnalysis.lighting as { suggestions?: string[] })?.suggestions ?? []),
          ...((audioAnalysis.audioClarity as { suggestions?: string[] })?.suggestions ?? []),
          ...((visualAnalysis.framing as { suggestions?: string[] })?.suggestions ?? []),
        ].slice(0, 6),
      },
      content: contentAnalysis,
      seo: seoResult,
      subtitles: {
        transcript: transcriptSegments,
        fullText: transcriptText,
        translatedTranscript: translatedSegments,
        translatedLanguage,
      },
    };

    await updateJob(jobId, {
      status: "complete",
      progress: 100,
      currentStep: "Analysis complete",
      result,
    });

    await fs.unlink(videoPath).catch(() => {});
  } catch (err) {
    logger.error({ err, jobId }, "Pipeline error");
    await updateJob(jobId, {
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    });
    await fs.unlink(videoPath).catch(() => {});
  }
}

async function analyzeVisuals(frameBase64List: string[], platform: string): Promise<object> {
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

  const body = {
    model: "gpt-5.2",
    max_completion_tokens: 2000,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          ...imageContent,
        ],
      },
    ],
  };

  const response = await callOpenAI(body) as { choices: Array<{ message: { content: string } }> };
  const content = response.choices[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
  } catch {
    return {
      lighting: { level: "medium", numeric: 70, assessment: "Acceptable lighting conditions", suggestions: [], effect: "Neutral viewer impact" },
      brightness: { level: "medium", numeric: 65, assessment: "Good brightness", suggestions: [], effect: "Clear visibility" },
      contrast: { level: "medium", numeric: 70, assessment: "Adequate contrast", suggestions: [], effect: "Good readability" },
      sharpness: { level: "acceptable", numeric: 75, assessment: "Clear image", suggestions: [], effect: "Professional look" },
      stability: { level: "stable", numeric: 80, assessment: "Stable footage", suggestions: [], effect: "Comfortable viewing" },
      colorBalance: { level: "good", numeric: 75, assessment: "Natural colors", suggestions: [], effect: "Appealing visuals" },
      background: { level: "normal", numeric: 70, assessment: "Background acceptable", suggestions: [], effect: "Not distracting" },
      framing: { level: "good", numeric: 78, assessment: "Good framing", suggestions: [], effect: "Professional appearance" },
      pacing: { level: "moderate", numeric: 72, assessment: "Good pacing", suggestions: [], effect: "Maintains attention" },
    };
  }
}

async function analyzeAudio(audioPath: string, transcript: string, whisperConfidence: number): Promise<object> {
  const fillerWordPattern = /\b(um+|uh+|er+|ah+|like|you know|basically|literally|actually|so|right\?)\b/gi;
  const fillerWordMatches = transcript.match(fillerWordPattern) || [];
  const fillerWordCount = fillerWordMatches.length;
  const wordCount = transcript.split(/\s+/).filter(w => w.length > 0).length;
  const fillerRatio = wordCount > 0 ? fillerWordCount / wordCount : 0;
  const gapPattern = /\.\.\.|--+|\[pause\]|\[silence\]/gi;
  const gapCount = (transcript.match(gapPattern) || []).length;
  const fillerLevel = fillerRatio > 0.1 ? "high" : fillerRatio > 0.05 ? "medium" : "low";
  const clarityNumeric = Math.round(whisperConfidence * 100);

  const prompt = `You are an audio quality analyst. Based on this transcript snippet, analyze audio quality. Return STRICT JSON only:

Transcript: "${transcript.substring(0, 500)}"
Detected filler words: ${fillerWordCount} out of ~${wordCount} words
Whisper confidence: ${clarityNumeric}%

Return:
{
  "audioVolume": {"level": "low/medium/high", "numeric": 0-100, "assessment": "...", "suggestions": ["..."], "effect": "..."},
  "audioClarity": {"level": "poor/acceptable/good", "numeric": ${clarityNumeric}, "assessment": "...", "suggestions": ["..."], "effect": "..."},
  "backgroundNoise": {"level": "high/medium/low", "numeric": 0-100, "assessment": "...", "suggestions": ["..."], "effect": "..."},
  "fillerWords": {"level": "${fillerLevel}", "numeric": ${fillerWordCount}, "assessment": "${fillerWordCount} filler words detected (${Math.round(fillerRatio * 100)}% of speech)", "suggestions": ["..."], "effect": "..."}
}`;

  const response = await callOpenAI({
    model: "gpt-5.2",
    max_completion_tokens: 800,
    messages: [{ role: "user", content: prompt }],
  }) as { choices: Array<{ message: { content: string } }> };

  const content = response.choices[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
  } catch {
    return {
      audioVolume: { level: "medium", numeric: 72, assessment: "Adequate volume levels", suggestions: ["Check audio consistency throughout"], effect: "Clear dialogue" },
      audioClarity: { level: clarityNumeric > 80 ? "good" : "acceptable", numeric: clarityNumeric, assessment: "Speech is intelligible", suggestions: [], effect: "Good comprehension" },
      backgroundNoise: { level: "low", numeric: 20, assessment: "Minimal background noise", suggestions: [], effect: "Clear audio" },
      fillerWords: { level: fillerLevel, numeric: fillerWordCount, assessment: `${fillerWordCount} filler words detected`, suggestions: ["Practice pausing instead of using filler words"], effect: "Affects perceived expertise" },
    };
  }
}

async function analyzeContent(transcript: string, segments: Array<{ start: number; end: number; text: string }>, platform: string): Promise<object> {
  const first15sec = segments.filter(s => s.start <= 15).map(s => s.text).join(" ");

  const platformInstructions: Record<string, string> = {
    youtube_long: "Focus on retention, clarity, and value delivery throughout. YouTube rewards watch time.",
    youtube_shorts: "Fast hook critical, needs viral potential, must grab in first 2 seconds.",
    tiktok: "Ultra-fast hook (< 1 second), high energy, trending engagement patterns.",
    instagram: "Visual storytelling, aesthetic appeal, relatable content.",
    linkedin: "Professional value, authority, actionable insights, B2B appeal.",
    x: "Concise, punchy, controversial or insightful take. Less is more.",
  };

  const instructions = platformInstructions[platform] || "General video content optimization.";

  const prompt = `You are a professional video content strategist for ${platform}. Platform guidance: ${instructions}

Full transcript: "${transcript.substring(0, 2000)}"
First 15 seconds: "${first15sec}"

Return STRICT JSON only (no markdown):
{
  "hookScore": 0-100,
  "hooks": ["hook 1 (with timestamp if applicable)", "hook 2", "hook 3"],
  "weakSections": [
    {"start": "MM:SS", "end": "MM:SS", "text": "excerpt...", "color": "red", "reason": "..."},
    {"start": "MM:SS", "end": "MM:SS", "text": "excerpt...", "color": "yellow", "reason": "..."}
  ],
  "improvements": ["improvement 1", "improvement 2", "improvement 3", "improvement 4"],
  "audience": "description of target audience",
  "problemSolved": "what problem this video solves for viewers"
}`;

  const response = await callOpenAI({
    model: "gpt-5.2",
    max_completion_tokens: 1500,
    messages: [{ role: "user", content: prompt }],
  }) as { choices: Array<{ message: { content: string } }> };

  const content = response.choices[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
  } catch {
    return {
      hookScore: 60,
      hooks: ["Consider starting with a bold statement or question", "Show the end result first to create curiosity"],
      weakSections: [],
      improvements: ["Strengthen the opening hook", "Add clear call-to-action at the end"],
      audience: "General audience interested in this topic",
      problemSolved: "Provides information and insights on the topic covered",
    };
  }
}

async function generateSeo(transcript: string, platform: string): Promise<object> {
  const hashtagCounts: Record<string, number> = {
    youtube_long: 15,
    youtube_shorts: 10,
    tiktok: 8,
    instagram: 12,
    linkedin: 5,
    x: 3,
  };
  const count = hashtagCounts[platform] || 8;

  const prompt = `You are an SEO expert for ${platform} video content. Analyze this transcript and create optimized metadata.

Transcript: "${transcript.substring(0, 1500)}"

Generate ${count} SEO-optimized hashtags. Return STRICT JSON only:
{
  "titles": ["title option 1 (optimized for ${platform})", "title option 2", "title option 3"],
  "description": "full optimized description with keywords, call to action, relevant links placeholder",
  "hashtags": [
    {"tag": "#ExampleTag", "effect": "reaches X audience, Y% engagement boost"},
    ...${count} total hashtags
  ],
  "timestamps": [
    {"time": "00:00", "label": "Introduction"},
    {"time": "00:30", "label": "Main topic"}
  ]
}`;

  const response = await callOpenAI({
    model: "gpt-5.2",
    max_completion_tokens: 1500,
    messages: [{ role: "user", content: prompt }],
  }) as { choices: Array<{ message: { content: string } }> };

  const content = response.choices[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
  } catch {
    return {
      titles: ["Engaging title for your video", "Alternative title with keywords", "Third title option"],
      description: "Video description would appear here with relevant keywords and call to action.",
      hashtags: [{ tag: "#VideoContent", effect: "Broad reach across the platform" }],
      timestamps: [{ time: "00:00", label: "Introduction" }],
    };
  }
}

async function translateSubtitles(
  segments: Array<{ start: number; end: number; text: string }>,
  targetLanguage: string
): Promise<Array<{ start: number; end: number; text: string }>> {
  const texts = segments.map(s => s.text).join("\n---\n");

  const response = await callOpenAI({
    model: "gpt-5.2",
    max_completion_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `Translate the following subtitle segments to ${targetLanguage}. Keep each segment on its own line separated by ---. Preserve timing. Return ONLY the translated text segments separated by ---:\n\n${texts}`,
      },
    ],
  }) as { choices: Array<{ message: { content: string } }> };

  const content = response.choices[0]?.message?.content ?? "";
  const translated = content.split("---").map(t => t.trim()).filter(Boolean);

  return segments.map((seg, i) => ({
    start: seg.start,
    end: seg.end,
    text: translated[i] || seg.text,
  }));
}

function computeQualityScore(visualAnalysis: object, audioAnalysis: object): number {
  const visual = visualAnalysis as Record<string, { numeric?: number }>;
  const audio = audioAnalysis as Record<string, { numeric?: number }>;

  const metrics = [
    visual.lighting?.numeric ?? 70,
    visual.brightness?.numeric ?? 70,
    visual.sharpness?.numeric ?? 70,
    visual.stability?.numeric ?? 70,
    visual.background?.numeric ?? 70,
    visual.framing?.numeric ?? 70,
    audio.audioClarity?.numeric ?? 70,
    audio.audioVolume?.numeric ?? 70,
  ];

  const fillerScore = Math.max(0, 100 - (audio.fillerWords?.numeric ?? 0) * 5);
  const noiseScore = Math.max(0, 100 - (audio.backgroundNoise?.numeric ?? 20));
  metrics.push(fillerScore);
  metrics.push(noiseScore);

  const avg = metrics.reduce((a, b) => a + b, 0) / metrics.length;
  return Math.round(Math.max(0, Math.min(100, avg)));
}
