/**
 * Status routes - /status, /health, /lock
 */

import type { Handler } from "../router";
import type { Router } from "../router";
import { json } from "../router";
import type { RuntimeState } from "../state";
import { readLockfile } from "../lockfile";

export function registerStatusRoutes(router: Router, getState: () => RuntimeState | null, port: number): void {
  // GET /status - Basic status
  router.get("/status", () => {
    const state = getState();
    if (!state) {
      return json({ error: "Not initialized" }, { status: 500 });
    }

    return json({
      workbookId: state.workbookId,
      workbookDir: state.workbookDir,
      runtimePort: port,
      startedAt: state.startedAt,
      services: {
        postgres: state.postgres.status,
        worker: state.worker.status,
      },
    });
  });

  // GET /health - Detailed health check
  router.get("/health", () => {
    const state = getState();
    if (!state) {
      return json({
        healthy: false,
        uptime: 0,
        services: {
          postgres: { state: "stopped", up: false, port: 0, restartCount: 0 },
          worker: { state: "stopped", up: false, port: 0, restartCount: 0 },
        },
      }, { status: 503 });
    }

    const postgresStatus = state.postgres.status;
    const workerStatus = state.worker.status;

    const health = {
      healthy: postgresStatus.up,
      uptime: Date.now() - state.startedAt,
      services: {
        postgres: postgresStatus,
        worker: workerStatus,
      },
    };

    return json(health, { status: health.healthy ? 200 : 503 });
  });

  // GET /lock - Get current lockfile info
  router.get("/lock", async () => {
    const lock = await readLockfile();
    return json(lock || { error: "No lockfile" });
  });
}
