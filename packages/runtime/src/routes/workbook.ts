/**
 * Workbook routes - /workbook/*
 */

import type { Router } from "../router";
import { json } from "../router";
import type { RuntimeState } from "../state";
import { updateLockfile } from "../lockfile";
import { PostgresPool, PostgresListener } from "../db";

export function registerWorkbookRoutes(router: Router, getState: () => RuntimeState | null): void {
  // POST /workbook/switch - Switch to different workbook
  router.post("/workbook/switch", async (req) => {
    const state = getState();
    if (!state) {
      return json({ error: "Not initialized" }, { status: 500 });
    }

    const body = (await req.json()) as { workbookId: string; workbookDir: string };
    if (!body.workbookId || !body.workbookDir) {
      return json({ error: "Missing workbookId or workbookDir" }, { status: 400 });
    }

    console.log(`Switching workbook from ${state.workbookId} to ${body.workbookId}`);

    // Stop listener and close pool
    await state.listener.stop();
    await state.pool.close();

    // Switch postgres to new workbook
    const newDatabase = `hands_${body.workbookId.replace(/-/g, "_")}`;
    await state.postgres.switchWorkbook(`${body.workbookDir}/db`, newDatabase);

    // Reconnect pool with new connection string
    state.pool = new PostgresPool(state.postgres.connectionString);
    state.pool.connect();

    // Restart listener with new connection
    state.listener = new PostgresListener(state.postgres.connectionString);
    try {
      await state.listener.start();
      state.listener.subscribe((change) => {
        for (const listener of state.changeListeners) {
          listener(change);
        }
      });
    } catch (err) {
      console.error("[runtime] Failed to restart change listener:", err);
    }

    // Switch worker to new workbook
    await state.worker.switchWorkbook(body.workbookDir);

    // Update state
    state.workbookId = body.workbookId;
    state.workbookDir = body.workbookDir;

    // Update lockfile
    await updateLockfile({
      workbookId: body.workbookId,
      workbookDir: body.workbookDir,
      postgresPid: state.postgres.status.pid,
      wranglerPort: state.worker.status.port,
    });

    console.log(`Switched to workbook ${body.workbookId}`);
    return json({ success: true, workbookId: body.workbookId });
  });
}
