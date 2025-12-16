/**
 * Diagnostics Plugin for Hands
 *
 * Runs `hands check` in the workbook to type-check and lint code.
 */
import type { Plugin } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";
import { spawn } from "child_process";
import path from "path";

const plugin: Plugin = async ({ directory }) => {
  return {
    tool: {
      hands_diagnostics: tool({
        description:
          "Run diagnostics on the Hands workbook. " +
          "Runs TypeScript type checking and Biome linting on workbook files.",
        args: {},
        async execute() {
          const cliPath = path.resolve(
            import.meta.dirname,
            "../../cli/bin/hands.js"
          );

          return new Promise((resolve) => {
            const child = spawn(cliPath, ["check"], {
              cwd: directory,
              stdio: ["ignore", "pipe", "pipe"],
            });

            let stdout = "";
            let stderr = "";

            child.stdout?.on("data", (data) => {
              stdout += data.toString();
            });

            child.stderr?.on("data", (data) => {
              stderr += data.toString();
            });

            child.on("exit", (code) => {
              const output = stdout + stderr;
              // Strip ANSI codes for cleaner output
              const cleaned = output.replace(
                /\x1b\[[0-9;]*[a-zA-Z]/g,
                ""
              );
              resolve(cleaned || (code === 0 ? "All checks passed" : "Check failed"));
            });

            child.on("error", (err) => {
              resolve(`Failed to run diagnostics: ${err.message}`);
            });
          });
        },
      }),
    },
  };
};

export default plugin;
