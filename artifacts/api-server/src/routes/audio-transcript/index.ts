import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../../middlewares/auth";
import { normalizePlan } from "../../lib/planLimits";
import { transcribeAudio } from "../../aiProviders/openaiTranscription";
import { translateTranscriptSegmentsBatched } from "../../aiProviders/openaiTranslation";
import { deleteUploadedAudioFile, storeUploadedAudio } from "../../services/audioTranscriptStorage";
import {
  createAudioTranscriptJob,
  createAudioTranscriptProjectRow,
  createTranslationRow,
  deleteAudioTranscriptProject,
  getAudioTranscriptJob,
  getAudioTranscriptProject,
  getTranslation,
  getTranslationByTarget,
  listAudioTranscriptProjects,
  listTranslationsForProject,
  updateAudioTranscriptJob,
  updateAudioTranscriptProject,
  updateTranslationRow,
} from "../../services/audioTranscriptService";

const router = Router();
router.use(requireAuth);

function assertStudio(plan: string) {
  return normalizePlan(plan) === "studio";
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 200 * 1024 * 1024,
  },
});

const ALLOWED_EXT = /\.(mp3|wav|m4a|ogg)$/i;
const ALLOWED_MIME = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/x-m4a",
  "audio/ogg",
]);

router.get("/projects", async (req, res) => {
  if (!assertStudio(req.auth!.plan)) {
    res.status(403).json({ code: "STUDIO_REQUIRED", error: "Audio 2 Transcript is available on the Studio plan." });
    return;
  }
  const projects = await listAudioTranscriptProjects(req.auth!.user_id);
  res.json({ projects });
});

router.get("/projects/:projectId", async (req, res) => {
  if (!assertStudio(req.auth!.plan)) {
    res.status(403).json({ code: "STUDIO_REQUIRED", error: "Audio 2 Transcript is available on the Studio plan." });
    return;
  }
  const projectId = String(req.params.projectId || "");
  const project = await getAudioTranscriptProject(req.auth!.user_id, projectId);
  if (!project) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const translations = await listTranslationsForProject(req.auth!.user_id, projectId);
  res.json({ project, translations });
});

