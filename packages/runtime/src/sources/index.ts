/**
 * Source Management Module
 *
 * Sources v2: Table containers with optional Electric-SQL subscriptions
 *
 * Features:
 * - Source discovery (v2 table containers)
 * - Auto-generated CRUD routes for tables
 * - Electric-SQL subscription management
 * - Schema introspection and export
 */

// Source creation
export {
  type ColumnIntrospection,
  type CreateSourceOptions,
  type CreateSourceResult,
  createSource,
  generateCreateTableDDL,
  generateSourceFile,
  introspectRemotePostgres,
  listRemoteTables,
  type TableIntrospection,
} from "./create.js";

// Discovery
export {
  discoverSources,
  getOrphanTables,
  introspectTables,
} from "./discovery.js";
// Routes (main public API)
export { registerSourceRoutes } from "./routes.js";
// Secrets utilities (used by manifest generation)
export { checkMissingSecrets } from "./secrets.js";
// Types
export type {
  CrudResult,
  DiscoveredSource,
  DiscoveredTable,
  ListQueryParams,
  LogEntry,
  SubscriptionStatus,
  TableColumn,
  TableIndex,
  TableSchema,
} from "./types.js";
