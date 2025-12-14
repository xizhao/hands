/**
 * Diagnostics Plugin for Hands
 *
 * Provides diagnostic tools for the AI agent to inspect the runtime and workbook state.
 * Uses tRPC client to communicate with the runtime.
 *
 * NOTE: tRPC is lazy-loaded inside execute() to avoid loading @hands/runtime
 * at plugin discovery time, which can slow down tool loading.
 */
import type { Plugin } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";

const plugin: Plugin = async ({ directory }) => {
  return {
    tool: {
      hands_diagnostics: tool({
        description:
          "Get diagnostics information about the Hands runtime and workbook. " +
          "Returns system status including database connection, worker state, and available sources.",
        args: {},
        async execute() {
          // Lazy load tRPC to avoid slowing down plugin discovery
          const { getRuntimePort, getTRPCClient } = await import("../lib/trpc.js");

          const results: Record<string, unknown> = {};

          try {
            // System info
            results.system = {
              workingDirectory: directory,
              platform: process.platform,
              nodeVersion: process.version,
              uptime: process.uptime(),
              runtimePort: getRuntimePort(),
            };

            // Get runtime status via tRPC
            try {
              const trpc = getTRPCClient();
              const status = await trpc.status.get.query();

              results.database = status.services?.db || { ready: false };
              results.blockServer = status.services?.blockServer || { ready: false };

              // Get manifest for sources info
              try {
                const manifest = await trpc.workbook.manifest.query();
                results.sources = manifest.sources || [];
                results.blocks = manifest.blocks?.length || 0;
                results.pages = manifest.pages?.length || 0;
              } catch {
                results.sources = [];
              }
            } catch (err) {
              results.runtimeError = `Could not connect to Hands runtime on port ${getRuntimePort()}: ${err}`;
            }
          } catch (err) {
            results.error = String(err);
          }

          return JSON.stringify(results, null, 2);
        },
      }),
    },
  };
};

export default plugin;
