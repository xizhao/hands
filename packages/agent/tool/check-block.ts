/**
 * Check Block tool - verify a block executes successfully at runtime
 *
 * Hits the block's endpoint to verify it renders without errors.
 * This catches runtime errors that TypeScript checking misses:
 * - Database query failures
 * - Missing/invalid props
 * - React rendering errors
 * - Runtime exceptions
 */

import { tool } from "@opencode-ai/plugin";

// Default runtime port (matches PORTS.RUNTIME in runtime/src/ports.ts)
const DEFAULT_RUNTIME_PORT = 55000;

const checkBlock = tool({
  description: `Test if a block executes successfully at runtime.

Unlike the 'check' tool (TypeScript validation), this actually runs the block to catch:
- Database query errors (missing tables, bad SQL)
- React rendering errors
- Missing imports or runtime exceptions
- Invalid props or context issues

Use this after creating or modifying a block to verify it works end-to-end.`,

  args: {
    blockId: tool.schema
      .string()
      .describe("The block ID to test (e.g., 'revenue-chart' or 'charts/bar-chart')"),
  },

  async execute(args, _ctx) {
    const { blockId } = args;

    // Build URL
    const port = process.env.HANDS_RUNTIME_PORT || DEFAULT_RUNTIME_PORT;
    const url = `http://localhost:${port}/blocks/${blockId}`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "text/x-component, application/json",
        },
      });

      if (response.ok) {
        // Block rendered successfully
        return `✓ Block "${blockId}" executes successfully (HTTP ${response.status})`;
      }

      // Handle error response
      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        try {
          const errorData = await response.json();
          const errorMessage = errorData.error || "Unknown error";
          const stack = errorData.stack || "";

          let result = `✗ Block "${blockId}" failed to execute (HTTP ${response.status})\n\n`;
          result += `Error: ${errorMessage}`;

          if (stack) {
            // Extract the most relevant part of the stack trace
            const stackLines = stack.split("\n").slice(0, 5).join("\n");
            result += `\n\nStack trace:\n${stackLines}`;
          }

          return result;
        } catch {
          return `✗ Block "${blockId}" failed (HTTP ${response.status}): Could not parse error response`;
        }
      }

      // Non-JSON error response
      const text = await response.text();
      return `✗ Block "${blockId}" failed (HTTP ${response.status}): ${text.slice(0, 500)}`;
    } catch (err) {
      // Network or connection error
      const message = err instanceof Error ? err.message : String(err);

      if (message.includes("ECONNREFUSED")) {
        return `✗ Could not connect to runtime at port ${port}. Is the runtime running?`;
      }

      return `✗ Block "${blockId}" check failed: ${message}`;
    }
  },
});

export default checkBlock;
