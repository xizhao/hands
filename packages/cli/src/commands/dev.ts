/**
 * hands dev - Start the development server
 *
 * Spawns the runtime process with the current workbook.
 */

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "bun";
import { loadHandsJson } from "./utils.js";

interface DevOptions {
  port?: number;
  hmr?: boolean;
}

export async function devCommand(options: DevOptions) {
  const workbookDir = process.cwd();

  // Verify this is a workbook directory
  const handsJsonPath = join(workbookDir, "hands.json");
  if (!existsSync(handsJsonPath)) {
    console.error("Error: hands.json not found");
    console.error("Run this command from a workbook directory");
    process.exit(1);
  }

  // Load config to get workbook name as ID
  const config = await loadHandsJson(workbookDir);
  const workbookId = config.name;

  console.log(`Starting Hands dev server for: ${workbookId}`);

  // Find the runtime binary
  const runtimePath = findRuntimePath();
  if (!runtimePath) {
    console.error("Error: @hands/runtime not found");
    console.error("Install it with: bun add @hands/runtime");
    process.exit(1);
  }

  // Build args for runtime
  const args = [runtimePath, `--workbook-id=${workbookId}`, `--workbook-dir=${workbookDir}`];

  if (options.port) {
    args.push(`--port=${options.port}`);
  }

  // Spawn the runtime process
  const proc = spawn({
    cmd: ["bun", ...args],
    cwd: workbookDir,
    stdout: "inherit",
    stderr: "inherit",
    env: {
      ...process.env,
      HANDS_HMR: options.hmr !== false ? "1" : "0",
    },
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

/**
 * Find the runtime entry point
 */
function findRuntimePath(): string | null {
  // Try workspace path (development)
  const devPath = resolve(import.meta.dir, "../../../runtime/src/index.ts");
  if (existsSync(devPath)) {
    return devPath;
  }

  // Try node_modules path (production)
  const nodeModulesPath = join(process.cwd(), "node_modules/@hands/runtime/src/index.ts");
  if (existsSync(nodeModulesPath)) {
    return nodeModulesPath;
  }

  // Try resolving from package
  try {
    return require.resolve("@hands/runtime");
  } catch {
    return null;
  }
}
