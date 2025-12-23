import { tool } from "@opencode-ai/plugin";
import pl from "nodejs-polars";
import { getTRPCClient, getRuntimePort } from "../lib/trpc";

// ============================================================================
// DataFrame Store
// ============================================================================

/**
 * In-memory DataFrame store with LRU-like cleanup.
 * Persists across tool calls within the same agent session.
 */
class DataFrameStore extends Map<string, pl.DataFrame> {
  private maxSize = 50;
  private accessOrder: string[] = [];

  set(key: string, value: pl.DataFrame): this {
    // Track access order for LRU
    this.accessOrder = this.accessOrder.filter((k) => k !== key);
    this.accessOrder.push(key);

    // Evict oldest if over capacity
    while (this.size >= this.maxSize && this.accessOrder.length > 0) {
      const oldest = this.accessOrder.shift();
      if (oldest) this.delete(oldest);
    }

    return super.set(key, value);
  }

  get(key: string): pl.DataFrame | undefined {
    const df = super.get(key);
    if (df) {
      // Update access order
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

// ============================================================================
// SQL Bridge Functions
// ============================================================================

/**
 * Map Polars dtype to SQLite type.
 */
function polarsTypeToSqlite(dtype: pl.DataType): string {
  const typeStr = dtype.toString();

  if (typeStr.includes("Int") || typeStr.includes("UInt")) return "INTEGER";
  if (typeStr.includes("Float")) return "REAL";
  if (typeStr.includes("Bool")) return "INTEGER";
  if (typeStr.includes("Date") || typeStr.includes("Time")) return "TEXT";
  return "TEXT";
}

/**
 * Escape SQL value for insertion.
 */
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

/**
 * Build CREATE TABLE statement from DataFrame schema.
 */
function buildCreateTable(df: pl.DataFrame, tableName: string): string {
  const columns = df.columns.map((col) => {
    const series = df.getColumn(col);
    const sqlType = polarsTypeToSqlite(series.dtype);
    return `"${col}" ${sqlType}`;
  });

  return `CREATE TABLE "${tableName}" (${columns.join(", ")})`;
}

/**
 * Build batch INSERT statement.
 */
function buildBatchInsert(
  tableName: string,
  columns: string[],
  rows: Record<string, unknown>[]
): string {
  const escapedCols = columns.map((c) => `"${c}"`).join(", ");

  const values = rows.map((row) => {
    const vals = columns.map((col) => escapeValue(row[col]));
    return `(${vals.join(", ")})`;
  });

  return `INSERT INTO "${tableName}" (${escapedCols}) VALUES ${values.join(", ")}`;
}

// ============================================================================
// Context Builder
// ============================================================================

interface WriteDbOptions {
  ifExists?: "replace" | "append" | "fail";
}

function createPolarsContext() {
  const trpc = getTRPCClient();

  /**
   * Load SQL query results into a Polars DataFrame.
   */
  async function read_db(sql: string): Promise<pl.DataFrame> {
    const result = await trpc.db.query.mutate({ sql });

    if (!result.rows || (result.rows as unknown[]).length === 0) {
      return pl.DataFrame({});
    }

    const rows = result.rows as Record<string, unknown>[];
    return pl.DataFrame(rows);
  }

  /**
   * Write DataFrame to SQLite table.
   */
  async function write_db(
    df: pl.DataFrame,
    tableName: string,
    opts: WriteDbOptions = {}
  ): Promise<number> {
    const { ifExists = "fail" } = opts;
    const safeTableName = tableName.replace(/[^a-zA-Z0-9_]/g, "_");

    // Check if table exists
    const existsResult = await trpc.db.query.mutate({
      sql: `SELECT name FROM sqlite_master WHERE type='table' AND name='${safeTableName}'`,
    });
    const tableExists = ((existsResult.rows as unknown[])?.length ?? 0) > 0;

    if (tableExists) {
      if (ifExists === "fail") {
        throw new Error(
          `Table "${safeTableName}" already exists. Use ifExists: "replace" or "append"`
        );
      }
      if (ifExists === "replace") {
        await trpc.db.query.mutate({ sql: `DROP TABLE "${safeTableName}"` });
      }
    }

    // Create table if needed (replace mode or new table)
    if (!tableExists || ifExists === "replace") {
      const createSql = buildCreateTable(df, safeTableName);
      await trpc.db.query.mutate({ sql: createSql });
    }

    // Insert data in batches
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

// ============================================================================
// Polars Tool
// ============================================================================

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

Aggregate and write back:
\`\`\`typescript
const orders = dfs.get("orders");
const summary = orders
  .groupBy("customer_id")
  .agg(
    pl.col("amount").sum().alias("total_spent"),
    pl.col("id").count().alias("order_count")
  );
const rowCount = await write_db(summary, "customer_summary", { ifExists: "replace" });
return \`Wrote \${rowCount} rows to customer_summary\`;
\`\`\`

Chain operations on existing DataFrames:
\`\`\`typescript
const df = dfs.get("high_value");
const result = df
  .withColumn(pl.col("amount").mul(1.1).alias("with_tax"))
  .sort("amount", { descending: true })
  .head(20);
return result.toRecords();
\`\`\`

List stored DataFrames:
\`\`\`typescript
return dfs.listAll();
\`\`\`

**Return Value:**
Return a value to see it in the output. Common patterns:
- \`df.toRecords()\` - Full DataFrame as array of objects
- \`df.head(n).toRecords()\` - First n rows
- \`df.describe().toRecords()\` - Statistical summary
- \`{ rows: df.height, columns: df.columns }\` - Shape info
- String message for confirmations`,

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

    try {
      // Build execution context
      const context = createPolarsContext();

      // Wrap code in async function to support await
      const wrappedCode = `
        return (async () => {
          ${code}
        })();
      `;

      // Create function with context in scope
      const fn = new Function(
        "pl",
        "dfs",
        "read_db",
        "write_db",
        wrappedCode
      );

      // Execute with timeout
      const result = await Promise.race([
        fn(pl, dataframes, context.read_db, context.write_db),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error(`Timeout after ${effectiveTimeout}ms`)),
            effectiveTimeout
          )
        ),
      ]);

      // Format result for display
      if (result === undefined) {
        return "Code executed successfully (no return value)";
      }

      if (typeof result === "string") {
        return result;
      }

      return JSON.stringify(result, null, 2);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // Provide helpful error context
      if (message.includes("not defined")) {
        return `Error: ${message}\n\nHint: Available in scope: pl, dfs, read_db, write_db`;
      }

      if (message.includes("ENOENT") || message.includes("No such file")) {
        return `Error: File not found\n${message}\n\nHint: Make sure the file path is correct and the file exists.`;
      }

      if (message.includes("ECONNREFUSED") || message.includes("fetch failed")) {
        return `Error: Cannot connect to runtime.\n${message}\n\nMake sure a workbook is open in Hands.\nRuntime port: ${getRuntimePort()}`;
      }

      return `Error: ${message}`;
    }
  },
});

export default polars;
