import { tool } from "@opencode-ai/plugin";
import { getRuntimePort, getTRPCClient } from "../lib/trpc";

interface TableInfo {
  table_name: string;
  columns: { name: string; type: string; nullable: boolean }[];
}

const schema = tool({
  description: `View the full database schema - all tables with their columns, types, and constraints.

Use this tool BEFORE writing SQL queries to understand what data is available.`,

  args: {},

  async execute(_args, _ctx) {
    try {
      const trpc = getTRPCClient();
      const rows = await trpc.db.schema.query();

      if (rows.length === 0) {
        return `No tables found in the database.

The database is empty. Use the hands_sql tool to create tables, or import data via the Hands app.`;
      }

      // Group by table - schema returns { table_name, columns: [...] }
      const tables: Map<string, TableInfo> = new Map();
      for (const row of rows) {
        tables.set(row.table_name, {
          table_name: row.table_name,
          columns: row.columns.map((col) => ({
            name: col.name,
            type: col.type,
            nullable: col.nullable,
          })),
        });
      }

      // Show full details for all tables
      let output = `## Database Schema\n\n`;
      output += `${tables.size} table${tables.size === 1 ? "" : "s"}:\n\n`;

      for (const [tableName, tableInfo] of tables) {
        output += `### ${tableName}\n\n`;
        output += `| Column | Type | Nullable |\n`;
        output += `|--------|------|----------|\n`;

        for (const col of tableInfo.columns) {
          const nullable = col.nullable ? "YES" : "NO";
          output += `| ${col.name} | ${col.type} | ${nullable} |\n`;
        }
        output += `\n`;
      }

      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes("ECONNREFUSED") || message.includes("fetch failed")) {
        return `Cannot connect to runtime.

Error: ${message}

Make sure a workbook is open in Hands (the runtime provides the database).
Runtime port: ${getRuntimePort()}`;
      }

      if (message.includes("booting") || message.includes("not ready")) {
        return `Database is still booting. Please wait a moment and try again.`;
      }

      return `Error reading schema: ${message}`;
    }
  },
});

export default schema;
