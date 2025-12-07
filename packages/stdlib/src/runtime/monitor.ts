import type { SqlClient } from "./sql.js"

export interface MonitorContext {
  sql: SqlClient
  log: (...args: unknown[]) => void
  env: Record<string, string | undefined>
}

export interface MonitorResult {
  status: "ok" | "warning" | "error"
  message?: string
  data?: unknown
}

export type MonitorHandler = (ctx: MonitorContext) => Promise<MonitorResult>

export function monitor(handler: MonitorHandler) {
  return async (event: unknown, context: unknown) => {
    const ctx: MonitorContext = {
      sql: createSqlClient(),
      log: console.log,
      env: process.env as Record<string, string | undefined>,
    }

    try {
      const result = await handler(ctx)
      return {
        statusCode: 200,
        body: JSON.stringify(result),
      }
    } catch (error) {
      console.error("Monitor error:", error)
      return {
        statusCode: 500,
        body: JSON.stringify({
          status: "error",
          message: error instanceof Error ? error.message : "Unknown error",
        }),
      }
    }
  }
}

function createSqlClient(): SqlClient {
  // TODO: Implement actual postgres connection
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
