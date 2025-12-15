/**
 * Safe SQL tagged template literal
 *
 * Prevents SQL injection by forcing parameterized queries.
 * Agent-authored code cannot do string concatenation.
 *
 * Usage:
 *   const users = await ctx.db.sql<User>`SELECT * FROM users WHERE id = ${id}`
 */

import type { PGlite } from "@electric-sql/pglite";
import type { DbContext } from "@hands/stdlib";
import { type RoleName, Roles } from "./roles.js";

export interface Query {
  text: string;
  values: any[];
}

/**
 * Build a parameterized query from a template literal
 */
export function sql(strings: TemplateStringsArray, ...values: any[]): Query {
  let text = strings[0];
  for (let i = 0; i < values.length; i++) {
    text += `$${i + 1}${strings[i + 1]}`;
  }
  return { text, values };
}

// Re-export DbContext from stdlib
export type { DbContext } from "@hands/stdlib";

/**
 * Create the db context wrapper for a PGlite instance (admin context - no role switch)
 */
export function createDbContext(pglite: PGlite): DbContext {
  return {
    sql: async <T = Record<string, unknown>>(
      strings: TemplateStringsArray,
      ...values: unknown[]
    ): Promise<T[]> => {
      const query = sql(strings, ...values);
      const result = await pglite.query<T>(query.text, query.values);
      return result.rows;
    },
    query: async <TParams, TResult>(
      preparedQuery: { run(params: TParams, client: unknown): Promise<TResult[]> },
      params: TParams,
    ): Promise<TResult[]> => {
      // Execute pgtyped prepared query using PGlite as the client
      return await preparedQuery.run(params, pglite);
    },
  };
}

/**
 * Create a role-aware db context wrapper
 * Wraps queries with SET ROLE / RESET ROLE for permission enforcement
 */
function createRoleContext(pglite: PGlite, role: RoleName): DbContext {
  return {
    sql: async <T = Record<string, unknown>>(
      strings: TemplateStringsArray,
      ...values: unknown[]
    ): Promise<T[]> => {
      await pglite.exec(`SET ROLE ${role}`);
      try {
        const query = sql(strings, ...values);
        const result = await pglite.query<T>(query.text, query.values);
        return result.rows;
      } finally {
        await pglite.exec("RESET ROLE");
      }
    },
    query: async <TParams, TResult>(
      preparedQuery: { run(params: TParams, client: unknown): Promise<TResult[]> },
      params: TParams,
    ): Promise<TResult[]> => {
      await pglite.exec(`SET ROLE ${role}`);
      try {
        return await preparedQuery.run(params, pglite);
      } finally {
        await pglite.exec("RESET ROLE");
      }
    },
  };
}

/**
 * Create a reader context (hands_reader role)
 * Used for block rendering - read-only access to public schema
 */
export function createReaderContext(pglite: PGlite): DbContext {
  return createRoleContext(pglite, Roles.READER);
}

/**
 * Create a writer context (hands_writer role)
 * Used for actions/sources - full DML on public schema
 */
export function createWriterContext(pglite: PGlite): DbContext {
  return createRoleContext(pglite, Roles.WRITER);
}
