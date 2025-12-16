import type { Connect, Plugin, ViteDevServer } from "vite";

/**
 * Vite plugin that handles "new version of the pre-bundle" errors.
 *
 * When Vite discovers a new dependency mid-request, it invalidates the pre-bundle
 * and starts re-optimizing in the background. Existing requests fail with
 * "new version of the pre-bundle" error.
 *
 * This plugin:
 * 1. Catches the error
 * 2. Waits for Vite to finish re-optimizing (500ms debounce after last transform)
 * 3. Triggers full-reload so client gets fresh bundle
 * 4. Redirects the failed request to retry
 */

let stabilityPromise: Promise<void> | null = null;
let stabilityResolver: (() => void) | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 500;

function startWaitingForStability() {
  if (!stabilityPromise) {
    stabilityPromise = new Promise((resolve) => {
      stabilityResolver = resolve;
    });
    debounceTimer = setTimeout(finishWaiting, DEBOUNCE_MS);
  }
}

function activityDetected() {
  if (stabilityPromise) {
    // Reset timer on activity - Vite is still busy
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(finishWaiting, DEBOUNCE_MS);
  }
}

function finishWaiting() {
  if (stabilityResolver) {
    stabilityResolver();
  }
  stabilityPromise = null;
  stabilityResolver = null;
  debounceTimer = null;
}

export function staleDepRetryPlugin(): Plugin {
  return {
    name: "hands:stale-dep-retry",
    apply: "serve",

    // Monitor transforms to detect when Vite is busy processing
    transform() {
      activityDetected();
      return null;
    },

    configureServer(server: ViteDevServer) {
      // Add error handling middleware (runs late in stack via returned function)
      return () => {
        // Cast to ErrorHandleFunction to ensure Connect treats this as error middleware
        const errorHandler: Connect.ErrorHandleFunction = async (err, req, res, next) => {
          if (
            err &&
            typeof err.message === "string" &&
            err.message.includes("new version of the pre-bundle")
          ) {
            console.log("[hands] Caught stale pre-bundle error, waiting for rebuild...");
            startWaitingForStability();
            await stabilityPromise;
            console.log("[hands] Rebuild complete, triggering reload");

            // Signal client to do full page reload
            server.environments.client.hot.send({ type: "full-reload" });

            // Redirect request to retry with fresh bundle
            res.writeHead(307, { Location: req.originalUrl || req.url || "/" });
            res.end();
            return;
          }
          next(err);
        };
        server.middlewares.use(errorHandler);
      };
    },
  };
}
