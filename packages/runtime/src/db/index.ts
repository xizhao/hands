/**
 * Database module
 *
 * Manages embedded PostgreSQL, connection pooling, real-time change notifications,
 * and external data source synchronization.
 */

// Connection & Management
export { PostgresPool } from "./connection";
export { PostgresManager } from "./manager";

// Real-time changes
export { PostgresListener, type DatabaseChange } from "./listener";
export {
  createChangesStream,
  createSSEResponse,
  MockChangeSource,
  collectSSEEvents,
  type ChangeSource,
  type ChangeStreamEvent,
  type HistoryEvent,
  type StreamEvent,
} from "./changes-stream";

// Sync
export { SyncManager } from "./sync";
export type { DataSource, SyncProgress, SyncSchedule } from "./sync-types";
