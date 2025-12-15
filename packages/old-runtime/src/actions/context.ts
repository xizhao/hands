/**
 * Action Context Builder
 *
 * Creates the ActionContext that is passed to action run functions.
 * Provides access to sources, raw SQL, logging, and notifications.
 */

import type { PGlite } from "@electric-sql/pglite";
import type {
  ActionContext,
  ActionLogger,
  ActionNotify,
  ActionRunMeta,
  ActionTriggerType,
  SelectOptions,
  TableClient,
} from "@hands/stdlib";
import type { DiscoveredSource } from "../sources/types.js";

interface BuildContextOptions {
  db: PGlite;
  sources: DiscoveredSource[];
  secrets: Record<string, string>;
  runMeta: ActionRunMeta;
}

/**
 * Build an ActionContext for executing an action
 */
export function buildActionContext(options: BuildContextOptions): ActionContext {
  const { db, sources, secrets, runMeta } = options;

  // Build source proxies
  const sourcesProxy = buildSourcesProxy(db, sources);

  // Build SQL tagged template
  const sql = buildSqlTemplate(db);

  // Build logger
  const log = buildLogger(runMeta.id);

  // Build notify (placeholder for now)
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
 * Provides: ctx.sources.mySource.myTable.select()
 */
function buildSourcesProxy(
  db: PGlite,
  sources: DiscoveredSource[],
): Record<string, Record<string, TableClient>> {
  const proxy: Record<string, Record<string, TableClient>> = {};

  for (const source of sources) {
    proxy[source.id] = {};
    for (const table of source.tables) {
      proxy[source.id][table.name] = buildTableClient(db, table.name);
    }
  }

  return proxy;
}

/**
 * Build a TableClient for a specific table
 */
function buildTableClient<T = Record<string, unknown>>(
  db: PGlite,
  tableName: string,
): TableClient<T> {
  const escapedTable = escapeIdentifier(tableName);

  return {
    async select(opts?: SelectOptions): Promise<T[]> {
      let query = `SELECT * FROM ${escapedTable}`;
      const params: unknown[] = [];

      if (opts?.where) {
        query += ` WHERE ${opts.where}`;
      }
      if (opts?.orderBy) {
        query += ` ORDER BY ${opts.orderBy}`;
      }
      if (opts?.limit) {
        query += ` LIMIT $${params.length + 1}`;
        params.push(opts.limit);
      }
      if (opts?.offset) {
        query += ` OFFSET $${params.length + 1}`;
        params.push(opts.offset);
      }

      const result = await db.query<T>(query, params);
      return result.rows;
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

      const values: unknown[] = [];
      const valuePlaceholders: string[] = [];

      for (const row of rowsArray) {
        const rowValues = columns.map((col) => (row as Record<string, unknown>)[col]);
        const placeholders = rowValues.map((_, i) => `$${values.length + i + 1}`);
        valuePlaceholders.push(`(${placeholders.join(", ")})`);
        values.push(...rowValues);
      }

      const query = `INSERT INTO ${escapedTable} (${escapedColumns}) VALUES ${valuePlaceholders.join(", ")} RETURNING *`;
      const result = await db.query<T>(query, values);
      return result.rows;
    },

    async update(where: string, data: Partial<T>): Promise<T[]> {
      const entries = Object.entries(data as Record<string, unknown>);
      if (entries.length === 0) return [];

      const setClauses = entries.map(([col], i) => `${escapeIdentifier(col)} = $${i + 1}`);
      const values = entries.map(([, val]) => val);

      const query = `UPDATE ${escapedTable} SET ${setClauses.join(", ")} WHERE ${where} RETURNING *`;
      const result = await db.query<T>(query, values);
      return result.rows;
    },

    async delete(where: string): Promise<number> {
      const query = `DELETE FROM ${escapedTable} WHERE ${where}`;
      const result = await db.query(query);
      return result.affectedRows ?? 0;
    },

    async upsert(rows: T | T[], conflictKeys: string[]): Promise<T[]> {
      const rowsArray = Array.isArray(rows) ? rows : [rows];
      if (rowsArray.length === 0) return [];

      const firstRow = rowsArray[0] as Record<string, unknown>;
      const columns = Object.keys(firstRow);
      const escapedColumns = columns.map(escapeIdentifier).join(", ");
      const escapedConflictKeys = conflictKeys.map(escapeIdentifier).join(", ");

      const values: unknown[] = [];
      const valuePlaceholders: string[] = [];

      for (const row of rowsArray) {
        const rowValues = columns.map((col) => (row as Record<string, unknown>)[col]);
        const placeholders = rowValues.map((_, i) => `$${values.length + i + 1}`);
        valuePlaceholders.push(`(${placeholders.join(", ")})`);
        values.push(...rowValues);
      }

      // Build the UPDATE SET clause excluding conflict keys
      const updateColumns = columns.filter((col) => !conflictKeys.includes(col));
      const updateClauses = updateColumns.map(
        (col) => `${escapeIdentifier(col)} = EXCLUDED.${escapeIdentifier(col)}`,
      );

      const query = `
        INSERT INTO ${escapedTable} (${escapedColumns})
        VALUES ${valuePlaceholders.join(", ")}
        ON CONFLICT (${escapedConflictKeys})
        DO UPDATE SET ${updateClauses.join(", ")}
        RETURNING *
      `;

      const result = await db.query<T>(query, values);
      return result.rows;
    },

    async count(where?: string): Promise<number> {
      let query = `SELECT COUNT(*) as count FROM ${escapedTable}`;
      if (where) {
        query += ` WHERE ${where}`;
      }
      const result = await db.query<{ count: string }>(query);
      return parseInt(result.rows[0]?.count ?? "0", 10);
    },
  };
}

/**
 * Build the SQL tagged template function
 */
function buildSqlTemplate(db: PGlite) {
  return async function sql<T = unknown>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]> {
    // Build parameterized query
    let query = strings[0];
    for (let i = 0; i < values.length; i++) {
      query += `$${i + 1}${strings[i + 1]}`;
    }

    const result = await db.query<T>(query, values);
    return result.rows;
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
 * Build the notify object (placeholder implementation)
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
  // Simple escape: wrap in double quotes and escape any internal double quotes
  return `"${identifier.replace(/"/g, '""')}"`;
}

/**
 * Create run metadata
 */
export function createRunMeta(
  runId: string,
  trigger: ActionTriggerType,
  input: unknown,
): ActionRunMeta {
  return {
    id: runId,
    trigger,
    startedAt: new Date(),
    input,
  };
}
