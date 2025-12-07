import { tool, type ToolDefinition } from "@opencode-ai/plugin"

export const dashboardTool: ToolDefinition = tool({
  description: `Create or modify a dashboard in the hands data app.

Dashboards are serverless web pages that display:
- Charts and visualizations
- Tables of data
- Key metrics
- Real-time updates`,

  args: {
    action: tool.schema
      .enum(["create", "update", "list", "delete"])
      .describe("Action to perform"),
    name: tool.schema.string().optional().describe("Dashboard name (required for create/update/delete)"),
    title: tool.schema.string().optional().describe("Dashboard title"),
    widgets: tool.schema
      .array(
        tool.schema.object({
          type: tool.schema.enum(["chart", "table", "metric", "text"]),
          title: tool.schema.string(),
          query: tool.schema.string().optional(),
        })
      )
      .optional()
      .describe("Widgets to include"),
  },

  async execute(args, ctx) {
    const { action, name, title, widgets } = args

    switch (action) {
      case "list":
        return `# Dashboards

| Name | Title | Handler |
|------|-------|---------|
| main | Events Dashboard | dashboards/main.handler |

Total: 1 dashboard`

      case "create":
        if (!name) {
          return "Error: name is required for create action"
        }

        const dashTitle = title || `${name.charAt(0).toUpperCase() + name.slice(1)} Dashboard`

        const widgetCode =
          widgets
            ?.map(
              (w) => `
      {
        type: "${w.type}",
        title: "${w.title}",
        data: await ctx.sql\`${w.query || "SELECT 1"}\`,
      }`
            )
            .join(",") ||
          `
      {
        type: "chart",
        title: "Sample Chart",
        data: await ctx.sql\`SELECT date_trunc('day', created_at) as day, count(*) FROM events GROUP BY 1\`,
      }`

        const handlerCode = `import { dashboard } from "@hands/sst-stdlib"

export const handler = dashboard(async (ctx) => {
  return {
    title: "${dashTitle}",
    widgets: [${widgetCode}
    ],
  }
})
`

        return `# Create Dashboard: ${name}

Would create:
1. Handler file: \`dashboards/${name}.ts\`
2. Config entry in \`hands.config.ts\`

## Handler Code
\`\`\`typescript
${handlerCode}
\`\`\`

## Config Addition
\`\`\`typescript
dashboards: {
  ${name}: {
    title: "${dashTitle}",
    handler: "dashboards/${name}.handler",
  },
  // ... existing dashboards
}
\`\`\`

Use the standard file editing tools to create these files.`

      case "update":
        if (!name) {
          return "Error: name is required for update action"
        }
        return `Would update dashboard: ${name}
New title: ${title || "(unchanged)"}

Use the standard file editing tools to modify the handler.`

      case "delete":
        if (!name) {
          return "Error: name is required for delete action"
        }
        return `Would delete dashboard: ${name}

This would:
1. Remove handler file: dashboards/${name}.ts
2. Remove config entry from hands.config.ts

Use the standard file deletion tools to remove these files.`

      default:
        return `Unknown action: ${action}`
    }
  },
})
