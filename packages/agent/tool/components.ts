import { tool } from "@opencode-ai/plugin";
import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";

// Component registry data (embedded from @hands/stdlib registry.json)
const COMPONENT_REGISTRY = {
  components: {
    button: {
      name: "Button",
      type: "ui",
      description: "A button component with multiple variants and sizes",
      import: "import { Button } from '@hands/stdlib'",
      usage: "<Button variant=\"primary\" size=\"md\">Click me</Button>",
      props: ["variant: 'primary' | 'secondary' | 'ghost'", "size: 'sm' | 'md' | 'lg'"],
    },
    card: {
      name: "Card",
      type: "ui",
      description: "A card container with header, content, and footer sections",
      import: "import { Card, CardHeader, CardContent, CardFooter } from '@hands/stdlib'",
      usage: "<Card><CardHeader>Title</CardHeader><CardContent>...</CardContent></Card>",
      props: [],
    },
    badge: {
      name: "Badge",
      type: "ui",
      description: "A small badge/chip for labels and status indicators",
      import: "import { Badge } from '@hands/stdlib'",
      usage: "<Badge variant=\"success\">Active</Badge>",
      props: ["variant: 'default' | 'success' | 'warning' | 'error'"],
    },
    "metric-card": {
      name: "MetricCard",
      type: "data",
      description: "Display a single metric with label, value, and optional trend",
      import: "import { MetricCard } from '@hands/stdlib'",
      usage: "<MetricCard value={123} label=\"Total Sales\" trend={+5.2} />",
      props: ["value: number | string", "label: string", "trend?: number (positive = up, negative = down)"],
    },
    "data-table": {
      name: "DataTable",
      type: "data",
      description: "A simple data table for displaying rows of data",
      import: "import { DataTable } from '@hands/stdlib'",
      usage: "<DataTable data={rows} columns={[{key: 'name', label: 'Name'}]} />",
      props: ["data: Record<string, any>[]", "columns: {key: string, label: string}[]"],
    },
    "line-chart": {
      name: "LineChart",
      type: "chart",
      description: "A line chart for time series data using SVG",
      import: "import { LineChart } from '@hands/stdlib'",
      usage: "<LineChart data={data} xKey=\"date\" yKey=\"value\" />",
      props: ["data: Record<string, any>[]", "xKey: string", "yKey: string"],
    },
    "bar-chart": {
      name: "BarChart",
      type: "chart",
      description: "A bar chart for categorical comparisons",
      import: "import { BarChart } from '@hands/stdlib'",
      usage: "<BarChart data={data} xKey=\"category\" yKey=\"value\" />",
      props: ["data: Record<string, any>[]", "xKey: string", "yKey: string"],
    },
  },
  categories: {
    ui: { name: "UI", description: "Base UI components" },
    data: { name: "Data", description: "Components for displaying data" },
    chart: { name: "Charts", description: "Data visualization components" },
  },
};

const components = tool({
  description: `Get information about available UI components from @hands/stdlib.

Components are pre-built React components for building blocks:
- **UI**: Button, Card, Badge
- **Data**: MetricCard, DataTable
- **Charts**: LineChart, BarChart

Use this tool to:
- List all available components
- Get usage examples and props for a specific component
- See how to import components`,

  args: {
    action: tool.schema
      .enum(["list", "info"])
      .describe("Action: 'list' shows all components, 'info' shows details for one component"),
    name: tool.schema
      .string()
      .optional()
      .describe("Component name for 'info' action (e.g., 'button', 'line-chart', 'metric-card')"),
    category: tool.schema
      .enum(["ui", "data", "chart"])
      .optional()
      .describe("Filter by category for 'list' action"),
  },

  async execute(args, ctx) {
    const { action, name, category } = args;

    if (action === "list") {
      let output = "## Available Components\n\n";

      const categories = category
        ? { [category]: COMPONENT_REGISTRY.categories[category] }
        : COMPONENT_REGISTRY.categories;

      for (const [catKey, catInfo] of Object.entries(categories)) {
        output += `### ${catInfo.name}\n`;
        output += `${catInfo.description}\n\n`;

        const componentsInCategory = Object.entries(COMPONENT_REGISTRY.components)
          .filter(([_, comp]) => comp.type === catKey);

        for (const [key, comp] of componentsInCategory) {
          output += `- **${comp.name}** (\`${key}\`) - ${comp.description}\n`;
        }
        output += "\n";
      }

      output += "Use `action='info'` with `name='<component>'` to see usage details.";
      return output;
    }

    if (action === "info") {
      if (!name) {
        return `Error: Component name required for 'info' action.

Available components: ${Object.keys(COMPONENT_REGISTRY.components).join(", ")}`;
      }

      const comp = COMPONENT_REGISTRY.components[name as keyof typeof COMPONENT_REGISTRY.components];
      if (!comp) {
        return `Component "${name}" not found.

Available components: ${Object.keys(COMPONENT_REGISTRY.components).join(", ")}`;
      }

      let output = `## ${comp.name}\n\n`;
      output += `${comp.description}\n\n`;
      output += `**Category:** ${COMPONENT_REGISTRY.categories[comp.type as keyof typeof COMPONENT_REGISTRY.categories].name}\n\n`;
      output += `### Import\n\`\`\`typescript\n${comp.import}\n\`\`\`\n\n`;
      output += `### Usage\n\`\`\`tsx\n${comp.usage}\n\`\`\`\n\n`;

      if (comp.props.length > 0) {
        output += `### Props\n`;
        for (const prop of comp.props) {
          output += `- \`${prop}\`\n`;
        }
      }

      return output;
    }

    return `Unknown action: ${action}. Use 'list' or 'info'.`;
  },
});

export default components;
