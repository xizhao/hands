/**
 * Hands Agent Server
 *
 * Runs an OpenCode server with custom agents and tools for the Hands app.
 * Spawned by Tauri as a subprocess.
 */

import type { Config } from "@opencode-ai/sdk";
import { createOpencode } from "@opencode-ai/sdk";
import { HANDS_PROMPT, IMPORT_PROMPT } from "../prompts";
import { existsSync, mkdirSync, symlinkSync, unlinkSync, lstatSync } from "fs";
import { resolve, dirname } from "path";

// Configuration
const PORT = parseInt(process.env.HANDS_AGENT_PORT || "55300", 10);
const MODEL = process.env.HANDS_MODEL || "anthropic/claude-sonnet-4-20250514";

// Paths
const AGENT_PKG_DIR = resolve(dirname(import.meta.dirname), ".");
const TOOLS_SOURCE = resolve(AGENT_PKG_DIR, "tool");

/**
 * Symlink our tools directory to the working directory's .opencode/tool/
 * OpenCode discovers tools from $CWD/.opencode/tool/*.ts
 */
function setupToolsSymlink(workingDir: string) {
  const opencodeDir = resolve(workingDir, ".opencode");
  const toolsTarget = resolve(opencodeDir, "tool");

  // Create .opencode directory if needed
  if (!existsSync(opencodeDir)) {
    mkdirSync(opencodeDir, { recursive: true });
    console.log(`[hands-agent] Created ${opencodeDir}`);
  }

  // Remove existing symlink/dir if it exists
  if (existsSync(toolsTarget)) {
    const stat = lstatSync(toolsTarget);
    if (stat.isSymbolicLink()) {
      unlinkSync(toolsTarget);
    } else {
      console.log(`[hands-agent] Warning: ${toolsTarget} exists and is not a symlink, skipping`);
      return;
    }
  }

  // Create symlink
  symlinkSync(TOOLS_SOURCE, toolsTarget, "dir");
  console.log(`[hands-agent] Symlinked tools: ${toolsTarget} -> ${TOOLS_SOURCE}`);
}

// Build config
const config: Config = {
  model: MODEL,
  agent: {
    // Disable general, keep build/plan/explore
    general: { disable: true },
    hands: {
      description: "Primary agent for Hands data app builder",
      mode: "primary",
      prompt: HANDS_PROMPT,
      tools: {
        read: true,
        write: true,
        edit: true,
        bash: true,
      },
    },
    import: {
      description: "Import and ingest files into PostgreSQL database",
      mode: "subagent",
      temperature: 0.1,
      prompt: IMPORT_PROMPT,
      tools: {
        read: true,
        write: true,
        bash: true,
        edit: true,
      },
      permission: {
        bash: { "*": "allow" },
        edit: "allow",
      },
    },
  },
};

async function main() {
  console.log(`[hands-agent] Starting server on port ${PORT}...`);
  console.log(`[hands-agent] Model: ${MODEL}`);

  // Get working directory from env (set by Tauri) or use cwd
  const workingDir = process.env.HANDS_WORKBOOK_DIR || process.cwd();
  console.log(`[hands-agent] Working directory: ${workingDir}`);

  // Setup tools symlink so OpenCode can discover our custom tools
  setupToolsSymlink(workingDir);

  try {
    const { server, client } = await createOpencode({
      hostname: "127.0.0.1",
      port: PORT,
      config,
    });

    console.log(`[hands-agent] Server running at ${server.url}`);

    // Verify agents loaded
    const agents = await client.app.agents();
    console.log(`[hands-agent] Agents loaded:`, agents.data);

    // Output ready message for Tauri to detect
    console.log(JSON.stringify({ type: "ready", port: PORT, url: server.url }));

    // Handle shutdown
    process.on("SIGINT", () => {
      console.log("[hands-agent] Shutting down...");
      server.close();
      process.exit(0);
    });

    process.on("SIGTERM", () => {
      console.log("[hands-agent] Shutting down...");
      server.close();
      process.exit(0);
    });
  } catch (error) {
    console.error("[hands-agent] Failed to start:", error);
    process.exit(1);
  }
}

main();
