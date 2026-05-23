CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "cine_projects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "description" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "cine_projects_user_id_idx" ON "cine_projects" ("user_id");

CREATE TABLE IF NOT EXISTS "cine_characters" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "cine_projects"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "base_prompt" text NOT NULL,
  "identity_prompt" text,
  "style_preset" text NOT NULL,
  "locked_identity" boolean NOT NULL DEFAULT false,
  "reference_image_url" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "cine_characters_project_id_idx" ON "cine_characters" ("project_id");
CREATE INDEX IF NOT EXISTS "cine_characters_user_id_idx" ON "cine_characters" ("user_id");

CREATE TABLE IF NOT EXISTS "cine_assets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "cine_projects"("id") ON DELETE CASCADE,
  "character_id" uuid REFERENCES "cine_characters"("id") ON DELETE SET NULL,
  "style_id" uuid,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "category" text NOT NULL,
  "url" text NOT NULL,
  "prompt" text NOT NULL,
  "provider" text NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "cine_assets_project_id_idx" ON "cine_assets" ("project_id");
CREATE INDEX IF NOT EXISTS "cine_assets_character_id_idx" ON "cine_assets" ("character_id");
CREATE INDEX IF NOT EXISTS "cine_assets_user_id_idx" ON "cine_assets" ("user_id");

CREATE TABLE IF NOT EXISTS "cine_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "cine_projects"("id") ON DELETE CASCADE,
  "character_id" uuid REFERENCES "cine_characters"("id") ON DELETE SET NULL,
  "provider" text NOT NULL,
  "job_type" text NOT NULL,
  "status" text NOT NULL,
  "input" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "output" jsonb,
  "error_message" text,
  "cost_credits" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "cine_jobs_user_id_idx" ON "cine_jobs" ("user_id");
CREATE INDEX IF NOT EXISTS "cine_jobs_project_id_idx" ON "cine_jobs" ("project_id");
CREATE INDEX IF NOT EXISTS "cine_jobs_status_idx" ON "cine_jobs" ("status");

CREATE TABLE IF NOT EXISTS "cine_styles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "style_prompt" text NOT NULL,
  "negative_prompt" text,
  "color_palette" jsonb,
  "mood_keywords" jsonb,
  "texture_keywords" jsonb,
  "lighting_keywords" jsonb,
  "reference_image_url" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "cine_styles_user_id_idx" ON "cine_styles" ("user_id");

ALTER TABLE "cine_projects"
  ADD COLUMN IF NOT EXISTS "style_id" uuid;

ALTER TABLE "cine_characters"
  ADD COLUMN IF NOT EXISTS "style_id" uuid;

CREATE TABLE IF NOT EXISTS "credits" (
  "user_id" integer PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "remaining_credits" integer NOT NULL DEFAULT 0,
  "updated_at" timestamp NOT NULL DEFAULT now()
);
