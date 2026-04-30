ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "social_growth_platforms" text NOT NULL DEFAULT '';

ALTER TABLE "user_usage"
  ADD COLUMN IF NOT EXISTS "social_growth_manual_ideas_used_linkedin" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "social_growth_manual_ideas_used_instagram" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "social_growth_manual_ideas_used_tiktok" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "social_growth_improvements_used_linkedin" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "social_growth_improvements_used_instagram" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "social_growth_improvements_used_tiktok" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "social_growth_additional_ideas_used_linkedin" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "social_growth_additional_ideas_used_instagram" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "social_growth_additional_ideas_used_tiktok" integer NOT NULL DEFAULT 0;

