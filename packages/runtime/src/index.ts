#!/usr/bin/env bun
/**
 * Hands Runtime - Workbook dev server
 *
 * Usage:
 *   hands-runtime --workbook-id=<id> --workbook-dir=<dir> [--port=<port>]
 *   hands-runtime --preflight   # Run preflight checks only
 *
 * Manages:
 *   - Embedded PostgreSQL (data in workbook-dir/postgres)
 *   - Wrangler dev server
 *   - Continuous code quality evaluation (tsc, biome, knip)
 */

import { watch } from "fs";
import { initRuntime, startServices, stopServices, createServer } from "./server";
import { runEval } from "./eval";
import { runPreflightChecks, printPreflightResults } from "./preflight";

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
 * Set up file watcher with debounced eval
 */
function setupFileWatcher(
  workbookDir: string,
  onEval: () => Promise<void>
): void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const watcher = watch(
    workbookDir,
    { recursive: true },
    (event, filename) => {
      // Ignore non-source files and postgres data
      if (!filename) return;
      if (filename.startsWith("postgres/")) return;
      if (filename.startsWith("node_modules/")) return;
      if (filename.startsWith(".")) return;
      if (!filename.match(/\.(ts|tsx|js|jsx|json|toml)$/)) return;

      // Debounce
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        console.log(`File changed: ${filename}`);
        try {
          await onEval();
        } catch (error) {
          console.error("Eval failed:", error);
        }
      }, 500);
    }
  );

  // Cleanup on exit
  process.on("SIGINT", () => {
    watcher.close();
    process.exit(0);
  });
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
  console.log(`Wrangler port: ${servicePorts.wrangler}`);

  // Initialize runtime
  await initRuntime({
    workbookId,
    workbookDir,
    postgresPort: servicePorts.postgres,
    wranglerPort: servicePorts.wrangler,
    runtimePort,
  });

  // Start services
  console.log("Starting services...");
  await startServices();

  // Create HTTP server
  const server = createServer(runtimePort);
  console.log(`Runtime server listening on http://localhost:${runtimePort}`);

  // Output JSON for parent process to read
  console.log(JSON.stringify({
    type: "ready",
    runtimePort,
    postgresPort: servicePorts.postgres,
    workerPort: servicePorts.wrangler, // Still uses wrangler port internally
  }));

  // Set up file watcher
  setupFileWatcher(workbookDir, async () => {
    // The server's /eval/watch SSE endpoint handles broadcasting
    // This just triggers a new eval
    const response = await fetch(`http://localhost:${runtimePort}/eval`, {
      method: "POST",
    });
    await response.json();
  });

  // Handle shutdown
  process.on("SIGTERM", async () => {
    console.log("Shutting down...");
    await stopServices();
    server.stop();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    console.log("Interrupted, shutting down...");
    await stopServices();
    server.stop();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
