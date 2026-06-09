import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../../middlewares/auth";
import { normalizePlan } from "../../lib/planLimits";
import { transcribeAudio } from "../../aiProviders/openaiTranscription";
import { deleteUploadedAudioFile, storeUploadedAudio } from "../../services/audioTranscriptStorage";
import {
  createAudioTranscriptJob,
  createAudioTranscriptProjectRow,
  deleteAudioTranscriptProject,
  getAudioTranscriptJob,
  getAudioTranscriptProject,
  listAudioTranscriptProjects,
  updateAudioTranscriptJob,
  updateAudioTranscriptProject,
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
  res.json({ project });
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
