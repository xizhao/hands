/**
 * Routes index - registers all routes on the router
 */

import { Router, cors } from "../router";
import type { RuntimeState } from "../state";
import { registerStatusRoutes } from "./status";
import { registerEvalRoutes } from "./eval";
import { registerPostgresRoutes } from "./postgres";
import { registerWorkerRoutes } from "./worker";
import { registerSyncRoutes } from "./sync";
import { registerBlocksRoutes } from "./blocks";
import { registerNotebookRoutes } from "./notebook";
import { registerWorkbookRoutes } from "./workbook";
import { stopServices } from "../services";
import { json } from "../router";

export function createRouter(getState: () => RuntimeState | null, port: number): Router {
  const router = new Router();

  // Global middleware
  router.use(cors());

  // Register route modules
  registerStatusRoutes(router, getState, port);
  registerEvalRoutes(router, getState);
  registerPostgresRoutes(router, getState);
  registerWorkerRoutes(router, getState);
  registerSyncRoutes(router, getState);
  registerBlocksRoutes(router, getState);
  registerNotebookRoutes(router, getState);
  registerWorkbookRoutes(router, getState);

  // POST /stop - Graceful shutdown
  router.post("/stop", async () => {
    await stopServices();
    process.exit(0);
  });

  return router;
}

export * from "./status";
export * from "./eval";
export * from "./postgres";
export * from "./worker";
export * from "./sync";
export * from "./blocks";
export * from "./notebook";
export * from "./workbook";
