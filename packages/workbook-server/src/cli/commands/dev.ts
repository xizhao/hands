/**
 * hands dev - Start the development server
 *
 * Runs preflight checks, then starts the runtime.
 */

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadConfig } from "../../config/index.js";
import { printPreflightResults, runPreflight } from "../../preflight.js";

interface DevOptions {
  port?: number;
  hmr?: boolean;
  editor?: boolean;
}

export async function devCommand(options: DevOptions) {
  const workbookDir = process.cwd();

  // Verify this is a workbook directory
  const pkgJsonPath = join(workbookDir, "package.json");
  if (!existsSync(pkgJsonPath)) {
    console.error("Error: package.json not found");
    console.error("Run this command from a workbook directory");
    process.exit(1);
  }

  // Load config to get workbook name as ID
  const config = await loadConfig(workbookDir);
  const workbookId = config.name;

  // Run preflight checks before starting runtime
  console.log(`[hands] Running preflight checks...`);
  const preflightResult = await runPreflight({
    workbookDir,
    port: options.port,
    autoFix: true,
    verbose: true,
  });

  if (!preflightResult.ok) {
    printPreflightResults(preflightResult);
    process.exit(1);
  }

  // Log any auto-fixed issues
  const fixedChecks = preflightResult.checks.filter((c) => c.fixed);
  if (fixedChecks.length > 0) {
    console.log(`[hands] Auto-fixed ${fixedChecks.length} issue(s)`);
  }

  console.log(`[hands] Starting dev server for: ${workbookId}`);

  // Set environment variables
  process.env.HANDS_HMR = options.hmr !== false ? "1" : "0";

  // Build args for the runtime main function
  const args = [
    "bun",
    resolve(import.meta.dir, "../../index.ts"),
    `--workbook-id=${workbookId}`,
    `--workbook-dir=${workbookDir}`,
  ];

  if (options.port) {
    args.push(`--port=${options.port}`);
  }

  if (options.editor === false) {
    args.push("--no-editor");
  }

  // Spawn the runtime process (spawn ourselves for clean signal handling)
  const proc = Bun.spawn({
    cmd: args,
    cwd: workbookDir,
    stdout: "inherit",
    stderr: "inherit",
    env: process.env,
  });

  // Handle Ctrl+C gracefully
  const cleanup = () => {
    proc.kill("SIGTERM");
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  // Wait for process to exit
  const exitCode = await proc.exited;
  process.exit(exitCode);
}
