/**
 * Postgres routes - /postgres/*
 */

import type { Router } from "../router";
import { json, sse } from "../router";
import type { RuntimeState } from "../state";
import { createChangesStream, PostgresPool } from "../db";
import { updateLockfile } from "../lockfile";

export function registerPostgresRoutes(router: Router, getState: () => RuntimeState | null): void {
  // POST /postgres/query - Execute SQL
  router.post("/postgres/query", async (req) => {
    const state = getState();
    if (!state) {
      return json({ error: "Not initialized" }, { status: 500 });
    }

    const body = (await req.json()) as { query: string };
    const result = await state.pool.query(body.query);
    return json(result);
  });

  // GET /postgres/changes - SSE stream for database changes
  router.get("/postgres/changes", (req) => {
    const state = getState();
    if (!state) {
      return json({ error: "Not initialized" }, { status: 500 });
    }

    const stream = createChangesStream(state.listener, req.signal);
    return sse(stream);
  });

  // GET /postgres/tables - List all tables with metadata
  router.get("/postgres/tables", async () => {
    const state = getState();
    if (!state) {
      return json({ error: "Not initialized" }, { status: 500 });
    }

    const result = await state.pool.query(`
      SELECT
        t.table_name as name,
        (SELECT COUNT(*)::int FROM information_schema.columns c
         WHERE c.table_schema = t.table_schema AND c.table_name = t.table_name) as column_count,
        pg_total_relation_size(quote_ident(t.table_schema) || '.' || quote_ident(t.table_name))::bigint as size_bytes
      FROM information_schema.tables t
      WHERE t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_name
    `);

    return json(result.rows);
  });

  // GET /postgres/tables/:name/columns - Get table columns
  router.get("/postgres/tables/:name/columns", async (_req, ctx) => {
    const state = getState();
    if (!state) {
      return json({ error: "Not initialized" }, { status: 500 });
    }

    const tableName = ctx.params.name;

    // Validate table exists
    const exists = await state.pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${tableName.replace(/'/g, "''")}'`
    );
    if (exists.rows.length === 0) {
      return json({ error: "Table not found" }, { status: 404 });
    }

    const result = await state.pool.query(`
      SELECT
        c.column_name as name,
        c.data_type as type,
        c.is_nullable = 'YES' as nullable,
        c.column_default as default_value,
        COALESCE(
          (SELECT true FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
           WHERE tc.table_name = c.table_name AND tc.constraint_type = 'PRIMARY KEY'
           AND kcu.column_name = c.column_name LIMIT 1),
          false
        ) as is_primary
      FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = '${tableName.replace(/'/g, "''")}'
      ORDER BY c.ordinal_position
    `);

    return json(result.rows);
  });

  // GET /postgres/tables/:name/rows - Get table rows with pagination
  router.get("/postgres/tables/:name/rows", async (_req, ctx) => {
    const state = getState();
    if (!state) {
      return json({ error: "Not initialized" }, { status: 500 });
    }

    const tableName = ctx.params.name;
    const limit = Math.min(parseInt(ctx.url.searchParams.get("limit") || "50"), 1000);
    const offset = parseInt(ctx.url.searchParams.get("offset") || "0");

    // Validate table exists (prevents SQL injection)
    const exists = await state.pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${tableName.replace(/'/g, "''")}'`
    );
    if (exists.rows.length === 0) {
      return json({ error: "Table not found" }, { status: 404 });
    }

    const result = await state.pool.query(
      `SELECT * FROM "${tableName.replace(/"/g, '""')}" LIMIT ${limit} OFFSET ${offset}`
    );
    const countResult = await state.pool.query(
      `SELECT COUNT(*)::int as total FROM "${tableName.replace(/"/g, '""')}"`
    );

    return json({
      rows: result.rows,
      total: countResult.rows[0]?.total ?? 0,
      limit,
      offset,
    });
  });

  // GET /postgres/schema - Get full schema (tables with columns) for agent context
  router.get("/postgres/schema", async () => {
    const state = getState();
    if (!state) {
      return json({ error: "Not initialized" }, { status: 500 });
    }

    const result = await state.pool.query(`
      SELECT
        t.table_name,
        json_agg(
          json_build_object(
            'name', c.column_name,
            'type', c.data_type,
            'nullable', c.is_nullable = 'YES'
          ) ORDER BY c.ordinal_position
        ) as columns
      FROM information_schema.tables t
      JOIN information_schema.columns c ON c.table_schema = t.table_schema AND c.table_name = t.table_name
      WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
      GROUP BY t.table_name
      ORDER BY t.table_name
    `);

    return json(result.rows);
  });

  // POST /postgres/triggers/refresh - Refresh change triggers on all tables
  router.post("/postgres/triggers/refresh", async () => {
    const state = getState();
    if (!state) {
      return json({ error: "Not initialized" }, { status: 500 });
    }

    await state.listener.refreshTriggers();
    return json({ success: true });
  });

  // POST /postgres/restart - Restart postgres
  router.post("/postgres/restart", async () => {
    const state = getState();
    if (!state) {
      return json({ error: "Not initialized" }, { status: 500 });
    }

    await state.pool.close();
    await state.postgres.restart();
    state.pool = new PostgresPool(state.postgres.connectionString);
    state.pool.connect();
    await updateLockfile({ postgresPid: state.postgres.status.pid });
    return json({ success: true, status: state.postgres.status });
  });
}
