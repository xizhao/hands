import { tool } from "@opencode-ai/plugin";

const DEFAULT_RUNTIME_PORT = 55000;

function parseFlightStreamForErrors(text: string): string | null {
  const errorMatches = text.matchAll(/\d+:E(\{[^\n]+\})/g);
  for (const match of errorMatches) {
    try {
      const errorData = JSON.parse(match[1]);
      if (errorData.message) return errorData.message;
    } catch {}
  }
  return null;
}

const checkPlugin = tool({
  description: `Test if a TSX plugin executes successfully at runtime.

Unlike the 'check' tool (TypeScript validation), this actually runs the plugin via RSC to catch:
- Database query errors (missing tables, bad SQL)
- React rendering errors (including serialization errors)
- Missing imports or runtime exceptions
- Invalid props or context issues

Use this after creating or modifying a plugin in plugins/ to verify it works end-to-end.`,

  args: {
    pluginId: tool.schema.string().describe("The plugin ID to test (e.g., 'revenue-chart' or 'charts/bar-chart')"),
  },

  async execute(args, _ctx) {
    const { pluginId } = args;
    const port = process.env.HANDS_RUNTIME_PORT || DEFAULT_RUNTIME_PORT;
    const url = `http://localhost:${port}/_editor/blocks/${pluginId}`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "text/x-component, application/json" },
      });

      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        try {
          const errorData = await response.json();
          const errorMessage = errorData.error || "Unknown error";
          const stack = errorData.stack || "";

          let result = `✗ Plugin "${pluginId}" failed to execute (HTTP ${response.status})\n\n`;
          result += `Error: ${errorMessage}`;
          if (stack) {
            const stackLines = stack.split("\n").slice(0, 5).join("\n");
            result += `\n\nStack trace:\n${stackLines}`;
          }
          return result;
        } catch {
          return `✗ Plugin "${pluginId}" failed (HTTP ${response.status}): Could not parse error response`;
        }
      }

      if (contentType.includes("text/x-component")) {
        const text = await response.text();
        const streamError = parseFlightStreamForErrors(text);
        if (streamError) {
          return `✗ Plugin "${pluginId}" failed during render\n\nError: ${streamError}`;
        }
        return `✓ Plugin "${pluginId}" renders successfully`;
      }

      if (response.ok) {
        return `✓ Plugin "${pluginId}" executes successfully (HTTP ${response.status})`;
      }

      const text = await response.text();
      return `✗ Plugin "${pluginId}" failed (HTTP ${response.status}): ${text.slice(0, 500)}`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("ECONNREFUSED")) {
        return `✗ Could not connect to runtime at port ${port}. Is the runtime running?`;
      }
      return `✗ Plugin "${pluginId}" check failed: ${message}`;
    }
  },
});

export default checkPlugin;
