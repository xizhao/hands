/**
 * HTTP server for the runtime API
 */

import type { EvalResult, RuntimeStatus, ServiceStatus } from "./types";
import {
  PostgresManager,
  PostgresPool,
  PostgresListener,
  SyncManager,
  createChangesStream,
  createSSEResponse,
  type DatabaseChange,
  type DataSource,
  type SyncProgress,
} from "./db";
import { WorkerManager } from "./worker";
import { runEval } from "./eval";
import { acquireLock, updateLockfile, releaseLock, readLockfile, type RuntimeLock } from "./lockfile";

interface RuntimeState {
  workbookId: string;
  workbookDir: string;
  postgres: PostgresManager;
  pool: PostgresPool;
  listener: PostgresListener;
  worker: WorkerManager;
  sync: SyncManager;
  startedAt: number;
  evalListeners: Set<(result: EvalResult) => void>;
  changeListeners: Set<(change: DatabaseChange) => void>;
  syncProgressListeners: Set<(progress: SyncProgress) => void>;
  lock: RuntimeLock;
}

let state: RuntimeState | null = null;

/**
 * Initialize the runtime state
 */
export async function initRuntime(config: {
  workbookId: string;
  workbookDir: string;
  postgresPort: number;
  wranglerPort: number;
  runtimePort: number;
}): Promise<void> {
  const { workbookId, workbookDir, postgresPort, wranglerPort, runtimePort } = config;

  // Acquire lock (also cleans up orphans)
  const lock = await acquireLock({
    runtimePort,
    postgresPort,
    wranglerPort,
    workbookId,
    workbookDir,
  });

  const postgres = new PostgresManager({
    dataDir: `${workbookDir}/postgres`,
    port: postgresPort,
    user: "hands",
    password: "hands",
    database: `hands_${workbookId.replace(/-/g, "_")}`,
  });

  const pool = new PostgresPool(postgres.connectionString);
  const listener = new PostgresListener(postgres.connectionString);

  const worker = new WorkerManager({
    workbookDir,
    port: wranglerPort,
  });

  const sync = new SyncManager(pool);

  state = {
    workbookId,
    workbookDir,
    postgres,
    pool,
    listener,
    worker,
    sync,
    startedAt: Date.now(),
    evalListeners: new Set(),
    changeListeners: new Set(),
    syncProgressListeners: new Set(),
    lock,
  };
}

/**
 * Start all services
 */
export async function startServices(): Promise<void> {
  if (!state) throw new Error("Runtime not initialized");

  // Start postgres
  await state.postgres.start();
  state.pool.connect();

  // Start change listener (for real-time DB notifications)
  try {
    await state.listener.start();
    // Wire up listener to broadcast changes
    state.listener.subscribe((change) => {
      for (const listener of state!.changeListeners) {
        listener(change);
      }
    });
  } catch (err) {
    console.error("[runtime] Failed to start change listener:", err);
    // Continue - listener is not critical
  }

  // Update lockfile with postgres PID
  if (state.postgres.status.pid) {
    await updateLockfile({ postgresPid: state.postgres.status.pid });
  }

  // Start worker dev server
  try {
    await state.worker.start();
    // Update lockfile with worker port
    await updateLockfile({ wranglerPort: state.worker.status.port });
  } catch (error) {
    console.error("Worker failed to start:", error);
    // Continue even if worker fails - postgres is more important
    // Build errors are available via state.worker.buildErrors
  }

  // Initialize sync manager tables and start scheduler
  try {
    await state.sync.init();
    state.sync.onProgress((progress) => {
      for (const listener of state!.syncProgressListeners) {
        listener(progress);
      }
    });
    state.sync.startScheduler();
    console.log("[runtime] Sync manager initialized");
  } catch (err) {
    console.error("[runtime] Failed to initialize sync manager:", err);
    // Continue - sync is not critical for basic operation
  }
}

/**
 * Stop all services
 */
export async function stopServices(): Promise<void> {
  if (!state) return;

  state.sync.stopScheduler();
  await state.listener.stop();
  await state.pool.close();
  await state.worker.stop();
  await state.postgres.stop();

  // Release the lock
  await releaseLock();
}

/**
 * Switch to a different workbook
 */
