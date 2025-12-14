/**
 * Components tool - search and get info about UI components
 *
 * Uses dynamic import to avoid loading stdlib at tool discovery time.
 */

import { tool } from "@opencode-ai/plugin";

const components = tool({
  description: `Search and get info about UI components from @hands/stdlib.

Available categories: ui, data, charts

Actions:
- **search**: Find components by name, description, or category (use query param)
- **info**: Get detailed info about a specific component (use name param)
- **list**: List all components, optionally filtered by category`,

  args: {
    action: tool.schema.enum(["search", "info", "list"]).describe("Action to perform"),
    query: tool.schema.string().optional().describe("Search query for 'search' action"),
    name: tool.schema.string().optional().describe("Component name for 'info' action"),
    category: tool.schema
      .enum(["ui", "data", "charts", "maps"])
      .optional()
      .describe("Filter by category for 'list' action"),
  },

  async execute(args) {
    // Dynamic import - only loads when tool is actually called
    const {
      getCategory,
      getComponent,
      listCategories,
      listComponents,
      searchComponents,
    } = await import("@hands/stdlib/registry");

    const { action, query, name, category } = args;

    // Helper to format component list
    const formatList = (comps: Array<{ key: string; name: string; category: string; description: string }>) => {
      if (comps.length === 0) return "No components found.";

      const byCategory: Record<string, typeof comps> = {};
      for (const comp of comps) {
        if (!byCategory[comp.category]) byCategory[comp.category] = [];
        byCategory[comp.category].push(comp);
      }

      let output = "";
      for (const [cat, items] of Object.entries(byCategory)) {
        const catInfo = getCategory(cat);
        output += `### ${catInfo?.name ?? cat}\n`;
        for (const comp of items) {
          output += `- **${comp.name}** (\`${comp.key}\`) - ${comp.description}\n`;
        }
        output += "\n";
      }
      return output;
    };

    if (action === "search") {
      if (!query) {
        return "Error: query required for 'search' action.";
      }

      const results = searchComponents(query);
      if (results.length === 0) {
        const all = listComponents();
        return `No components matching "${query}".\n\nAvailable: ${all.map((c) => c.key).join(", ")}`;
      }

      let output = `## Search Results for "${query}"\n\n`;
      output += formatList(results);
      output += `Use \`action='info' name='<component>'\` for details.`;
      return output;
    }

    if (action === "info") {
      if (!name) {
        const all = listComponents();
        return `Error: name required for 'info' action.\n\nAvailable: ${all.map((c) => c.key).join(", ")}`;
      }

      const comp = getComponent(name);
      if (!comp) {
        const all = listComponents();
        return `Component "${name}" not found.\n\nAvailable: ${all.map((c) => c.key).join(", ")}`;
      }

      const catInfo = getCategory(comp.category);
      let output = `## ${comp.name}\n\n`;
      output += `${comp.description}\n\n`;
      output += `**Category:** ${catInfo?.name ?? comp.category}\n\n`;

      output += `### Files\n`;
      for (const file of comp.files) {
        output += `- \`${file}\`\n`;
      }
      output += "\n";

      if (comp.dependencies.length > 0) {
        output += `### Dependencies\n`;
        for (const dep of comp.dependencies) {
          output += `- \`${dep}\`\n`;
        }
        output += "\n";
      }

      if (comp.example) {
        output += `### Example\n\`\`\`tsx\n${comp.example}\n\`\`\`\n`;
      }

      return output;
    }

    if (action === "list") {
      const comps = listComponents(category);
      const categories = listCategories();

      let output = "## Available Components\n\n";

      if (category) {
        const cat = getCategory(category);
        output += `Showing: ${cat?.name ?? category}\n\n`;
      } else {
        output += `Categories: ${categories.map((c) => `${c.name} (${c.key})`).join(", ")}\n\n`;
      }

      output += formatList(comps);
      output += `Use \`action='search' query='...'\` to find components.\n`;
      output += `Use \`action='info' name='<component>'\` for details.`;
      return output;
    }

    return `Unknown action: ${action}. Use 'search', 'info', or 'list'.`;
  },
});

export default components;
