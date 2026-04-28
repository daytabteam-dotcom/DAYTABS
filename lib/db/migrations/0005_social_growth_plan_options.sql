ALTER TABLE social_growth_weekly_plans
  ADD COLUMN IF NOT EXISTS posting_mode text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS preferred_weekdays jsonb NOT NULL DEFAULT '[]'::jsonb;

