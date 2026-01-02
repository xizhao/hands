/**
 * D1 HTTP API Client
 *
 * Queries any D1 database via Cloudflare HTTP API.
 * Used in production to dynamically access per-workbook D1s.
 */

const CF_API_BASE = "https://api.cloudflare.com/client/v4";

export interface D1ClientConfig {
  accountId: string;
  apiToken: string;
}

export interface QueryResult<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta?: {
    duration: number;
    rows_read: number;
    rows_written: number;
  };
}

export class D1Client {
  constructor(
    private databaseId: string,
    private config: D1ClientConfig
  ) {}

  async query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
    const response = await fetch(
      `${CF_API_BASE}/accounts/${this.config.accountId}/d1/database/${this.databaseId}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sql,
          params: params ?? [],
        }),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`D1 query failed: ${response.status} ${text}`);
    }

    const data = await response.json() as {
      success: boolean;
      errors?: Array<{ message: string }>;
      result: Array<QueryResult<T>>;
    };

    if (!data.success) {
      throw new Error(`D1 query failed: ${data.errors?.[0]?.message ?? "Unknown error"}`);
    }

    return data.result[0];
  }

  /**
   * Execute a read-only query (for LiveQuery)
   * Validates that the SQL is read-only
   */
  async liveQuery<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    if (!isReadOnly(sql)) {
      throw new Error("liveQuery only allows SELECT statements");
    }
    const result = await this.query<T>(sql, params);
    return result.results;
  }

  /**
   * Execute a write query (for LiveAction)
   */
  async liveAction(sql: string, params?: unknown[]): Promise<{ changes: number }> {
    const result = await this.query(sql, params);
    return {
      changes: result.meta?.rows_written ?? 0,
    };
  }
}

/**
 * Check if SQL is read-only
 */
function isReadOnly(sql: string): boolean {
  const trimmed = sql.trim().toUpperCase();
  return (
    trimmed.startsWith("SELECT") ||
    trimmed.startsWith("WITH") ||
    trimmed.startsWith("EXPLAIN") ||
    trimmed.startsWith("PRAGMA")
  );
}
