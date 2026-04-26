ALTER TABLE blog_comments
  ADD COLUMN IF NOT EXISTS author_name TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS blog_shares (
  id SERIAL PRIMARY KEY,
  blog_id INTEGER NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
  share_type TEXT NOT NULL,
  platform TEXT NOT NULL,
  blog_url TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS blog_shares_blog_id_created_at_idx ON blog_shares (blog_id, created_at DESC);
