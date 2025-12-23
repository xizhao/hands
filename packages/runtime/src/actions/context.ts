/**
 * Action Context Builder (Direct DB)
 *
 * Creates ActionContext with direct database access via Kysely.
 * Used when runtime executes actions (not HTTP proxying).
 */

import type {
  ActionContext,
  ActionLogger,
  ActionNotify,
  ActionRunMeta,
  ActionTriggerType,
  SelectOptions,
  TableClient,
} from "../types/action";
import { getDb, kyselySql, runWithDbMode } from "../db/dev";

interface BuildContextOptions {
  tables: Array<{ name: string; source?: string }>;
  secrets: Record<string, string>;
  runMeta: ActionRunMeta;
}

/**
 * Build an ActionContext with direct DB access
 */
export function buildActionContext(options: BuildContextOptions): ActionContext {
  const { tables, secrets, runMeta } = options;

  // Build source proxies (group tables by source)
  const sourcesProxy = buildSourcesProxy(tables);

  // Build SQL tagged template
  const sql = buildSqlTemplate();

  // Build logger
  const log = buildLogger(runMeta.id);

  // Build notify
  const notify = buildNotify();

  return {
    sources: sourcesProxy,
    sql,
    log,
    notify,
    secrets,
    run: runMeta,
  };
}

/**
 * Build the sources proxy object
 * Groups tables by source name (default: "main")
 */
function buildSourcesProxy(
  tables: Array<{ name: string; source?: string }>
): Record<string, Record<string, TableClient>> {
  const proxy: Record<string, Record<string, TableClient>> = {};

  for (const table of tables) {
    const sourceName = table.source ?? "main";
    if (!proxy[sourceName]) {
      proxy[sourceName] = {};
    }
    proxy[sourceName][table.name] = buildTableClient(table.name);
  }

  return proxy;
}

/**
 * Build a TableClient with direct DB access
 */
function buildTableClient<T = Record<string, unknown>>(
  tableName: string
): TableClient<T> {
  const db = getDb();
  const escapedTable = escapeIdentifier(tableName);

  return {
    async select(opts?: SelectOptions): Promise<T[]> {
      let query = `SELECT * FROM ${escapedTable}`;

      if (opts?.where) {
        query += ` WHERE ${opts.where}`;
      }
      if (opts?.orderBy) {
        query += ` ORDER BY ${opts.orderBy}`;
      }
      if (opts?.limit) {
        query += ` LIMIT ${opts.limit}`;
      }
      if (opts?.offset) {
        query += ` OFFSET ${opts.offset}`;
      }

      const result = await runWithDbMode("action", async () => {
        return kyselySql.raw<T>(query).execute(db);
      });
      return result.rows as T[];
    },

    async selectOne(opts?: SelectOptions): Promise<T | null> {
      const rows = await this.select({ ...opts, limit: 1 });
      return rows[0] ?? null;
    },

    async insert(rows: T | T[]): Promise<T[]> {
      const rowsArray = Array.isArray(rows) ? rows : [rows];
      if (rowsArray.length === 0) return [];

      const firstRow = rowsArray[0] as Record<string, unknown>;
      const columns = Object.keys(firstRow);
      const escapedColumns = columns.map(escapeIdentifier).join(", ");

      const valuePlaceholders: string[] = [];

      for (const row of rowsArray) {
        const rowValues = columns.map((col) => {
          const val = (row as Record<string, unknown>)[col];
          return escapeValue(val);
        });
        valuePlaceholders.push(`(${rowValues.join(", ")})`);
      }

      const query = `INSERT INTO ${escapedTable} (${escapedColumns}) VALUES ${valuePlaceholders.join(", ")} RETURNING *`;

      const result = await runWithDbMode("action", async () => {
        return kyselySql.raw<T>(query).execute(db);
      });
      return result.rows as T[];
    },

    async update(where: string, data: Partial<T>): Promise<T[]> {
      const entries = Object.entries(data as Record<string, unknown>);
      if (entries.length === 0) return [];

      const setClauses = entries.map(
        ([col, val]) => `${escapeIdentifier(col)} = ${escapeValue(val)}`
      );

      const query = `UPDATE ${escapedTable} SET ${setClauses.join(", ")} WHERE ${where} RETURNING *`;

      const result = await runWithDbMode("action", async () => {
        return kyselySql.raw<T>(query).execute(db);
      });
      return result.rows as T[];
    },

    async delete(where: string): Promise<number> {
      const query = `DELETE FROM ${escapedTable} WHERE ${where}`;

      const result = await runWithDbMode("action", async () => {
        return kyselySql.raw(query).execute(db);
      });
      return Number((result as { numAffectedRows?: bigint }).numAffectedRows ?? 0);
    },

    async upsert(rows: T | T[], conflictKeys: string[]): Promise<T[]> {
      const rowsArray = Array.isArray(rows) ? rows : [rows];
      if (rowsArray.length === 0) return [];

      const firstRow = rowsArray[0] as Record<string, unknown>;
      const columns = Object.keys(firstRow);
      const escapedColumns = columns.map(escapeIdentifier).join(", ");
      const escapedConflictKeys = conflictKeys.map(escapeIdentifier).join(", ");

      const valuePlaceholders: string[] = [];

      for (const row of rowsArray) {
        const rowValues = columns.map((col) => {
          const val = (row as Record<string, unknown>)[col];
          return escapeValue(val);
        });
        valuePlaceholders.push(`(${rowValues.join(", ")})`);
      }

      // Build the UPDATE SET clause excluding conflict keys
      const updateColumns = columns.filter((col) => !conflictKeys.includes(col));
      const updateClauses = updateColumns.map(
        (col) => `${escapeIdentifier(col)} = EXCLUDED.${escapeIdentifier(col)}`
      );

      const query = `
        INSERT INTO ${escapedTable} (${escapedColumns})
        VALUES ${valuePlaceholders.join(", ")}
        ON CONFLICT (${escapedConflictKeys})
        DO UPDATE SET ${updateClauses.join(", ")}
        RETURNING *
      `;

      const result = await runWithDbMode("action", async () => {
        return kyselySql.raw<T>(query).execute(db);
      });
      return result.rows as T[];
    },

    async count(where?: string): Promise<number> {
      let query = `SELECT COUNT(*) as count FROM ${escapedTable}`;
      if (where) {
        query += ` WHERE ${where}`;
      }

      const result = await runWithDbMode("action", async () => {
        return kyselySql.raw<{ count: number }>(query).execute(db);
      });
      return result.rows[0]?.count ?? 0;
    },
  };
}

