/**
 * SQLite Web Worker
 *
 * Runs SQLite in a worker where OPFS is available.
 * Communicates with main thread via postMessage.
 */

import sqlite3InitModule, { type Sqlite3Static, type Database } from "@sqlite.org/sqlite-wasm";

// ============================================================================
// Types
// ============================================================================

type WorkerRequest =
  | { id: number; type: "open"; workbookId: string; name?: string }
  | { id: number; type: "close" }
  | { id: number; type: "query"; sql: string; params?: unknown[] }
  | { id: number; type: "execute"; sql: string; params?: unknown[] }
  | { id: number; type: "schema" }
  | { id: number; type: "getWorkbookMeta" }
  | { id: number; type: "setWorkbookMeta"; name?: string; description?: string };

type WorkerResponse =
  | { id: number; type: "success"; result: unknown }
  | { id: number; type: "error"; error: string }
  | { type: "ready"; hasOpfs: boolean }
  | { type: "schema-changed" };

// ============================================================================
// State
// ============================================================================

let sqlite3: Sqlite3Static | null = null;
let db: Database | null = null;
let currentWorkbookId: string | null = null;

// ============================================================================
// Initialization
// ============================================================================

async function init() {
  try {
    sqlite3 = await sqlite3InitModule({
      print: console.log,
      printErr: console.error,
    });

    console.log("[SQLiteWorker] Initialized, version:", sqlite3.version.libVersion);
    console.log("[SQLiteWorker] OPFS available:", !!sqlite3.opfs);

    self.postMessage({ type: "ready", hasOpfs: !!sqlite3.opfs } as WorkerResponse);
  } catch (err) {
    console.error("[SQLiteWorker] Init failed:", err);
    self.postMessage({ type: "ready", hasOpfs: false } as WorkerResponse);
  }
}

// ============================================================================
// Database Operations
// ============================================================================

function openDatabase(workbookId: string, initialName?: string): { isNew: boolean; meta: ReturnType<typeof getWorkbookMeta> } {
  if (!sqlite3) throw new Error("SQLite not initialized");

  // Close existing database
  if (db) {
    db.close();
    db = null;
  }

  const filename = `/hands-${workbookId}.sqlite3`;

  if (sqlite3.opfs) {
    console.log("[SQLiteWorker] Opening OPFS database:", filename);
    db = new sqlite3.oo1.OpfsDb(filename);
  } else {
    console.warn("[SQLiteWorker] OPFS not available, using in-memory");
    db = new sqlite3.oo1.DB();
  }

  // Initialize internal tables
  initInternalTables();

  // Check if this is a new workbook (no metadata yet)
  let meta = getWorkbookMeta();
  const isNew = !meta;

  if (isNew && initialName) {
    // New workbook - set initial metadata
    setWorkbookMeta(initialName);
    meta = getWorkbookMeta();
  } else if (isNew) {
    // New workbook without name - create default
    setWorkbookMeta("Untitled");
    meta = getWorkbookMeta();
  }

  currentWorkbookId = workbookId;
  console.log("[SQLiteWorker] Database opened:", workbookId, isNew ? "(new)" : "(existing)");

  return { isNew, meta };
}

/**
 * Initialize internal tables for workbook metadata, pages, sessions, messages, parts.
 * These are prefixed with _ to distinguish from user data tables.
 */
function initInternalTables(): void {
  if (!db) return;

  db.exec(`
    -- Workbook metadata (source of truth, cached in IndexedDB)
    CREATE TABLE IF NOT EXISTS _workbook (
      id TEXT PRIMARY KEY DEFAULT 'self',
      name TEXT NOT NULL DEFAULT 'Untitled',
      description TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    -- Pages (MDX content)
    CREATE TABLE IF NOT EXISTS _pages (
      path TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      title TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    -- Sessions (agent conversations)
    CREATE TABLE IF NOT EXISTS _sessions (
      id TEXT PRIMARY KEY,
      parent_id TEXT REFERENCES _sessions(id) ON DELETE CASCADE,
      title TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Messages within sessions
    CREATE TABLE IF NOT EXISTS _messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES _sessions(id) ON DELETE CASCADE,
      parent_id TEXT,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      model_id TEXT,
      provider_id TEXT,
      created_at INTEGER NOT NULL,
      completed_at INTEGER,
      cost REAL,
      tokens_input INTEGER,
      tokens_output INTEGER,
      finish_reason TEXT
    );

    -- Message parts (text, tool calls, etc.)
    CREATE TABLE IF NOT EXISTS _parts (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES _messages(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      data TEXT NOT NULL
    );

    -- Todos (per-session task list)
    CREATE TABLE IF NOT EXISTS _todos (
      session_id TEXT NOT NULL REFERENCES _sessions(id) ON DELETE CASCADE,
      idx INTEGER NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed')),
      active_form TEXT NOT NULL,
      PRIMARY KEY (session_id, idx)
    );

    -- Indexes for efficient queries
    CREATE INDEX IF NOT EXISTS _sessions_parent ON _sessions(parent_id);
    CREATE INDEX IF NOT EXISTS _sessions_updated ON _sessions(updated_at DESC);
    CREATE INDEX IF NOT EXISTS _messages_session ON _messages(session_id);
    CREATE INDEX IF NOT EXISTS _parts_message ON _parts(message_id);
  `);

  console.log("[SQLiteWorker] Internal tables initialized");
}

