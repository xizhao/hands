-- Hacker News stories table
-- Run this migration before enabling the hackernews source

CREATE TABLE IF NOT EXISTS hn_stories (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'story',
  by TEXT NOT NULL,
  time INTEGER NOT NULL,
  title TEXT NOT NULL,
  url TEXT,
  text TEXT,
  score INTEGER NOT NULL DEFAULT 0,
  descendants INTEGER,
  stream TEXT NOT NULL,
  synced_at TEXT NOT NULL
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_hn_stories_stream ON hn_stories(stream);
CREATE INDEX IF NOT EXISTS idx_hn_stories_time ON hn_stories(time DESC);
CREATE INDEX IF NOT EXISTS idx_hn_stories_score ON hn_stories(score DESC);
CREATE INDEX IF NOT EXISTS idx_hn_stories_by ON hn_stories(by);
