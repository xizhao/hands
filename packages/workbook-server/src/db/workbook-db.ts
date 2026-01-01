/**
 * Workbook Data Database
 *
 * Uses bun:sqlite to access the D1 local database file.
 * The D1 database is created/managed by wrangler via the runtime's vite plugin.
 * Path: {workbook}/.hands/db/v3/d1/{database_name}/{hash}.sqlite
 */

import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Singleton database instances per workbook
const dbInstances = new Map<string, Database>();

/**
 * Find the D1 SQLite database file in the persist state directory.
 * D1 databases are stored at: {persistPath}/v3/d1/{database_name}/{hash}.sqlite
 */
function findD1DatabaseFile(workbookDir: string): string | null {
  const persistPath = join(workbookDir, ".hands", "db");
  const d1Path = join(persistPath, "v3", "d1");

  if (!existsSync(d1Path)) {
    return null;
  }

  // Look for database folders (miniflare uses "miniflare-D1DatabaseObject")
  const dbFolders = readdirSync(d1Path, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  if (dbFolders.length === 0) {
    return null;
  }

  // Use the first database folder (typically "hands-workbook")
  const dbFolder = join(d1Path, dbFolders[0]);

  // Find .sqlite files in the folder
  const sqliteFiles = readdirSync(dbFolder)
    .filter((f) => f.endsWith(".sqlite"));

  if (sqliteFiles.length === 0) {
    return null;
  }

  // If multiple files, use the most recently modified
  if (sqliteFiles.length > 1) {
    sqliteFiles.sort((a, b) => {
      const aPath = join(dbFolder, a);
      const bPath = join(dbFolder, b);
      return statSync(bPath).mtimeMs - statSync(aPath).mtimeMs;
    });
  }

  return join(dbFolder, sqliteFiles[0]);
}

/**
 * Get database for a workbook.
 * Uses the D1 local database file that wrangler/miniflare manages.
 *
 * IMPORTANT: Does NOT create a database - only discovers existing D1 database.
 * The database is created by wrangler when the runtime starts.
 * This prevents race conditions where two different sqlite files exist.
 */
export function getWorkbookDb(workbookDir: string): Database {
  const existing = dbInstances.get(workbookDir);
  if (existing) {
    return existing;
  }

  // Find existing D1 database (created by wrangler)
  const dbPath = findD1DatabaseFile(workbookDir);

  if (!dbPath) {
    throw new Error(
      `[db] D1 database not found at ${workbookDir}/.hands/db/v3/d1/. ` +
      `Start the runtime first to initialize the database.`
    );
  }

  const db = new Database(dbPath);

  // Enable foreign keys
  db.run("PRAGMA foreign_keys = ON");

  console.log(`[db] Connected to D1 database: ${dbPath}`);

  dbInstances.set(workbookDir, db);
  return db;
}

/**
 * Get the path to the D1 database file (for external tools)
 */
export function getD1DatabasePath(workbookDir: string): string | null {
  return findD1DatabaseFile(workbookDir);
}

/**
 * Check if database is initialized for a workbook
 */
export function isDbInitialized(workbookDir: string): boolean {
  return dbInstances.has(workbookDir);
}

/**
 * Close database for a workbook
 */
export function closeWorkbookDb(workbookDir: string): void {
  const db = dbInstances.get(workbookDir);
  if (db) {
    db.close();
    dbInstances.delete(workbookDir);
  }
}

/**
 * Close all open databases
 */
export function closeAllWorkbookDbs(): void {
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

/**
 * Execute a SQL query with parameters
 */
export function executeQuery(db: Database, sql: string, params?: unknown[]): QueryResult {
  const trimmedSql = sql.trim().toUpperCase();
  const isSelect =
    trimmedSql.startsWith("SELECT") ||
    trimmedSql.startsWith("PRAGMA") ||
    trimmedSql.startsWith("WITH") ||
    trimmedSql.startsWith("EXPLAIN");

  if (isSelect) {
    const stmt = params && params.length > 0
      ? db.query(sql).all(...(params as any[]))
      : db.query(sql).all();
    return { rows: stmt as unknown[] };
  } else {
    const stmt = db.prepare(sql);
    const result = params && params.length > 0
      ? stmt.run(...(params as any[]))
      : stmt.run();
    return {
      rows: [],
      changes: result.changes,
      lastInsertRowid: Number(result.lastInsertRowid),
    };
  }
}

/**
 * Get database schema (all tables, columns, and foreign keys)
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
    foreignKeys: Array<{
      column: string;
      referencesTable: string;
      referencesColumn: string;
    }>;
  }>;
} {
  // Get all user tables (excluding sqlite internal and double-underscore prefixed)
  const tables = db.query<{ name: string }, []>(`
    SELECT name FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
      AND name NOT LIKE '_cf_%'
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

    const fks = db.query<{
      id: number;
      seq: number;
      table: string;
      from: string;
      to: string;
    }, []>(`PRAGMA foreign_key_list("${t.name}")`).all();

    return {
      name: t.name,
      columns: columns.map((c) => ({
        name: c.name,
        type: c.type,
        nullable: c.notnull === 0,
        isPrimary: c.pk === 1,
      })),
      foreignKeys: fks.map((fk) => ({
        column: fk.from,
        referencesTable: fk.table,
        referencesColumn: fk.to,
      })),
    };
  });

  return { tables: result };
}