router.post("/projects", upload.single("file"), async (req, res) => {
  if (!assertStudio(req.auth!.plan)) {
    res.status(403).json({ code: "STUDIO_REQUIRED", error: "Audio 2 Transcript is available on the Studio plan." });
    return;
  }

  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  const sourceLanguage = typeof req.body?.source_language === "string" ? req.body.source_language.trim() : "auto";
  const file = req.file;
  if (!title) {
    res.status(400).json({ error: "title is required" });
    return;
  }
  if (!file) {
    res.status(400).json({ error: "file is required" });
    return;
  }
  if (!ALLOWED_MIME.has(file.mimetype) && !ALLOWED_EXT.test(file.originalname)) {
    res.status(400).json({ error: "Unsupported file type. Upload mp3, wav, m4a, or ogg." });
    return;
  }

  const stored = await storeUploadedAudio({
    userId: req.auth!.user_id,
    filename: file.originalname || "audio.bin",
    bytes: file.buffer,
    contentType: file.mimetype || "application/octet-stream",
  });

  const project = await createAudioTranscriptProjectRow({
    userId: req.auth!.user_id,
    title,
    audioFileUrl: stored.url,
    audioFileName: file.originalname || null as never,
    audioFileSize: file.size,
    sourceLanguage,
  });

  const job = await createAudioTranscriptJob({
    userId: req.auth!.user_id,
    transcriptProjectId: project.id,
    jobType: "transcription",
    status: "queued",
    inputPayload: { sourceLanguage, filename: file.originalname, bytes: file.size },
    costCredits: 0,
  });

  try {
    await updateAudioTranscriptJob(req.auth!.user_id, job.id, { status: "processing" });
    await updateAudioTranscriptProject(req.auth!.user_id, project.id, { status: "transcribing" });

    const transcription = await transcribeAudio({
      audioBytes: file.buffer,
      filename: file.originalname || "audio.mp3",
      sourceLanguage: sourceLanguage || "auto",
    });

    await updateAudioTranscriptProject(req.auth!.user_id, project.id, {
      status: "completed",
      detectedLanguage: transcription.detectedLanguage,
      fullTranscript: transcription.fullText,
      transcriptSegments: transcription.segments,
      errorMessage: null,
    });

    await updateAudioTranscriptJob(req.auth!.user_id, job.id, {
      status: "completed",
      output: { detectedLanguage: transcription.detectedLanguage, segments: transcription.segments.length },
      errorMessage: null,
    });

    const cleanup = await deleteUploadedAudioFile(stored.url);
    if (cleanup.deleted) {
      await updateAudioTranscriptProject(req.auth!.user_id, project.id, {
        audioDeleted: true,
        audioFileUrl: null,
      });
    }

    const fresh = await getAudioTranscriptProject(req.auth!.user_id, project.id);
    res.json({ project: fresh, job });
  } catch (err) {
    await updateAudioTranscriptProject(req.auth!.user_id, project.id, {
      status: "failed",
      errorMessage: err instanceof Error ? err.message : "Transcription failed",
    });
    await updateAudioTranscriptJob(req.auth!.user_id, job.id, {
      status: "failed",
      errorMessage: err instanceof Error ? err.message : "Transcription failed",
    });
    await deleteUploadedAudioFile(stored.url);
    await updateAudioTranscriptProject(req.auth!.user_id, project.id, { audioDeleted: true, audioFileUrl: null });
    res.status(500).json({ error: err instanceof Error ? err.message : "Transcription failed" });
  }
});

router.get("/jobs/:jobId", async (req, res) => {
  if (!assertStudio(req.auth!.plan)) {
    res.status(403).json({ code: "STUDIO_REQUIRED", error: "Audio 2 Transcript is available on the Studio plan." });
    return;
  }
  const jobId = String(req.params.jobId || "");
  const job = await getAudioTranscriptJob(req.auth!.user_id, jobId);
  if (!job) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ job });
});

