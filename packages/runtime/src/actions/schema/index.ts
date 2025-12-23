/**
 * Action Schema Utilities
 *
 * Validation and DDL generation for action schema requirements.
 */

// Validation
export { validateSchema, assertSchemaValid } from "./validate";

// DDL generation
export { generateCreateTable, generateCreateTables } from "./ddl";

// Re-export types from core
export type {
  ActionSchema,
  SchemaTable,
  SchemaColumn,
  ColumnType,
  DbSchema,
  DbTable,
  DbColumn,
  SchemaValidationResult,
} from "@hands/core/primitives";
