/**
 * Workbook Data Database
 *
 * Simple SQLite database at .hands/workbook.db
 * No runtime dependency - creates on first access.
 */

import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// Singleton database instances per workbook
const dbInstances = new Map<string, Database>();

/**
 * Get or create workbook database
 */
export function getWorkbookDb(workbookDir: string): Database {
  const existing = dbInstances.get(workbookDir);
  if (existing) {
    return existing;
  }

  const handsDir = join(workbookDir, ".hands");
  const dbPath = join(handsDir, "workbook.db");

  // Ensure .hands directory exists
  if (!existsSync(handsDir)) {
    mkdirSync(handsDir, { recursive: true });
  }

  const db = new Database(dbPath);

  // Enable foreign keys and WAL mode
  db.run("PRAGMA foreign_keys = ON");
  db.run("PRAGMA journal_mode = WAL");

  console.log(`[db] Connected: ${dbPath}`);

  dbInstances.set(workbookDir, db);
  return db;
}

/**
 * Get the database path
 */
export function getWorkbookDbPath(workbookDir: string): string {
  return join(workbookDir, ".hands", "workbook.db");
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
    const rows = params?.length
      ? db.query(sql).all(...(params as any[]))
      : db.query(sql).all();
    return { rows };
  } else {
    const stmt = db.prepare(sql);
    const result = params?.length
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
 * Get database schema
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
  const tables = db.query<{ name: string }, []>(`
    SELECT name FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
      AND name NOT GLOB '__*'
    ORDER BY name
  `).all();

  return {
    tables: tables.map((t) => {
      const columns = db.query<{
        name: string;
        type: string;
        notnull: number;
        pk: number;
      }, []>(`PRAGMA table_info("${t.name}")`).all();

      const fks = db.query<{
        from: string;
        table: string;
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
    }),
  };
}
