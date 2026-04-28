ALTER TABLE "user_usage"
ADD COLUMN IF NOT EXISTS "social_growth_plans_used" integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "social_growth_weekly_plans" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "platform" text NOT NULL,
  "week_number" integer NOT NULL,
  "start_date" text NOT NULL,
  "end_date" text NOT NULL,
  "topic" text NOT NULL,
  "posts_per_week" integer NOT NULL,
  "audience" text,
  "goal" text,
  "tone" text,
  "format_preference" text,
  "plan" jsonb NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "social_growth_weekly_plans_user_platform_idx"
  ON "social_growth_weekly_plans" ("user_id", "platform", "start_date");

CREATE TABLE IF NOT EXISTS "social_growth_plan_feedback" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "plan_id" integer NOT NULL REFERENCES "social_growth_weekly_plans"("id") ON DELETE cascade,
  "platform" text NOT NULL,
  "feedback" jsonb NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "social_growth_plan_feedback_plan_idx"
  ON "social_growth_plan_feedback" ("plan_id");

