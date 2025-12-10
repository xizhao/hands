/**
 * Safe SQL tagged template literal
 *
 * Prevents SQL injection by forcing parameterized queries.
 * Agent-authored code cannot do string concatenation.
 *
 * Usage:
 *   const users = await ctx.db.sql<User>`SELECT * FROM users WHERE id = ${id}`
 */

import type { PGlite } from "@electric-sql/pglite"
import type { DbContext } from "@hands/stdlib"

export interface Query {
  text: string
  values: any[]
}

/**
 * Build a parameterized query from a template literal
 */
export function sql(strings: TemplateStringsArray, ...values: any[]): Query {
  let text = strings[0]
  for (let i = 0; i < values.length; i++) {
    text += `$${i + 1}${strings[i + 1]}`
  }
  return { text, values }
}

// Re-export DbContext from stdlib
export type { DbContext } from "@hands/stdlib"

/**
 * Create the db context wrapper for a PGlite instance
 */
export function createDbContext(pglite: PGlite): DbContext {
  return {
    sql: async <T = Record<string, unknown>>(
      strings: TemplateStringsArray,
      ...values: unknown[]
    ): Promise<T[]> => {
      const query = sql(strings, ...values)
      const result = await pglite.query<T>(query.text, query.values)
      return result.rows
    },
  }
}
