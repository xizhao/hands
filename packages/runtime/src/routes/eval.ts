/**
 * Eval routes - /eval, /eval/watch
 */

import type { Router } from "../router";
import { json, sse } from "../router";
import type { RuntimeState } from "../state";
import type { EvalResult } from "../types";
import { runEval } from "../eval";
import { updateLockfile } from "../lockfile";
import { PostgresPool } from "../db";

/**
 * Ensure services are healthy, auto-restart if needed
 */
async function ensureServicesHealthy(state: RuntimeState): Promise<void> {
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
    }
  }
}

/**
 * Run eval and notify listeners
 */
async function doEval(state: RuntimeState): Promise<EvalResult> {
  await ensureServicesHealthy(state);

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

export function registerEvalRoutes(router: Router, getState: () => RuntimeState | null): void {
  // POST /eval - Run eval loop
  router.post("/eval", async () => {
    const state = getState();
    if (!state) {
      return json({ error: "Not initialized" }, { status: 500 });
    }

    const result = await doEval(state);
    return json(result);
  });

  // GET /eval/watch - SSE stream
  router.get("/eval/watch", (req) => {
    const state = getState();
    if (!state) {
      return json({ error: "Not initialized" }, { status: 500 });
    }

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();

        const listener = (result: EvalResult) => {
          const data = `data: ${JSON.stringify(result)}\n\n`;
          controller.enqueue(encoder.encode(data));
        };

        state.evalListeners.add(listener);

        // Send initial eval
        doEval(state).then(listener);

        // Cleanup on close
        req.signal.addEventListener("abort", () => {
          state.evalListeners.delete(listener);
        });
      },
    });

    return sse(stream);
  });
}
