/**
 * Schema Primitives
 *
 * Types for declaring and validating action schema requirements.
 */

export type {
  ColumnType,
  SchemaColumn,
  SchemaTable,
  ActionSchema,
  DbColumn,
  DbTable,
  DbSchema,
  SchemaValidationResult,
} from "./types.js";

export { validateSchema, assertSchemaValid } from "./validate.js";
