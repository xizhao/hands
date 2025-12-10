import { tool } from "@opencode-ai/plugin";

// Default runtime port (matches packages/runtime/src/ports.ts)
const DEFAULT_RUNTIME_PORT = 55000;

// Get runtime port from env or use default
function getRuntimePort(): number {
  // HANDS_RUNTIME_PORT is set by Tauri when starting the agent
  const envPort = process.env.HANDS_RUNTIME_PORT;
  if (envPort) {
    return parseInt(envPort, 10);
  }
  return DEFAULT_RUNTIME_PORT;
}

// Execute query via HTTP API to runtime
async function executeQuery(query: string): Promise<{ rows: unknown[]; rowCount: number }> {
  const port = getRuntimePort();
  const url = `http://localhost:${port}/postgres/query`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    if (error.booting) {
      throw new Error("Database is still booting. Please wait a moment and try again.");
    }
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

function formatTable(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "(no rows)";

  const headers = Object.keys(rows[0]);
  const widths = headers.map((h) =>
    Math.max(h.length, ...rows.map((r) => String(r[h] ?? "").length))
  );
  const separator = widths.map((w) => "-".repeat(w)).join("-+-");
  const headerRow = headers.map((h, i) => h.padEnd(widths[i])).join(" | ");
  const dataRows = rows.map((r) =>
    headers.map((h, i) => String(r[h] ?? "").padEnd(widths[i])).join(" | ")
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
      .join(",")
  );
  return [headerRow, ...dataRows].join("\n");
}

const psql = tool({
  description: `Execute SQL queries against the workbook's embedded Postgres database.

Use this tool to:
- Query data for analysis (SELECT)
- Create/alter tables (CREATE, ALTER)
- Insert/update data (INSERT, UPDATE)
- Debug data issues

TIP: Use the SchemaRead tool first to see available tables and columns.

IMPORTANT RULES:
- Always use the default 'public' schema - do NOT create custom schemas
- Use simple CREATE TABLE tablename (...) - no schema prefix needed
- NEVER run CREATE SCHEMA - you don't have permission and don't need it`,

  args: {
    query: tool.schema.string().describe("SQL query to execute"),
    format: tool.schema
      .enum(["table", "json", "csv"])
      .optional()
      .describe("Output format. Defaults to table."),
    confirm_destructive: tool.schema
      .boolean()
      .optional()
      .describe(
        "Set to true to confirm destructive operations (DROP, TRUNCATE, DELETE)"
      ),
  },

  async execute(args, ctx) {
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
        return `${formatTable(rows)}\n\n(${rows.length} row${
          rows.length === 1 ? "" : "s"
        })`;
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
      if (message.includes("booting")) {
        return `⏳ Database is starting up.

${message}

Try again in a few seconds.`;
      }

      return `❌ SQL Error: ${message}`;
    }
  },
});

export default psql;
