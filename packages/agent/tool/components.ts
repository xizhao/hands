import { tool } from "@opencode-ai/plugin";
import {
  listComponents,
  getComponent,
  searchComponents,
  listCategories,
  getCategory,
  type ComponentMeta,
} from "@hands/stdlib/registry";

function formatComponentList(components: Array<{ key: string } & ComponentMeta>): string {
  if (components.length === 0) return "No components found.";

  const byCategory = components.reduce((acc, comp) => {
    (acc[comp.category] ??= []).push(comp);
    return acc;
  }, {} as Record<string, typeof components>);

  let output = "";
  for (const [cat, comps] of Object.entries(byCategory)) {
    const category = getCategory(cat);
    output += `### ${category?.name ?? cat}\n`;
    for (const comp of comps) {
      output += `- **${comp.name}** (\`${comp.key}\`) - ${comp.description}\n`;
    }
    output += "\n";
  }
  return output;
}

function formatComponentInfo(comp: { key: string } & ComponentMeta): string {
  const category = getCategory(comp.category);

  let output = `## ${comp.name}\n\n`;
  output += `${comp.description}\n\n`;
  output += `**Category:** ${category?.name ?? comp.category}\n\n`;

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

  output += `### Install\n\`\`\`bash\nhands add component ${comp.key}\n\`\`\``;

  return output;
}

const components = tool({
  description: `Search and get info about UI components from @hands/stdlib.

Available categories: ui, data, charts

Actions:
- **search**: Find components by name, description, or category (use query param)
- **info**: Get detailed info about a specific component (use name param)
- **list**: List all components, optionally filtered by category`,

  args: {
    action: tool.schema
      .enum(["search", "info", "list"])
      .describe("Action to perform"),
    query: tool.schema
      .string()
      .optional()
      .describe("Search query for 'search' action"),
    name: tool.schema
      .string()
      .optional()
      .describe("Component name for 'info' action"),
    category: tool.schema
      .enum(["ui", "data", "charts"])
      .optional()
      .describe("Filter by category for 'list' action"),
  },

  async execute(args) {
    const { action, query, name, category } = args;

    if (action === "search") {
      if (!query) {
        return "Error: query required for 'search' action.";
      }

      const results = searchComponents(query);
      if (results.length === 0) {
        const allComponents = listComponents();
        return `No components matching "${query}".\n\nAvailable: ${allComponents.map((c) => c.key).join(", ")}`;
      }

      let output = `## Search Results for "${query}"\n\n`;
      output += formatComponentList(results);
      output += `Use \`action='info' name='<component>'\` for details.`;
      return output;
    }

    if (action === "info") {
      if (!name) {
        const allComponents = listComponents();
        return `Error: name required for 'info' action.\n\nAvailable: ${allComponents.map((c) => c.key).join(", ")}`;
      }

      const comp = getComponent(name);
      if (!comp) {
        const allComponents = listComponents();
        return `Component "${name}" not found.\n\nAvailable: ${allComponents.map((c) => c.key).join(", ")}`;
      }

      return formatComponentInfo(comp);
    }

    if (action === "list") {
      const components = listComponents(category);
      const categories = listCategories();

      let output = "## Available Components\n\n";

      if (category) {
        const cat = getCategory(category);
        output += `Showing: ${cat?.name ?? category}\n\n`;
      } else {
        output += `Categories: ${categories.map((c) => `${c.name} (${c.key})`).join(", ")}\n\n`;
      }

      output += formatComponentList(components);
      output += `Use \`action='search' query='...'\` to find components.\n`;
      output += `Use \`action='info' name='<component>'\` for details.`;
      return output;
    }

    return `Unknown action: ${action}. Use 'search', 'info', or 'list'.`;
  },
});

export default components;
