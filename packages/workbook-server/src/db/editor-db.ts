/**
 * Editor State Database
 *
 * SQLite database for persisting workbook-specific editor state.
 * Located at {workbookDir}/.hands/editor.db
 *
 * ## Table of Contents
 * - Dependency Injection (setDatabaseFactory, clearDatabaseCache)
 * - Schema & Migrations (MIGRATION_001)
 * - Connection Management (getEditorDb, closeEditorDb, closeAllEditorDbs)
 * - UI State Operations (getUiState, updateUiState)
 * - Expanded Folders/Sources (getExpandedFolders, setFolderExpanded, etc.)
 * - Recent Items (getRecentItems, addRecentItem)
 * - Action Runs (getActionRuns, insertActionRun, updateActionRun)
 * - Action Run Logs (getActionRunLogs, appendActionRunLog)
 *
 * ## Testability
 * - Use setDatabaseFactory() to inject a mock database factory for tests
 * - Use resetDatabaseFactory() to restore default behavior
 * - Use clearDatabaseCache() to reset state between tests
 */

import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";

// Current schema version
const CURRENT_SCHEMA_VERSION = 2;

// Singleton database instances per workbook
const dbInstances = new Map<string, Database>();

// ============================================================================
// Dependency Injection for Testing
// ============================================================================

/** Factory function type for creating databases */
export type DatabaseFactory = (dbPath: string) => Database;

/** Default factory that creates real SQLite databases */
const defaultDatabaseFactory: DatabaseFactory = (dbPath: string) => {
  return new Database(dbPath);
};

/** Current factory (can be overridden for testing) */
let databaseFactory: DatabaseFactory = defaultDatabaseFactory;

/**
 * Set a custom database factory (for testing)
 * Returns a cleanup function to restore the default factory
 */
export function setDatabaseFactory(factory: DatabaseFactory): () => void {
  databaseFactory = factory;
  return () => {
    databaseFactory = defaultDatabaseFactory;
  };
}

/**
 * Reset to the default database factory
 */
export function resetDatabaseFactory() {
  databaseFactory = defaultDatabaseFactory;
}

/**
 * Clear all cached database instances (useful for testing)
 */
export function clearDatabaseCache() {
  for (const [, db] of dbInstances) {
    try {
      db.close();
    } catch {
      // Ignore close errors
    }
  }
  dbInstances.clear();
}

/**
 * Initial schema migration
 */
const MIGRATION_001 = `
-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Single-row UI state
CREATE TABLE IF NOT EXISTS ui_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  sidebar_width INTEGER NOT NULL DEFAULT 280,
  chat_expanded INTEGER NOT NULL DEFAULT 0,
  right_panel TEXT,
  active_tab TEXT DEFAULT 'preview',
  pages_expanded INTEGER NOT NULL DEFAULT 1,
  data_expanded INTEGER NOT NULL DEFAULT 1,
  actions_expanded INTEGER NOT NULL DEFAULT 1,
  plugins_expanded INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Expanded folders (set-based)
CREATE TABLE IF NOT EXISTS expanded_folders (
  path TEXT PRIMARY KEY
);

-- Expanded sources (set-based)
CREATE TABLE IF NOT EXISTS expanded_sources (
  source_id TEXT PRIMARY KEY
);

-- Recently opened items
CREATE TABLE IF NOT EXISTS recent_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_type TEXT NOT NULL,
  item_id TEXT NOT NULL,
  opened_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(item_type, item_id)
);

-- Action execution history
CREATE TABLE IF NOT EXISTS action_runs (
  id TEXT PRIMARY KEY,
  action_id TEXT NOT NULL,
  trigger TEXT NOT NULL,
  status TEXT NOT NULL,
  input TEXT,
  output TEXT,
  error TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  duration_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_action_runs_action_id ON action_runs(action_id);
CREATE INDEX IF NOT EXISTS idx_action_runs_started_at ON action_runs(started_at DESC);

-- Action run logs (stdout/stderr)
CREATE TABLE IF NOT EXISTS action_run_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES action_runs(id) ON DELETE CASCADE,
  stream TEXT NOT NULL,
  content TEXT NOT NULL,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_action_run_logs_run_id ON action_run_logs(run_id);

-- Insert default UI state row
INSERT OR IGNORE INTO ui_state (id) VALUES (1);

-- Record migration
INSERT INTO schema_migrations (version) VALUES (1);
`;

