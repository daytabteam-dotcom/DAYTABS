import { pool } from "@workspace/db";
import { logger } from "./logger";

const TERMINAL_STATUSES = ["complete", "error", "cancelled"];
const RUNNING_STATUSES = [
  "processing",
  "downloading",
  "extracting_audio",
  "transcribing",
  "detecting_speech",
  "extracting_frames",
  "analyzing_visual",
  "analyzing_audio",
  "analyzing_content",
  "generating_seo",
  "generating_subtitles",
];

export interface ClaimedAnalysisJob {
  id: string;
  userId: number | null;
  status: string;
  mode: string;
  platform: string;
  translateSubtitles: number;
  subtitleLanguage: string | null;
  audioLanguage: string | null;
  b2Key: string;
  result: unknown;
}

function mapJob(row: Record<string, unknown>): ClaimedAnalysisJob {
  return {
    id: String(row.id),
    userId: row.user_id == null ? null : Number(row.user_id),
    status: String(row.status),
    mode: String(row.mode ?? "video-analyzer"),
    platform: String(row.platform ?? "youtube_long"),
    translateSubtitles: Number(row.translate_subtitles ?? 0),
    subtitleLanguage: row.subtitle_language == null ? null : String(row.subtitle_language),
    audioLanguage: row.audio_language == null ? null : String(row.audio_language),
    b2Key: String(row.b2_key ?? ""),
    result: row.result,
  };
}

export async function ensureAnalysisJobQueueColumns() {
  await pool.query(`
    ALTER TABLE analysis_jobs
      ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS locked_by TEXT,
      ADD COLUMN IF NOT EXISTS started_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMP
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS analysis_jobs_queue_idx
      ON analysis_jobs (status, created_at)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS analysis_jobs_lock_idx
      ON analysis_jobs (locked_by, heartbeat_at)
  `);
}

export async function resetInterruptedAnalysisJobs() {
  await pool.query(
    `
      UPDATE analysis_jobs
      SET
        status = 'error',
        progress = 0,
        current_step = 'Analysis interrupted',
        error = 'Analysis was interrupted before the upload was available. Please upload the video again.',
        locked_by = NULL,
        heartbeat_at = NULL,
        updated_at = NOW()
      WHERE status <> ALL($1)
        AND (b2_key IS NULL OR b2_key = '')
    `,
    [TERMINAL_STATUSES],
  );

  const result = await pool.query(
    `
      UPDATE analysis_jobs
      SET
        status = 'queued',
        current_step = 'Waiting for analysis slot',
        locked_by = NULL,
        heartbeat_at = NULL,
        error = NULL,
        updated_at = NOW()
      WHERE status <> ALL($1)
        AND b2_key <> ''
        AND locked_by IS NULL
    `,
    [TERMINAL_STATUSES],
  );

  logger.info({ recovered: result.rowCount ?? 0 }, "Interrupted analysis jobs returned to DB queue");
}

export async function reclaimStaleAnalysisJobs(staleAfterMs: number) {
  const result = await pool.query(
    `
      UPDATE analysis_jobs
      SET
        status = 'queued',
        current_step = 'Waiting for analysis slot',
        locked_by = NULL,
        heartbeat_at = NULL,
        updated_at = NOW()
      WHERE status = ANY($1)
        AND locked_by IS NOT NULL
        AND (heartbeat_at IS NULL OR heartbeat_at < NOW() - ($2::text)::interval)
    `,
    [RUNNING_STATUSES, `${Math.max(1, staleAfterMs)} milliseconds`],
  );

  if ((result.rowCount ?? 0) > 0) {
    logger.warn({ reclaimed: result.rowCount }, "Reclaimed stale analysis jobs");
  }
}

