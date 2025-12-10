import { tool } from "@opencode-ai/plugin";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import postgres from "postgres";

// Lockfile location (same as runtime)
function getLockfilePath(): string {
  const home = process.env.HOME || "~";
  if (process.platform === "darwin") {
    return join(
      home,
      "Library",
      "Application Support",
      "Hands",
      "runtime.lock"
    );
  } else if (process.platform === "win32") {
    return join(
      process.env.LOCALAPPDATA || join(home, "AppData", "Local"),
      "Hands",
      "runtime.lock"
    );
  } else {
    return join(
      process.env.XDG_STATE_HOME || join(home, ".local", "state"),
      "hands",
      "runtime.lock"
    );
  }
}

// Dynamically get database URL - first from lockfile, then fallback to env var
function getDatabaseUrl(): string {
  // Try reading from runtime lockfile (most reliable - always current)
  const lockfilePath = getLockfilePath();
  if (existsSync(lockfilePath)) {
    try {
      const lock = JSON.parse(readFileSync(lockfilePath, "utf-8"));
      if (lock.postgresPort && lock.workbookId) {
        const dbName = `hands_${lock.workbookId.replace(/-/g, "_")}`;
        return `postgres://hands:hands@localhost:${lock.postgresPort}/${dbName}`;
      }
    } catch (e) {
      // Fall through to env var
    }
  }

  // Fallback to env var (set by Tauri when OpenCode starts)
  const url = process.env.HANDS_DATABASE_URL;
  if (!url) {
    throw new Error(
      "No active workbook found. Open a workbook in Hands or check if the runtime is running."
    );
  }
  return url;
}

let sql: ReturnType<typeof postgres> | null = null;
let currentUrl: string | null = null;

function getClient() {
  const url = getDatabaseUrl();
  // Reconnect if URL changed (workbook switched)
  if (sql && currentUrl !== url) {
    sql.end();
    sql = null;
  }
  if (!sql) {
    currentUrl = url;
    sql = postgres(url, {
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return sql;
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
      const client = getClient();
      const result = await client.unsafe(query);

      // For non-SELECT queries
      if (!Array.isArray(result) || result.length === 0) {
        const count = (result as any).count;
        if (count !== undefined) {
          return `Query executed successfully. Rows affected: ${count}`;
        }
        return `Query executed successfully.`;
      }

      // Format results
      const rows = result as Record<string, unknown>[];

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
      if (message.includes("connect") || message.includes("ECONNREFUSED")) {
        return `❌ Database connection failed.

Error: ${message}

Make sure a workbook is open in Hands (the runtime starts embedded Postgres automatically).
Lockfile: ${getLockfilePath()}
Env HANDS_DATABASE_URL: ${process.env.HANDS_DATABASE_URL || "(not set)"}`;
      }

      // Check for missing workbook
      if (message.includes("No active workbook")) {
        return `❌ No database configured.

${message}

Open a workbook in Hands to connect to its database.`;
      }

      return `❌ SQL Error: ${message}`;
    }
  },
});

export default psql;
