/**
 * SQL Collection (placeholder)
 *
 * TanStack DB collection support for SQL queries.
 * Currently not used - the useLiveQuery hook handles all live queries.
 * This is kept as a placeholder for future TanStack DB integration.
 */

export interface SqlCollectionConfig<T> {
  /** Unique collection ID */
  id: string;
  /** SQL query to fetch data */
  sql: string;
  /** Query parameters */
  params?: unknown[];
  /** Function to execute the query (provided by context) */
  executeQuery: (sql: string, params?: unknown[]) => Promise<T[]>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SqlCollection<T = any> = {
  id: string;
  data: T[];
  refetch: () => Promise<void>;
};

/**
 * Create a SQL-backed collection (placeholder implementation)
 *
 * TODO: Integrate with TanStack DB when API stabilizes
 */
export function createSqlCollection<T extends { id: string | number }>(
  config: SqlCollectionConfig<T>,
): SqlCollection<T> {
  const { id, sql, params = [], executeQuery } = config;

  let data: T[] = [];

  return {
    id,
    data,
    refetch: async () => {
      data = await executeQuery(sql, params);
    },
  };
}

/**
 * Collection registry for managing multiple SQL collections
 */
export class CollectionRegistry {
  private collections = new Map<string, SqlCollection>();
  private executeQuery: (sql: string, params?: unknown[]) => Promise<unknown[]>;

  constructor(executeQuery: (sql: string, params?: unknown[]) => Promise<unknown[]>) {
    this.executeQuery = executeQuery;
  }

  /**
   * Get or create a collection for a SQL query
   */
  getCollection<T extends { id: string | number }>(
    sql: string,
    params?: unknown[],
  ): SqlCollection<T> {
    // Use SQL + params as cache key
    const key = `${sql}:${JSON.stringify(params ?? [])}`;

    if (!this.collections.has(key)) {
      const collection = createSqlCollection<T>({
        id: key,
        sql,
        params,
        executeQuery: this.executeQuery as (sql: string, params?: unknown[]) => Promise<T[]>,
      });
      this.collections.set(key, collection);
    }

    return this.collections.get(key) as SqlCollection<T>;
  }

  /**
   * Invalidate all collections (triggers refetch)
   */
  async invalidateAll() {
    const refetchPromises = Array.from(this.collections.values()).map((c) => c.refetch());
    await Promise.all(refetchPromises);
  }

  /**
   * Clear all collections
   */
  clear() {
    this.collections.clear();
  }
}
