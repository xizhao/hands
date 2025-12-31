/**
 * Domain Primitive
 *
 * A Domain represents a non-relation SQLite table as a first-class entity.
 * Domains unify tables and pages into a single concept with schema tracking.
 */

// Types
export type {
  Domain,
  DomainSchema,
  DomainColumn,
  DomainForeignKey,
  DomainMeta,
  DomainSyncStatus,
  SchemaChange,
  RelationTableDetection,
  DomainTab,
  DomainListItem,
} from "./types";

// Utilities
export {
  generateSchemaHash,
  detectRelationTable,
  toDisplayName,
  toTableName,
  matchPageToDomain,
  compareSchemas,
} from "./utils";