/**
 * Migration 002: Add steps column for workflow actions
 */
const MIGRATION_002 = `
-- Add steps column to action_runs for workflow step recording
ALTER TABLE action_runs ADD COLUMN steps TEXT;

-- Record migration
INSERT INTO schema_migrations (version) VALUES (2);
`;

/**
 * Get or create editor database for a workbook
 */
export function getEditorDb(workbookDir: string): Database {
  const existing = dbInstances.get(workbookDir);
  if (existing) {
    return existing;
  }

  const handsDir = join(workbookDir, ".hands");
  const dbPath = join(handsDir, "editor.db");

  // Ensure .hands directory exists
  if (!existsSync(handsDir)) {
    mkdirSync(handsDir, { recursive: true });
  }

  // Open or create database (using injected factory for testability)
  const db = databaseFactory(dbPath);

  // Enable foreign keys
  db.run("PRAGMA foreign_keys = ON");

  // Run integrity check
  const integrityResult = db.query<{ integrity_check: string }, []>("PRAGMA integrity_check").get();

  if (integrityResult?.integrity_check !== "ok") {
    console.error(`Editor database corrupted: ${integrityResult?.integrity_check}`);
    db.close();

    // Backup corrupt file
    const timestamp = Date.now();
    const backupPath = join(handsDir, `editor.db.corrupt.${timestamp}`);
    renameSync(dbPath, backupPath);
    console.log(`Backed up corrupt database to: ${backupPath}`);

    // Create fresh database (using injected factory for testability)
    const freshDb = databaseFactory(dbPath);
    freshDb.run("PRAGMA foreign_keys = ON");
    runMigrations(freshDb);
    dbInstances.set(workbookDir, freshDb);
    return freshDb;
  }

  // Check schema version and run migrations if needed
  runMigrations(db);

  dbInstances.set(workbookDir, db);
  return db;
}

/**
 * Run pending migrations
 */
function runMigrations(db: Database) {
  // Check if schema_migrations table exists
  const tableExists = db
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'",
    )
    .get();

  if (!tableExists) {
    // Fresh database - run initial migration
    db.run(MIGRATION_001);
    return;
  }

  // Check current version
  const versionRow = db
    .query<{ version: number }, []>("SELECT MAX(version) as version FROM schema_migrations")
    .get();

  const currentVersion = versionRow?.version ?? 0;

  if (currentVersion < CURRENT_SCHEMA_VERSION) {
    // Run pending migrations
    if (currentVersion < 1) {
      db.run(MIGRATION_001);
    }
    if (currentVersion < 2) {
      db.run(MIGRATION_002);
    }
    // Add future migrations here:
    // if (currentVersion < 3) { db.run(MIGRATION_003); }
  }
}

/**
 * Close database for a workbook (cleanup)
 */
export function closeEditorDb(workbookDir: string) {
  const db = dbInstances.get(workbookDir);
  if (db) {
    db.close();
    dbInstances.delete(workbookDir);
  }
}

/**
 * Close all open databases
 */
export function closeAllEditorDbs() {
  for (const [, db] of dbInstances) {
    db.close();
  }
  dbInstances.clear();
}

// ============================================================================
// UI State Operations
// ============================================================================

export interface UiState {
  sidebarWidth: number;
  chatExpanded: boolean;
  activeTab: string;
  pagesExpanded: boolean;
  dataExpanded: boolean;
  actionsExpanded: boolean;
  pluginsExpanded: boolean;
}

