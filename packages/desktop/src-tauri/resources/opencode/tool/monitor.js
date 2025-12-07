// @bun
// ../plugin/src/tools/monitor.ts
import { tool } from "@opencode-ai/plugin";
var monitorTool = tool({
  description: `Create or modify a monitor (scheduled job) in the hands data app.

Monitors are functions that run on a schedule to:
- Check system health
- Process data periodically
- Send alerts
- Sync data from external sources`,
  args: {
    action: tool.schema.enum(["create", "update", "list", "delete"]).describe("Action to perform"),
    name: tool.schema.string().optional().describe("Monitor name (required for create/update/delete)"),
    schedule: tool.schema.string().optional().describe("Schedule expression, e.g. 'rate(5 minutes)' or 'cron(0 * * * *)'"),
    description: tool.schema.string().optional().describe("What this monitor does")
  },
  async execute(args, ctx) {
    const { action, name, schedule, description } = args;
    switch (action) {
      case "list":
        return `# Monitors

| Name | Schedule | Handler |
|------|----------|---------|
| health-check | rate(5 minutes) | monitors/health-check.handler |

Total: 1 monitor`;
      case "create":
        if (!name) {
          return "Error: name is required for create action";
        }
        if (!schedule) {
          return "Error: schedule is required for create action";
        }
        const handlerCode = `import { monitor } from "@hands/sst-stdlib"

/**
 * ${description || `${name} monitor`}
 * Schedule: ${schedule}
 */
export const handler = monitor(async (ctx) => {
  // TODO: Implement ${name} logic

  const result = await ctx.sql\`SELECT 1\`

  ctx.log("${name} executed")

  return { status: "ok" }
})
`;
        return `# Create Monitor: ${name}

Would create:
1. Handler file: \`monitors/${name}.ts\`
2. Config entry in \`hands.config.ts\`

## Handler Code
\`\`\`typescript
${handlerCode}
\`\`\`

## Config Addition
\`\`\`typescript
monitors: {
  ${name}: {
    schedule: "${schedule}",
    handler: "monitors/${name}.handler",
  },
  // ... existing monitors
}
\`\`\`

Use the standard file editing tools to create these files.`;
      case "update":
        if (!name) {
          return "Error: name is required for update action";
        }
        return `Would update monitor: ${name}
New schedule: ${schedule || "(unchanged)"}

Use the standard file editing tools to modify the handler or config.`;
      case "delete":
        if (!name) {
          return "Error: name is required for delete action";
        }
        return `Would delete monitor: ${name}

This would:
1. Remove handler file: monitors/${name}.ts
2. Remove config entry from hands.config.ts

Use the standard file deletion tools to remove these files.`;
      default:
        return `Unknown action: ${action}`;
    }
  }
});
export {
  monitorTool
};

export default monitorTool;