export async function switchWorkbook(newWorkbookId: string, newWorkbookDir: string): Promise<void> {
  if (!state) throw new Error("Runtime not initialized");

  console.log(`Switching workbook from ${state.workbookId} to ${newWorkbookId}`);

  // Stop listener and close pool
  await state.listener.stop();
  await state.pool.close();

  // Switch postgres to new workbook
  const newDatabase = `hands_${newWorkbookId.replace(/-/g, "_")}`;
  await state.postgres.switchWorkbook(`${newWorkbookDir}/postgres`, newDatabase);

  // Reconnect pool with new connection string
  state.pool = new PostgresPool(state.postgres.connectionString);
  state.pool.connect();

  // Restart listener with new connection
  state.listener = new PostgresListener(state.postgres.connectionString);
  try {
    await state.listener.start();
    state.listener.subscribe((change) => {
      for (const listener of state!.changeListeners) {
        listener(change);
      }
    });
  } catch (err) {
    console.error("[runtime] Failed to restart change listener:", err);
  }

  // Switch worker to new workbook
  await state.worker.switchWorkbook(newWorkbookDir);

  // Update state
  state.workbookId = newWorkbookId;
  state.workbookDir = newWorkbookDir;

  // Update lockfile
  await updateLockfile({
    workbookId: newWorkbookId,
    workbookDir: newWorkbookDir,
    postgresPid: state.postgres.status.pid,
    wranglerPort: state.worker.status.port,
  });

  console.log(`Switched to workbook ${newWorkbookId}`);
}

/**
 * Get runtime status
 */
function getStatus(): RuntimeStatus {
  if (!state) throw new Error("Runtime not initialized");

  return {
    workbookId: state.workbookId,
    workbookDir: state.workbookDir,
    runtimePort: 0, // Will be set by caller
    startedAt: state.startedAt,
    services: {
      postgres: state.postgres.status,
      worker: state.worker.status,
    },
  };
}

/**
 * Get detailed health info for services
 */
function getHealth(): {
  healthy: boolean;
  uptime: number;
  services: {
    postgres: ServiceStatus & { connectionOk?: boolean };
    worker: ServiceStatus;
  };
} {
  if (!state) {
    return {
      healthy: false,
      uptime: 0,
      services: {
        postgres: { state: "stopped", up: false, port: 0, restartCount: 0 },
        worker: { state: "stopped", up: false, port: 0, restartCount: 0 },
      },
    };
  }

  const postgresStatus = state.postgres.status;
  const workerStatus = state.worker.status;

  return {
    healthy: postgresStatus.up, // Postgres is required, worker is optional
    uptime: Date.now() - state.startedAt,
    services: {
      postgres: postgresStatus,
      worker: workerStatus,
    },
  };
}

/**
 * Check and auto-fix service health
 */
async function ensureServicesHealthy(): Promise<void> {
  if (!state) return;

  // Check postgres health
  if (!state.postgres.status.up) {
    console.log("Postgres is down, attempting to restart...");
    try {
      await state.postgres.restart();
      state.pool = new PostgresPool(state.postgres.connectionString);
      state.pool.connect();
      await updateLockfile({ postgresPid: state.postgres.status.pid });
      console.log("Postgres restarted successfully");
    } catch (error) {
      console.error("Failed to restart postgres:", error);
    }
  } else {
    // Ping to verify connection is alive
    try {
      await state.pool.ping();
    } catch {
      console.log("Postgres connection lost, reconnecting...");
      try {
        state.pool.connect();
      } catch (error) {
        console.error("Failed to reconnect to postgres:", error);
      }
    }
  }

  // Check worker health
  if (!state.worker.status.up && state.worker.status.state !== "failed") {
    console.log("Worker is down, attempting to restart...");
    try {
      await state.worker.restart();
      await updateLockfile({ wranglerPort: state.worker.status.port });
      console.log("Worker restarted successfully");
    } catch (error) {
      console.error("Failed to restart worker:", error);
      // Don't throw - worker is optional
    }
  }
}

/**
 * Run eval and notify listeners
 */
