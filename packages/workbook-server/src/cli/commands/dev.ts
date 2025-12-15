/**
 * hands dev - Start the development server
 *
 * Runs the runtime directly (no subprocess needed since we're in the runtime package).
 */

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadConfig } from "../../config/index.js";

interface DevOptions {
  port?: number;
  hmr?: boolean;
  editor?: boolean;
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
  const config = await loadConfig(workbookDir);
  const workbookId = config.name;

  console.log(`Starting Hands dev server for: ${workbookId}`);

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
