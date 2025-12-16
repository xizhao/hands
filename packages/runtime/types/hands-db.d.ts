/**
 * @hands/db type declarations for workbook type checking
 */
import type { Kysely } from "kysely";

// Re-export DB type from workbook's generated types
export type { DB } from "@hands/db/types";

/**
 * Tagged template for SQL queries.
 * Read-only in blocks, read-write in actions.
 */
export declare function sql<T = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]>;

/**
 * Get the typed Kysely database instance for complex queries.
 */
export declare function getDb<T = unknown>(): Kysely<T>;

/**
 * Re-export Kysely's sql helper for building raw SQL fragments
 */
export { sql as kyselySql } from "kysely";
