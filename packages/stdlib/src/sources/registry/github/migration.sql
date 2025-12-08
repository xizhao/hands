-- GitHub source tables
-- Run this migration before enabling the github source

-- Stars table
CREATE TABLE IF NOT EXISTS github_stars (
  id TEXT PRIMARY KEY,
  repo TEXT NOT NULL,
  user_login TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  starred_at TEXT NOT NULL,
  synced_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_github_stars_repo ON github_stars(repo);
CREATE INDEX IF NOT EXISTS idx_github_stars_user ON github_stars(user_login);
CREATE INDEX IF NOT EXISTS idx_github_stars_date ON github_stars(starred_at DESC);

-- Issues table
CREATE TABLE IF NOT EXISTS github_issues (
  id TEXT PRIMARY KEY,
  repo TEXT NOT NULL,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  state TEXT NOT NULL,
  author_login TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  closed_at TEXT,
  labels TEXT,
  synced_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_github_issues_repo ON github_issues(repo);
CREATE INDEX IF NOT EXISTS idx_github_issues_state ON github_issues(state);
CREATE INDEX IF NOT EXISTS idx_github_issues_updated ON github_issues(updated_at DESC);

-- Pull Requests table
CREATE TABLE IF NOT EXISTS github_pull_requests (
  id TEXT PRIMARY KEY,
  repo TEXT NOT NULL,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  state TEXT NOT NULL,
  author_login TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  merged_at TEXT,
  closed_at TEXT,
  additions INTEGER NOT NULL DEFAULT 0,
  deletions INTEGER NOT NULL DEFAULT 0,
  synced_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_github_prs_repo ON github_pull_requests(repo);
CREATE INDEX IF NOT EXISTS idx_github_prs_state ON github_pull_requests(state);
CREATE INDEX IF NOT EXISTS idx_github_prs_updated ON github_pull_requests(updated_at DESC);
