/**
 * Schema Validation
 *
 * Simple exact-match validation of action schema against database.
 */

import type {
  ActionSchema,
  DbSchema,
  SchemaValidationResult,
} from "./types.js";

/**
 * Validate that database has all tables/columns required by action schema.
 * Returns validation result with missing tables/columns.
 */
export function validateSchema(
  actionSchema: ActionSchema,
  dbSchema: DbSchema
): SchemaValidationResult {
  const missingTables: string[] = [];
  const missingColumns: Array<{ table: string; column: string }> = [];
  const errors: string[] = [];

  for (const requiredTable of actionSchema.tables) {
    const dbTable = dbSchema.tables.find((t) => t.name === requiredTable.name);

    if (!dbTable) {
      missingTables.push(requiredTable.name);
      errors.push(`Table "${requiredTable.name}" does not exist`);
      continue;
    }

    // Check required columns (non-optional)
    for (const requiredCol of requiredTable.columns) {
      if (requiredCol.optional) continue;

      const dbCol = dbTable.columns.find((c) => c.name === requiredCol.name);

      if (!dbCol) {
        missingColumns.push({
          table: requiredTable.name,
          column: requiredCol.name,
        });
        errors.push(
          `Column "${requiredTable.name}.${requiredCol.name}" does not exist`
        );
      }
    }
  }

  return {
    valid: missingTables.length === 0 && missingColumns.length === 0,
    missingTables,
    missingColumns,
    errors,
  };
}

/**
 * Check if action can run against current database schema.
 * Throws if validation fails.
 */
export function assertSchemaValid(
  actionSchema: ActionSchema,
  dbSchema: DbSchema
): void {
  const result = validateSchema(actionSchema, dbSchema);

  if (!result.valid) {
    throw new Error(
      `Action schema validation failed:\n${result.errors.join("\n")}`
    );
  }
}