/**
 * Build the SQL tagged template function with direct DB access
 */
function buildSqlTemplate() {
  return async function sql<T = unknown>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]> {
    const db = getDb();

    // Build query with escaped values
    let query = strings[0];
    for (let i = 0; i < values.length; i++) {
      query += escapeValue(values[i]) + strings[i + 1];
    }

    const result = await runWithDbMode("action", async () => {
      return kyselySql.raw<T>(query).execute(db);
    });
    return result.rows as T[];
  };
}

/**
 * Build the logger
 */
function buildLogger(runId: string): ActionLogger {
  const prefix = `[action:${runId}]`;

  return {
    debug: (msg: string, meta?: unknown) => {
      console.debug(prefix, msg, meta !== undefined ? meta : "");
    },
    info: (msg: string, meta?: unknown) => {
      console.info(prefix, msg, meta !== undefined ? meta : "");
    },
    warn: (msg: string, meta?: unknown) => {
      console.warn(prefix, msg, meta !== undefined ? meta : "");
    },
    error: (msg: string, meta?: unknown) => {
      console.error(prefix, msg, meta !== undefined ? meta : "");
    },
  };
}

/**
 * Build the notify object
 */
function buildNotify(): ActionNotify {
  return {
    slack: async (_channel: string, _message: string) => {
      console.warn("[notify] Slack integration not configured");
    },
    email: async (_to: string, _subject: string, _body: string) => {
      console.warn("[notify] Email integration not configured");
    },
    webhook: async (url: string, payload: unknown) => {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return response;
    },
  };
}

/**
 * Escape a SQL identifier (table/column name)
 */
function escapeIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

/**
 * Escape a SQL value
 */
function escapeValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }
  if (value instanceof Date) {
    return `'${value.toISOString()}'`;
  }
  if (typeof value === "object") {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  }
  // String - escape single quotes
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Create run metadata
 */
export function createRunMeta(
  runId: string,
  trigger: ActionTriggerType,
  input: unknown
): ActionRunMeta {
  return {
    id: runId,
    trigger,
    startedAt: new Date(),
    input,
  };
}