export async function claimNextAnalysisJob(workerId: string, staleAfterMs: number, perUserConcurrency: number) {
  await reclaimStaleAnalysisJobs(staleAfterMs);

  const result = await pool.query(
    `
      WITH candidate AS (
        SELECT j.id
        FROM analysis_jobs j
        WHERE j.status = 'queued'
          AND j.b2_key <> ''
          AND (
            j.user_id IS NULL
            OR (
              SELECT COUNT(*)
              FROM analysis_jobs active
              WHERE active.user_id = j.user_id
                AND active.status = ANY($1)
                AND active.locked_by IS NOT NULL
                AND active.heartbeat_at > NOW() - ($2::text)::interval
            ) < $3
          )
        ORDER BY j.created_at ASC NULLS LAST
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE analysis_jobs
      SET
        status = 'processing',
        progress = GREATEST(progress, 5),
        current_step = 'Starting analysis',
        attempt_count = attempt_count + 1,
        locked_by = $4,
        started_at = COALESCE(started_at, NOW()),
        heartbeat_at = NOW(),
        updated_at = NOW()
      WHERE id = (SELECT id FROM candidate)
      RETURNING *
    `,
    [RUNNING_STATUSES, `${Math.max(1, staleAfterMs)} milliseconds`, Math.max(1, perUserConcurrency), workerId],
  );

  return result.rows[0] ? mapJob(result.rows[0]) : null;
}

export async function heartbeatAnalysisJob(jobId: string, workerId: string) {
  await pool.query(
    `
      UPDATE analysis_jobs
      SET heartbeat_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND locked_by = $2
    `,
    [jobId, workerId],
  );
}

export async function releaseAnalysisJob(jobId: string, workerId: string) {
  await pool.query(
    `
      UPDATE analysis_jobs
      SET locked_by = NULL, heartbeat_at = NULL, updated_at = NOW()
      WHERE id = $1 AND locked_by = $2
    `,
    [jobId, workerId],
  );
}

export async function getActiveAnalysisCount() {
  const result = await pool.query(
    `
      SELECT COUNT(*)::int AS count
      FROM analysis_jobs
      WHERE status <> ALL($1)
    `,
    [TERMINAL_STATUSES],
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function getDbQueueStatus() {
  const result = await pool.query(
    `
      SELECT
        COUNT(*) FILTER (WHERE status = 'queued')::int AS waiting,
        COUNT(*) FILTER (WHERE status = ANY($1))::int AS running
      FROM analysis_jobs
      WHERE status <> ALL($2)
    `,
    [RUNNING_STATUSES, TERMINAL_STATUSES],
  );
  return {
    running: Number(result.rows[0]?.running ?? 0),
    waiting: Number(result.rows[0]?.waiting ?? 0),
    concurrency: readWorkerConcurrency(),
  };
}

export async function getDbJobQueueStatus(jobId: string) {
  const jobResult = await pool.query(
    `
      SELECT id, status, created_at
      FROM analysis_jobs
      WHERE id = $1
      LIMIT 1
    `,
    [jobId],
  );
  const job = jobResult.rows[0];
  const queue = await getDbQueueStatus();
  if (!job) {
    return { state: "unknown" as const, position: null, ahead: null, ...queue };
  }
  if (RUNNING_STATUSES.includes(String(job.status))) {
    return { state: "running" as const, position: 0, ahead: 0, ...queue };
  }
  if (job.status === "queued") {
    const aheadResult = await pool.query(
      `
        SELECT COUNT(*)::int AS ahead
        FROM analysis_jobs
        WHERE status = 'queued'
          AND COALESCE(created_at, NOW()) < COALESCE($1::timestamp, NOW())
      `,
      [job.created_at],
    );
    const ahead = Number(aheadResult.rows[0]?.ahead ?? 0);
    return { state: "waiting" as const, position: ahead + 1, ahead, ...queue };
  }
  return { state: "unknown" as const, position: null, ahead: null, ...queue };
}

export function readWorkerConcurrency() {
  const raw = Number(process.env.ANALYSIS_WORKER_CONCURRENCY ?? process.env.ANALYSIS_QUEUE_CONCURRENCY ?? "2");
  if (!Number.isFinite(raw) || raw < 1) return 2;
  return Math.max(1, Math.min(8, Math.floor(raw)));
}

export function readPerUserConcurrency() {
  const raw = Number(process.env.ANALYSIS_PER_USER_CONCURRENCY ?? "1");
  if (!Number.isFinite(raw) || raw < 1) return 1;
  return Math.max(1, Math.min(4, Math.floor(raw)));
}
