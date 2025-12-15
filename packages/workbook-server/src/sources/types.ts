/**
 * Runtime types for source management (v2 - table containers)
 */

// Re-export from stdlib for convenience
export type {
  DiscoveredSource,
  DiscoveredTable,
  SourceDefinitionV2,
  SourcePermissions,
  SourceRole,
  SubscriptionStatus,
  TableColumn,
  TableDefinition,
  TableIndex,
  TableSchema,
  TableSubscription,
} from "@hands/stdlib/sources";

/** Log entry from source execution */
export interface LogEntry {
  timestamp: number;
  level: "info" | "warn" | "error" | "debug";
  message: string;
}

/** CRUD operation result */
export interface CrudResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  count?: number;
}

/** Query parameters for list operations */
export interface ListQueryParams {
  limit?: number;
  offset?: number;
  sort?: string;
  filter?: Record<string, Record<string, unknown>>;
  select?: string[];
}
