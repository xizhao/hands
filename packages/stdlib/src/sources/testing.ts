/**
 * Source Testing Utilities
 *
 * Provides mock database context for testing v2 sources with bun:test.
 *
 * @example
 * ```typescript
 * import { test, expect } from "bun:test"
 * import { createMockDb, expectQuery } from "@hands/stdlib/sources/testing"
 *
 * test("queries correctly", async () => {
 *   const db = createMockDb()
 *
 *   // Mock DB responses
 *   db.sql.mockResolvedValue([{ id: 1 }])
 *
 *   // Use mock db
 *   const result = await db.sql`SELECT * FROM users`
 *
 *   // Assert queries were made
 *   expect(db.queries).toHaveLength(1)
 *   expect(db.queries[0].sql).toContain("SELECT")
 * })
 * ```
 */

/**
 * Recorded SQL query
 */
export interface RecordedQuery {
  sql: string;
  values: unknown[];
  timestamp: number;
}

/**
 * Mock SQL function type - matches DbContext.sql signature
 */
export interface MockSqlFn {
  <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
  mockResolvedValue: <T>(value: T[]) => void;
  mockRejectedValue: (error: Error) => void;
  mockImplementation: <T>(
    fn: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<T[]>,
  ) => void;
  calls: [TemplateStringsArray, ...unknown[]][];
}

/**
 * Mock database context
 */
export interface MockDbContext {
  /** Mock SQL template tag function */
  sql: MockSqlFn;
  /** All recorded queries */
  queries: RecordedQuery[];
  /** Clear recorded queries */
  clearQueries: () => void;
}

/**
 * Mock source context with recording capabilities
 * For v2 sources that may need to query the database
 */
export interface MockSourceContext<TSecrets extends readonly string[] = readonly string[]> {
  /** Secrets object with mocked values */
  secrets: { [K in TSecrets[number]]: string };
  /** Mock database with query recording */
  db: MockDbContext;
  /** Structured logging */
  log: (...args: unknown[]) => void;
  /** All recorded log calls */
  logs: unknown[][];
  /** Clear recorded logs */
  clearLogs: () => void;
}

/**
 * Create a mock database context for testing
 */
export function createMockDb(): MockDbContext {
  const queries: RecordedQuery[] = [];
  const calls: [TemplateStringsArray, ...unknown[]][] = [];

  // State for mock behavior
  let resolvedValue: unknown[] | undefined;
  let rejectedError: Error | undefined;
  let customImpl:
    | ((strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>)
    | undefined;

  // Create mock SQL function that records queries
  const sqlMock: MockSqlFn = Object.assign(
    async function sql<T = Record<string, unknown>>(
      strings: TemplateStringsArray,
      ...values: unknown[]
    ): Promise<T[]> {
      calls.push([strings, ...values]);

      const sqlStr = strings.reduce((acc, str, i) => {
        return acc + str + (i < values.length ? `$${i + 1}` : "");
      }, "");

      queries.push({
        sql: sqlStr,
        values,
        timestamp: Date.now(),
      });

      if (rejectedError) {
        throw rejectedError;
      }
      if (resolvedValue !== undefined) {
        return resolvedValue as T[];
      }
      if (customImpl) {
        return customImpl(strings, ...values) as Promise<T[]>;
      }
      return [] as T[];
    },
    {
      mockResolvedValue: <T>(value: T[]) => {
        resolvedValue = value;
        rejectedError = undefined;
        customImpl = undefined;
      },
      mockRejectedValue: (error: Error) => {
        rejectedError = error;
        resolvedValue = undefined;
        customImpl = undefined;
      },
      mockImplementation: <T>(
        fn: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<T[]>,
      ) => {
        customImpl = fn as (
          strings: TemplateStringsArray,
          ...values: unknown[]
        ) => Promise<unknown[]>;
        resolvedValue = undefined;
        rejectedError = undefined;
      },
      calls,
    },
  );

  return {
    sql: sqlMock,
    queries,
    clearQueries: () => {
      queries.length = 0;
      calls.length = 0;
    },
  };
}

/**
 * Create a mock source context for testing
 *
 * @param secrets - Object mapping secret names to test values
 * @returns Mock context with recording capabilities
 *
 * @example
 * ```typescript
 * const ctx = createMockContext({
 *   STRIPE_KEY: "sk_test_xxx",
 *   WEBHOOK_SECRET: "whsec_xxx"
 * })
 * ```
 */
export function createMockContext<TSecrets extends readonly string[]>(
  secrets: { [K in TSecrets[number]]: string },
): MockSourceContext<TSecrets> {
  const db = createMockDb();
  const logs: unknown[][] = [];

  // Create mock log function
  const log = (...args: unknown[]) => {
    logs.push(args);
    // Also output to console for visibility during tests
    console.log("[source]", ...args);
  };

  return {
    secrets,
    db,
    log,
    logs,
    clearLogs: () => {
      logs.length = 0;
    },
  };
}

/**
 * Assert helper for checking if a query contains expected SQL
 */
export function expectQuery(
  queries: RecordedQuery[],
  pattern: string | RegExp,
  message?: string,
): RecordedQuery {
  const found = queries.find((q) =>
    typeof pattern === "string"
      ? q.sql.toLowerCase().includes(pattern.toLowerCase())
      : pattern.test(q.sql),
  );

  if (!found) {
    const queryList = queries.map((q) => `  - ${q.sql}`).join("\n");
    throw new Error(
      message ||
        `Expected query matching "${pattern}" but found:\n${queryList || "  (no queries)"}`,
    );
  }

  return found;
}

/**
 * Assert helper for checking query count
 */
export function expectQueryCount(queries: RecordedQuery[], count: number, message?: string): void {
  if (queries.length !== count) {
    throw new Error(message || `Expected ${count} queries but found ${queries.length}`);
  }
}
