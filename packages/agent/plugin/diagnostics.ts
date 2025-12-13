/**
 * Diagnostics Plugin for Hands
 *
 * Provides diagnostic tools for the AI agent to inspect the runtime and workbook state.
 */
import type { Plugin } from "@opencode-ai/plugin";

const plugin: Plugin = async ({ directory }) => {
  return {
    tool: {
      "hands.diagnostics": {
        description:
          "Get diagnostics information about the Hands runtime and workbook. " +
          "Returns system status including database connection, worker state, and available sources.",
        parameters: {
          type: "object",
          properties: {
            include: {
              type: "array",
              items: { type: "string" },
              description:
                "Optional list of diagnostic sections to include: 'system', 'database', 'sources'. Defaults to all.",
            },
          },
        },
        async execute({ include }) {
          const sections = include || ["system", "database", "sources"];
          const results: Record<string, unknown> = {};

          try {
            // System info
            if (sections.includes("system")) {
              results.system = {
                workingDirectory: directory,
                platform: process.platform,
                nodeVersion: process.version,
                uptime: process.uptime(),
              };
            }

            // Try to get runtime status from the local runtime server
            if (sections.includes("database") || sections.includes("sources")) {
              try {
                const statusRes = await fetch("http://localhost:4100/status");
                if (statusRes.ok) {
                  const status = await statusRes.json();
                  if (sections.includes("database")) {
                    results.database = status.services?.postgres || { state: "unknown" };
                  }
                  if (sections.includes("sources")) {
                    results.sources = status.sources || [];
                  }
                }
              } catch {
                results.runtimeError = "Could not connect to Hands runtime on port 4100";
              }
            }
          } catch (err) {
            results.error = String(err);
          }

          return {
            title: "Diagnostics",
            output: JSON.stringify(results, null, 2),
            metadata: results,
          };
        },
      },
    },
  };
};

export default plugin;
