/**
 * HTTP server for the runtime API
 *
 * Refactored to use extracted router and route modules.
 * See routes/ for individual route handlers.
 */

import { createRouter } from "./routes";
import { getState } from "./state";

// Re-export from services for backwards compatibility
export {
  initRuntime,
  startPostgres,
  startWorker,
  startServices,
  stopServices,
} from "./services";

/**
 * Create the HTTP server
 */
export function createServer(port: number) {
  const router = createRouter(getState, port);

  return Bun.serve({
    port,
    fetch(req) {
      return router.handle(req);
    },
  });
}
