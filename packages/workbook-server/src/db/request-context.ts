/**
 * Request-scoped database context using AsyncLocalStorage
 *
 * This allows server components to access the database without prop drilling.
 * The worker sets up the context before rendering, and blocks import db directly.
 *
 * Usage in blocks:
 *   import { db } from '@hands/db'
 *   const users = await db.sql<User>`SELECT * FROM users`
 *
 * The db interface is the same in dev (PGlite) and prod (serverless pg).
 * All queries run with hands_reader role for security.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { DbContext, PreparedQuery } from "@hands/stdlib";

/**
 * Request context stored in AsyncLocalStorage
 */
export interface RequestContext {
  /** Database context for the current request (reader role for blocks) */
  dbContext: DbContext;
  /** URL/form params */
  params: Record<string, unknown>;
  /** Cloudflare env bindings */
  env: Record<string, unknown>;
}

/**
 * AsyncLocalStorage for request-scoped context
 * This is set by the worker before rendering and read by db import
 */
export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Get the current request context
 * Throws if called outside of a request (e.g., at module load time)
 */
function getRequestContext(): RequestContext {
  const ctx = requestContextStorage.getStore();
  if (!ctx) {
    throw new Error(
      "[hands] No request context available. " +
        "db.sql/db.query can only be called during request handling, not at module load time.",
    );
  }
  return ctx;
}

/**
 * Run a function with request context
 * Used by the worker to set up context before rendering
 */
export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return requestContextStorage.run(ctx, fn);
}

/**
 * Database interface for blocks
 *
 * Provides the same interface in dev (PGlite) and prod (serverless pg).
 * All queries automatically run with hands_reader role for security.
 *
 * @example
 * import { db } from '@hands/db'
 *
 * export default async function MyBlock() {
 *   const users = await db.sql<User>\`SELECT * FROM users WHERE active = \${true}\`
 *   return <UserList users={users} />
 * }
 */
export const db: DbContext = {
  /**
   * Tagged template literal for type-safe SQL queries
   * Queries run with hands_reader role (read-only access to public schema)
   */
  sql<T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]> {
    const ctx = getRequestContext();
    return ctx.dbContext.sql<T>(strings, ...values);
  },

  /**
   * Execute a pgtyped prepared query with type-safe params and results
   * Queries run with hands_reader role (read-only access to public schema)
   */
  query<TParams, TResult>(
    preparedQuery: PreparedQuery<TParams, TResult>,
    params: TParams,
  ): Promise<TResult[]> {
    const ctx = getRequestContext();
    return ctx.dbContext.query(preparedQuery, params);
  },
};

/**
 * Get URL/form params from request context
 *
 * @example
 * import { params } from '@hands/db'
 *
 * export default async function MyBlock() {
 *   const { limit = 10 } = params<{ limit?: number }>()
 *   const items = await db.sql\`SELECT * FROM items LIMIT \${limit}\`
 *   return <ItemList items={items} />
 * }
 */
export function params<T = Record<string, unknown>>(): T {
  const ctx = getRequestContext();
  return ctx.params as T;
}

/**
 * Get env bindings from request context
 */
export function env<T = Record<string, unknown>>(): T {
  const ctx = getRequestContext();
  return ctx.env as T;
}

// Legacy exports for backwards compatibility
export const sql = db.sql.bind(db);
export const query = db.query.bind(db);
export const getParams = params;
export const getEnv = env;
