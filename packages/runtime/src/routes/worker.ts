/**
 * Worker routes - /worker/*
 */

import type { Router } from "../router";
import { json } from "../router";
import type { RuntimeState } from "../state";
import { updateLockfile } from "../lockfile";

export function registerWorkerRoutes(router: Router, getState: () => RuntimeState | null): void {
  // GET /worker/status - Get detailed worker status including build errors
  router.get("/worker/status", () => {
    const state = getState();
    if (!state) {
      return json({ error: "Not initialized" }, { status: 500 });
    }

    return json({
      status: state.worker.status,
      buildErrors: state.worker.buildErrors,
    });
  });

  // POST /worker/restart - Restart worker
  router.post("/worker/restart", async () => {
    const state = getState();
    if (!state) {
      return json({ error: "Not initialized" }, { status: 500 });
    }

    await state.worker.restart();
    await updateLockfile({ wranglerPort: state.worker.status.port });
    return json({ success: true, status: state.worker.status });
  });
}
