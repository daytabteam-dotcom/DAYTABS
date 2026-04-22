import app from "./app";
import { logger } from "./lib/logger";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { ensureAnalysisJobQueueColumns } from "./lib/analysisJobQueueDb";

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
    await db.execute(
      sql`ALTER TABLE user_usage ADD COLUMN IF NOT EXISTS video_analysis_runs_used INTEGER NOT NULL DEFAULT 0`
    );
    await db.execute(
      sql`ALTER TABLE user_usage ADD COLUMN IF NOT EXISTS video_analysis_usage_used INTEGER NOT NULL DEFAULT 0`
    );
    await db.execute(
      sql`ALTER TABLE user_usage ADD COLUMN IF NOT EXISTS script_generations_used INTEGER NOT NULL DEFAULT 0`
    );
    await db.execute(
      sql`UPDATE user_usage SET video_analysis_runs_used = COALESCE(video_analysis_runs_used, video_analyses_used, 0)`
    );
    await db.execute(
      sql`UPDATE user_usage SET video_analysis_usage_used = COALESCE(video_analysis_usage_used, video_analyses_used, 0)`
    );
    await db.execute(
      sql`UPDATE user_usage SET script_generations_used = COALESCE(script_generations_used, script_planner_chats_used, 0)`
    );
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS youtube_connections (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        connected_google_email TEXT,
        channel_id TEXT,
        channel_title TEXT,
        preferred_posts_per_week INTEGER DEFAULT 3,
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
    await db.execute(sql`ALTER TABLE youtube_connections ADD COLUMN IF NOT EXISTS preferred_posts_per_week INTEGER DEFAULT 3`);
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
    await db.execute(sql`
      ALTER TABLE youtube_channel_profiles
      ADD COLUMN IF NOT EXISTS idea_feedback_summary JSONB NOT NULL DEFAULT '{"liked":[],"disliked":[],"deleted":[]}'::jsonb
    `);
    await db.execute(sql`ALTER TABLE youtube_competitors ADD COLUMN IF NOT EXISTS thumbnail_url TEXT`);
    await ensureAnalysisJobQueueColumns();
    logger.info("Startup migrations applied");
  } catch (err) {
    logger.warn({ err }, "Startup migrations warning (non-fatal)");
  }
}

const PORT = parseInt(process.env.PORT ?? '3000', 10);

await runStartupMigrations();

const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info({ port: PORT }, "Server listening");
});

// Extend timeouts to support Pro-sized direct uploads.
// Default Node.js socket timeout is 5 s which is far too short for big files.
server.setTimeout(6 * 60 * 60 * 1000);
server.headersTimeout = 6 * 60 * 60 * 1000 + 60_000;
server.requestTimeout = 6 * 60 * 60 * 1000 + 60_000;
