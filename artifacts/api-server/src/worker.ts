import os from "os";
import { db, analysisJobsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./lib/logger";
import {
  CONTACT_EMAIL,
  assertMailConfigured,
  createMailTransport,
  escapeHtml,
} from "./lib/email";
import {
  claimNextAnalysisJob,
  ensureAnalysisJobQueueColumns,
  heartbeatAnalysisJob,
  readPerUserConcurrency,
  readWorkerConcurrency,
  releaseAnalysisJob,
  resetInterruptedAnalysisJobs,
  type ClaimedAnalysisJob,
} from "./lib/analysisJobQueueDb";
import { incrementVideoAnalysis } from "./lib/usageService";
import { runAnalysisPipeline, type PipelineOptions } from "./routes/analysis/pipeline";

const workerId = process.env.ANALYSIS_WORKER_ID ?? `${os.hostname()}-${process.pid}`;
const pollIntervalMs = Number(process.env.ANALYSIS_WORKER_POLL_MS ?? "2000");
const heartbeatIntervalMs = Number(process.env.ANALYSIS_WORKER_HEARTBEAT_MS ?? "5000");
const staleAfterMs = Number(process.env.ANALYSIS_WORKER_STALE_MS ?? String(2 * 60 * 1000));
const concurrency = readWorkerConcurrency();
const perUserConcurrency = readPerUserConcurrency();
const CANONICAL_APP_ORIGIN = (
  process.env.APP_URL ||
  process.env.BASE_URL ||
  process.env.NEXT_PUBLIC_URL ||
  "https://daytabs.com"
).replace(/\/$/, "");

function buildVideoAnalyzerReportUrl(jobId: string) {
  const url = new URL("/?tab=video-analyzer", CANONICAL_APP_ORIGIN);
  url.searchParams.set("jobId", jobId);
  return url.toString();
}

async function sendVideoAnalyzerOutcomeEmail(jobId: string, userId: number) {
  const mailStatus = assertMailConfigured();
  if (!mailStatus.configured) {
    logger.warn({ jobId, missing: mailStatus.missing }, "Skipping analysis outcome email because SMTP is not configured");
    return;
  }

  const [jobRecord] = await db
    .select({
      status: analysisJobsTable.status,
      currentStep: analysisJobsTable.currentStep,
      error: analysisJobsTable.error,
      result: analysisJobsTable.result,
    })
    .from(analysisJobsTable)
    .where(eq(analysisJobsTable.id, jobId))
    .limit(1);

  if (!jobRecord || jobRecord.status === "cancelled") {
    return;
  }

  const existingResult =
    jobRecord.result && typeof jobRecord.result === "object"
      ? (jobRecord.result as Record<string, unknown>)
      : {};

  if (typeof existingResult.outcomeEmailSentAt === "string" && existingResult.outcomeEmailSentAt.trim()) {
    return;
  }

  const [user] = await db
    .select({
      email: usersTable.email,
      name: usersTable.name,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user?.email) {
    logger.warn({ jobId, userId }, "Skipping analysis report email because the user email is missing");
    return;
  }

  const reportUrl = buildVideoAnalyzerReportUrl(jobId);
  const originalFileName =
    typeof existingResult.analysisOptions === "object" &&
    existingResult.analysisOptions &&
    typeof (existingResult.analysisOptions as Record<string, unknown>).originalFileName === "string"
      ? String((existingResult.analysisOptions as Record<string, unknown>).originalFileName)
      : "your video";
  const fallbackReason = "We hit an issue while processing the video. Please try again with a shorter or cleaner file.";
  const failureReason = (jobRecord.error || jobRecord.currentStep || fallbackReason).trim();
  const isSuccess = jobRecord.status === "complete";
  const safeFileName = escapeHtml(originalFileName);
  const safeName = escapeHtml((user.name || user.email.split("@")[0] || "there").trim());
  const safeReportUrl = escapeHtml(reportUrl);
  const safeFailureReason = escapeHtml(failureReason);
  const transport = createMailTransport();
  const subject = isSuccess
    ? "Your DayTabs video report is ready"
    : "Your DayTabs video analysis needs attention";
  const text = isSuccess
    ? [
        `Hi ${user.name || user.email.split("@")[0] || "there"},`,
        "",
        `Your DayTabs report for ${originalFileName} is ready.`,
        "Open it here:",
        reportUrl,
        "",
        "Thanks,",
        "DayTabs",
      ].join("\n")
    : [
        `Hi ${user.name || user.email.split("@")[0] || "there"},`,
        "",
        `We couldn't finish your DayTabs analysis for ${originalFileName}.`,
        `Reason: ${failureReason}`,
        "",
        "You can review the analysis page here:",
        reportUrl,
        "",
        "Thanks,",
        "DayTabs",
      ].join("\n");
  const html = isSuccess
    ? `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
        <p>Hi ${safeName},</p>
        <p>Your DayTabs report for <strong>${safeFileName}</strong> is ready.</p>
        <p>
          <a href="${safeReportUrl}" style="display:inline-block;padding:10px 16px;border-radius:10px;background:#111827;color:#ffffff;text-decoration:none;font-weight:600">
            Open your report
          </a>
        </p>
        <p>If the button does not work, use this link:<br /><a href="${safeReportUrl}">${safeReportUrl}</a></p>
        <p>Thanks,<br />DayTabs</p>
      </div>
    `
    : `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
        <p>Hi ${safeName},</p>
        <p>We couldn&apos;t finish your DayTabs analysis for <strong>${safeFileName}</strong>.</p>
        <p><strong>Reason:</strong> ${safeFailureReason}</p>
        <p>
          <a href="${safeReportUrl}" style="display:inline-block;padding:10px 16px;border-radius:10px;background:#111827;color:#ffffff;text-decoration:none;font-weight:600">
            Open the analysis page
          </a>
        </p>
        <p>If the button does not work, use this link:<br /><a href="${safeReportUrl}">${safeReportUrl}</a></p>
        <p>Thanks,<br />DayTabs</p>
      </div>
    `;

  await transport.sendMail({
    from: CONTACT_EMAIL,
    to: user.email,
    subject,
    text,
    html,
  });

  await db
    .update(analysisJobsTable)
    .set({
      result: {
        ...existingResult,
        outcomeEmailSentAt: new Date().toISOString(),
        outcomeEmailSentTo: user.email,
        outcomeEmailStatus: jobRecord.status,
        reportUrl,
      },
      updatedAt: new Date(),
    })
    .where(eq(analysisJobsTable.id, jobId));
}

function readStoredAnalysisOptions(result: unknown): Partial<PipelineOptions> {
  if (!result || typeof result !== "object" || !("analysisOptions" in result)) {
    return {};
  }
  const options = (result as { analysisOptions?: unknown }).analysisOptions;
  return options && typeof options === "object" ? options as Partial<PipelineOptions> : {};
}

async function getPlan(job: ClaimedAnalysisJob, storedOptions: Partial<PipelineOptions>) {
  if (storedOptions.plan) return storedOptions.plan;
  if (!job.userId) return "free";
  const user = await db.select({ plan: usersTable.plan }).from(usersTable).where(eq(usersTable.id, job.userId)).limit(1);
  return user[0]?.plan ?? "free";
}

async function processJob(job: ClaimedAnalysisJob) {
  logger.info({
    jobId: job.id,
    workerId,
    userId: job.userId,
    platform: job.platform,
    b2Key: job.b2Key,
  }, "Worker claimed analysis job");
  const heartbeat = setInterval(() => {
    heartbeatAnalysisJob(job.id, workerId).catch((err) => {
      logger.warn({ err, jobId: job.id, workerId }, "Analysis worker heartbeat failed");
    });
  }, Math.max(1000, heartbeatIntervalMs));

  try {
    const fresh = await db
      .select({ status: analysisJobsTable.status })
      .from(analysisJobsTable)
      .where(eq(analysisJobsTable.id, job.id))
      .limit(1);
    if (fresh[0]?.status === "cancelled") {
      logger.info({ jobId: job.id, workerId }, "Worker skipping job because it was already cancelled before pipeline start");
      return;
    }

    const storedOptions = readStoredAnalysisOptions(job.result);
    const plan = await getPlan(job, storedOptions);
    const completed = await runAnalysisPipeline(job.id, job.b2Key, {
      mode: "video-analyzer",
      platform: storedOptions.platform ?? job.platform ?? "youtube_long",
      platforms: storedOptions.platforms ?? [job.platform ?? "youtube_long"],
      modules: storedOptions.modules ?? ["quality", "editing"],
      translateSubtitles: storedOptions.translateSubtitles ?? Boolean(job.translateSubtitles),
      subtitleLanguage: storedOptions.subtitleLanguage ?? job.subtitleLanguage ?? undefined,
      audioLanguage: storedOptions.audioLanguage ?? job.audioLanguage ?? undefined,
      audioVoice: storedOptions.audioVoice ?? "alloy",
      originalFileName: storedOptions.originalFileName,
      plan,
      maxDurationSeconds: storedOptions.maxDurationSeconds,
      durationSeconds: storedOptions.durationSeconds,
    });
    if (completed && job.userId) await incrementVideoAnalysis(job.userId, storedOptions.durationSeconds);
    if (job.userId) {
      try {
        await sendVideoAnalyzerOutcomeEmail(job.id, job.userId);
      } catch (err) {
        logger.error({ err, jobId: job.id, workerId, userId: job.userId }, "Failed to send analysis outcome email");
      }
    }
    logger.info({ jobId: job.id, workerId, completed }, "Worker finished analysis job");
  } catch (err) {
    logger.error({ err, jobId: job.id, workerId }, "Worker analysis job failed");
    if (job.userId) {
      try {
        await sendVideoAnalyzerOutcomeEmail(job.id, job.userId);
      } catch (mailErr) {
        logger.error({ err: mailErr, jobId: job.id, workerId, userId: job.userId }, "Failed to send analysis failure email");
      }
    }
  } finally {
    clearInterval(heartbeat);
    logger.info({ jobId: job.id, workerId }, "Worker releasing analysis job lock");
    await releaseAnalysisJob(job.id, workerId).catch((err) => {
      logger.warn({ err, jobId: job.id, workerId }, "Failed to release analysis job lock");
    });
  }
}

async function workerLoop(slot: number) {
  while (true) {
    try {
      const job = await claimNextAnalysisJob(workerId, staleAfterMs, perUserConcurrency);
      if (!job) {
        await new Promise((resolve) => setTimeout(resolve, Math.max(500, pollIntervalMs)));
        continue;
      }
      await processJob(job);
    } catch (err) {
      logger.error({ err, workerId, slot }, "Analysis worker loop error");
      await new Promise((resolve) => setTimeout(resolve, Math.max(1000, pollIntervalMs)));
    }
  }
}

await ensureAnalysisJobQueueColumns();
await resetInterruptedAnalysisJobs();

logger.info({ workerId, concurrency, perUserConcurrency, staleAfterMs }, "Analysis worker starting");
for (let i = 0; i < concurrency; i++) {
  void workerLoop(i + 1);
}
