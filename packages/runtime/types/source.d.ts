/**
 * Source types for @hands/runtime
 */

export interface TableSubscription {
  url: string;
  table: string;
  where?: string;
  columns?: string[];
}

export interface TableDefinition {
  description?: string;
  subscription?: TableSubscription;
  role?: "hands_reader" | "hands_writer" | "hands_admin";
}

export type SourceRole = "hands_reader" | "hands_writer" | "hands_admin";

export interface SourcePermissions {
  default?: SourceRole;
  tables?: Record<string, SourceRole>;
}

export interface SourceDefinition {
  name: string;
  description?: string;
  tables?: Record<string, TableDefinition>;
  permissions?: SourcePermissions;
}

export declare function defineSource(config: SourceDefinition): SourceDefinition;

export interface DiscoveredSource {
  id: string;
  path: string;
  definition: SourceDefinition;
  tables: DiscoveredTable[];
}

export interface DiscoveredTable {
  name: string;
  source: string;
  schema: TableSchema;
  subscription?: TableSubscription & { status: SubscriptionStatus };
}

export interface TableSchema {
  columns: TableColumn[];
  primaryKey?: string[];
  indexes?: TableIndex[];
}

export interface TableColumn {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: string;
  isPrimaryKey: boolean;
}

export interface TableIndex {
  name: string;
  columns: string[];
  unique: boolean;
}

export interface SubscriptionStatus {
  active: boolean;
  shapeId?: string;
  lastSyncAt?: string;
  rowCount?: number;
  error?: string;
}
