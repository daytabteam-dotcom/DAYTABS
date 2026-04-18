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
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS youtube_connections (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        connected_google_email TEXT,
        channel_id TEXT,
        channel_title TEXT,
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        token_type TEXT,
        scopes TEXT,
        expires_at TIMESTAMP,
        last_synced_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS youtube_channel_profiles (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        channel_id TEXT NOT NULL,
        channel_name TEXT NOT NULL,
        subscriber_count TEXT,
        total_view_count TEXT,
        video_count TEXT,
        recent_videos JSONB NOT NULL DEFAULT '[]'::jsonb,
        niche_profile JSONB,
        fetched_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS youtube_competitors (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        channel_id TEXT NOT NULL,
        channel_name TEXT NOT NULL,
        subscriber_count TEXT,
        most_viewed_recent_videos JSONB NOT NULL DEFAULT '[]'::jsonb,
        posting_frequency TEXT,
        niche TEXT,
        fetched_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS youtube_weekly_plans (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        week_number INTEGER NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        plan JSONB NOT NULL,
        context_snapshot JSONB NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS youtube_plan_results (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        plan_id INTEGER NOT NULL REFERENCES youtube_weekly_plans(id) ON DELETE CASCADE,
        day_index INTEGER NOT NULL,
        planned_title TEXT NOT NULL,
        video_url TEXT NOT NULL,
        video_id TEXT NOT NULL,
        metrics JSONB NOT NULL,
        fetched_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS youtube_api_cache (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        cache_key TEXT NOT NULL UNIQUE,
        payload JSONB NOT NULL,
        quota_cost INTEGER NOT NULL DEFAULT 0,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`ALTER TABLE youtube_channel_profiles ADD COLUMN IF NOT EXISTS channel_thumbnail_url TEXT`);
    await db.execute(sql`ALTER TABLE youtube_competitors ADD COLUMN IF NOT EXISTS thumbnail_url TEXT`);
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
            plan: plan ?? "free",
            maxDurationSeconds: storedOptions.maxDurationSeconds,
          });
          if (completed && job.userId) await incrementVideoAnalysis(job.userId);
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

// Extend timeouts to support Pro-sized direct uploads.
// Default Node.js socket timeout is 5 s which is far too short for big files.
server.setTimeout(6 * 60 * 60 * 1000);
server.headersTimeout = 6 * 60 * 60 * 1000 + 60_000;
server.requestTimeout = 6 * 60 * 60 * 1000 + 60_000;