export function getUiState(db: Database): UiState {
  const row = db
    .query<
      {
        sidebar_width: number;
        chat_expanded: number;
        active_tab: string;
        pages_expanded: number;
        data_expanded: number;
        actions_expanded: number;
        plugins_expanded: number;
      },
      []
    >(
      `SELECT sidebar_width, chat_expanded, active_tab,
            pages_expanded, data_expanded, actions_expanded, plugins_expanded
     FROM ui_state WHERE id = 1`,
    )
    .get();

  if (!row) {
    // Return defaults if somehow missing
    return {
      sidebarWidth: 280,
      chatExpanded: false,
      activeTab: "preview",
      pagesExpanded: true,
      dataExpanded: true,
      actionsExpanded: true,
      pluginsExpanded: true,
    };
  }

  return {
    sidebarWidth: row.sidebar_width,
    chatExpanded: row.chat_expanded === 1,
    activeTab: row.active_tab,
    pagesExpanded: row.pages_expanded === 1,
    dataExpanded: row.data_expanded === 1,
    actionsExpanded: row.actions_expanded === 1,
    pluginsExpanded: row.plugins_expanded === 1,
  };
}

export function updateUiState(db: Database, updates: Partial<UiState>) {
  const setClauses: string[] = [];
  const params: (string | number | null)[] = [];

  if (updates.sidebarWidth !== undefined) {
    setClauses.push("sidebar_width = ?");
    params.push(updates.sidebarWidth);
  }
  if (updates.chatExpanded !== undefined) {
    setClauses.push("chat_expanded = ?");
    params.push(updates.chatExpanded ? 1 : 0);
  }
  if (updates.activeTab !== undefined) {
    setClauses.push("active_tab = ?");
    params.push(updates.activeTab);
  }
  if (updates.pagesExpanded !== undefined) {
    setClauses.push("pages_expanded = ?");
    params.push(updates.pagesExpanded ? 1 : 0);
  }
  if (updates.dataExpanded !== undefined) {
    setClauses.push("data_expanded = ?");
    params.push(updates.dataExpanded ? 1 : 0);
  }
  if (updates.actionsExpanded !== undefined) {
    setClauses.push("actions_expanded = ?");
    params.push(updates.actionsExpanded ? 1 : 0);
  }
  if (updates.pluginsExpanded !== undefined) {
    setClauses.push("plugins_expanded = ?");
    params.push(updates.pluginsExpanded ? 1 : 0);
  }

  if (setClauses.length === 0) return;

  setClauses.push("updated_at = datetime('now')");

  const sql = `UPDATE ui_state SET ${setClauses.join(", ")} WHERE id = 1`;
  db.run(sql, params);
}

// ============================================================================
// Expanded Folders/Sources Operations
// ============================================================================

export function getExpandedFolders(db: Database): string[] {
  const rows = db.query<{ path: string }, []>("SELECT path FROM expanded_folders").all();
  return rows.map((r) => r.path);
}

export function setFolderExpanded(db: Database, path: string, expanded: boolean) {
  if (expanded) {
    db.run("INSERT OR IGNORE INTO expanded_folders (path) VALUES (?)", [path]);
  } else {
    db.run("DELETE FROM expanded_folders WHERE path = ?", [path]);
  }
}

export function getExpandedSources(db: Database): string[] {
  const rows = db.query<{ source_id: string }, []>("SELECT source_id FROM expanded_sources").all();
  return rows.map((r) => r.source_id);
}

export function setSourceExpanded(db: Database, sourceId: string, expanded: boolean) {
  if (expanded) {
    db.run("INSERT OR IGNORE INTO expanded_sources (source_id) VALUES (?)", [sourceId]);
  } else {
    db.run("DELETE FROM expanded_sources WHERE source_id = ?", [sourceId]);
  }
}

