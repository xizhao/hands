/**
 * SQL Builder - Pure functions for SQL generation
 */
export {
  escapeIdentifier,
  escapeValue,
  generateInsertSql,
  generateUpdateSql,
  generateDeleteSql,
  generateBulkDeleteSql,
  generateSelectSql,
  generateCountSql,
  generateAddColumnSql,
  generateDropColumnSql,
  generateRenameColumnSql,
  generateAlterColumnTypeSql,
  isValidSqlType,
  type SelectOptions,
} from "./sql-builder";