/**
 * Get workbook metadata from _workbook table
 */
function getWorkbookMeta(): { name: string; description: string | null; created_at: number; updated_at: number } | null {
  if (!db) return null;

  const rows = executeQuery<{ name: string; description: string | null; created_at: number; updated_at: number }>(
    "SELECT name, description, created_at, updated_at FROM _workbook WHERE id = 'self'"
  );

  return rows[0] || null;
}

/**
 * Set workbook metadata in _workbook table
 */
function setWorkbookMeta(name?: string, description?: string): void {
  if (!db) return;

  const now = Date.now();

  // Check if row exists
  const existing = getWorkbookMeta();

  if (existing) {
    // Update existing
    const updates: string[] = [];
    const params: unknown[] = [];

    if (name !== undefined) {
      updates.push("name = ?");
      params.push(name);
    }
    if (description !== undefined) {
      updates.push("description = ?");
      params.push(description);
    }
    updates.push("updated_at = ?");
    params.push(now);

    if (updates.length > 0) {
      db.exec({
        sql: `UPDATE _workbook SET ${updates.join(", ")} WHERE id = 'self'`,
        bind: params,
      });
    }
  } else {
    // Insert new
    db.exec({
      sql: `INSERT INTO _workbook (id, name, description, created_at, updated_at) VALUES ('self', ?, ?, ?, ?)`,
      bind: [name || "Untitled", description || null, now, now],
    });
  }
}

function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
  currentWorkbookId = null;
}

function executeQuery<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[] {
  if (!db) throw new Error("Database not open");

  const results: T[] = [];

  if (params && params.length > 0) {
    db.exec({
      sql,
      bind: params,
      rowMode: "object",
      callback: (row) => {
        results.push(row as T);
      },
    });
  } else {
    db.exec({
      sql,
      rowMode: "object",
      callback: (row) => {
        results.push(row as T);
      },
    });
  }

  return results;
}

function executeMutation(sql: string, params?: unknown[]): void {
  if (!db) throw new Error("Database not open");

  if (params && params.length > 0) {
    db.exec({ sql, bind: params });
  } else {
    db.exec(sql);
  }

  // Notify schema change for DDL
  if (/^\s*(CREATE|DROP|ALTER)\s/i.test(sql)) {
    self.postMessage({ type: "schema-changed" } as WorkerResponse);
  }
}

function getSchema(includeInternal = false): Array<{
  table_name: string;
  columns: Array<{ name: string; type: string; nullable: boolean }>;
}> {
  if (!db) return [];

  const tables: Array<{
    table_name: string;
    columns: Array<{ name: string; type: string; nullable: boolean }>;
  }> = [];

  // Filter out sqlite internals and optionally our internal tables (prefixed with _)
  const filter = includeInternal
    ? "name NOT LIKE 'sqlite_%'"
    : "name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_%' ESCAPE '\\'";

  db.exec({
    sql: `SELECT name FROM sqlite_master WHERE type='table' AND ${filter}`,
    callback: (row) => {
      const tableName = row[0] as string;
      const columns: Array<{ name: string; type: string; nullable: boolean }> = [];

      db!.exec({
        sql: `PRAGMA table_info("${tableName}")`,
        callback: (col) => {
          columns.push({
            name: col[1] as string,
            type: col[2] as string,
            nullable: col[3] === 0,
          });
        },
      });

      tables.push({ table_name: tableName, columns });
    },
  });

  return tables;
}

// ============================================================================
// Message Handler
// ============================================================================

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, type } = e.data;

  try {
    let result: unknown;

    switch (type) {
      case "open":
        result = openDatabase(e.data.workbookId, e.data.name);
        break;

      case "close":
        closeDatabase();
        result = { success: true };
        break;

      case "query":
        result = executeQuery(e.data.sql, e.data.params);
        break;

      case "execute":
        executeMutation(e.data.sql, e.data.params);
        result = { success: true };
        break;

      case "schema":
        result = getSchema();
        break;

      case "getWorkbookMeta":
        result = getWorkbookMeta();
        break;

      case "setWorkbookMeta":
        setWorkbookMeta(e.data.name, e.data.description);
        result = getWorkbookMeta();
        break;

      default:
        throw new Error(`Unknown message type: ${type}`);
    }

    self.postMessage({ id, type: "success", result } as WorkerResponse);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[SQLiteWorker] Error:", error);
    self.postMessage({ id, type: "error", error } as WorkerResponse);
  }
};

// Start initialization
init();