// ============================================================================
// Recent Items Operations
// ============================================================================

export interface RecentItem {
  id: number;
  itemType: string;
  itemId: string;
  openedAt: string;
}

export function getRecentItems(db: Database, limit = 10): RecentItem[] {
  const rows = db
    .query<
      {
        id: number;
        item_type: string;
        item_id: string;
        opened_at: string;
      },
      [number]
    >(
      `SELECT id, item_type, item_id, opened_at
     FROM recent_items
     ORDER BY opened_at DESC
     LIMIT ?`,
    )
    .all(limit);

  return rows.map((r) => ({
    id: r.id,
    itemType: r.item_type,
    itemId: r.item_id,
    openedAt: r.opened_at,
  }));
}

export function addRecentItem(db: Database, itemType: string, itemId: string) {
  db.run(
    `INSERT INTO recent_items (item_type, item_id, opened_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(item_type, item_id) DO UPDATE SET opened_at = datetime('now')`,
    [itemType, itemId],
  );

  // Keep only last 50 recent items
  db.run(
    `DELETE FROM recent_items
     WHERE id NOT IN (
       SELECT id FROM recent_items ORDER BY opened_at DESC LIMIT 50
     )`,
  );
}

// ============================================================================
// Action Runs Operations
// ============================================================================

/** Step record from workflow execution */
export interface StepRecord {
  name: string;
  type: "do" | "sleep" | "sleepUntil" | "waitForEvent";
  startedAt?: string;
  finishedAt?: string;
  status: "pending" | "running" | "success" | "failed" | "waiting";
  result?: unknown;
  error?: string;
  children?: StepRecord[];
  config?: {
    retries?: { limit: number; delay: string | number; backoff?: string };
    timeout?: string | number;
  };
}

export interface ActionRunRecord {
  id: string;
  actionId: string;
  trigger: string;
  status: string;
  input: unknown;
  output: unknown;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  createdAt: string;
  /** Workflow steps (for workflow actions only) */
  steps: StepRecord[] | null;
}

export function getActionRuns(db: Database, actionId: string, limit = 20): ActionRunRecord[] {
  const rows = db
    .query<
      {
        id: string;
        action_id: string;
        trigger: string;
        status: string;
        input: string | null;
        output: string | null;
        error: string | null;
        started_at: string;
        finished_at: string | null;
        duration_ms: number | null;
        created_at: string;
        steps: string | null;
      },
      [string, number]
    >(
      `SELECT id, action_id, trigger, status, input, output, error,
            started_at, finished_at, duration_ms, created_at, steps
     FROM action_runs
     WHERE action_id = ?
     ORDER BY started_at DESC
     LIMIT ?`,
    )
    .all(actionId, limit);

  return rows.map((r) => ({
    id: r.id,
    actionId: r.action_id,
    trigger: r.trigger,
    status: r.status,
    input: r.input ? JSON.parse(r.input) : null,
    output: r.output ? JSON.parse(r.output) : null,
    error: r.error,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    durationMs: r.duration_ms,
    createdAt: r.created_at,
    steps: r.steps ? JSON.parse(r.steps) : null,
  }));
}

export function getActionRun(db: Database, runId: string): ActionRunRecord | null {
  const row = db
    .query<
      {
        id: string;
        action_id: string;
        trigger: string;
        status: string;
        input: string | null;
        output: string | null;
        error: string | null;
        started_at: string;
        finished_at: string | null;
        duration_ms: number | null;
        created_at: string;
        steps: string | null;
      },
      [string]
    >(
      `SELECT id, action_id, trigger, status, input, output, error,
            started_at, finished_at, duration_ms, created_at, steps
     FROM action_runs
     WHERE id = ?`,
    )
    .get(runId);

  if (!row) return null;

  return {
    id: row.id,
    actionId: row.action_id,
    trigger: row.trigger,
    status: row.status,
    input: row.input ? JSON.parse(row.input) : null,
    output: row.output ? JSON.parse(row.output) : null,
    error: row.error,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
    steps: row.steps ? JSON.parse(row.steps) : null,
  };
}

