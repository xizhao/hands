-- D1 Database Schema
-- Run with: npm run db:migrate

-- Events table for storing ingested data
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  data TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Create index for common queries
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
