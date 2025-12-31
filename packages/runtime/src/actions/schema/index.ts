/**
 * Action Schema Utilities
 *
 * Validation and DDL generation for action schema requirements.
 */

// Re-export types from core
export type {
  ActionSchema,
  ColumnType,
  DbColumn,
  DbSchema,
  DbTable,
  SchemaColumn,
  SchemaTable,
  SchemaValidationResult,
} from "@hands/core/primitives";

// DDL generation
export { generateCreateTable, generateCreateTables } from "./ddl";
// Validation
export { assertSchemaValid, validateSchema } from "./validate";
