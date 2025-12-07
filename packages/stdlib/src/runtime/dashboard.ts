import type { SqlClient } from "./sql.js"

export interface DashboardContext {
  sql: SqlClient
  params: Record<string, string>
  query: Record<string, string>
}

export interface Widget {
  type: "chart" | "table" | "metric" | "text"
  title?: string
  data?: unknown
  options?: Record<string, unknown>
}

export interface DashboardResult {
  title: string
  widgets: Widget[]
  refreshInterval?: number // seconds
}

export type DashboardHandler = (ctx: DashboardContext) => Promise<DashboardResult>

export function dashboard(handler: DashboardHandler) {
  return async (event: { pathParameters?: Record<string, string>; queryStringParameters?: Record<string, string> }) => {
    const ctx: DashboardContext = {
      sql: createSqlClient(),
      params: event.pathParameters || {},
      query: event.queryStringParameters || {},
    }

    try {
      const result = await handler(ctx)

      // Return HTML for dashboard rendering
      const html = renderDashboard(result)

      return {
        statusCode: 200,
        headers: {
          "Content-Type": "text/html",
        },
        body: html,
      }
    } catch (error) {
      console.error("Dashboard error:", error)
      return {
        statusCode: 500,
        body: `<h1>Error</h1><pre>${error instanceof Error ? error.message : "Unknown error"}</pre>`,
      }
    }
  }
}

function createSqlClient(): SqlClient {
  return Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.reduce((acc, str, i) => {
        return acc + str + (values[i] !== undefined ? `$${i + 1}` : "")
      }, "")
      console.log("SQL:", query, values)
      return Promise.resolve([])
    },
    {
      unsafe: (query: string) => Promise.resolve([]),
    }
  )
}

function renderDashboard(result: DashboardResult): string {
  // Simple HTML rendering - in production would use a proper template engine
  const widgetsHtml = result.widgets
    .map((widget) => {
      return `
      <div class="widget">
        <h3>${widget.title || ""}</h3>
        <div class="widget-content" data-type="${widget.type}">
          <pre>${JSON.stringify(widget.data, null, 2)}</pre>
        </div>
      </div>
    `
    })
    .join("")

  return `
<!DOCTYPE html>
<html>
<head>
  <title>${result.title}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
    h1 { margin-bottom: 20px; }
    .dashboard { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 20px; }
    .widget { background: white; border-radius: 8px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .widget h3 { margin-top: 0; }
    .widget-content pre { overflow: auto; }
  </style>
  ${result.refreshInterval ? `<meta http-equiv="refresh" content="${result.refreshInterval}">` : ""}
</head>
<body>
  <h1>${result.title}</h1>
  <div class="dashboard">
    ${widgetsHtml}
  </div>
</body>
</html>
  `
}
