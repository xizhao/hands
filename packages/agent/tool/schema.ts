import { tool } from "@opencode-ai/plugin"

// Default runtime port (matches packages/runtime/src/ports.ts)
const DEFAULT_RUNTIME_PORT = 55000

function getRuntimePort(): number {
  const envPort = process.env.HANDS_RUNTIME_PORT
  if (envPort) {
    return parseInt(envPort, 10)
  }
  return DEFAULT_RUNTIME_PORT
}

interface SchemaRow {
  table_name: string
  column_name: string
  data_type: string
  is_nullable: string
  column_default: string | null
}

interface TableInfo {
  table_name: string
  columns: { name: string; type: string; nullable: boolean; default: string | null }[]
}

const schema = tool({
  description: `View the database schema - lists all tables and their columns.

Use this tool BEFORE writing SQL queries to understand:
- What tables exist in the database
- Column names and data types for each table

This is a read-only tool that helps you write correct queries.`,

  args: {
    table: tool.schema
      .string()
      .optional()
      .describe("Specific table name to get detailed info. If omitted, lists all tables."),
  },

  async execute(args, ctx) {
    const { table } = args
    const port = getRuntimePort()

    try {
      // Fetch schema from runtime
      const response = await fetch(`http://localhost:${port}/postgres/schema`)

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }))
        if (error.booting) {
          return `Database is still booting. Please wait a moment and try again.`
        }
        throw new Error(error.error || `HTTP ${response.status}`)
      }

      const rows = await response.json() as SchemaRow[]

      if (rows.length === 0) {
        return `No tables found in the database.

The database is empty. Use the hands_sql tool to create tables, or import data via the Hands app.`
      }

      // Group by table
      const tables: Map<string, TableInfo> = new Map()
      for (const row of rows) {
        if (!tables.has(row.table_name)) {
          tables.set(row.table_name, { table_name: row.table_name, columns: [] })
        }
        tables.get(row.table_name)!.columns.push({
          name: row.column_name,
          type: row.data_type,
          nullable: row.is_nullable === "YES",
          default: row.column_default,
        })
      }

      // If specific table requested
      if (table) {
        const tableInfo = tables.get(table)
        if (!tableInfo) {
          const available = Array.from(tables.keys()).join(", ")
          return `Table "${table}" not found. Available tables: ${available}`
        }

        let output = `## Table: ${table}\n\n`
        output += `| Column | Type | Nullable | Default |\n`
        output += `|--------|------|----------|--------|\n`

        for (const col of tableInfo.columns) {
          const nullable = col.nullable ? "YES" : "NO"
          const defaultVal = col.default ? String(col.default).slice(0, 20) : ""
          output += `| ${col.name} | ${col.type} | ${nullable} | ${defaultVal} |\n`
        }

        return output
      }

      // List all tables
      let output = `## Database Schema\n\n`
      output += `Found ${tables.size} table${tables.size === 1 ? "" : "s"}:\n\n`

      for (const [tableName, tableInfo] of tables) {
        const colList = tableInfo.columns.map(c => `${c.name} (${c.type})`).join(", ")
        output += `### ${tableName}\n`
        output += `${colList}\n\n`
      }

      output += `---\nUse \`hands_schema\` with \`table: "tablename"\` to see detailed column info.`
      return output

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      if (message.includes("ECONNREFUSED") || message.includes("fetch failed")) {
        return `Cannot connect to runtime.

Error: ${message}

Make sure a workbook is open in Hands (the runtime provides the database).
Runtime port: ${port}`
      }

      return `Error reading schema: ${message}`
    }
  },
})

export default schema
