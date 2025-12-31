import { tool } from "@opencode-ai/plugin";

// Use dynamic import for nodejs-polars since it's a native addon
// that can't be bundled and must remain external
let pl: typeof import("nodejs-polars");
let polarsError: Error | null = null;
const polarsPromise = import("nodejs-polars")
  .then((m) => {
    pl = m.default ?? m;
  })
  .catch((err) => {
    polarsError = err;
  });

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

class DataFrameStore extends Map<string, pl.DataFrame> {
  private maxSize = 50;
  private accessOrder: string[] = [];

  set(key: string, value: pl.DataFrame): this {
    this.accessOrder = this.accessOrder.filter((k) => k !== key);
    this.accessOrder.push(key);
    while (this.size >= this.maxSize && this.accessOrder.length > 0) {
      const oldest = this.accessOrder.shift();
      if (oldest) this.delete(oldest);
    }
    return super.set(key, value);
  }

  get(key: string): pl.DataFrame | undefined {
    const df = super.get(key);
    if (df) {
      this.accessOrder = this.accessOrder.filter((k) => k !== key);
      this.accessOrder.push(key);
    }
    return df;
  }

  clear(): void {
    this.accessOrder = [];
    super.clear();
  }

  listAll(): Array<{ name: string; rows: number; columns: string[] }> {
    return Array.from(this.entries()).map(([name, df]) => ({
      name,
      rows: df.height,
      columns: df.columns,
    }));
  }
}

const dataframes = new DataFrameStore();

function polarsTypeToSqlite(dtype: pl.DataType): string {
  const typeStr = dtype.toString();
  if (typeStr.includes("Int") || typeStr.includes("UInt")) return "INTEGER";
  if (typeStr.includes("Float")) return "REAL";
  if (typeStr.includes("Bool")) return "INTEGER";
  if (typeStr.includes("Date") || typeStr.includes("Time")) return "TEXT";
  return "TEXT";
}

function escapeValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") {
    if (Number.isNaN(value) || !Number.isFinite(value)) return "NULL";
    return String(value);
  }
  if (typeof value === "boolean") return value ? "1" : "0";
  if (value instanceof Date) return `'${value.toISOString()}'`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildCreateTable(df: pl.DataFrame, tableName: string): string {
  const columns = df.columns.map((col) => {
    const series = df.getColumn(col);
    const sqlType = polarsTypeToSqlite(series.dtype);
    return `"${col}" ${sqlType}`;
  });
  return `CREATE TABLE "${tableName}" (${columns.join(", ")})`;
}

function buildBatchInsert(
  tableName: string,
  columns: string[],
  rows: Record<string, unknown>[],
): string {
  const escapedCols = columns.map((c) => `"${c}"`).join(", ");
  const values = rows.map((row) => {
    const vals = columns.map((col) => escapeValue(row[col]));
    return `(${vals.join(", ")})`;
  });
  return `INSERT INTO "${tableName}" (${escapedCols}) VALUES ${values.join(", ")}`;
}

function createPolarsContext() {
  const trpc = getTRPCClient();

  async function read_db(sql: string): Promise<pl.DataFrame> {
    const result = await trpc.db.query.mutate({ sql });
    if (!result.rows || (result.rows as unknown[]).length === 0) {
      return pl.DataFrame({});
    }
    return pl.DataFrame(result.rows as Record<string, unknown>[]);
  }

  async function write_db(
    df: pl.DataFrame,
    tableName: string,
    opts: { ifExists?: "replace" | "append" | "fail" } = {},
  ): Promise<number> {
    const { ifExists = "fail" } = opts;
    const safeTableName = tableName.replace(/[^a-zA-Z0-9_]/g, "_");

    const existsResult = await trpc.db.query.mutate({
      sql: `SELECT name FROM sqlite_master WHERE type='table' AND name='${safeTableName}'`,
    });
    const tableExists = ((existsResult.rows as unknown[])?.length ?? 0) > 0;

    if (tableExists) {
      if (ifExists === "fail")
        throw new Error(
          `Table "${safeTableName}" already exists. Use ifExists: "replace" or "append"`,
        );
      if (ifExists === "replace")
        await trpc.db.query.mutate({ sql: `DROP TABLE "${safeTableName}"` });
    }

    if (!tableExists || ifExists === "replace") {
      const createSql = buildCreateTable(df, safeTableName);
      await trpc.db.query.mutate({ sql: createSql });
    }

    const rows = df.toRecords();
    const columns = df.columns;
    const batchSize = 500;

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const insertSql = buildBatchInsert(safeTableName, columns, batch);
      await trpc.db.query.mutate({ sql: insertSql });
    }

    return rows.length;
  }

  return { read_db, write_db };
}

const polars = tool({
  description: `Execute Polars DataFrame operations for exploratory data analysis.

Use this tool to:
- Load data from CSV/JSON/Parquet files anywhere on the filesystem
- Load query results from the database into a DataFrame
- Filter, transform, aggregate, and analyze DataFrames
- Write results back to the SQLite database

**Execution Context:**
Your code runs with these variables pre-defined:
- \`pl\` - The Polars library
- \`dfs\` - Map of named DataFrames (persisted across calls)
- \`read_db(sql)\` - Load query results into a DataFrame
- \`write_db(df, tableName, opts?)\` - Write DataFrame to SQLite

**Examples:**

Load and explore a CSV:
\`\`\`typescript
const df = pl.readCSV("/path/to/orders.csv");
dfs.set("orders", df);
return df.head(10).toRecords();
\`\`\`

Load from database and filter:
\`\`\`typescript
const df = await read_db("SELECT * FROM orders WHERE status = 'pending'");
const filtered = df.filter(pl.col("amount").gt(100));
dfs.set("high_value", filtered);
return { rows: filtered.height, preview: filtered.head(5).toRecords() };
\`\`\`

**Return Value:**
Return a value to see it in the output.`,

  args: {
    code: tool.schema
      .string()
      .describe("TypeScript code to execute with Polars. Must return a value."),
    timeout: tool.schema
      .number()
      .optional()
      .describe("Execution timeout in ms (default: 30000, max: 120000)"),
  },

  async execute(args, _ctx) {
    const { code, timeout = 30000 } = args;
    const maxTimeout = 120000;
    const effectiveTimeout = Math.min(timeout, maxTimeout);

    // Ensure polars is loaded (dynamic import for native addon)
    await polarsPromise;
    if (polarsError) {
      return `Error: Failed to load nodejs-polars native module.\n${polarsError.message}\n\nMake sure the native polars binary is available.`;
    }

    try {
      const context = createPolarsContext();
      const wrappedCode = `return (async () => { ${code} })();`;
      const fn = new Function("pl", "dfs", "read_db", "write_db", wrappedCode);

      const result = await Promise.race([
        fn(pl, dataframes, context.read_db, context.write_db),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error(`Timeout after ${effectiveTimeout}ms`)),
            effectiveTimeout,
          ),
        ),
      ]);

      if (result === undefined) return "Code executed successfully (no return value)";
      if (typeof result === "string") return result;
      return JSON.stringify(result, null, 2);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes("not defined"))
        return `Error: ${message}\n\nHint: Available in scope: pl, dfs, read_db, write_db`;
      if (message.includes("ENOENT") || message.includes("No such file"))
        return `Error: File not found\n${message}`;
      if (message.includes("ECONNREFUSED") || message.includes("fetch failed")) {
        return `Error: Cannot connect to runtime.\n${message}\n\nMake sure a workbook is open in Hands.\nRuntime port: ${getRuntimePort()}`;
      }
      return `Error: ${message}`;
    }
  },
});

export default polars;
