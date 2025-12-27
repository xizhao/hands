/**
 * UI tool - search and add components via hands ui (shadcn proxy)
 */

import { tool } from "@opencode-ai/plugin";
import { runCliSync } from "../lib/cli";

const ui = tool({
  description: `Search and add UI components from shadcn and other registries.

Actions:
- **search**: Find components in a registry (default: @shadcn)
- **add**: Add a component to the workbook

Registries:
- @shadcn - Official shadcn/ui components
- @magicui - Animation components

Examples:
- search: \`action='search' query='button'\`
- add: \`action='add' component='@shadcn/button'\``,

  args: {
    action: tool.schema.enum(["search", "add"]).describe("Action to perform"),
    query: tool.schema
      .string()
      .optional()
      .describe("Search query for 'search' action"),
    registry: tool.schema
      .string()
      .optional()
      .describe("Registry to search (default: @shadcn)"),
    component: tool.schema
      .string()
      .optional()
      .describe("Component to add (e.g., '@shadcn/button')"),
  },

  async execute(args) {
    const { action, query, registry = "@shadcn", component } = args;

    try {
      if (action === "search") {
        const searchQuery = query ?? "";
        const result = runCliSync(["ui", "search", registry, "-q", searchQuery], { timeout: 30000 });

        if (result.code !== 0) {
          return `Error: ${result.stderr || result.stdout}`;
        }

        // Parse JSON output
        const data = JSON.parse(result.stdout.split("\n").slice(1).join("\n")); // Skip "Running:" line

        if (!data.items || data.items.length === 0) {
          return `No components found for "${searchQuery}" in ${registry}`;
        }

        let output = `## Components in ${registry}`;
        if (searchQuery) output += ` matching "${searchQuery}"`;
        output += `\n\nFound ${data.pagination.total} components:\n\n`;

        for (const item of data.items.slice(0, 20)) {
          output += `- **${item.name}** - \`${item.addCommandArgument}\`\n`;
        }

        if (data.pagination.hasMore) {
          output += `\n... and ${data.pagination.total - 20} more`;
        }

        output += `\n\nTo add: \`action='add' component='@shadcn/component-name'\``;
        return output;
      }

      if (action === "add") {
        if (!component) {
          return "Error: component required for 'add' action. Example: component='@shadcn/button'";
        }

        // Run from workbook directory where components.json lives
        const workbookDir = process.cwd();
        const result = runCliSync(["ui", "add", component], { cwd: workbookDir, timeout: 60000 });

        if (result.code !== 0) {
          return `Error: ${result.stderr || result.stdout}`;
        }

        return `Added ${component}\n\n${result.stdout}`;
      }

      return `Unknown action: ${action}. Use 'search' or 'add'.`;
    } catch (error) {
      const err = error as Error & { stdout?: string; stderr?: string };
      return `Error: ${err.message}\n${err.stderr || err.stdout || ""}`;
    }
  },
});

export default ui;
