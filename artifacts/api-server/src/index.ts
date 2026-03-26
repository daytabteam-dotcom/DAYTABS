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

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

await runStartupMigrations();

const server = app.listen(port, () => {
  logger.info({ port }, "Server listening");
});

// Extend timeouts to support large video uploads (up to 2 GB for Studio plan).
// Default Node.js socket timeout is 5 s which is far too short for big files.
server.setTimeout(60 * 60 * 1000);       // 1 hour socket timeout
server.headersTimeout = 61 * 60 * 1000;  // slightly above socket timeout
server.requestTimeout = 61 * 60 * 1000;  // same
