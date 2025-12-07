import { tool, type ToolDefinition } from "@opencode-ai/plugin"

export const introspectTool: ToolDefinition = tool({
  description: `Analyze the hands data app structure.

Returns detailed information about:
- Monitors (scheduled jobs)
- Dashboards
- Integrations
- Database configuration
- Overall app architecture

Use this to understand what a hands app does before making changes.`,

  args: {
    path: tool.schema
      .string()
      .optional()
      .describe("Path to hands.config.ts. Defaults to current directory."),
    detailed: tool.schema
      .boolean()
      .optional()
      .describe("Include handler source code analysis"),
  },

  async execute(args, ctx) {
    const configPath = args.path || "hands.config.ts"

    const file = Bun.file(configPath)
    if (!(await file.exists())) {
      return `Error: No hands.config.ts found at ${configPath}`
    }

    const content = await file.text()
    const result: string[] = ["# Hands App Structure", ""]

    const monitorsMatch = content.match(/monitors:\s*{([^}]*)}/s)
    if (monitorsMatch) {
      result.push("## Monitors")
      result.push("Scheduled jobs that run periodically:")
      result.push("")
      const monitorDefs = monitorsMatch[1].matchAll(/(\w+):\s*{([^}]*)}/g)
      for (const [, name, config] of monitorDefs) {
        const scheduleMatch = config.match(/schedule:\s*["']([^"']+)["']/)
        const handlerMatch = config.match(/handler:\s*["']([^"']+)["']/)
        result.push(`- **${name}**`)
        if (scheduleMatch) result.push(`  - Schedule: ${scheduleMatch[1]}`)
        if (handlerMatch) result.push(`  - Handler: ${handlerMatch[1]}`)
      }
      result.push("")
    }

    const dashboardsMatch = content.match(/dashboards:\s*{([^}]*)}/s)
    if (dashboardsMatch) {
      result.push("## Dashboards")
      result.push("Web interfaces for viewing data:")
      result.push("")
      const dashDefs = dashboardsMatch[1].matchAll(/(\w+):\s*{([^}]*)}/g)
      for (const [, name, config] of dashDefs) {
        const titleMatch = config.match(/title:\s*["']([^"']+)["']/)
        const handlerMatch = config.match(/handler:\s*["']([^"']+)["']/)
        result.push(`- **${name}**`)
        if (titleMatch) result.push(`  - Title: ${titleMatch[1]}`)
        if (handlerMatch) result.push(`  - Handler: ${handlerMatch[1]}`)
      }
      result.push("")
    }

    const integrationsMatch = content.match(/integrations:\s*{([^}]*)}/s)
    if (integrationsMatch) {
      result.push("## Integrations")
      result.push("External data source connections:")
      result.push("")
      const intDefs = integrationsMatch[1].matchAll(/(\w+):\s*{([^}]*)}/g)
      for (const [, name, config] of intDefs) {
        const typeMatch = config.match(/type:\s*["']([^"']+)["']/)
        const handlerMatch = config.match(/handler:\s*["']([^"']+)["']/)
        result.push(`- **${name}**`)
        if (typeMatch) result.push(`  - Type: ${typeMatch[1]}`)
        if (handlerMatch) result.push(`  - Handler: ${handlerMatch[1]}`)
      }
      result.push("")
    }

    result.push("## Database")
    if (content.includes("connectionString")) {
      result.push("Using external Postgres (from DATABASE_URL)")
    } else {
      result.push("Using embedded Postgres")
    }

    return result.join("\n")
  },
})
