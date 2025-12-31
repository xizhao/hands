/**
 * Worker entry point with retry logic for Vite pre-bundle errors.
 *
 * This wraps the actual worker module to handle cases where Vite discovers
 * new dependencies at startup and needs to re-bundle.
 */

import { isPreBundleError, sleep } from "./lib/module-loader";

// Database is in runtime code (no workbook deps) - safe to import statically
// Must be class export for Durable Objects binding
export { Database } from "./db/dev";

const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 500;

async function loadWorker() {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const worker = await import("./worker");
      return worker;
    } catch (err) {
      if (isPreBundleError(err) && attempt < MAX_RETRIES) {
        console.log(
          `[worker] Pre-bundle invalidated at startup, retrying... (attempt ${attempt}/${MAX_RETRIES})`,
        );
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      throw err;
    }
  }
  throw new Error("Failed to load worker after max retries");
}

// Load worker with retry - this imports workbook code (pages/blocks)
const workerModule = await loadWorker();

// Re-export other named exports
export const setCommonHeaders = workerModule.setCommonHeaders;

// Default export is the app
export default workerModule.default;
