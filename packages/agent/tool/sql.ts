import { tool } from "@opencode-ai/plugin";
import { getRuntimePort, getTRPCClient } from "../lib/trpc";

// Execute query via tRPC
async function executeQuery(sql: string): Promise<{ rows: unknown[]; rowCount: number; changes?: number }> {
  const trpc = getTRPCClient();
  return trpc.db.query.mutate({ sql });
}

function formatTable(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "(no rows)";

  const headers = Object.keys(rows[0]);
  const widths = headers.map((h) =>
    Math.max(h.length, ...rows.map((r) => String(r[h] ?? "").length)),
  );
  const separator = widths.map((w) => "-".repeat(w)).join("-+-");
  const headerRow = headers.map((h, i) => h.padEnd(widths[i])).join(" | ");
  const dataRows = rows.map((r) =>
    headers.map((h, i) => String(r[h] ?? "").padEnd(widths[i])).join(" | "),
  );
  return [headerRow, separator, ...dataRows].join("\n");
}

function formatCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";

  const headers = Object.keys(rows[0]);
  const headerRow = headers.join(",");
  const dataRows = rows.map((r) =>
    headers
      .map((h) => {
        const val = String(r[h] ?? "");
        return val.includes(",") ? `"${val}"` : val;
      })
      .join(","),
  );
  return [headerRow, ...dataRows].join("\n");
}

const sql = tool({
  description: `Execute SQL queries against the workbook's embedded SQLite database.

Use this tool to:
- Query data for analysis (SELECT)
- Create/alter tables (CREATE, ALTER)
- Insert/update data (INSERT, UPDATE)
- Debug data issues

TIP: Use the SchemaRead tool first to see available tables and columns.

SQLite-specific notes:
- Uses SQLite syntax (not PostgreSQL)
- No schemas - tables are in the main database
- Use INTEGER PRIMARY KEY for auto-increment
- BOOLEAN stored as 0/1
- Use datetime('now') for current timestamp`,

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

  async execute(args, _ctx) {
    const { query, format = "table", confirm_destructive = false } = args;

    const lowerQuery = query.toLowerCase().trim();
    const isDestructive =
      lowerQuery.startsWith("drop") ||
      lowerQuery.startsWith("truncate") ||
      (lowerQuery.startsWith("delete") && !lowerQuery.includes("where"));

    if (isDestructive && !confirm_destructive) {
      return `⚠️ Destructive operation detected.

Query: ${query}

This would modify/delete data. To proceed, run again with confirm_destructive: true`;
    }

    try {
      const result = await executeQuery(query);

      // For non-SELECT queries
      if (!Array.isArray(result.rows) || result.rows.length === 0) {
        if (result.changes !== undefined && result.changes > 0) {
          return `Query executed successfully. Rows affected: ${result.changes}`;
        }
        if (result.rowCount !== undefined && result.rowCount > 0) {
          return `Query executed successfully. Rows affected: ${result.rowCount}`;
        }
        return `Query executed successfully.`;
      }

      // Format results
      const rows = result.rows as Record<string, unknown>[];

      if (format === "json") {
        return JSON.stringify(rows, null, 2);
      } else if (format === "csv") {
        return formatCsv(rows);
      } else {
        return `${formatTable(rows)}\n\n(${rows.length} row${rows.length === 1 ? "" : "s"})`;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // Check for connection errors
      if (message.includes("ECONNREFUSED") || message.includes("fetch failed")) {
        return `❌ Cannot connect to runtime.

Error: ${message}

Make sure a workbook is open in Hands (the runtime provides the database).
Runtime port: ${getRuntimePort()}`;
      }

      // Check for booting database
      if (message.includes("booting") || message.includes("not ready")) {
        return `⏳ Database is starting up.

${message}

Try again in a few seconds.`;
      }

      return `❌ SQL Error: ${message}`;
    }
  },
});

export default sql;
