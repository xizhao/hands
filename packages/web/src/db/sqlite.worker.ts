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
  | { id: number; type: "open"; workbookId: string }
  | { id: number; type: "close" }
  | { id: number; type: "query"; sql: string; params?: unknown[] }
  | { id: number; type: "execute"; sql: string; params?: unknown[] }
  | { id: number; type: "schema" };

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

function openDatabase(workbookId: string): void {
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

  currentWorkbookId = workbookId;
  console.log("[SQLiteWorker] Database opened:", workbookId);
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

function getSchema(): Array<{
  table_name: string;
  columns: Array<{ name: string; type: string; nullable: boolean }>;
}> {
  if (!db) return [];

  const tables: Array<{
    table_name: string;
    columns: Array<{ name: string; type: string; nullable: boolean }>;
  }> = [];

  db.exec({
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
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
        openDatabase(e.data.workbookId);
        result = { success: true };
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
