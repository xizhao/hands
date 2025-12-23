/**
 * Action Run History
 *
 * Stores and queries action run history in PGlite.
 */

import type { PGlite } from "@electric-sql/pglite";
import type { ActionRun, ActionRunStatus } from "@hands/core/primitives";

const SCHEMA = "hands_admin";
const RUNS_TABLE = `${SCHEMA}.action_runs`;

/**
 * Initialize the action runs table in the hands_admin schema
 */
export async function initActionRunsTable(db: PGlite): Promise<void> {
  // Ensure the hands_admin schema exists
  await db.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);

  await db.query(`
    CREATE TABLE IF NOT EXISTS ${RUNS_TABLE} (
      id TEXT PRIMARY KEY,
      action_id TEXT NOT NULL,
      trigger TEXT NOT NULL,
      status TEXT NOT NULL,
      input JSONB,
      output JSONB,
      error TEXT,
      started_at TIMESTAMPTZ NOT NULL,
      finished_at TIMESTAMPTZ,
      duration_ms INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Create indexes for common queries
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_ha_action_runs_action_id ON ${RUNS_TABLE} (action_id)
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_ha_action_runs_status ON ${RUNS_TABLE} (status)
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_ha_action_runs_started_at ON ${RUNS_TABLE} (started_at DESC)
  `);
}

/**
 * Save a new action run
 */
export async function saveActionRun(db: PGlite, run: ActionRun): Promise<void> {
  await db.query(
    `
    INSERT INTO ${RUNS_TABLE} (
      id, action_id, trigger, status, input, output, error,
      started_at, finished_at, duration_ms
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `,
    [
      run.id,
      run.actionId,
      run.trigger,
      run.status,
      JSON.stringify(run.input),
      run.output ? JSON.stringify(run.output) : null,
      run.error || null,
      run.startedAt,
      run.finishedAt || null,
      run.durationMs || null,
    ],
  );
}

/**
 * Update an existing action run
 */
export async function updateActionRun(db: PGlite, run: ActionRun): Promise<void> {
  await db.query(
    `
    UPDATE ${RUNS_TABLE}
    SET status = $2,
        output = $3,
        error = $4,
        finished_at = $5,
        duration_ms = $6
    WHERE id = $1
    `,
    [
      run.id,
      run.status,
      run.output ? JSON.stringify(run.output) : null,
      run.error || null,
      run.finishedAt || null,
      run.durationMs || null,
    ],
  );
}

/**
 * Get a single run by ID
 */
export async function getActionRun(db: PGlite, runId: string): Promise<ActionRun | null> {
  const result = await db.query<ActionRunRow>(`SELECT * FROM ${RUNS_TABLE} WHERE id = $1`, [runId]);

  if (result.rows.length === 0) {
    return null;
  }

  return rowToRun(result.rows[0]);
}

/**
 * Query action runs
 */
export interface QueryRunsOptions {
  actionId?: string;
  status?: ActionRunStatus;
  limit?: number;
  offset?: number;
}

export async function queryActionRuns(
  db: PGlite,
  options: QueryRunsOptions = {},
): Promise<ActionRun[]> {
  const { actionId, status, limit = 50, offset = 0 } = options;

  let query = `SELECT * FROM ${RUNS_TABLE} WHERE 1=1`;
  const params: unknown[] = [];
  let paramIndex = 1;

  if (actionId) {
    query += ` AND action_id = $${paramIndex++}`;
    params.push(actionId);
  }

  if (status) {
    query += ` AND status = $${paramIndex++}`;
    params.push(status);
  }

  query += ` ORDER BY started_at DESC`;
  query += ` LIMIT $${paramIndex++}`;
  params.push(limit);
  query += ` OFFSET $${paramIndex++}`;
  params.push(offset);

  const result = await db.query<ActionRunRow>(query, params);
  return result.rows.map(rowToRun);
}

/**
 * Get the most recent run for an action
 */
export async function getLastActionRun(db: PGlite, actionId: string): Promise<ActionRun | null> {
  const result = await db.query<ActionRunRow>(
    `SELECT * FROM ${RUNS_TABLE}
     WHERE action_id = $1
     ORDER BY started_at DESC
     LIMIT 1`,
    [actionId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return rowToRun(result.rows[0]);
}

/**
 * Get run statistics for an action
 */
export interface ActionRunStats {
  totalRuns: number;
  successCount: number;
  failedCount: number;
  averageDurationMs: number | null;
  lastRunAt: string | null;
}

export async function getActionRunStats(db: PGlite, actionId: string): Promise<ActionRunStats> {
  const result = await db.query<{
    total_runs: string;
    success_count: string;
    failed_count: string;
    avg_duration_ms: string | null;
    last_run_at: string | null;
  }>(
    `SELECT
      COUNT(*) as total_runs,
      COUNT(*) FILTER (WHERE status = 'success') as success_count,
      COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
      AVG(duration_ms) FILTER (WHERE duration_ms IS NOT NULL) as avg_duration_ms,
      MAX(started_at) as last_run_at
     FROM ${RUNS_TABLE}
     WHERE action_id = $1`,
    [actionId],
  );

  const row = result.rows[0];
  return {
    totalRuns: parseInt(row.total_runs, 10),
    successCount: parseInt(row.success_count, 10),
    failedCount: parseInt(row.failed_count, 10),
    averageDurationMs: row.avg_duration_ms ? parseFloat(row.avg_duration_ms) : null,
    lastRunAt: row.last_run_at,
  };
}

/**
 * Delete old runs (retention policy)
 */
export async function cleanupOldRuns(db: PGlite, retentionDays: number = 30): Promise<number> {
  const result = await db.query(
    `DELETE FROM ${RUNS_TABLE}
     WHERE started_at < NOW() - INTERVAL '${retentionDays} days'`,
  );
  return result.affectedRows ?? 0;
}

// Internal types and helpers

interface ActionRunRow {
  id: string;
  action_id: string;
  trigger: string;
  status: string;
  input: unknown;
  output: unknown;
  error: string | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
}

function rowToRun(row: ActionRunRow): ActionRun {
  return {
    id: row.id,
    actionId: row.action_id,
    trigger: row.trigger as ActionRun["trigger"],
    status: row.status as ActionRunStatus,
    input: row.input,
    output: row.output ?? undefined,
    error: row.error ?? undefined,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? undefined,
    durationMs: row.duration_ms ?? undefined,
  };
}
