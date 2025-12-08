/**
 * Data Sync Types
 *
 * Supports syncing from 1000s of remote data sources into the local PostgreSQL.
 */

export type SyncFormat =
  | "json"       // JSON array or object
  | "csv"        // CSV file
  | "parquet"    // Parquet file (via DuckDB bridge)
  | "postgres"   // Remote PostgreSQL (FDW or direct copy)
  | "electric"   // Electric SQL shape
  | "http-json"; // HTTP endpoint returning JSON

export type SyncMode =
  | "full"       // Replace all data on each sync
  | "incremental"// Append/upsert based on key
  | "cdc";       // Change data capture (for Electric/subscriptions)

export interface DataSource {
  id: string;
  name: string;
  description?: string;

  // Connection info
  format: SyncFormat;
  url: string;          // URL, file path, or connection string

  // Target table
  targetTable: string;
  targetSchema?: string; // defaults to 'public'

  // Sync config
  mode: SyncMode;
  primaryKey?: string[];  // For incremental/upsert mode

  // Schedule (cron syntax or null for manual)
  schedule?: string;

  // Auth (stored securely)
  auth?: {
    type: "none" | "bearer" | "basic" | "api-key";
    headerName?: string;  // For api-key
    // Actual credentials stored in separate secrets table
  };

  // Transform (SQL to apply after fetch)
  transformSql?: string;

  // Metadata
  enabled: boolean;
  lastSyncAt?: number;
  lastSyncStatus?: "success" | "error";
  lastSyncError?: string;
  lastSyncRowCount?: number;
  createdAt: number;
  updatedAt: number;
}

export interface SyncResult {
  sourceId: string;
  success: boolean;
  rowCount: number;
  duration: number;
  error?: string;
  timestamp: number;
}

export interface SyncProgress {
  sourceId: string;
  phase: "connecting" | "fetching" | "transforming" | "loading" | "done" | "error";
  progress?: number;  // 0-100
  message?: string;
}

export interface BulkSyncResult {
  total: number;
  successful: number;
  failed: number;
  results: SyncResult[];
  duration: number;
}
