/**
 * Data Sync Manager
 *
 * Manages syncing data from 1000s of remote sources into local PostgreSQL.
 * Optimized for high concurrency and efficient bulk operations.
 */

import type {
  DataSource,
  SyncResult,
  SyncProgress,
  BulkSyncResult,
} from "./sync-types";
import type { PostgresPool } from "./connection";

// Internal schema for Hands infrastructure (hidden from user)
const INTERNAL_SCHEMA = "_hands";
const SOURCES_TABLE = `${INTERNAL_SCHEMA}._sync_sources`;
const SECRETS_TABLE = `${INTERNAL_SCHEMA}._sync_secrets`;
const SYNC_LOG_TABLE = `${INTERNAL_SCHEMA}._sync_log`;

export class SyncManager {
  private pool: PostgresPool;
  private progressListeners = new Set<(progress: SyncProgress) => void>();
  private activeSyncs = new Map<string, AbortController>();
  private scheduledJobs = new Map<string, ReturnType<typeof setInterval>>();

  constructor(pool: PostgresPool) {
    this.pool = pool;
  }

  /**
   * Initialize sync tables if they don't exist
   */
  async init(): Promise<void> {
    // Create internal schema (hidden from default user)
    await this.pool.query(`CREATE SCHEMA IF NOT EXISTS ${INTERNAL_SCHEMA}`);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${SOURCES_TABLE} (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        format TEXT NOT NULL,
        url TEXT NOT NULL,
        target_table TEXT NOT NULL,
        target_schema TEXT DEFAULT 'public',
        mode TEXT NOT NULL DEFAULT 'full',
        primary_key TEXT[],
        schedule TEXT,
        auth_type TEXT DEFAULT 'none',
        auth_header_name TEXT,
        transform_sql TEXT,
        enabled BOOLEAN DEFAULT true,
        last_sync_at TIMESTAMPTZ,
        last_sync_status TEXT,
        last_sync_error TEXT,
        last_sync_row_count INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ${SECRETS_TABLE} (
        source_id TEXT PRIMARY KEY REFERENCES ${SOURCES_TABLE}(id) ON DELETE CASCADE,
        secret TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ${SYNC_LOG_TABLE} (
        id SERIAL PRIMARY KEY,
        source_id TEXT NOT NULL REFERENCES ${SOURCES_TABLE}(id) ON DELETE CASCADE,
        started_at TIMESTAMPTZ NOT NULL,
        finished_at TIMESTAMPTZ,
        status TEXT,
        row_count INTEGER,
        error TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_sync_log_source ON ${SYNC_LOG_TABLE}(source_id, started_at DESC);
    `);
  }

  /**
   * Add a new data source
   */
  async addSource(source: Omit<DataSource, "createdAt" | "updatedAt">, secret?: string): Promise<DataSource> {
    const now = Date.now();
    const id = source.id || crypto.randomUUID();

    await this.pool.query(`
      INSERT INTO ${SOURCES_TABLE} (
        id, name, description, format, url, target_table, target_schema,
        mode, primary_key, schedule, auth_type, auth_header_name,
        transform_sql, enabled, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
      )
    `, [
      id,
      source.name,
      source.description || null,
      source.format,
      source.url,
      source.targetTable,
      source.targetSchema || "public",
      source.mode,
      source.primaryKey || null,
      source.schedule || null,
      source.auth?.type || "none",
      source.auth?.headerName || null,
      source.transformSql || null,
      source.enabled,
      new Date(now),
      new Date(now),
    ]);

    if (secret) {
      await this.pool.query(
        `INSERT INTO ${SECRETS_TABLE} (source_id, secret) VALUES ($1, $2)`,
        [id, secret]
      );
    }

    // Start scheduled job if applicable
    if (source.schedule && source.enabled) {
      this.scheduleSource(id, source.schedule);
    }

    return {
      ...source,
      id,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Get all data sources
   */
  async getSources(): Promise<DataSource[]> {
    const result = await this.pool.query(`SELECT * FROM ${SOURCES_TABLE} ORDER BY name`);
    return result.rows.map(this.rowToSource);
  }

  /**
   * Get a single source by ID
   */
  async getSource(id: string): Promise<DataSource | null> {
    const result = await this.pool.query(
      `SELECT * FROM ${SOURCES_TABLE} WHERE id = $1`,
      [id]
    );
    return result.rows[0] ? this.rowToSource(result.rows[0]) : null;
  }

  /**
   * Update a source
   */
  async updateSource(id: string, updates: Partial<DataSource>, secret?: string): Promise<DataSource | null> {
    const existing = await this.getSource(id);
    if (!existing) return null;

    const updated = { ...existing, ...updates, updatedAt: Date.now() };

    await this.pool.query(`
      UPDATE ${SOURCES_TABLE} SET
        name = $2, description = $3, format = $4, url = $5,
        target_table = $6, target_schema = $7, mode = $8,
        primary_key = $9, schedule = $10, auth_type = $11,
        auth_header_name = $12, transform_sql = $13, enabled = $14,
        updated_at = $15
      WHERE id = $1
    `, [
      id,
      updated.name,
      updated.description,
      updated.format,
      updated.url,
      updated.targetTable,
      updated.targetSchema,
      updated.mode,
      updated.primaryKey,
      updated.schedule,
      updated.auth?.type || "none",
      updated.auth?.headerName,
      updated.transformSql,
      updated.enabled,
      new Date(updated.updatedAt),
    ]);

    if (secret !== undefined) {
      await this.pool.query(
        `INSERT INTO ${SECRETS_TABLE} (source_id, secret)
         VALUES ($1, $2)
         ON CONFLICT (source_id) DO UPDATE SET secret = $2`,
        [id, secret]
      );
    }

    // Update scheduled job
    this.unscheduleSource(id);
    if (updated.schedule && updated.enabled) {
      this.scheduleSource(id, updated.schedule);
    }

    return updated;
  }

  /**
   * Delete a source
   */
  async deleteSource(id: string): Promise<boolean> {
    this.unscheduleSource(id);
    const result = await this.pool.query(
      `DELETE FROM ${SOURCES_TABLE} WHERE id = $1`,
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Sync a single source
   */
  async syncSource(sourceId: string): Promise<SyncResult> {
    const startTime = Date.now();
    const source = await this.getSource(sourceId);

    if (!source) {
      return {
        sourceId,
        success: false,
        rowCount: 0,
        duration: 0,
        error: "Source not found",
        timestamp: startTime,
      };
    }

    // Check if already syncing
    if (this.activeSyncs.has(sourceId)) {
      return {
        sourceId,
        success: false,
        rowCount: 0,
        duration: 0,
        error: "Sync already in progress",
        timestamp: startTime,
      };
    }

    const abortController = new AbortController();
    this.activeSyncs.set(sourceId, abortController);

    // Log sync start
    const logResult = await this.pool.query(
      `INSERT INTO ${SYNC_LOG_TABLE} (source_id, started_at) VALUES ($1, $2) RETURNING id`,
      [sourceId, new Date(startTime)]
    );
    const logId = logResult.rows[0]?.id;

    try {
      this.emitProgress({ sourceId, phase: "connecting" });

      // Get secret if needed
      let secret: string | undefined;
      if (source.auth?.type && source.auth.type !== "none") {
        const secretResult = await this.pool.query(
          `SELECT secret FROM ${SECRETS_TABLE} WHERE source_id = $1`,
          [sourceId]
        );
        secret = secretResult.rows[0]?.secret;
      }

      this.emitProgress({ sourceId, phase: "fetching" });

      // Fetch data based on format
      const data = await this.fetchData(source, secret, abortController.signal);

      if (abortController.signal.aborted) {
        throw new Error("Sync cancelled");
      }

      this.emitProgress({ sourceId, phase: "transforming" });

      // Apply transform if specified
      const transformed = source.transformSql
        ? await this.applyTransform(data, source.transformSql)
        : data;

      this.emitProgress({ sourceId, phase: "loading", progress: 0 });

      // Load into target table
      const rowCount = await this.loadData(source, transformed, (progress) => {
        this.emitProgress({ sourceId, phase: "loading", progress });
      });

      const duration = Date.now() - startTime;

      // Update source status
      await this.pool.query(`
        UPDATE ${SOURCES_TABLE} SET
          last_sync_at = $2, last_sync_status = 'success',
          last_sync_error = NULL, last_sync_row_count = $3
        WHERE id = $1
      `, [sourceId, new Date(), rowCount]);

      // Update log
      await this.pool.query(`
        UPDATE ${SYNC_LOG_TABLE} SET
          finished_at = $2, status = 'success', row_count = $3
        WHERE id = $1
      `, [logId, new Date(), rowCount]);

      this.emitProgress({ sourceId, phase: "done", progress: 100 });

      return {
        sourceId,
        success: true,
        rowCount,
        duration,
        timestamp: startTime,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Update source status
      await this.pool.query(`
        UPDATE ${SOURCES_TABLE} SET
          last_sync_at = $2, last_sync_status = 'error', last_sync_error = $3
        WHERE id = $1
      `, [sourceId, new Date(), errorMessage]);

      // Update log
      await this.pool.query(`
        UPDATE ${SYNC_LOG_TABLE} SET
          finished_at = $2, status = 'error', error = $3
        WHERE id = $1
      `, [logId, new Date(), errorMessage]);

      this.emitProgress({ sourceId, phase: "error", message: errorMessage });

      return {
        sourceId,
        success: false,
        rowCount: 0,
        duration,
        error: errorMessage,
        timestamp: startTime,
      };
    } finally {
      this.activeSyncs.delete(sourceId);
    }
  }

  /**
   * Sync multiple sources in parallel (with concurrency limit)
   */
  async syncSources(sourceIds: string[], concurrency = 10): Promise<BulkSyncResult> {
    const startTime = Date.now();
    const results: SyncResult[] = [];

    // Process in batches
    for (let i = 0; i < sourceIds.length; i += concurrency) {
      const batch = sourceIds.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map((id) => this.syncSource(id))
      );
      results.push(...batchResults);
    }

    const successful = results.filter((r) => r.success).length;

    return {
      total: sourceIds.length,
      successful,
      failed: sourceIds.length - successful,
      results,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Sync all enabled sources
   */
  async syncAll(concurrency = 10): Promise<BulkSyncResult> {
    const sources = await this.getSources();
    const enabledIds = sources.filter((s) => s.enabled).map((s) => s.id);
    return this.syncSources(enabledIds, concurrency);
  }

  /**
   * Cancel an in-progress sync
   */
  cancelSync(sourceId: string): boolean {
    const controller = this.activeSyncs.get(sourceId);
    if (controller) {
      controller.abort();
      return true;
    }
    return false;
  }

  /**
   * Subscribe to sync progress updates
   */
  onProgress(listener: (progress: SyncProgress) => void): () => void {
    this.progressListeners.add(listener);
    return () => this.progressListeners.delete(listener);
  }

  /**
   * Get sync history for a source
   */
  async getSyncHistory(sourceId: string, limit = 50): Promise<Array<{
    startedAt: Date;
    finishedAt: Date | null;
    status: string;
    rowCount: number | null;
    error: string | null;
  }>> {
    const result = await this.pool.query(`
      SELECT started_at, finished_at, status, row_count, error
      FROM ${SYNC_LOG_TABLE}
      WHERE source_id = $1
      ORDER BY started_at DESC
      LIMIT $2
    `, [sourceId, limit]);

    return result.rows.map((row: Record<string, unknown>) => ({
      startedAt: row.started_at as Date,
      finishedAt: row.finished_at as Date | null,
      status: row.status as string,
      rowCount: row.row_count as number | null,
      error: row.error as string | null,
    }));
  }

  /**
   * Start all scheduled syncs
   */
  startScheduler(): void {
    this.getSources().then((sources) => {
      for (const source of sources) {
        if (source.schedule && source.enabled) {
          this.scheduleSource(source.id, source.schedule);
        }
      }
    });
  }

  /**
   * Stop all scheduled syncs
   */
  stopScheduler(): void {
    for (const [id] of this.scheduledJobs) {
      this.unscheduleSource(id);
    }
  }

  // Private helpers

  private rowToSource(row: Record<string, unknown>): DataSource {
    return {
      id: row.id as string,
      name: row.name as string,
      description: row.description as string | undefined,
      format: row.format as DataSource["format"],
      url: row.url as string,
      targetTable: row.target_table as string,
      targetSchema: row.target_schema as string,
      mode: row.mode as DataSource["mode"],
      primaryKey: row.primary_key as string[] | undefined,
      schedule: row.schedule as string | undefined,
      auth: row.auth_type !== "none" ? {
        type: row.auth_type as DataSource["auth"]["type"],
        headerName: row.auth_header_name as string | undefined,
      } : undefined,
      transformSql: row.transform_sql as string | undefined,
      enabled: row.enabled as boolean,
      lastSyncAt: row.last_sync_at ? new Date(row.last_sync_at as string).getTime() : undefined,
      lastSyncStatus: row.last_sync_status as DataSource["lastSyncStatus"],
      lastSyncError: row.last_sync_error as string | undefined,
      lastSyncRowCount: row.last_sync_row_count as number | undefined,
      createdAt: new Date(row.created_at as string).getTime(),
      updatedAt: new Date(row.updated_at as string).getTime(),
    };
  }

  private emitProgress(progress: SyncProgress): void {
    for (const listener of this.progressListeners) {
      listener(progress);
    }
  }

  private async fetchData(
    source: DataSource,
    secret: string | undefined,
    signal: AbortSignal
  ): Promise<unknown[]> {
    const headers: Record<string, string> = {};

    if (source.auth?.type === "bearer" && secret) {
      headers["Authorization"] = `Bearer ${secret}`;
    } else if (source.auth?.type === "basic" && secret) {
      headers["Authorization"] = `Basic ${btoa(secret)}`;
    } else if (source.auth?.type === "api-key" && secret && source.auth.headerName) {
      headers[source.auth.headerName] = secret;
    }

    switch (source.format) {
      case "json":
      case "http-json": {
        const response = await fetch(source.url, { headers, signal });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        return Array.isArray(data) ? data : [data];
      }

      case "csv": {
        const response = await fetch(source.url, { headers, signal });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const text = await response.text();
        return this.parseCSV(text);
      }

      case "parquet": {
        // Use DuckDB to read parquet and convert to JSON
        // This requires duckdb to be available
        throw new Error("Parquet sync not yet implemented - requires DuckDB integration");
      }

      case "postgres": {
        // Direct postgres-to-postgres copy
        throw new Error("Postgres-to-postgres sync not yet implemented");
      }

      case "electric": {
        // Electric SQL shape sync
        // Parse shape URL and sync via Electric protocol
        throw new Error("Electric sync not yet implemented");
      }

      default:
        throw new Error(`Unsupported format: ${source.format}`);
    }
  }

  private parseCSV(text: string): Record<string, string>[] {
    const lines = text.trim().split("\n");
    if (lines.length < 2) return [];

    const headers = this.parseCSVLine(lines[0]);
    const rows: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      const row: Record<string, string> = {};
      for (let j = 0; j < headers.length; j++) {
        row[headers[j]] = values[j] || "";
      }
      rows.push(row);
    }

    return rows;
  }

  private parseCSVLine(line: string): string[] {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    return values;
  }

  private async applyTransform(data: unknown[], sql: string): Promise<unknown[]> {
    // Create temp table, load data, run transform SQL, return results
    const tempTable = `_sync_temp_${Date.now()}`;

    if (data.length === 0) return [];

    // Infer schema from first row
    const firstRow = data[0] as Record<string, unknown>;
    const columns = Object.keys(firstRow);
    const columnDefs = columns.map((col) => {
      const value = firstRow[col];
      const type = typeof value === "number" ? "DOUBLE PRECISION"
        : typeof value === "boolean" ? "BOOLEAN"
        : "TEXT";
      return `"${col}" ${type}`;
    }).join(", ");

    await this.pool.query(`CREATE TEMP TABLE ${tempTable} (${columnDefs})`);

    // Insert data
    for (const row of data) {
      const r = row as Record<string, unknown>;
      const values = columns.map((col) => r[col]);
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
      await this.pool.query(
        `INSERT INTO ${tempTable} VALUES (${placeholders})`,
        values
      );
    }

    // Run transform (replace __TABLE__ placeholder with temp table name)
    const transformedSql = sql.replace(/__TABLE__/g, tempTable);
    const result = await this.pool.query(transformedSql);

    // Cleanup
    await this.pool.query(`DROP TABLE ${tempTable}`);

    return result.rows;
  }

  private async loadData(
    source: DataSource,
    data: unknown[],
    onProgress: (progress: number) => void
  ): Promise<number> {
    if (data.length === 0) return 0;

    const schema = source.targetSchema || "public";
    const table = source.targetTable;
    const fullTable = `"${schema}"."${table}"`;

    // Get column info from first row
    const firstRow = data[0] as Record<string, unknown>;
    const columns = Object.keys(firstRow);
    const quotedColumns = columns.map((c) => `"${c}"`).join(", ");
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");

    // Create table if it doesn't exist
    const columnDefs = columns.map((col) => {
      const value = firstRow[col];
      const type = typeof value === "number" ? "DOUBLE PRECISION"
        : typeof value === "boolean" ? "BOOLEAN"
        : "TEXT";
      return `"${col}" ${type}`;
    }).join(", ");

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${fullTable} (${columnDefs})
    `);

    // Handle different sync modes
    if (source.mode === "full") {
      // Truncate and reload
      await this.pool.query(`TRUNCATE TABLE ${fullTable}`);
    }

    // Batch insert for efficiency
    const batchSize = 1000;
    let loaded = 0;

    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);

      if (source.mode === "incremental" && source.primaryKey?.length) {
        // Upsert
        const pkColumns = source.primaryKey.map((c) => `"${c}"`).join(", ");
        const updateSet = columns
          .filter((c) => !source.primaryKey?.includes(c))
          .map((c) => `"${c}" = EXCLUDED."${c}"`)
          .join(", ");

        for (const row of batch) {
          const r = row as Record<string, unknown>;
          const values = columns.map((col) => r[col]);

          const upsertSql = updateSet
            ? `INSERT INTO ${fullTable} (${quotedColumns}) VALUES (${placeholders})
               ON CONFLICT (${pkColumns}) DO UPDATE SET ${updateSet}`
            : `INSERT INTO ${fullTable} (${quotedColumns}) VALUES (${placeholders})
               ON CONFLICT (${pkColumns}) DO NOTHING`;

          await this.pool.query(upsertSql, values);
        }
      } else {
        // Simple insert
        for (const row of batch) {
          const r = row as Record<string, unknown>;
          const values = columns.map((col) => r[col]);
          await this.pool.query(
            `INSERT INTO ${fullTable} (${quotedColumns}) VALUES (${placeholders})`,
            values
          );
        }
      }

      loaded += batch.length;
      onProgress(Math.round((loaded / data.length) * 100));
    }

    return loaded;
  }

  private scheduleSource(id: string, cronExpr: string): void {
    // Simple interval-based scheduling (cron parsing would need a library)
    // For now, support simple intervals: "every 5m", "every 1h", "every 1d"
    const match = cronExpr.match(/^every\s+(\d+)\s*(m|h|d)$/i);
    if (!match) {
      console.warn(`Invalid schedule expression: ${cronExpr}`);
      return;
    }

    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    const ms = unit === "m" ? value * 60 * 1000
      : unit === "h" ? value * 60 * 60 * 1000
      : value * 24 * 60 * 60 * 1000;

    const job = setInterval(() => {
      this.syncSource(id).catch(console.error);
    }, ms);

    this.scheduledJobs.set(id, job);
  }

  private unscheduleSource(id: string): void {
    const job = this.scheduledJobs.get(id);
    if (job) {
      clearInterval(job);
      this.scheduledJobs.delete(id);
    }
  }
}
