/**
 * Hands Agent Server
 *
 * Runs an OpenCode server with custom agents and tools for the Hands app.
 * Spawned by Tauri as a subprocess.
 */

import { existsSync, lstatSync, mkdirSync, symlinkSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Config } from "@opencode-ai/sdk";
import { createOpencode } from "@opencode-ai/sdk";
import { coderAgent, handsAgent, importAgent } from "../agents";

// Configuration
const PORT = parseInt(process.env.HANDS_AGENT_PORT || "55300", 10);
const MODEL = "openrouter/anthropic/claude-opus-4.5";

// Paths
// Bun uses import.meta.dir, Node uses import.meta.dirname
const AGENT_PKG_DIR = resolve(dirname(import.meta.dir ?? import.meta.dirname ?? __dirname), ".");
const TOOLS_SOURCE = resolve(AGENT_PKG_DIR, "tool");

/**
 * Symlink tools directory to .opencode/tool/
 * Skips if running from bundled binary (source path doesn't exist)
 */
function setupToolsSymlink(workingDir: string) {
  // Skip if source doesn't exist (running from compiled binary)
  if (!existsSync(TOOLS_SOURCE)) {
    return;
  }

  const opencodeDir = resolve(workingDir, ".opencode");
  const target = resolve(opencodeDir, "tool");

  if (!existsSync(opencodeDir)) {
    mkdirSync(opencodeDir, { recursive: true });
  }

  if (existsSync(target)) {
    const stat = lstatSync(target);
    if (stat.isSymbolicLink()) {
      unlinkSync(target);
    } else {
      console.warn(`[agent] Warning: ${target} exists and is not a symlink`);
      return;
    }
  }

  try {
    symlinkSync(TOOLS_SOURCE, target, "dir");
  } catch (err) {
    // Ignore symlink errors in bundled mode
  }
}

/**
 * Symlink plugin directory to .opencode/plugin/
 * OpenCode discovers plugins from the workbook's .opencode/plugin/ dir
 * Skips if running from bundled binary (source path doesn't exist)
 */
function setupPluginsSymlink(workingDir: string) {
  const pluginSource = resolve(AGENT_PKG_DIR, "plugin");

  // Skip if source doesn't exist (running from compiled binary)
  if (!existsSync(pluginSource)) {
    return;
  }

  const opencodeDir = resolve(workingDir, ".opencode");
  const target = resolve(opencodeDir, "plugin");

  if (!existsSync(opencodeDir)) {
    mkdirSync(opencodeDir, { recursive: true });
  }

  if (existsSync(target)) {
    const stat = lstatSync(target);
    if (stat.isSymbolicLink()) {
      unlinkSync(target);
    } else {
      console.warn(`[agent] Warning: ${target} exists and is not a symlink`);
      return;
    }
  }

  try {
    symlinkSync(pluginSource, target, "dir");
  } catch (err) {
    // Ignore symlink errors in bundled mode
  }
}

// Build config
const config: Config = {
  model: MODEL,
  // Disable OpenCode's built-in LSP file diagnostics - we use hands check instead
  lsp: false,
  // Plugins are auto-discovered from .opencode/plugin/ directory
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

  // Setup tools and plugins symlinks (both in workbook dir)
  setupToolsSymlink(workingDir);
  setupPluginsSymlink(workingDir);

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
