import { tool } from "@opencode-ai/plugin";


const DEFAULT_RUNTIME_PORT = 55000;
function getRuntimePort(): number {
  const envPort = process.env.HANDS_RUNTIME_PORT;
  if (envPort) return parseInt(envPort, 10);
  return DEFAULT_RUNTIME_PORT;
}


import { createTRPCClient, httpBatchLink } from "@trpc/client";

let client: ReturnType<typeof createTRPCClient<any>> | null = null;
let currentPort: number | null = null;

function getTRPCClient() {
  const port = getRuntimePort();
  if (client && currentPort === port) return client;

  client = createTRPCClient({
    links: [
      httpBatchLink({
        url: `http://localhost:${port}/trpc`,
      }),
    ],
  });
  currentPort = port;
  return client;
}


interface TableInfo {
  table_name: string;
  columns: { name: string; type: string; nullable: boolean }[];
}

const schema = tool({
  description: `View the SQLite database schema - all tables with their columns and types.

Use this tool BEFORE writing SQL queries to understand what data is available.
After viewing the schema, use the sql tool to query the data.`,

  args: {},

  async execute(_args, _ctx) {
    try {
      const trpc = getTRPCClient();
      const rows = await trpc.db.schema.query();

      if (rows.length === 0) {
        return `No tables found in the database.

The database is empty. Use the sql tool to create tables, or import data via the Hands app.`;
      }

      const tables: Map<string, TableInfo> = new Map();
      for (const row of rows) {
        tables.set(row.table_name, {
          table_name: row.table_name,
          columns: row.columns.map((col: any) => ({
            name: col.name,
            type: col.type,
            nullable: col.nullable,
          })),
        });
      }

      let output = "## Database Schema\n\n";
      output += `${tables.size} table${tables.size === 1 ? "" : "s"}:\n\n`;

      for (const [tableName, tableInfo] of tables) {
        output += `### ${tableName}\n\n`;
        output += "| Column | Type | Nullable |\n";
        output += "|--------|------|----------|\n";

        for (const col of tableInfo.columns) {
          const nullable = col.nullable ? "YES" : "NO";
          output += `| ${col.name} | ${col.type} | ${nullable} |\n`;
        }
        output += "\n";
      }

      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes("ECONNREFUSED") || message.includes("fetch failed")) {
        return `Cannot connect to workbook server.

Error: ${message}

Make sure a workbook is open in Hands.
Server port: ${getRuntimePort()}`;
      }

      if (message.includes("booting") || message.includes("not ready")) {
        return "Database is still booting. Please wait a moment and try again.";
      }

      return `Error reading schema: ${message}`;
    }
  },
});

export default schema;
