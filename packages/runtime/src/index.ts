#!/usr/bin/env bun
/**
 * Hands Runtime - Workbook dev server
 *
 * Usage:
 *   hands-runtime --workbook-id=<id> --workbook-dir=<dir> [--port=<port>]
 *   hands-runtime --preflight   # Run preflight checks only
 *
 * Manages:
 *   - Embedded PostgreSQL (data in workbook-dir/db)
 *   - Miniflare dev server (CF Workers compatible runtime)
 *   - Continuous code quality evaluation (tsc, biome, knip)
 */

import { initRuntime, startPostgres, startWorker, stopServices, createServer } from "./server";
import { runEval } from "./eval";
import { runPreflightChecks, printPreflightResults } from "./preflight";
import { createWatcher } from "./watcher";
import { getEventBus } from "./events";

// Parse CLI args
function parseArgs(): {
  workbookId: string;
  workbookDir: string;
  port?: number;
} {
  const args: Record<string, string> = {};

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--")) {
      const [key, value] = arg.slice(2).split("=");
      args[key.replace(/-/g, "_")] = value;
    }
  }

  if (!args.workbook_id || !args.workbook_dir) {
    console.error("Usage: hands-runtime --workbook-id=<id> --workbook-dir=<dir> [--port=<port>]");
    process.exit(1);
  }

  return {
    workbookId: args.workbook_id,
    workbookDir: args.workbook_dir,
    port: args.port ? parseInt(args.port, 10) : undefined,
  };
}

/**
 * Find a free port
 */
async function findFreePort(start = 4100): Promise<number> {
  for (let port = start; port < start + 100; port++) {
    try {
      const server = Bun.serve({
        port,
        fetch() {
          return new Response();
        },
      });
      server.stop();
      return port;
    } catch {
      continue;
    }
  }
  throw new Error("No free port found");
}

/**
 * Find free ports for postgres and wrangler
 */
async function findServicePorts(): Promise<{ postgres: number; wrangler: number }> {
  const postgres = await findFreePort(5500);
  const wrangler = await findFreePort(8800);
  return { postgres, wrangler };
}

/**
 * Set up file watcher with improved race condition handling
 */
function setupFileWatcher(
  workbookDir: string,
  runtimePort: number
): ReturnType<typeof createWatcher> {
  const bus = getEventBus();
  const watcher = createWatcher({ workbookDir });

  // Handle debounced file changes
  bus.on("file:debounced", async ({ paths }) => {
    console.log(`Files changed: ${paths.join(", ")}`);

    bus.emit("eval:started");
    try {
      // Trigger eval via HTTP endpoint (keeps eval logic centralized)
      const response = await fetch(`http://localhost:${runtimePort}/eval`, {
        method: "POST",
      });
      const result = await response.json();
      bus.emit("eval:completed", { result });
    } catch (error) {
      bus.emit("eval:error", { error: error instanceof Error ? error : new Error(String(error)) });
      console.error("Eval failed:", error);
    }
  });

  return watcher;
}

/**
 * Main entry point
 */
async function main() {
  // Check for --preflight flag
  if (process.argv.includes("--preflight")) {
    const result = await runPreflightChecks();
    printPreflightResults(result);
    process.exit(result.ok ? 0 : 1);
  }

  // Run preflight checks before starting
  console.log("Running preflight checks...");
  const preflightResult = await runPreflightChecks();

  if (!preflightResult.ok) {
    printPreflightResults(preflightResult);
    process.exit(1);
  }

  // Print brief success message
  console.log("Preflight checks passed\n");

  const { workbookId, workbookDir, port } = parseArgs();

  console.log(`Starting Hands Runtime for workbook: ${workbookId}`);
  console.log(`Workbook directory: ${workbookDir}`);

  // Find free ports
  const runtimePort = port ?? await findFreePort(4100);
  const servicePorts = await findServicePorts();

  console.log(`Runtime port: ${runtimePort}`);
  console.log(`Postgres port: ${servicePorts.postgres}`);
  console.log(`Worker port: ${servicePorts.wrangler}`);

  // Initialize runtime
  await initRuntime({
    workbookId,
    workbookDir,
    postgresPort: servicePorts.postgres,
    wranglerPort: servicePorts.wrangler,
    runtimePort,
  });

  // Start postgres first (blocking - required for runtime to function)
  console.log("Starting postgres...");
  await startPostgres();

  // Create HTTP server (before worker, so we can respond to health checks)
  const server = createServer(runtimePort);
  console.log(`Runtime server listening on http://localhost:${runtimePort}`);

  // Output JSON for parent process to read (runtime is now usable)
  console.log(JSON.stringify({
    type: "ready",
    runtimePort,
    postgresPort: servicePorts.postgres,
    workerPort: servicePorts.wrangler,
  }));

  // Start worker in background (non-blocking - can be slow/fail without blocking runtime)
  console.log("Starting worker...");
  startWorker().catch(err => {
    console.error("Worker startup error:", err);
  });

  // Set up file watcher with race condition protection
  const watcher = setupFileWatcher(workbookDir, runtimePort);

  // Emit runtime ready event
  const bus = getEventBus();
  bus.emit("runtime:ready", {
    runtimePort,
    postgresPort: servicePorts.postgres,
    workerPort: servicePorts.wrangler,
  });

  // Handle shutdown
  process.on("SIGTERM", async () => {
    console.log("Shutting down...");
    watcher.stop();
    await stopServices();
    server.stop();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    console.log("Interrupted, shutting down...");
    watcher.stop();
    await stopServices();
    server.stop();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
