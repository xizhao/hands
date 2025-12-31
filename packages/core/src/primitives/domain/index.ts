/**
 * Domain Primitive
 *
 * A Domain represents a non-relation SQLite table as a first-class entity.
 * Domains unify tables and pages into a single concept with schema tracking.
 */

// Types
export type {
  Domain,
  DomainColumn,
  DomainForeignKey,
  DomainListItem,
  DomainMeta,
  DomainSchema,
  DomainSyncStatus,
  DomainTab,
  RelationTableDetection,
  SchemaChange,
} from "./types";

// Utilities
export {
  compareSchemas,
  detectRelationTable,
  generateSchemaHash,
  matchPageToDomain,
  toDisplayName,
  toTableName,
} from "./utils";
