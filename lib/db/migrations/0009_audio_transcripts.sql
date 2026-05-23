CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "audio_transcript_projects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "audio_file_url" text,
  "audio_file_name" text,
  "audio_file_size" integer,
  "audio_duration_seconds" integer,
  "source_language" text,
  "detected_language" text,
  "status" text NOT NULL,
  "full_transcript" text,
  "transcript_segments" jsonb,
  "audio_deleted" boolean NOT NULL DEFAULT false,
  "error_message" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "audio_transcript_projects_user_id_idx" ON "audio_transcript_projects" ("user_id");

CREATE TABLE IF NOT EXISTS "audio_translations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "transcript_project_id" uuid NOT NULL REFERENCES "audio_transcript_projects"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "source_language" text,
  "target_language" text NOT NULL,
  "translated_full_text" text,
  "translated_segments" jsonb,
  "status" text NOT NULL,
  "error_message" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "audio_translations_user_id_idx" ON "audio_translations" ("user_id");
CREATE INDEX IF NOT EXISTS "audio_translations_project_id_idx" ON "audio_translations" ("transcript_project_id");

CREATE TABLE IF NOT EXISTS "audio_transcript_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "transcript_project_id" uuid NOT NULL REFERENCES "audio_transcript_projects"("id") ON DELETE CASCADE,
  "job_type" text NOT NULL,
  "provider" text NOT NULL,
  "status" text NOT NULL,
  "input" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "output" jsonb,
  "error_message" text,
  "cost_credits" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "audio_transcript_jobs_user_id_idx" ON "audio_transcript_jobs" ("user_id");
CREATE INDEX IF NOT EXISTS "audio_transcript_jobs_project_id_idx" ON "audio_transcript_jobs" ("transcript_project_id");

