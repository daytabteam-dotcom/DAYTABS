import app from "./app";
import { logger } from "./lib/logger";
import { analysisQueue } from "./lib/analysisQueue";
import { runAnalysisPipeline, type PipelineOptions } from "./routes/analysis/pipeline";
import { db, analysisJobsTable, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { incrementVideoAnalysis } from "./lib/usageService";

/**
 * Apply any pending schema changes that couldn't run via drizzle-kit during the build phase.
 * Each statement uses IF NOT EXISTS / IF EXISTS so it is fully idempotent.
 */
async function runStartupMigrations() {
  try {
    await db.execute(
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_cancels_at TIMESTAMP`
    );
    await db.execute(
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_past_due BOOLEAN DEFAULT FALSE`
    );
    logger.info("Startup migrations applied");
  } catch (err) {
    logger.warn({ err }, "Startup migrations warning (non-fatal)");
  }
}

function readStoredAnalysisOptions(result: unknown): Partial<PipelineOptions> {
  if (!result || typeof result !== "object" || !("analysisOptions" in result)) {
    return {};
  }
  const options = (result as { analysisOptions?: unknown }).analysisOptions;
  return options && typeof options === "object" ? options as Partial<PipelineOptions> : {};
}

async function recoverInterruptedAnalysisJobs() {
  try {
    await db.execute(sql`
      UPDATE analysis_jobs
      SET
        status = 'error',
        progress = 0,
        current_step = 'Analysis interrupted',
        error = 'Analysis was interrupted by a server restart. Please upload the video again.',
        updated_at = NOW()
      WHERE status NOT IN ('complete', 'error')
        AND (b2_key IS NULL OR b2_key = '')
    `);

    const jobs = await db
      .select()
      .from(analysisJobsTable)
      .where(sql`${analysisJobsTable.status} NOT IN ('complete', 'error') AND ${analysisJobsTable.b2Key} <> ''`);

    for (const job of jobs) {
      await db.update(analysisJobsTable)
        .set({
          status: "queued",
          currentStep: "Resuming analysis after restart",
          error: null,
          updatedAt: new Date(),
        })
        .where(eq(analysisJobsTable.id, job.id));

      analysisQueue
        .add(async () => {
          const storedOptions = readStoredAnalysisOptions(job.result);
          let plan = storedOptions.plan;
          if (!plan && job.userId) {
            const user = await db.select({ plan: usersTable.plan }).from(usersTable).where(eq(usersTable.id, job.userId)).limit(1);
            plan = user[0]?.plan;
          }

          await runAnalysisPipeline(job.id, job.b2Key, {
            mode: "video-analyzer",
            platform: storedOptions.platform ?? job.platform ?? "youtube_long",
            platforms: storedOptions.platforms ?? [job.platform ?? "youtube_long"],
            modules: storedOptions.modules ?? ["quality", "editing"],
            translateSubtitles: storedOptions.translateSubtitles ?? Boolean(job.translateSubtitles),
            subtitleLanguage: storedOptions.subtitleLanguage ?? job.subtitleLanguage ?? undefined,
            audioLanguage: storedOptions.audioLanguage ?? job.audioLanguage ?? undefined,
            audioVoice: storedOptions.audioVoice ?? "alloy",
            plan: plan ?? "free",
            maxDurationSeconds: storedOptions.maxDurationSeconds,
          });
          if (job.userId) await incrementVideoAnalysis(job.userId);
        })
        .catch((err) => {
          logger.error({ err, jobId: job.id }, "Recovered pipeline error");
        });
    }

    logger.info({ recovered: jobs.length }, "Interrupted analysis jobs recovered");
  } catch (err) {
    logger.warn({ err }, "Unable to recover interrupted analysis jobs");
  }
}

const PORT = parseInt(process.env.PORT ?? '3000', 10);

await runStartupMigrations();
await recoverInterruptedAnalysisJobs();

const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info({ port: PORT }, "Server listening");
});

// Extend timeouts to support large video uploads (up to 2 GB for Studio plan).
// Default Node.js socket timeout is 5 s which is far too short for big files.
server.setTimeout(60 * 60 * 1000);       // 1 hour socket timeout
server.headersTimeout = 61 * 60 * 1000;  // slightly above socket timeout
server.requestTimeout = 61 * 60 * 1000;  // same
