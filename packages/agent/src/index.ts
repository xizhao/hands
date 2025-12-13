/**
 * Hands Agent Server
 *
 * Runs an OpenCode server with custom agents and tools for the Hands app.
 * Spawned by Tauri as a subprocess.
 */

import type { Config } from "@opencode-ai/sdk";
import { createOpencode } from "@opencode-ai/sdk";
import { existsSync, lstatSync, mkdirSync, symlinkSync, unlinkSync } from "fs";
import { dirname, resolve } from "path";
import { handsAgent, coderAgent, importAgent } from "../agents";

// Configuration
const PORT = parseInt(process.env.HANDS_AGENT_PORT || "55300", 10);
const MODEL = process.env.HANDS_MODEL || "anthropic/claude-sonnet-4-20250514";

// Paths
const AGENT_PKG_DIR = resolve(dirname(import.meta.dirname), ".");
const TOOLS_SOURCE = resolve(AGENT_PKG_DIR, "tool");
const PLUGINS_SOURCE = resolve(AGENT_PKG_DIR, "plugin");

/**
 * Symlink a source directory to a target in .opencode/
 * OpenCode discovers tools from $CWD/.opencode/tool/*.ts
 * OpenCode discovers plugins from $CWD/.opencode/plugin/*.ts
 */
function setupSymlink(workingDir: string, source: string, name: string) {
  const opencodeDir = resolve(workingDir, ".opencode");
  const target = resolve(opencodeDir, name);

  // Create .opencode directory if needed
  if (!existsSync(opencodeDir)) {
    mkdirSync(opencodeDir, { recursive: true });
  }

  // Remove existing symlink/dir if it exists
  if (existsSync(target)) {
    const stat = lstatSync(target);
    if (stat.isSymbolicLink()) {
      unlinkSync(target);
    } else {
      console.warn(`[agent] Warning: ${target} exists and is not a symlink`);
      return;
    }
  }

  // Create symlink
  symlinkSync(source, target, "dir");
}

// Build config
const config: Config = {
  model: MODEL,
  // Register plugins by path - OpenCode will load from .opencode/plugin/ directory
  plugin: ["diagnostics"],
  agent: {
    // Disable general and build, keep plan/explore
    general: { disable: true },
    build: { disable: true },
    // Custom agents
    hands: handsAgent,
    coder: coderAgent,
    import: importAgent,
  },
};

async function main() {
  // Get working directory from env (set by Tauri) or use cwd
  const workingDir = process.env.HANDS_WORKBOOK_DIR || process.cwd();

  // Setup symlinks so OpenCode can discover our custom tools and plugins
  setupSymlink(workingDir, TOOLS_SOURCE, "tool");
  setupSymlink(workingDir, PLUGINS_SOURCE, "plugin");

  try {
    const { server, client } = await createOpencode({
      hostname: "127.0.0.1",
      port: PORT,
      config,
    });

    // Verify agents loaded
    const agents = await client.app.agents();
    const agentNames = agents.data?.map((a: { name: string }) => a.name) ?? [];
    console.log(`[agent] Ready on :${PORT} (${agentNames.join(", ")})`);

    // Output ready message for Tauri to detect
    console.log(JSON.stringify({ type: "ready", port: PORT, url: server.url }));

    // Handle shutdown
    process.on("SIGINT", () => {
      server.close();
      process.exit(0);
    });

    process.on("SIGTERM", () => {
      server.close();
      process.exit(0);
    });
  } catch (error) {
    console.error("[agent] Failed to start:", error);
    process.exit(1);
  }
}

main();
