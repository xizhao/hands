/**
 * Block execution context
 *
 * This is the ONLY interface exposed to workbook code.
 * Keeps blocks clean - no imports needed.
 */

import type { DbContext } from "./db/index.js"

/**
 * The context passed to every block function
 */
export interface BlockContext<TParams = Record<string, any>> {
  /** Safe SQL queries - tagged template only */
  db: DbContext

  /** User inputs, URL params, form values */
  params: TParams
}

/**
 * Type helper for defining blocks
 *
 * Usage in workbook:
 *   export default async (ctx: Ctx<{ userId: string }>) => {
 *     const users = await ctx.db.sql<User>`SELECT * FROM users WHERE id = ${ctx.params.userId}`
 *     return users
 *   }
 */
export type Ctx<TParams = Record<string, any>> = BlockContext<TParams>
