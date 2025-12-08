/**
 * HTTP server for the runtime API
 */

import type { EvalResult, RuntimeStatus, ServiceStatus } from "./types";
import { PostgresManager, PostgresPool } from "./postgres";
import { WorkerManager } from "./worker";
import { runEval } from "./eval";
import { acquireLock, updateLockfile, releaseLock, readLockfile, type RuntimeLock } from "./lockfile";

interface RuntimeState {
  workbookId: string;
  workbookDir: string;
  postgres: PostgresManager;
  pool: PostgresPool;
  worker: WorkerManager;
  startedAt: number;
  evalListeners: Set<(result: EvalResult) => void>;
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

  const worker = new WorkerManager({
    workbookDir,
    port: wranglerPort,
  });

  state = {
    workbookId,
    workbookDir,
    postgres,
    pool,
    worker,
    startedAt: Date.now(),
    evalListeners: new Set(),
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
}

/**
 * Stop all services
 */
export async function stopServices(): Promise<void> {
  if (!state) return;

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

  // Close current pool
  await state.pool.close();

  // Switch postgres to new workbook
  const newDatabase = `hands_${newWorkbookId.replace(/-/g, "_")}`;
  await state.postgres.switchWorkbook(`${newWorkbookDir}/postgres`, newDatabase);

  // Reconnect pool with new connection string
  state.pool = new PostgresPool(state.postgres.connectionString);
  state.pool.connect();

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
