/**
 * Workbook Data Database
 *
 * SQLite database for user data (tables created via LiveValue queries).
 * Uses the same database as the runtime (wrangler's Durable Object storage).
 *
 * Database location (in order of precedence):
 * 1. Runtime DO database: .hands/db/v3/do/runtime-Database/*.sqlite
 * 2. Fallback: .hands/workbook.db
 */

import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readdirSync, renameSync } from "node:fs";
import { join } from "node:path";

// Singleton database instances per workbook
const dbInstances = new Map<string, Database>();

/**
 * Find the runtime's Durable Object SQLite database
 * Wrangler stores DO data in: .hands/db/v3/do/{namespace}-Database/{hash}.sqlite
 */
function findRuntimeDbPath(workbookDir: string): string | null {
  const doDir = join(workbookDir, ".hands/db/v3/do");

  if (!existsSync(doDir)) {
    return null;
  }

  // Look for runtime-Database or any *-Database directory
  try {
    const entries = readdirSync(doDir);
    for (const entry of entries) {
      if (entry.endsWith("-Database")) {
        const dbDir = join(doDir, entry);
        const files = readdirSync(dbDir);
        const sqliteFile = files.find(f => f.endsWith(".sqlite"));
        if (sqliteFile) {
          return join(dbDir, sqliteFile);
        }
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return null;
}

/**
 * Get or create workbook database
 * Prefers the runtime's DO database if it exists
 */
export function getWorkbookDb(workbookDir: string): Database {
  const existing = dbInstances.get(workbookDir);
  if (existing) {
    return existing;
  }

  const handsDir = join(workbookDir, ".hands");

  // First, try to find runtime's DO database
  const runtimeDbPath = findRuntimeDbPath(workbookDir);
  const dbPath = runtimeDbPath ?? join(handsDir, "workbook.db");

  if (runtimeDbPath) {
    console.log(`[db] Using runtime DO database: ${runtimeDbPath}`);
  }

  // Ensure .hands directory exists (for fallback)
  if (!existsSync(handsDir)) {
    mkdirSync(handsDir, { recursive: true });
  }

  // Open or create database
  const db = new Database(dbPath);

  // Enable foreign keys and WAL mode for better concurrency
  db.run("PRAGMA foreign_keys = ON");
  db.run("PRAGMA journal_mode = WAL");

  // Run integrity check
  const integrityResult = db.query<{ integrity_check: string }, []>(
    "PRAGMA integrity_check"
  ).get();

  if (integrityResult?.integrity_check !== "ok") {
    console.error(`Workbook database corrupted: ${integrityResult?.integrity_check}`);
    db.close();

    // Backup corrupt file
    const timestamp = Date.now();
    const backupPath = join(handsDir, `workbook.db.corrupt.${timestamp}`);
    renameSync(dbPath, backupPath);
    console.log(`Backed up corrupt database to: ${backupPath}`);

    // Create fresh database
    const freshDb = new Database(dbPath);
    freshDb.run("PRAGMA foreign_keys = ON");
    freshDb.run("PRAGMA journal_mode = WAL");
    dbInstances.set(workbookDir, freshDb);
    return freshDb;
  }

  dbInstances.set(workbookDir, db);
  return db;
}

/**
 * Close database for a workbook
 */
export function closeWorkbookDb(workbookDir: string) {
  const db = dbInstances.get(workbookDir);
  if (db) {
    db.close();
    dbInstances.delete(workbookDir);
  }
}

/**
 * Close all open databases
 */
export function closeAllWorkbookDbs() {
  for (const [, db] of dbInstances) {
    db.close();
  }
  dbInstances.clear();
}

/**
 * Query result type
 */
export interface QueryResult {
  rows: unknown[];
  changes?: number;
  lastInsertRowid?: number;
}

// SQLite binding types
type SQLQueryBindings = string | number | bigint | boolean | null | Uint8Array;

/**
 * Execute a SQL query with parameters
 */
export function executeQuery(
  db: Database,
  sql: string,
  params?: unknown[]
): QueryResult {
  const trimmedSql = sql.trim().toUpperCase();
  const isSelect = trimmedSql.startsWith("SELECT") ||
                   trimmedSql.startsWith("PRAGMA") ||
                   trimmedSql.startsWith("WITH") ||
                   trimmedSql.startsWith("EXPLAIN");

  // Cast params to SQLite binding types
  const safeParams = (params || []) as SQLQueryBindings[];

  if (isSelect) {
    // SELECT query - return rows
    const stmt = db.query(sql);
    const rows = safeParams.length > 0 ? stmt.all(...safeParams) : stmt.all();
    return { rows };
  } else {
    // DML/DDL query - execute and return affected rows
    const stmt = db.query(sql);
    if (safeParams.length > 0) {
      stmt.run(...safeParams);
    } else {
      stmt.run();
    }

    // Get changes and last insert rowid
    const changesResult = db.query<{ changes: number }, []>("SELECT changes() as changes").get();
    const rowidResult = db.query<{ rowid: number }, []>("SELECT last_insert_rowid() as rowid").get();

    return {
      rows: [],
      changes: changesResult?.changes,
      lastInsertRowid: rowidResult?.rowid,
    };
  }
}

/**
 * Get database schema (all tables and their columns)
 */
export function getSchema(db: Database): {
  tables: Array<{
    name: string;
    columns: Array<{
      name: string;
      type: string;
      nullable: boolean;
      isPrimary: boolean;
    }>;
  }>;
} {
  // Get all user tables (excluding sqlite internal and double-underscore prefixed)
  const tables = db.query<{ name: string }, []>(`
    SELECT name FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
      AND name NOT GLOB '__*'
    ORDER BY name
  `).all();

  const result = tables.map((t) => {
    const columns = db.query<{
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }, []>(`PRAGMA table_info("${t.name}")`).all();

    return {
      name: t.name,
      columns: columns.map((c) => ({
        name: c.name,
        type: c.type,
        nullable: c.notnull === 0,
        isPrimary: c.pk === 1,
      })),
    };
  });

  return { tables: result };
}
