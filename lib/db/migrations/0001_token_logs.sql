CREATE TABLE IF NOT EXISTS token_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
  feature       TEXT NOT NULL,
  model         TEXT NOT NULL,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd      NUMERIC(10,6),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_token_logs_user_id    ON token_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_token_logs_feature    ON token_logs(feature);
CREATE INDEX IF NOT EXISTS idx_token_logs_created_at ON token_logs(created_at);
