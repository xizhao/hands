/**
 * Check Block tool - verify a block executes successfully at runtime
 *
 * Hits the block's endpoint to verify it renders without errors.
 * Parses RSC Flight stream to catch all errors including:
 * - Database query failures
 * - Missing/invalid props
 * - React rendering errors (including serialization errors)
 * - Runtime exceptions
 */

import { tool } from "@opencode-ai/plugin";

// Default runtime port (matches PORTS.RUNTIME in runtime/src/ports.ts)
const DEFAULT_RUNTIME_PORT = 55000;

/**
 * Parse RSC Flight stream for errors
 * Flight format: {id}:E{json} for errors
 * Example: 3:E{"name":"Error","message":"Functions cannot be passed..."}
 */
function parseFlightStreamForErrors(text: string): string | null {
  // Look for error chunks in Flight format
  const errorMatches = text.matchAll(/\d+:E(\{[^\n]+\})/g);
  for (const match of errorMatches) {
    try {
      const errorData = JSON.parse(match[1]);
      if (errorData.message) {
        return errorData.message;
      }
    } catch {
      // Continue to next match
    }
  }
  return null;
}

const checkBlock = tool({
  description: `Test if a block executes successfully at runtime.

Unlike the 'check' tool (TypeScript validation), this actually runs the block to catch:
- Database query errors (missing tables, bad SQL)
- React rendering errors (including serialization errors)
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
    const url = `http://localhost:${port}/_editor/blocks/${blockId}`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "text/x-component, application/json",
        },
      });

      const contentType = response.headers.get("content-type") || "";

      // Handle JSON error response (load errors, etc.)
      if (contentType.includes("application/json")) {
        try {
          const errorData = await response.json();
          const errorMessage = errorData.error || "Unknown error";
          const stack = errorData.stack || "";

          let result = `✗ Block "${blockId}" failed to execute (HTTP ${response.status})\n\n`;
          result += `Error: ${errorMessage}`;

          if (stack) {
            const stackLines = stack.split("\n").slice(0, 5).join("\n");
            result += `\n\nStack trace:\n${stackLines}`;
          }

          return result;
        } catch {
          return `✗ Block "${blockId}" failed (HTTP ${response.status}): Could not parse error response`;
        }
      }

      // For RSC streams, consume full stream and check for error chunks
      if (contentType.includes("text/x-component")) {
        const text = await response.text();

        // Check for error chunks in the Flight stream
        const streamError = parseFlightStreamForErrors(text);
        if (streamError) {
          return `✗ Block "${blockId}" failed during render\n\nError: ${streamError}`;
        }

        // Stream completed without errors
        return `✓ Block "${blockId}" renders successfully`;
      }

      // Non-RSC success response
      if (response.ok) {
        return `✓ Block "${blockId}" executes successfully (HTTP ${response.status})`;
      }

      // Other error response
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
