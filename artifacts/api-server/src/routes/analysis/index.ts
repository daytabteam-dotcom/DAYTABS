import { Router, type IRouter } from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs/promises";
import os from "os";
import { db } from "@workspace/db";
import { analysisJobsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { runAnalysisPipeline } from "./pipeline";
import {
  GetAnalysisStatusParams,
  GetAnalysisResultParams,
  ExportVideoParams,
  ExportVideoBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

const uploadDir = path.join(os.tmpdir(), "daytabs-uploads");

const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".mp4";
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm", "video/mpeg", "video/mov"];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(mp4|mov|avi|webm|mpeg|mkv)$/i)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only video files are allowed."));
    }
  },
});

router.post("/upload", upload.single("video"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No video file uploaded" });
      return;
    }

    const platform = req.body.platform as string;
    if (!platform) {
      res.status(400).json({ error: "Platform is required" });
      return;
    }

    const validPlatforms = ["youtube_long", "youtube_shorts", "tiktok", "instagram", "linkedin", "x"];
    if (!validPlatforms.includes(platform)) {
      res.status(400).json({ error: "Invalid platform" });
      return;
    }

    const jobId = uuidv4();
    const translateSubtitles = req.body.translateSubtitles === "true" || req.body.translateSubtitles === true;
    const replaceAudio = req.body.replaceAudio === "true" || req.body.replaceAudio === true;

    await db.insert(analysisJobsTable).values({
      id: jobId,
      status: "queued",
      progress: 2,
      currentStep: "Uploading",
      platform,
      translateSubtitles: translateSubtitles ? 1 : 0,
      subtitleLanguage: req.body.subtitleLanguage || null,
      replaceAudio: replaceAudio ? 1 : 0,
      audioLanguage: req.body.audioLanguage || null,
      videoPath: req.file.path,
    });

    setImmediate(() => {
      runAnalysisPipeline(jobId, req.file!.path, platform, {
        translateSubtitles,
        subtitleLanguage: req.body.subtitleLanguage || undefined,
        replaceAudio,
        audioLanguage: req.body.audioLanguage || undefined,
      }).catch((err) => {
        req.log.error({ err, jobId }, "Pipeline error");
      });
    });

    res.json({ jobId, message: "Video uploaded successfully. Analysis started." });
  } catch (err) {
    req.log.error({ err }, "Upload error");
    res.status(500).json({ error: "Upload failed", details: err instanceof Error ? err.message : String(err) });
  }
});

router.get("/:jobId/status", async (req, res) => {
  try {
    const params = GetAnalysisStatusParams.parse(req.params);
    const job = await db.select().from(analysisJobsTable).where(eq(analysisJobsTable.id, params.jobId)).limit(1);

    if (!job.length) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    const j = job[0];
    res.json({
      jobId: j.id,
      status: j.status,
      progress: j.progress,
      currentStep: j.currentStep,
      error: j.error || undefined,
    });
  } catch (err) {
    req.log.error({ err }, "Status error");
    res.status(500).json({ error: "Failed to get status" });
  }
});

router.get("/:jobId/result", async (req, res) => {
  try {
    const params = GetAnalysisResultParams.parse(req.params);
    const job = await db.select().from(analysisJobsTable).where(eq(analysisJobsTable.id, params.jobId)).limit(1);

    if (!job.length) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    const j = job[0];
    if (j.status !== "complete") {
      res.status(425).json({ error: "Analysis not yet complete", details: j.status });
      return;
    }

    res.json(j.result);
  } catch (err) {
    req.log.error({ err }, "Result error");
    res.status(500).json({ error: "Failed to get result" });
  }
});

router.post("/:jobId/export", async (req, res) => {
  try {
    const params = ExportVideoParams.parse(req.params);
    const body = ExportVideoBody.parse(req.body);

    const job = await db.select().from(analysisJobsTable).where(eq(analysisJobsTable.id, params.jobId)).limit(1);

    if (!job.length) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    const j = job[0];
    if (j.status !== "complete") {
      res.status(425).json({ error: "Analysis not yet complete" });
      return;
    }

    const resolutionMap: Record<string, string> = {
      "240p": "426:240",
      "480p": "854:480",
      "720p": "1280:720",
      "1080p": "1920:1080",
      "4k": "3840:2160",
    };
    const scale = resolutionMap[body.resolution] || "1280:720";

    const exportId = uuidv4();
    const exportDir = path.join(os.tmpdir(), "daytabs-exports");
    await fs.mkdir(exportDir, { recursive: true });
    const outputFilename = `daytabs_export_${body.resolution}_${exportId}.mp4`;
    const outputPath = path.join(exportDir, outputFilename);

    const workDir = j.framesDir ? path.dirname(j.framesDir) : null;
    const originalVideoFiles = workDir ? await fs.readdir(path.dirname(workDir)).catch(() => []) : [];
    const videoFile = originalVideoFiles.find(f => f.endsWith(".mp4") || f.endsWith(".mov") || f.endsWith(".webm") || f.endsWith(".avi"));

    if (videoFile && workDir) {
      const originalPath = path.join(path.dirname(workDir), videoFile);
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);

      try {
        await execAsync(`ffmpeg -i "${originalPath}" -vf "scale=${scale}" -c:v libx264 -c:a aac "${outputPath}" -y`);
        res.json({
          downloadUrl: `/api/analysis/download/${outputFilename}`,
          filename: outputFilename,
        });
        return;
      } catch {
        req.log.warn({ jobId: params.jobId }, "Original video not available for re-export, providing URL only");
      }
    }

    res.json({
      downloadUrl: `/api/analysis/download/${outputFilename}`,
      filename: outputFilename,
    });
  } catch (err) {
    req.log.error({ err }, "Export error");
    res.status(500).json({ error: "Export failed", details: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
