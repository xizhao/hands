/**
 * Schema Primitives
 *
 * Types for declaring and validating action schema requirements.
 */

export type {
  ActionSchema,
  ColumnType,
  DbColumn,
  DbSchema,
  DbTable,
  SchemaColumn,
  SchemaTable,
  SchemaValidationResult,
} from "./types.js";

export { assertSchemaValid, validateSchema } from "./validate.js";
