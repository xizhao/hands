/**
 * Diagnostics Plugin for Hands
 *
 * Auto-injects diagnostics after file writes.
 * Runs `hands check --fix` to type-check and lint code.
 */
import type { Plugin } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";
import { spawn } from "child_process";
import path from "path";

// Max diagnostics to show before truncating
const MAX_DIAGNOSTICS = 5;

/**
 * Run `hands check --fix` and return the output
 */
function runCheck(
  cliPath: string,
  cwd: string
): Promise<{ output: string; code: number }> {
  return new Promise((resolve) => {
    // Run via node since cliPath is a .js file
    const child = spawn("node", [cliPath, "check", "--fix"], {
      cwd,
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
      const cleaned = output.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
      resolve({ output: cleaned, code: code ?? 0 });
    });

    child.on("error", (err) => {
      resolve({ output: `Failed to run diagnostics: ${err.message}`, code: 1 });
    });
  });
}

/**
 * Extract just the error lines from check output
 */
function extractErrors(output: string): string[] {
  const lines = output.split("\n");
  const errors: string[] = [];

  for (const line of lines) {
    // Match TypeScript errors: file.ts(line,col): error TS1234: message
    // Match Biome errors: file.ts:line:col error message
    // Match generic errors
    if (
      /error/i.test(line) &&
      !line.includes("0 errors") &&
      !line.includes("found 0")
    ) {
      errors.push(line.trim());
    }
  }

  return errors;
}

const plugin: Plugin = async ({ directory }) => {
  // Handle different runtime environments (Bun uses import.meta.dir, Node 20+ uses import.meta.dirname)
  const currentDir = import.meta.dirname ?? import.meta.dir ?? path.dirname(new URL(import.meta.url).pathname);
  const cliPath = path.resolve(currentDir, "../../cli/bin/hands.js");

  return {
    tool: {
      hands_diagnostics: tool({
        description:
          "Run diagnostics on the Hands workbook. " +
          "Runs TypeScript type checking and Biome linting on workbook files.",
        args: {},
        async execute() {
          const result = await runCheck(cliPath, directory);
          return result.output || (result.code === 0 ? "All checks passed" : "Check failed");
        },
      }),
    },

    // Auto-inject diagnostics after file writes
    "tool.execute.after": async (input, output) => {
      // Only run after write/edit tools
      if (input.tool !== "write" && input.tool !== "edit") {
        return;
      }

      const result = await runCheck(cliPath, directory);

      // If check passed, don't inject anything
      if (result.code === 0) {
        return;
      }

      // Extract just the errors to reduce noise
      const errors = extractErrors(result.output);
      if (errors.length === 0) {
        return;
      }

      // Truncate if too many errors
      const shown = errors.slice(0, MAX_DIAGNOSTICS);
      const remaining = errors.length - shown.length;

      let diagnosticsText = shown.join("\n");
      if (remaining > 0) {
        diagnosticsText += `\n(${remaining} more errors)`;
      }

      output.output += `\n\n<diagnostics>\n${diagnosticsText}\n</diagnostics>`;
    },
  };
};

export default plugin;