router.post("/projects/:projectId/translate", async (req, res) => {
  if (!assertStudio(req.auth!.plan)) {
    res.status(403).json({ code: "STUDIO_REQUIRED", error: "Audio 2 Transcript is available on the Studio plan." });
    return;
  }
  const projectId = String(req.params.projectId || "");
  const targetLanguage = typeof req.body?.target_language === "string" ? req.body.target_language.trim() : "";
  if (!targetLanguage) {
    res.status(400).json({ error: "target_language is required" });
    return;
  }

  const project = await getAudioTranscriptProject(req.auth!.user_id, projectId);
  if (!project) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const segments = (project.transcriptSegments ?? []) as any[];
  if (!Array.isArray(segments) || segments.length === 0) {
    res.status(400).json({ error: "Transcript is not ready yet" });
    return;
  }

  const existing = await getTranslationByTarget(req.auth!.user_id, projectId, targetLanguage);
  if (existing && existing.status === "completed") {
    res.json({ translation: existing, cached: true });
    return;
  }

  const translation = existing ?? await createTranslationRow({
    userId: req.auth!.user_id,
    transcriptProjectId: projectId,
    sourceLanguage: project.detectedLanguage ?? project.sourceLanguage ?? "auto",
    targetLanguage,
  });

  const job = await createAudioTranscriptJob({
    userId: req.auth!.user_id,
    transcriptProjectId: projectId,
    jobType: "translation",
    status: "queued",
    inputPayload: { targetLanguage },
    costCredits: 0,
  });

  const sourceLanguage = project.detectedLanguage ?? project.sourceLanguage ?? "auto";
  const totalChars = (segments as Array<{ text?: unknown }>).reduce((acc, s) => acc + (typeof s?.text === "string" ? s.text.length : 0), 0);
  const SYNC_MAX_CHARS = Number(process.env.AUDIO_TRANSLATION_SYNC_MAX_CHARS ?? "60000");
  const shouldSync = Number.isFinite(SYNC_MAX_CHARS) ? totalChars < SYNC_MAX_CHARS : totalChars < 60000;

  if (shouldSync) {
    try {
      await updateAudioTranscriptJob(req.auth!.user_id, job.id, { status: "processing" });
      await updateTranslationRow(req.auth!.user_id, translation.id, { status: "translating", errorMessage: null });

      const result = await translateTranscriptSegmentsBatched({
        segments: segments as any,
        sourceLanguage,
        targetLanguage,
      });

      const updated = await updateTranslationRow(req.auth!.user_id, translation.id, {
        status: "completed",
        translatedFullText: result.translatedFullText,
        translatedSegments: result.translatedSegments,
        errorMessage: null,
      });

      await updateAudioTranscriptJob(req.auth!.user_id, job.id, {
        status: "completed",
        output: { segments: result.translatedSegments.length, sync: true, totalChars },
        errorMessage: null,
      });

      res.json({ translation: updated, job: { ...job, status: "completed" } });
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Translation failed";
      await updateTranslationRow(req.auth!.user_id, translation.id, { status: "failed", errorMessage: msg });
      await updateAudioTranscriptJob(req.auth!.user_id, job.id, { status: "failed", errorMessage: msg });
      res.status(500).json({ error: msg });
      return;
    }
  }

  // Large transcripts: avoid long-running HTTP requests (browser/proxy timeouts). Start the job and return immediately.
  await updateAudioTranscriptJob(req.auth!.user_id, job.id, { status: "processing" });
  await updateTranslationRow(req.auth!.user_id, translation.id, { status: "translating", errorMessage: null });

  const userId = req.auth!.user_id;
  const translationId = translation.id;
  const jobId = job.id;
  const segs = segments as any;

  setTimeout(() => {
    void (async () => {
      try {
        const result = await translateTranscriptSegmentsBatched({
          segments: segs,
          sourceLanguage,
          targetLanguage,
        });

        await updateTranslationRow(userId, translationId, {
          status: "completed",
          translatedFullText: result.translatedFullText,
          translatedSegments: result.translatedSegments,
          errorMessage: null,
        });

        await updateAudioTranscriptJob(userId, jobId, {
          status: "completed",
          output: { segments: result.translatedSegments.length, sync: false, totalChars },
          errorMessage: null,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Translation failed";
        await updateTranslationRow(userId, translationId, { status: "failed", errorMessage: msg });
        await updateAudioTranscriptJob(userId, jobId, { status: "failed", errorMessage: msg });
        // eslint-disable-next-line no-console
        console.error("[audio-transcript] translation job failed", { jobId, translationId, msg });
      }
    })();
  }, 0);

  res.status(202).json({ translation: { ...translation, status: "translating" }, job });
});

router.get("/translations/:translationId", async (req, res) => {
  if (!assertStudio(req.auth!.plan)) {
    res.status(403).json({ code: "STUDIO_REQUIRED", error: "Audio 2 Transcript is available on the Studio plan." });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  const translationId = String(req.params.translationId || "");
  const translation = await getTranslation(req.auth!.user_id, translationId);
  if (!translation) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ translation });
});

router.delete("/projects/:projectId", async (req, res) => {
  if (!assertStudio(req.auth!.plan)) {
    res.status(403).json({ code: "STUDIO_REQUIRED", error: "Audio 2 Transcript is available on the Studio plan." });
    return;
  }
  const projectId = String(req.params.projectId || "");
  const deleted = await deleteAudioTranscriptProject(req.auth!.user_id, projectId);
  if (!deleted) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ success: true });
});

export default router;
