#!/usr/bin/env bun
/**
 * Development script that runs the runtime + editor sandbox
 *
 * Usage: bun run scripts/dev-with-runtime.ts
 *
 * This starts:
 * 1. Runtime server on port 55100 (API + blocks vite)
 * 2. Editor sandbox vite server on port 5167
 *
 * Then opens the sandbox in the browser.
 */

import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { getTRPCClient } from "../src/trpc";

const RUNTIME_PORT = 55100;
const SANDBOX_PORT = 5167;
const WORKBOOK_ID = "editor-demo";
const WORKBOOK_DIR = resolve(import.meta.dirname, "../demo/workbook");
const RUNTIME_DIR = resolve(import.meta.dirname, "../../runtime");
const EDITOR_DIR = resolve(import.meta.dirname, "..");

console.log("[dev] Starting editor development environment...");
console.log("[dev] Workbook:", WORKBOOK_DIR);

// Start the runtime (without editor - we run it separately)
const runtime = spawn(
  "bun",
  [
    "run",
    "src/index.ts",
    `--workbook-id=${WORKBOOK_ID}`,
    `--workbook-dir=${WORKBOOK_DIR}`,
    `--port=${RUNTIME_PORT}`,
    "--no-editor",
  ],
  {
    cwd: RUNTIME_DIR,
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "development" },
  }
);

// Start editor sandbox vite server
const sandbox = spawn(
  "bun",
  ["run", "dev:sandbox", "--", "--port", String(SANDBOX_PORT)],
  {
    cwd: EDITOR_DIR,
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "development" },
  }
);

// Wait for both servers to be ready
console.log("[dev] Waiting for servers to be ready...");
const trpc = getTRPCClient(RUNTIME_PORT);

const waitForServers = async () => {
  let runtimeReady = false;
  let sandboxReady = false;

  for (let i = 0; i < 120; i++) {
    try {
      // Check runtime health via tRPC
      if (!runtimeReady) {
        const health = await trpc.status.health.query();
        if (health.ready) {
          runtimeReady = true;
          console.log("[dev] Runtime ready (db + blocks vite)");
        }
      }

      // Check editor sandbox on its own port
      if (!sandboxReady) {
        const sandboxRes = await fetch(`http://localhost:${SANDBOX_PORT}/sandbox.html`);
        if (sandboxRes.ok) {
          sandboxReady = true;
          console.log("[dev] Editor sandbox ready");
        }
      }

      if (runtimeReady && sandboxReady) {
        return true;
      }

      const waiting = [];
      if (!runtimeReady) waiting.push("runtime");
      if (!sandboxReady) waiting.push("sandbox");
      if (i % 3 === 0) {
        console.log(`[dev] Waiting for: ${waiting.join(", ")}... (${i + 1}s)`);
      }
    } catch {
      if (i % 5 === 0) {
        console.log(`[dev] Waiting for servers to start... (${i + 1}s)`);
      }
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.error("[dev] Timeout waiting for servers");
  return false;
};

if (!(await waitForServers())) {
  runtime.kill();
  sandbox.kill();
  process.exit(1);
}

// Determine what to open - prefer pages, fallback to blocks
// Sandbox runs on its own port, runtime provides API + blocks vite
let openUrl: string;
try {
  const manifest = await trpc.workbook.manifest.query();

  if (manifest.pages?.length > 0) {
    // Open first page in MDX editor - use route not id
    const page = manifest.pages[0];
    openUrl = `http://localhost:${SANDBOX_PORT}/sandbox.html?pageId=${page.route}&runtimePort=${RUNTIME_PORT}`;
    console.log(`\n[dev] Opening page: ${page.route}`);
  } else if (manifest.blocks?.length > 0) {
    // Fallback to first block
    const blockId = manifest.blocks[0].id;
    openUrl = `http://localhost:${SANDBOX_PORT}/sandbox.html?blockId=${blockId}&runtimePort=${RUNTIME_PORT}`;
    console.log(`\n[dev] Opening block: ${blockId}`);
  } else {
    console.log("\n[dev] No pages or blocks found in workbook");
    openUrl = `http://localhost:${SANDBOX_PORT}/sandbox.html?runtimePort=${RUNTIME_PORT}`;
  }
} catch (err) {
  console.error("[dev] Failed to get manifest:", err);
  // Fallback
  openUrl = `http://localhost:${SANDBOX_PORT}/sandbox.html?runtimePort=${RUNTIME_PORT}`;
}

console.log(`[dev] URL: ${openUrl}\n`);

const openCmd =
  process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
spawn(openCmd, [openUrl], { stdio: "ignore" });

// Handle cleanup
const cleanup = () => {
  console.log("\n[dev] Shutting down...");
  runtime.kill();
  sandbox.kill();
  process.exit(0);
};

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

// Keep alive
await new Promise(() => {});
