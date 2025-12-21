#!/usr/bin/env bun
/**
 * Standalone dev mode - runs editor + harness together
 *
 * Usage: bun run scripts/dev-standalone.ts <workbook-path>
 *
 * Starts:
 *   - Editor sandbox on port 5167 (with file API)
 *   - Harness on port 5173 (for previews/RSC)
 */

import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const workbookPath = process.argv[2];

if (!workbookPath) {
  console.error("Usage: bun run scripts/dev-standalone.ts <workbook-path>");
  console.error("Example: bun run scripts/dev-standalone.ts demo/workbook");
  process.exit(1);
}

const absoluteWorkbookPath = path.resolve(workbookPath);

if (!fs.existsSync(absoluteWorkbookPath)) {
  console.error(`Workbook not found: ${absoluteWorkbookPath}`);
  process.exit(1);
}

console.log(`\n🚀 Starting standalone dev mode`);
console.log(`   Workbook: ${absoluteWorkbookPath}`);
console.log(`   Editor:   http://localhost:5167/sandbox.html`);
console.log(`   Harness:  http://localhost:5173\n`);

const editorRoot = path.resolve(import.meta.dir, "..");
const harnessRoot = path.resolve(editorRoot, "../harness");

// Start harness
const harness = spawn("bun", ["run", "dev"], {
  cwd: harnessRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    HANDS_WORKBOOK_PATH: absoluteWorkbookPath,
  },
});

// Start editor sandbox
const editor = spawn(
  "bun",
  ["vite", "--config", "vite.sandbox.config.ts"],
  {
    cwd: editorRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      WORKBOOK_PATH: absoluteWorkbookPath,
      HARNESS_URL: "http://localhost:5173",
    },
  }
);

// Handle cleanup
function cleanup() {
  console.log("\n👋 Shutting down...");
  harness.kill();
  editor.kill();
  process.exit(0);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

// Handle child process exits
harness.on("exit", (code) => {
  if (code !== 0 && code !== null) {
    console.error(`Harness exited with code ${code}`);
  }
});

editor.on("exit", (code) => {
  if (code !== 0 && code !== null) {
    console.error(`Editor exited with code ${code}`);
  }
});
