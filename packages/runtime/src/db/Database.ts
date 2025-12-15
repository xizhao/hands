/**
 * Hands Database Durable Object
 *
 * SQLite-backed Durable Object for hands workbooks.
 * No migrations - DB is authoritative, schema comes from existing db state.
 *
 * Extends rwsdk's SqliteDurableObject for compatibility with createDb().
 */

import { SqliteDurableObject } from "rwsdk/db";

export class Database extends SqliteDurableObject {
  constructor(ctx: DurableObjectState, env: unknown) {
    // Pass empty migrations - DB is authoritative, no migrations needed
    super(ctx, env, {});
  }
}
