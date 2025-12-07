import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import postgres from "postgres"

// Connection string for the embedded Postgres (started by Tauri desktop app)
// Can be overridden via HANDS_DATABASE_URL env var
const DATABASE_URL = process.env.HANDS_DATABASE_URL || "postgres://hands:hands@localhost:5433/hands_db"

let sql: ReturnType<typeof postgres> | null = null

function getClient() {
  if (!sql) {
    sql = postgres(DATABASE_URL, {
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
    })
  }
  return sql
}

function formatTable(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "(no rows)"

  const headers = Object.keys(rows[0])
  const widths = headers.map((h) =>
    Math.max(h.length, ...rows.map((r) => String(r[h] ?? "").length))
  )
  const separator = widths.map((w) => "-".repeat(w)).join("-+-")
  const headerRow = headers.map((h, i) => h.padEnd(widths[i])).join(" | ")
  const dataRows = rows.map((r) =>
    headers.map((h, i) => String(r[h] ?? "").padEnd(widths[i])).join(" | ")
  )
  return [headerRow, separator, ...dataRows].join("\n")
}

function formatCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ""

  const headers = Object.keys(rows[0])
  const headerRow = headers.join(",")
  const dataRows = rows.map((r) =>
    headers.map((h) => {
      const val = String(r[h] ?? "")
      return val.includes(",") ? `"${val}"` : val
    }).join(",")
  )
  return [headerRow, ...dataRows].join("\n")
}

export const sqlTool: ToolDefinition = tool({
  description: `Execute SQL queries against the hands embedded Postgres database.

Use this tool to:
- Query data for analysis (SELECT)
- Inspect table schemas (\\d, information_schema)
- Create/alter tables (CREATE, ALTER)
- Insert/update data (INSERT, UPDATE)
- Debug data issues

The database is the hands embedded Postgres running on port 5433.
Connection: ${DATABASE_URL}

Common queries:
- List tables: SELECT tablename FROM pg_tables WHERE schemaname = 'public'
- Describe table: SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'your_table'`,

  args: {
    query: tool.schema.string().describe("SQL query to execute"),
    format: tool.schema
      .enum(["table", "json", "csv"])
      .optional()
      .describe("Output format. Defaults to table."),
    confirm_destructive: tool.schema
      .boolean()
      .optional()
      .describe("Set to true to confirm destructive operations (DROP, TRUNCATE, DELETE)"),
  },

  async execute(args, ctx) {
    const { query, format = "table", confirm_destructive = false } = args

    const lowerQuery = query.toLowerCase().trim()
    const isDestructive =
      lowerQuery.startsWith("drop") ||
      lowerQuery.startsWith("truncate") ||
      (lowerQuery.startsWith("delete") && !lowerQuery.includes("where"))

    if (isDestructive && !confirm_destructive) {
      return `⚠️ Destructive operation detected.

Query: ${query}

This would modify/delete data. To proceed, run again with confirm_destructive: true`
    }

    try {
      const client = getClient()
      const result = await client.unsafe(query)

      // For non-SELECT queries
      if (!Array.isArray(result) || result.length === 0) {
        const count = (result as any).count
        if (count !== undefined) {
          return `Query executed successfully. Rows affected: ${count}`
        }
        return `Query executed successfully.`
      }

      // Format results
      const rows = result as Record<string, unknown>[]

      if (format === "json") {
        return JSON.stringify(rows, null, 2)
      } else if (format === "csv") {
        return formatCsv(rows)
      } else {
        return `${formatTable(rows)}\n\n(${rows.length} row${rows.length === 1 ? "" : "s"})`
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      // Check for connection errors
      if (message.includes("connect") || message.includes("ECONNREFUSED")) {
        return `❌ Database connection failed.

Error: ${message}

Make sure the hands desktop app is running (it starts the embedded Postgres on port 5433).

You can also set HANDS_DATABASE_URL to connect to a different database.`
      }

      return `❌ SQL Error: ${message}`
    }
  },
})