export function insertActionRun(
  db: Database,
  run: {
    id: string;
    actionId: string;
    trigger: string;
    status: string;
    input?: unknown;
    output?: unknown;
    error?: string;
    startedAt: string;
    finishedAt?: string;
    durationMs?: number;
    steps?: StepRecord[];
  },
) {
  db.run(
    `INSERT INTO action_runs (id, action_id, trigger, status, input, output, error, started_at, finished_at, duration_ms, steps)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      run.id,
      run.actionId,
      run.trigger,
      run.status,
      run.input !== undefined ? JSON.stringify(run.input) : null,
      run.output !== undefined ? JSON.stringify(run.output) : null,
      run.error ?? null,
      run.startedAt,
      run.finishedAt ?? null,
      run.durationMs ?? null,
      run.steps !== undefined ? JSON.stringify(run.steps) : null,
    ],
  );

  // Enforce retention: keep last 100 runs per action
  db.run(
    `DELETE FROM action_runs
     WHERE action_id = ?
     AND id NOT IN (
       SELECT id FROM action_runs
       WHERE action_id = ?
       ORDER BY started_at DESC
       LIMIT 100
     )`,
    [run.actionId, run.actionId],
  );
}

export function updateActionRun(
  db: Database,
  runId: string,
  updates: {
    status?: string;
    output?: unknown;
    error?: string;
    finishedAt?: string;
    durationMs?: number;
    steps?: StepRecord[];
  },
) {
  const setClauses: string[] = [];
  const params: (string | number | null)[] = [];

  if (updates.status !== undefined) {
    setClauses.push("status = ?");
    params.push(updates.status);
  }
  if (updates.output !== undefined) {
    setClauses.push("output = ?");
    params.push(JSON.stringify(updates.output));
  }
  if (updates.error !== undefined) {
    setClauses.push("error = ?");
    params.push(updates.error);
  }
  if (updates.finishedAt !== undefined) {
    setClauses.push("finished_at = ?");
    params.push(updates.finishedAt);
  }
  if (updates.durationMs !== undefined) {
    setClauses.push("duration_ms = ?");
    params.push(updates.durationMs);
  }
  if (updates.steps !== undefined) {
    setClauses.push("steps = ?");
    params.push(JSON.stringify(updates.steps));
  }

  if (setClauses.length === 0) return;

  params.push(runId);
  const sql = `UPDATE action_runs SET ${setClauses.join(", ")} WHERE id = ?`;
  db.run(sql, params);
}

// ============================================================================
// Action Run Logs Operations
// ============================================================================

export interface ActionRunLog {
  id: number;
  runId: string;
  stream: "stdout" | "stderr";
  content: string;
  timestamp: string;
}

export function getActionRunLogs(db: Database, runId: string): ActionRunLog[] {
  const rows = db
    .query<
      {
        id: number;
        run_id: string;
        stream: string;
        content: string;
        timestamp: string;
      },
      [string]
    >(
      `SELECT id, run_id, stream, content, timestamp
     FROM action_run_logs
     WHERE run_id = ?
     ORDER BY timestamp ASC, id ASC`,
    )
    .all(runId);

  return rows.map((r) => ({
    id: r.id,
    runId: r.run_id,
    stream: r.stream as "stdout" | "stderr",
    content: r.content,
    timestamp: r.timestamp,
  }));
}

export function appendActionRunLog(
  db: Database,
  runId: string,
  stream: "stdout" | "stderr",
  content: string,
) {
  db.run(
    `INSERT INTO action_run_logs (run_id, stream, content)
     VALUES (?, ?, ?)`,
    [runId, stream, content],
  );
}
