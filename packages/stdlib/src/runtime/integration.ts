import type { SqlClient } from "./sql.js"

export interface IntegrationContext {
  sql: SqlClient
  body: unknown
  headers: Record<string, string>
  log: (...args: unknown[]) => void
}

export interface IntegrationResult {
  statusCode?: number
  body?: unknown
  headers?: Record<string, string>
}

export type IntegrationHandler = (ctx: IntegrationContext) => Promise<IntegrationResult | void>

export function integration(handler: IntegrationHandler) {
  return async (event: { body?: string; headers?: Record<string, string> }) => {
    let body: unknown
    try {
      body = event.body ? JSON.parse(event.body) : {}
    } catch {
      body = event.body
    }

    const ctx: IntegrationContext = {
      sql: createSqlClient(),
      body,
      headers: event.headers || {},
      log: console.log,
    }

    try {
      const result = await handler(ctx)

      return {
        statusCode: result?.statusCode || 200,
        headers: {
          "Content-Type": "application/json",
          ...result?.headers,
        },
        body: result?.body ? JSON.stringify(result.body) : '{"ok":true}',
      }
    } catch (error) {
      console.error("Integration error:", error)
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: error instanceof Error ? error.message : "Unknown error",
        }),
      }
    }
  }
}

function createSqlClient(): SqlClient {
  return Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.reduce((acc, str, i) => {
        return acc + str + (values[i] !== undefined ? `$${i + 1}` : "")
      }, "")
      console.log("SQL:", query, values)
      return Promise.resolve([])
    },
    {
      unsafe: (query: string) => Promise.resolve([]),
    }
  )
}
