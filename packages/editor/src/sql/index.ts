/**
 * SQL Builder - Pure functions for SQL generation
 */
export {
  escapeIdentifier,
  escapeValue,
  generateAddColumnSql,
  generateAlterColumnTypeSql,
  generateBulkDeleteSql,
  generateCountSql,
  generateDeleteSql,
  generateDropColumnSql,
  generateInsertSql,
  generateRenameColumnSql,
  generateSelectSql,
  generateUpdateSql,
  isValidSqlType,
  type SelectOptions,
} from "./sql-builder";
