/**
 * SQLite Module
 *
 * TRPC router for SQLite database operations.
 * Includes SSE subscription for live queries.
 */

export {
  sqliteTRPCRouter,
  type SQLiteTRPCContext,
  type SQLiteTRPCRouter,
  // SSE subscription exports
  getDbSubscriptionManager,
  createDbSubscriptionManager,
  type DbChangeEvent,
  type DbSubscriptionState,
} from "./trpc.js";
