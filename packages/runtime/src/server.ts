/**
 * HTTP server for the runtime API
 */

// Server type from Bun
import type { EvalResult, RuntimeStatus, QueryResult } from "./types";
import { PostgresManager, PostgresPool } from "./postgres";
import { WranglerManager, parseWranglerConfig } from "./wrangler";
import { runEval } from "./eval";

interface RuntimeState {
  workbookId: string;
  workbookDir: string;
  postgres: PostgresManager;
  pool: PostgresPool;
  wrangler: WranglerManager;
  startedAt: number;
  evalListeners: Set<(result: EvalResult) => void>;
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
}): Promise<void> {
  const { workbookId, workbookDir, postgresPort, wranglerPort } = config;

  const postgres = new PostgresManager({
    dataDir: `${workbookDir}/postgres`,
    port: postgresPort,
    user: "hands",
    password: "hands",
    database: `hands_${workbookId.replace(/-/g, "_")}`,
  });

  const pool = new PostgresPool(postgres.connectionString);

  const wrangler = new WranglerManager({
    workbookDir,
    port: wranglerPort,
  });

  state = {
    workbookId,
    workbookDir,
    postgres,
    pool,
    wrangler,
    startedAt: Date.now(),
    evalListeners: new Set(),
  };
}

/**
 * Start all services
 */
export async function startServices(): Promise<void> {
  if (!state) throw new Error("Runtime not initialized");

  await state.postgres.start();
  state.pool.connect();

  try {
    await state.wrangler.start();
  } catch (error) {
    console.error("Wrangler failed to start:", error);
    // Continue even if wrangler fails - postgres is more important
  }
}

/**
 * Stop all services
 */
export async function stopServices(): Promise<void> {
  if (!state) return;

  await state.pool.close();
  await state.wrangler.stop();
  await state.postgres.stop();
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
      wrangler: state.wrangler.status,
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
      await state.postgres.start();
      state.pool.connect();
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

  // Check wrangler health
  if (!state.wrangler.status.up) {
    console.log("Wrangler is down, attempting to restart...");
    try {
      await state.wrangler.start();
      console.log("Wrangler restarted successfully");
    } catch (error) {
      console.error("Failed to restart wrangler:", error);
      // Don't throw - wrangler is optional
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
      wrangler: state.wrangler.status,
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
        // GET /status - Health check
        if (method === "GET" && url.pathname === "/status") {
          const status = getStatus();
          status.runtimePort = port;
          return Response.json(status, { headers });
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

        // POST /postgres/query - Execute SQL
        if (method === "POST" && url.pathname === "/postgres/query") {
          if (!state) {
            return Response.json({ error: "Not initialized" }, { status: 500, headers });
          }

          const body = await req.json() as { query: string };
          const result = await state.pool.query(body.query);
          return Response.json(result, { headers });
        }

        // POST /wrangler/restart - Restart wrangler
        if (method === "POST" && url.pathname === "/wrangler/restart") {
          if (!state) {
            return Response.json({ error: "Not initialized" }, { status: 500, headers });
          }

          await state.wrangler.restart();
          return Response.json({ success: true }, { headers });
        }

        // POST /postgres/restart - Restart postgres
        if (method === "POST" && url.pathname === "/postgres/restart") {
          if (!state) {
            return Response.json({ error: "Not initialized" }, { status: 500, headers });
          }

          await state.pool.close();
          await state.postgres.stop();
          await state.postgres.start();
          state.pool.connect();
          return Response.json({ success: true }, { headers });
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
