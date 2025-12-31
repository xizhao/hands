/**
 * SQLite Module
 *
 * TRPC router for SQLite database operations.
 * Includes SSE subscription for live queries.
 */

export {
  createDbSubscriptionManager,
  type DbChangeEvent,
  type DbSubscriptionState,
  // SSE subscription exports
  getDbSubscriptionManager,
  type SQLiteTRPCContext,
  type SQLiteTRPCRouter,
  sqliteTRPCRouter,
} from "./trpc.js";
