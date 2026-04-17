import app from "./app";
import { logger } from "./lib/logger";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

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

async function markInterruptedAnalysisJobs() {
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
    `);
    logger.info("Interrupted analysis jobs marked as failed");
  } catch (err) {
    logger.warn({ err }, "Unable to mark interrupted analysis jobs");
  }
}

const PORT = parseInt(process.env.PORT ?? '3000', 10);

await runStartupMigrations();
await markInterruptedAnalysisJobs();

const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info({ port: PORT }, "Server listening");
});

// Extend timeouts to support large video uploads (up to 2 GB for Studio plan).
// Default Node.js socket timeout is 5 s which is far too short for big files.
server.setTimeout(60 * 60 * 1000);       // 1 hour socket timeout
server.headersTimeout = 61 * 60 * 1000;  // slightly above socket timeout
server.requestTimeout = 61 * 60 * 1000;  // same
