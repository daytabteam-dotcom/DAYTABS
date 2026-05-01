ALTER TABLE "user_usage"
  ADD COLUMN IF NOT EXISTS "social_growth_ai_improvements_linkedin" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "social_growth_ai_improvements_tiktok" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "social_growth_ai_improvements_instagram" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "social_growth_additional_ai_ideas_linkedin" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "social_growth_additional_ai_ideas_tiktok" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "social_growth_additional_ai_ideas_instagram" integer NOT NULL DEFAULT 0;

