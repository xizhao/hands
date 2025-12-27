/**
 * Diagnostics Plugin for Hands
 *
 * Auto-injects diagnostics after file writes.
 * Runs `hands check --fix` to type-check and lint code.
 */
import type { Plugin } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";
import { runCli } from "../lib/cli";

// Max diagnostics to show before truncating
const MAX_DIAGNOSTICS = 5;

/**
 * Run `hands check --fix` and return the output
 */
async function runCheck(
  cwd: string
): Promise<{ output: string; code: number }> {
  const result = await runCli(["check", "--fix"], { cwd });
  const output = result.stdout + result.stderr;
  // Strip ANSI codes for cleaner output
  const cleaned = output.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
  return { output: cleaned, code: result.code };
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
  return {
    tool: {
      hands_diagnostics: tool({
        description:
          "Run diagnostics on the Hands workbook. " +
          "Runs TypeScript type checking and Biome linting on workbook files.",
        args: {},
        async execute() {
          const result = await runCheck(directory);
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

      const result = await runCheck(directory);

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
