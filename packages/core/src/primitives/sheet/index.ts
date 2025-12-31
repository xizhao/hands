/**
 * Sheet Primitive
 *
 * The Sheet primitive encapsulates a SQLite table with rich metadata,
 * formulas, and editor state. It's the core abstraction that the manifest understands.
 *
 * @example
 * ```typescript
 * import { Sheet, SheetColumn } from "@hands/core/primitives/sheet";
 *
 * // Formulas use column names directly
 * const formulaColumn: SheetColumn = {
 *   id: "col-1",
 *   name: "total",
 *   displayName: "Total",
 *   type: "REAL",
 *   isFormula: true,
 *   formula: "=price * quantity",
 *   sqlExpression: "price * quantity",
 *   createdAt: new Date().toISOString(),
 *   updatedAt: new Date().toISOString(),
 * };
 * ```
 */

// SQL Schemas
export {
  CREATE_SHEET_CELLS_TABLE,
  CREATE_SHEET_COLUMNS_TABLE,
  CREATE_SHEET_DEPENDENCIES_TABLE,
  CREATE_SHEET_INDEXES,
  // Individual table schemas
  CREATE_SHEETS_TABLE,
  GET_COLUMN_DEPENDENCIES_SQL,
  GET_DEPENDENT_FORMULAS_SQL,
  GET_SHEET_BY_TABLE_NAME_SQL,
  GET_SHEET_CELLS_SQL,
  GET_SHEET_COLUMNS_SQL,
  GET_STALE_CELLS_SQL,
  GET_TABLE_COLUMNS_SQL,
  // Query templates
  GET_USER_TABLES_SQL,
  // Combined schema
  SHEET_SCHEMA_SQL,
} from "./schema";
// Types
export type {
  BinaryOperator,
  BinaryOpNode,
  BooleanNode,
  CellNode,
  // Note: ColumnType is already exported from ../schema, don't re-export to avoid conflicts
  // Cell references
  CellRef,
  // Compilation
  CompiledFormula,
  FormulaDependency,
  FormulaError,
  // Formula AST
  FormulaNode,
  FunctionNode,
  NumberNode,
  ParenthesesNode,
  RangeNode,
  RangeRef,
  // Core types
  Sheet,
  // Future expansion
  SheetACL,
  // Cell-level formulas
  SheetCell,
  SheetColumn,
  SheetMeta,
  SheetValidationRules,
  SheetVersionConfig,
  StringNode,
  UnaryOperator,
  UnaryOpNode,
} from "./types";