async function doEval(): Promise<EvalResult> {
  if (!state) throw new Error("Runtime not initialized");

  // First, ensure services are healthy (auto-restart if needed)
  await ensureServicesHealthy();

  const result = await runEval({
    workbookDir: state.workbookDir,
    services: {
      postgres: state.postgres.status,
      worker: state.worker.status,
    },
  });

  // Notify SSE listeners
  for (const listener of state.evalListeners) {
    listener(result);
  }

  return result;
}

/**
 * Create the HTTP server
 */
export function createServer(port: number) {
  return Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);
      const method = req.method;

      // CORS headers
      const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json",
      };

      // Handle preflight
      if (method === "OPTIONS") {
        return new Response(null, { headers });
      }

      try {
        // GET /status - Basic status
        if (method === "GET" && url.pathname === "/status") {
          const status = getStatus();
          status.runtimePort = port;
          return Response.json(status, { headers });
        }

        // GET /health - Detailed health check
        if (method === "GET" && url.pathname === "/health") {
          const health = getHealth();
          const statusCode = health.healthy ? 200 : 503;
          return Response.json(health, { status: statusCode, headers });
        }

        // GET /lock - Get current lockfile info
        if (method === "GET" && url.pathname === "/lock") {
          const lock = await readLockfile();
          return Response.json(lock || { error: "No lockfile" }, { headers });
        }

        // POST /eval - Run eval loop
        if (method === "POST" && url.pathname === "/eval") {
          const result = await doEval();
          return Response.json(result, { headers });
        }

        // GET /eval/watch - SSE stream
        if (method === "GET" && url.pathname === "/eval/watch") {
          if (!state) {
            return Response.json({ error: "Not initialized" }, { status: 500, headers });
          }

          const stream = new ReadableStream({
            start(controller) {
              const encoder = new TextEncoder();

              const listener = (result: EvalResult) => {
                const data = `data: ${JSON.stringify(result)}\n\n`;
                controller.enqueue(encoder.encode(data));
              };

              state!.evalListeners.add(listener);

              // Send initial eval
              doEval().then(listener);

              // Cleanup on close
              req.signal.addEventListener("abort", () => {
                state?.evalListeners.delete(listener);
              });
            },
          });

          return new Response(stream, {
            headers: {
              ...headers,
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              "Connection": "keep-alive",
            },
          });
        }

        // POST /workbook/switch - Switch to different workbook
        if (method === "POST" && url.pathname === "/workbook/switch") {
          const body = (await req.json()) as { workbookId: string; workbookDir: string };
          if (!body.workbookId || !body.workbookDir) {
            return Response.json(
              { error: "Missing workbookId or workbookDir" },
              { status: 400, headers }
            );
          }

          await switchWorkbook(body.workbookId, body.workbookDir);
          return Response.json({ success: true, workbookId: body.workbookId }, { headers });
        }

        // POST /postgres/query - Execute SQL
        if (method === "POST" && url.pathname === "/postgres/query") {
          if (!state) {
            return Response.json({ error: "Not initialized" }, { status: 500, headers });
          }

          const body = (await req.json()) as { query: string };
          const result = await state.pool.query(body.query);
          return Response.json(result, { headers });
        }

        // GET /postgres/changes - SSE stream for database changes
        if (method === "GET" && url.pathname === "/postgres/changes") {
          if (!state) {
            return Response.json({ error: "Not initialized" }, { status: 500, headers });
          }

          // Use the listener directly as the change source
          const stream = createChangesStream(state.listener, req.signal);
          return createSSEResponse(stream);
        }

        // GET /postgres/tables - List all tables with metadata
        if (method === "GET" && url.pathname === "/postgres/tables") {
          if (!state) {
            return Response.json({ error: "Not initialized" }, { status: 500, headers });
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

          return Response.json(result.rows, { headers });
        }

        // GET /postgres/tables/:name/columns - Get table columns
        if (method === "GET" && url.pathname.startsWith("/postgres/tables/") && url.pathname.endsWith("/columns")) {
          if (!state) {
            return Response.json({ error: "Not initialized" }, { status: 500, headers });
          }

          const tableName = url.pathname.replace("/postgres/tables/", "").replace("/columns", "");

          // Validate table exists
          const exists = await state.pool.query(
            `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${tableName.replace(/'/g, "''")}'`
          );
          if (exists.rows.length === 0) {
            return Response.json({ error: "Table not found" }, { status: 404, headers });
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

          return Response.json(result.rows, { headers });
        }

        // GET /postgres/tables/:name/rows - Get table rows with pagination
        if (method === "GET" && url.pathname.startsWith("/postgres/tables/") && url.pathname.endsWith("/rows")) {
          if (!state) {
            return Response.json({ error: "Not initialized" }, { status: 500, headers });
          }

          const tableName = url.pathname.replace("/postgres/tables/", "").replace("/rows", "");
          const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 1000);
          const offset = parseInt(url.searchParams.get("offset") || "0");

          // Validate table exists (prevents SQL injection)
          const exists = await state.pool.query(
            `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${tableName.replace(/'/g, "''")}'`
          );
          if (exists.rows.length === 0) {
            return Response.json({ error: "Table not found" }, { status: 404, headers });
          }

          const result = await state.pool.query(
            `SELECT * FROM "${tableName.replace(/"/g, '""')}" LIMIT ${limit} OFFSET ${offset}`
          );
          const countResult = await state.pool.query(
            `SELECT COUNT(*)::int as total FROM "${tableName.replace(/"/g, '""')}"`
          );

          return Response.json({
            rows: result.rows,
            total: countResult.rows[0]?.total ?? 0,
            limit,
            offset,
          }, { headers });
        }

        // POST /postgres/triggers/refresh - Refresh change triggers on all tables
        if (method === "POST" && url.pathname === "/postgres/triggers/refresh") {
          if (!state) {
            return Response.json({ error: "Not initialized" }, { status: 500, headers });
          }

          await state.listener.refreshTriggers();
          return Response.json({ success: true }, { headers });
        }

        // GET /worker/status - Get detailed worker status including build errors
        if (method === "GET" && url.pathname === "/worker/status") {
          if (!state) {
            return Response.json({ error: "Not initialized" }, { status: 500, headers });
          }

          return Response.json({
            status: state.worker.status,
            buildErrors: state.worker.buildErrors,
          }, { headers });
        }

        // POST /worker/restart - Restart worker
        if (method === "POST" && url.pathname === "/worker/restart") {
          if (!state) {
            return Response.json({ error: "Not initialized" }, { status: 500, headers });
          }

          await state.worker.restart();
          await updateLockfile({ wranglerPort: state.worker.status.port });
          return Response.json({ success: true, status: state.worker.status }, { headers });
        }

        // POST /postgres/restart - Restart postgres
        if (method === "POST" && url.pathname === "/postgres/restart") {
          if (!state) {
            return Response.json({ error: "Not initialized" }, { status: 500, headers });
          }

          await state.pool.close();
          await state.postgres.restart();
          state.pool = new PostgresPool(state.postgres.connectionString);
          state.pool.connect();
          await updateLockfile({ postgresPid: state.postgres.status.pid });
          return Response.json({ success: true, status: state.postgres.status }, { headers });
        }

        // POST /stop - Graceful shutdown
        if (method === "POST" && url.pathname === "/stop") {
          await stopServices();
          process.exit(0);
        }

        // ========== SYNC ENDPOINTS ==========

        // GET /sync/sources - List all data sources
        if (method === "GET" && url.pathname === "/sync/sources") {
          if (!state) {
            return Response.json({ error: "Not initialized" }, { status: 500, headers });
          }
          const sources = await state.sync.getSources();
          return Response.json(sources, { headers });
        }

        // GET /sync/sources/:id - Get a specific source
        if (method === "GET" && url.pathname.startsWith("/sync/sources/") && !url.pathname.includes("/history")) {
          if (!state) {
            return Response.json({ error: "Not initialized" }, { status: 500, headers });
          }
          const id = url.pathname.replace("/sync/sources/", "");
          const source = await state.sync.getSource(id);
          if (!source) {
            return Response.json({ error: "Source not found" }, { status: 404, headers });
          }
          return Response.json(source, { headers });
        }

        // POST /sync/sources - Add a new data source
        if (method === "POST" && url.pathname === "/sync/sources") {
          if (!state) {
            return Response.json({ error: "Not initialized" }, { status: 500, headers });
          }
          const body = await req.json() as { source: Omit<DataSource, "createdAt" | "updatedAt">; secret?: string };
          const source = await state.sync.addSource(body.source, body.secret);
          return Response.json(source, { status: 201, headers });
        }

        // PUT /sync/sources/:id - Update a data source
        if (method === "PUT" && url.pathname.startsWith("/sync/sources/")) {
          if (!state) {
            return Response.json({ error: "Not initialized" }, { status: 500, headers });
          }
          const id = url.pathname.replace("/sync/sources/", "");
          const body = await req.json() as { updates: Partial<DataSource>; secret?: string };
          const source = await state.sync.updateSource(id, body.updates, body.secret);
          if (!source) {
            return Response.json({ error: "Source not found" }, { status: 404, headers });
          }
          return Response.json(source, { headers });
        }

        // DELETE /sync/sources/:id - Delete a data source
        if (method === "DELETE" && url.pathname.startsWith("/sync/sources/")) {
          if (!state) {
            return Response.json({ error: "Not initialized" }, { status: 500, headers });
          }
          const id = url.pathname.replace("/sync/sources/", "");
          const deleted = await state.sync.deleteSource(id);
          if (!deleted) {
            return Response.json({ error: "Source not found" }, { status: 404, headers });
          }
          return Response.json({ success: true }, { headers });
        }

        // POST /sync/sources/:id/sync - Sync a single source
        if (method === "POST" && url.pathname.match(/^\/sync\/sources\/[^/]+\/sync$/)) {
          if (!state) {
            return Response.json({ error: "Not initialized" }, { status: 500, headers });
          }
          const id = url.pathname.replace("/sync/sources/", "").replace("/sync", "");
          const result = await state.sync.syncSource(id);
          return Response.json(result, { headers });
        }

        // POST /sync/sources/:id/cancel - Cancel an in-progress sync
        if (method === "POST" && url.pathname.match(/^\/sync\/sources\/[^/]+\/cancel$/)) {
          if (!state) {
            return Response.json({ error: "Not initialized" }, { status: 500, headers });
          }
          const id = url.pathname.replace("/sync/sources/", "").replace("/cancel", "");
          const cancelled = state.sync.cancelSync(id);
          return Response.json({ cancelled }, { headers });
        }

        // GET /sync/sources/:id/history - Get sync history for a source
        if (method === "GET" && url.pathname.match(/^\/sync\/sources\/[^/]+\/history$/)) {
          if (!state) {
            return Response.json({ error: "Not initialized" }, { status: 500, headers });
          }
          const id = url.pathname.replace("/sync/sources/", "").replace("/history", "");
          const limit = parseInt(url.searchParams.get("limit") || "50");
          const history = await state.sync.getSyncHistory(id, limit);
          return Response.json(history, { headers });
        }

        // POST /sync/run - Sync multiple sources
        if (method === "POST" && url.pathname === "/sync/run") {
          if (!state) {
            return Response.json({ error: "Not initialized" }, { status: 500, headers });
          }
          const body = await req.json() as { sourceIds?: string[]; concurrency?: number };
          const result = body.sourceIds
            ? await state.sync.syncSources(body.sourceIds, body.concurrency)
            : await state.sync.syncAll(body.concurrency);
          return Response.json(result, { headers });
        }

        // GET /sync/progress - SSE stream for sync progress
        if (method === "GET" && url.pathname === "/sync/progress") {
          if (!state) {
            return Response.json({ error: "Not initialized" }, { status: 500, headers });
          }

          const stream = new ReadableStream({
            start(controller) {
              const encoder = new TextEncoder();

              const listener = (progress: SyncProgress) => {
                const data = `data: ${JSON.stringify(progress)}\n\n`;
                controller.enqueue(encoder.encode(data));
              };

              state!.syncProgressListeners.add(listener);

              // Cleanup on close
              req.signal.addEventListener("abort", () => {
                state?.syncProgressListeners.delete(listener);
              });
            },
          });

          return new Response(stream, {
            headers: {
              ...headers,
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              "Connection": "keep-alive",
            },
          });
        }

        // 404
        return Response.json({ error: "Not found" }, { status: 404, headers });
      } catch (error) {
        console.error("Request error:", error);
        return Response.json(
          { error: error instanceof Error ? error.message : String(error) },
          { status: 500, headers }
        );
      }
    },
  });
}
