/**
 * UI tool - search and add components via hands ui (shadcn proxy)
 */

import { execSync } from "node:child_process";
import { tool } from "@opencode-ai/plugin";

const ui = tool({
  description: `Search and add UI components from shadcn and other registries.

Actions:
- **search**: Find components in a registry (default: @shadcn)
- **add**: Add a component to the workbook

Registries:
- @shadcn - Official shadcn/ui components
- @plate-ui - Plate editor components
- @magicui - Animation components

Examples:
- search: \`action='search' query='button'\`
- add: \`action='add' component='@shadcn/button'\``,

  args: {
    action: tool.schema.enum(["search", "add"]).describe("Action to perform"),
    query: tool.schema.string().optional().describe("Search query for 'search' action"),
    registry: tool.schema.string().optional().describe("Registry to search (default: @shadcn)"),
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
        const cmd = `hands ui search ${registry} -q "${searchQuery}"`;
        const result = execSync(cmd, { encoding: "utf-8", timeout: 30000 });

        // Parse JSON output
        const data = JSON.parse(result.split("\n").slice(1).join("\n")); // Skip "Running:" line

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

        const cmd = `hands ui add ${component}`;
        const result = execSync(cmd, {
          encoding: "utf-8",
          timeout: 60000,
          stdio: ["pipe", "pipe", "pipe"],
        });

        return `Added ${component}\n\n${result}`;
      }

      return `Unknown action: ${action}. Use 'search' or 'add'.`;
    } catch (error) {
      const err = error as Error & { stdout?: string; stderr?: string };
      return `Error: ${err.message}\n${err.stderr || err.stdout || ""}`;
    }
  },
});

export default ui;
