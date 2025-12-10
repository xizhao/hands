import { tool } from "@opencode-ai/plugin"
import postgres from "postgres"
import { existsSync, readFileSync } from "fs"
import { join } from "path"

// Lockfile location (same as runtime)
function getLockfilePath(): string {
  const home = process.env.HOME || "~"
  if (process.platform === "darwin") {
    return join(home, "Library", "Application Support", "Hands", "runtime.lock")
  } else if (process.platform === "win32") {
    return join(process.env.LOCALAPPDATA || join(home, "AppData", "Local"), "Hands", "runtime.lock")
  } else {
    return join(process.env.XDG_STATE_HOME || join(home, ".local", "state"), "hands", "runtime.lock")
  }
}

// Dynamically get database URL - first from lockfile, then fallback to env var
function getDatabaseUrl(): string {
  const lockfilePath = getLockfilePath()
  if (existsSync(lockfilePath)) {
    try {
      const lock = JSON.parse(readFileSync(lockfilePath, "utf-8"))
      if (lock.postgresPort && lock.workbookId) {
        const dbName = `hands_${lock.workbookId.replace(/-/g, "_")}`
        return `postgres://hands:hands@localhost:${lock.postgresPort}/${dbName}`
      }
    } catch (e) {
      // Fall through to env var
    }
  }

  const url = process.env.HANDS_DATABASE_URL
  if (!url) {
    throw new Error("No active workbook found. Open a workbook in Hands or check if the runtime is running.")
  }
  return url
}

let sql: ReturnType<typeof postgres> | null = null
let currentUrl: string | null = null

function getClient() {
  const url = getDatabaseUrl()
  if (sql && currentUrl !== url) {
    sql.end()
    sql = null
  }
  if (!sql) {
    currentUrl = url
    sql = postgres(url, {
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
    })
  }
  return sql
}

interface TableInfo {
  table_name: string
  columns: { name: string; type: string; nullable: boolean }[]
  row_count?: number
}

const schema = tool({
  description: `View the database schema - lists all tables and their columns.

Use this tool BEFORE writing SQL queries to understand:
- What tables exist in the database
- Column names and data types for each table
- Approximate row counts (optional)

This is a read-only tool that helps you write correct queries.`,

  args: {
    table: tool.schema
      .string()
      .optional()
      .describe("Specific table name to get detailed info. If omitted, lists all tables."),
    include_counts: tool.schema
      .boolean()
      .optional()
      .describe("Include row counts for each table (slower but useful for understanding data volume)"),
  },

  async execute(args, ctx) {
    const { table, include_counts = false } = args

    try {
      const client = getClient()

      if (table) {
        // Get detailed info for a specific table
        const columns = await client`
          SELECT
            c.column_name as name,
            c.data_type as type,
            c.is_nullable = 'YES' as nullable,
            c.column_default as default_value,
            COALESCE(
              (SELECT true FROM information_schema.table_constraints tc
               JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
               WHERE tc.table_name = c.table_name AND tc.constraint_type = 'PRIMARY KEY'
               AND kcu.column_name = c.column_name LIMIT 1),
              false
            ) as is_primary
          FROM information_schema.columns c
          WHERE c.table_schema = 'public' AND c.table_name = ${table}
          ORDER BY c.ordinal_position
        `

        if (columns.length === 0) {
          return `Table "${table}" not found in the public schema.`
        }

        // Get row count
        const countResult = await client.unsafe(`SELECT COUNT(*)::int as count FROM "${table.replace(/"/g, '""')}"`)
        const rowCount = countResult[0]?.count ?? 0

        // Format output
        let output = `## Table: ${table}\n\n`
        output += `Rows: ${rowCount.toLocaleString()}\n\n`
        output += `| Column | Type | Nullable | Primary | Default |\n`
        output += `|--------|------|----------|---------|--------|\n`

        for (const col of columns) {
          const pk = col.is_primary ? "YES" : ""
          const nullable = col.nullable ? "YES" : "NO"
          const defaultVal = col.default_value ? String(col.default_value).slice(0, 20) : ""
          output += `| ${col.name} | ${col.type} | ${nullable} | ${pk} | ${defaultVal} |\n`
        }

        return output
      }

      // List all tables with their columns
      const tables = await client`
        SELECT
          t.table_name,
          json_agg(
            json_build_object(
              'name', c.column_name,
              'type', c.data_type,
              'nullable', c.is_nullable = 'YES'
            ) ORDER BY c.ordinal_position
          ) as columns
        FROM information_schema.tables t
        JOIN information_schema.columns c ON c.table_schema = t.table_schema AND c.table_name = t.table_name
        WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
        GROUP BY t.table_name
        ORDER BY t.table_name
      `

      if (tables.length === 0) {
        return `No tables found in the database.

The database is empty. Use the hands_sql tool to create tables, or import data via the Hands app.`
      }

      let output = `## Database Schema\n\n`
      output += `Found ${tables.length} table${tables.length === 1 ? "" : "s"}:\n\n`

      for (const t of tables) {
        const cols = t.columns as { name: string; type: string; nullable: boolean }[]
        const colList = cols.map(c => `${c.name} (${c.type})`).join(", ")

        if (include_counts) {
          try {
            const countResult = await client.unsafe(`SELECT COUNT(*)::int as count FROM "${t.table_name.replace(/"/g, '""')}"`)
            const rowCount = countResult[0]?.count ?? 0
            output += `### ${t.table_name} (${rowCount.toLocaleString()} rows)\n`
          } catch {
            output += `### ${t.table_name}\n`
          }
        } else {
          output += `### ${t.table_name}\n`
        }

        output += `${colList}\n\n`
      }

      output += `---\nUse \`hands_schema\` with \`table: "tablename"\` to see detailed column info including primary keys and defaults.`

      return output
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      if (message.includes("connect") || message.includes("ECONNREFUSED")) {
        return `Database connection failed.

Error: ${message}

Make sure a workbook is open in Hands (the runtime starts embedded Postgres automatically).`
      }

      if (message.includes("No active workbook")) {
        return `No database configured.

${message}

Open a workbook in Hands to connect to its database.`
      }

      return `Error reading schema: ${message}`
    }
  },
})

export default schema
