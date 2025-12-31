/**
 * Hands Agent Server
 *
 * Runs an OpenCode server with custom agents and tools for the Hands app.
 * Spawned by Tauri as a subprocess.
 */

import { existsSync, lstatSync, mkdirSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";

// Setup NODE_PATH for native modules (nodejs-polars) shipped with the binary
// This must be done before any imports that might need these modules
function setupNodePath() {
  // In compiled binary, process.execPath points to the binary itself
  const binaryDir = dirname(process.execPath);

  // Check multiple possible locations for lib/node_modules:
  // 1. Next to binary (dev mode or simple deployment)
  // 2. In Resources folder (macOS app bundle: Contents/MacOS/../Resources/lib)
  // 3. In parent lib folder (Linux/Windows app bundle)
  const possiblePaths = [
    join(binaryDir, "lib", "node_modules"),
    join(binaryDir, "..", "Resources", "lib", "node_modules"),
    join(binaryDir, "..", "lib", "node_modules"),
  ];

  for (const libPath of possiblePaths) {
    if (existsSync(libPath)) {
      // Prepend to NODE_PATH so shipped modules take precedence
      const currentNodePath = process.env.NODE_PATH || "";
      process.env.NODE_PATH = currentNodePath
        ? `${libPath}:${currentNodePath}`
        : libPath;
      console.log(`[agent] Set NODE_PATH to include: ${libPath}`);
      return;
    }
  }
}
setupNodePath();
import type { Config } from "@opencode-ai/sdk";
import { createOpencode } from "@opencode-ai/sdk";
import { coderAgent, handsAgent, importAgent, researcherAgent } from "../agents";
// Generated at build time by scripts/bundle-tools.ts
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - file may not exist in dev mode
import { EMBEDDED_TOOLS } from "./embedded-tools.generated";

// Configuration
const PORT = parseInt(process.env.HANDS_AGENT_PORT || "55300", 10);
const MODEL = "openrouter/anthropic/claude-opus-4.5";

// Paths
const AGENT_PKG_DIR = resolve(dirname(import.meta.dir ?? import.meta.dirname ?? __dirname), ".");

/**
 * Setup tools in .opencode/tool/
 * Always writes tool files (no symlinks - more reliable across platforms)
 */
function setupTools(workingDir: string) {
  const opencodeDir = resolve(workingDir, ".opencode");
  const toolDir = resolve(opencodeDir, "tool");

  // Clean up any existing symlink or directory
  try {
    const stat = lstatSync(toolDir);
    if (stat.isSymbolicLink()) {
      unlinkSync(toolDir);
    }
  } catch {
    // Doesn't exist - fine
  }

  if (!existsSync(toolDir)) {
    mkdirSync(toolDir, { recursive: true });
  }

  // EMBEDDED_TOOLS is generated at build time by scripts/bundle-tools.ts
  if (!EMBEDDED_TOOLS || Object.keys(EMBEDDED_TOOLS).length === 0) {
    console.warn("[agent] No embedded tools found - tools will not be available");
    return;
  }

  for (const [filename, source] of Object.entries(EMBEDDED_TOOLS)) {
    const filePath = resolve(toolDir, filename);
    writeFileSync(filePath, source, "utf-8");
  }
  console.log(`[agent] Wrote ${Object.keys(EMBEDDED_TOOLS).length} tools to ${toolDir}`);
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
    researcher: researcherAgent,
  },
};

async function main() {
  // Get working directory from env (set by Tauri) or use cwd
  const workingDir = process.env.HANDS_WORKBOOK_DIR || process.cwd();

  // Setup tools and plugins (symlink in dev, embed in bundled)
  setupTools(workingDir);
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
