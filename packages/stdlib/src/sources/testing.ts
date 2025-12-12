/**
 * Source Testing Utilities
 *
 * Provides mock context factory for testing sources with bun:test.
 * Allows sources to be tested in isolation with mocked secrets, db, and logging.
 *
 * @example
 * ```typescript
 * import { test, expect } from "bun:test"
 * import { createMockContext } from "@hands/stdlib/sources/testing"
 * import source from "./my-source.ts"
 *
 * test("syncs data correctly", async () => {
 *   const ctx = createMockContext({
 *     API_KEY: "test-key"
 *   })
 *
 *   // Mock DB responses
 *   ctx.db.sql.mockResolvedValue([{ id: 1 }])
 *
 *   await source.sync(ctx)
 *
 *   // Assert queries were made
 *   expect(ctx.db.queries).toHaveLength(1)
 *   expect(ctx.db.queries[0].sql).toContain("INSERT")
 * })
 * ```
 */

import type { SourceContext } from "./types.js"

/**
 * Recorded SQL query
 */
export interface RecordedQuery {
  sql: string
  values: unknown[]
  timestamp: number
}

/**
 * Mock function type (compatible with bun:test mock)
 */
export interface MockFn<T extends (...args: any[]) => any> {
  (...args: Parameters<T>): ReturnType<T>
  mockResolvedValue: (value: Awaited<ReturnType<T>>) => void
  mockRejectedValue: (error: Error) => void
  mockImplementation: (fn: T) => void
  calls: Parameters<T>[]
}

/**
 * Mock SQL function type - matches DbContext.sql signature
 */
export interface MockSqlFn {
  <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>
  mockResolvedValue: <T>(value: T[]) => void
  mockRejectedValue: (error: Error) => void
  mockImplementation: <T>(fn: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<T[]>) => void
  calls: [TemplateStringsArray, ...unknown[]][]
}

/**
 * Mock database context
 */
export interface MockDbContext {
  /** Mock SQL template tag function */
  sql: MockSqlFn
  /** All recorded queries */
  queries: RecordedQuery[]
  /** Clear recorded queries */
  clearQueries: () => void
}

/**
 * Mock source context with recording capabilities
 */
export interface MockSourceContext<TSecrets extends readonly string[] = readonly string[]> {
  /** Secrets object with mocked values */
  secrets: { [K in TSecrets[number]]: string }
  /** Mock database with query recording */
  db: MockDbContext
  /** Structured logging */
  log: (...args: unknown[]) => void
  /** All recorded log calls */
  logs: unknown[][]
  /** Clear recorded logs */
  clearLogs: () => void
}

/**
 * Create a mock function (simplified version compatible with bun:test)
 */
function createMockFn<T extends (...args: any[]) => any>(
  defaultImpl?: T
): MockFn<T> {
  let impl: T | undefined = defaultImpl
  let resolvedValue: Awaited<ReturnType<T>> | undefined
  let rejectedError: Error | undefined
  const calls: Parameters<T>[] = []

  const mockFn = ((...args: Parameters<T>) => {
    calls.push(args)

    if (rejectedError) {
      return Promise.reject(rejectedError)
    }
    if (resolvedValue !== undefined) {
      return Promise.resolve(resolvedValue)
    }
    if (impl) {
      return impl(...args)
    }
    return Promise.resolve([])
  }) as MockFn<T>

  mockFn.calls = calls
  mockFn.mockResolvedValue = (value) => {
    resolvedValue = value
    rejectedError = undefined
  }
  mockFn.mockRejectedValue = (error) => {
    rejectedError = error
    resolvedValue = undefined
  }
  mockFn.mockImplementation = (fn) => {
    impl = fn
    resolvedValue = undefined
    rejectedError = undefined
  }

  return mockFn
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
  secrets: { [K in TSecrets[number]]: string }
): MockSourceContext<TSecrets> {
  const queries: RecordedQuery[] = []
  const logs: unknown[][] = []
  const calls: [TemplateStringsArray, ...unknown[]][] = []

  // State for mock behavior
  let resolvedValue: unknown[] | undefined
  let rejectedError: Error | undefined
  let customImpl: ((strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>) | undefined

  // Create mock SQL function that records queries
  const sqlMock: MockSqlFn = Object.assign(
    async function sql<T = Record<string, unknown>>(
      strings: TemplateStringsArray,
      ...values: unknown[]
    ): Promise<T[]> {
      calls.push([strings, ...values])

      const sqlStr = strings.reduce((acc, str, i) => {
        return acc + str + (i < values.length ? `$${i + 1}` : "")
      }, "")

      queries.push({
        sql: sqlStr,
        values,
        timestamp: Date.now(),
      })

      if (rejectedError) {
        throw rejectedError
      }
      if (resolvedValue !== undefined) {
        return resolvedValue as T[]
      }
      if (customImpl) {
        return customImpl(strings, ...values) as Promise<T[]>
      }
      return [] as T[]
    },
    {
      mockResolvedValue: <T>(value: T[]) => {
        resolvedValue = value
        rejectedError = undefined
        customImpl = undefined
      },
      mockRejectedValue: (error: Error) => {
        rejectedError = error
        resolvedValue = undefined
        customImpl = undefined
      },
      mockImplementation: <T>(fn: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<T[]>) => {
        customImpl = fn as (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>
        resolvedValue = undefined
        rejectedError = undefined
      },
      calls,
    }
  )

  // Create mock db context
  const db: MockDbContext = {
    sql: sqlMock,
    queries,
    clearQueries: () => {
      queries.length = 0
      calls.length = 0
    },
  }

  // Create mock log function
  const log = (...args: unknown[]) => {
    logs.push(args)
    // Also output to console for visibility during tests
    console.log("[source]", ...args)
  }

  return {
    secrets,
    db,
    log,
    logs,
    clearLogs: () => {
      logs.length = 0
    },
  }
}

/**
 * Assert helper for checking if a query contains expected SQL
 */
export function expectQuery(
  queries: RecordedQuery[],
  pattern: string | RegExp,
  message?: string
): RecordedQuery {
  const found = queries.find((q) =>
    typeof pattern === "string"
      ? q.sql.toLowerCase().includes(pattern.toLowerCase())
      : pattern.test(q.sql)
  )

  if (!found) {
    const queryList = queries.map((q) => `  - ${q.sql}`).join("\n")
    throw new Error(
      message ||
        `Expected query matching "${pattern}" but found:\n${queryList || "  (no queries)"}`
    )
  }

  return found
}

/**
 * Assert helper for checking query count
 */
export function expectQueryCount(
  queries: RecordedQuery[],
  count: number,
  message?: string
): void {
  if (queries.length !== count) {
    throw new Error(
      message ||
        `Expected ${count} queries but found ${queries.length}`
    )
  }
}
