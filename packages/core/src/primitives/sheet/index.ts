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

// Types
export type {
  // Core types
  Sheet,
  SheetColumn,
  // Note: ColumnType is already exported from ../schema, don't re-export to avoid conflicts
  // Cell references
  CellRef,
  RangeRef,
  // Formula AST
  FormulaNode,
  NumberNode,
  StringNode,
  BooleanNode,
  CellNode,
  RangeNode,
  FunctionNode,
  BinaryOpNode,
  UnaryOpNode,
  ParenthesesNode,
  BinaryOperator,
  UnaryOperator,
  // Compilation
  CompiledFormula,
  FormulaDependency,
  FormulaError,
  // Cell-level formulas
  SheetCell,
  // Future expansion
  SheetACL,
  SheetVersionConfig,
  SheetValidationRules,
  SheetMeta,
} from "./types";

// SQL Schemas
export {
  // Individual table schemas
  CREATE_SHEETS_TABLE,
  CREATE_SHEET_COLUMNS_TABLE,
  CREATE_SHEET_DEPENDENCIES_TABLE,
  CREATE_SHEET_CELLS_TABLE,
  CREATE_SHEET_INDEXES,
  // Combined schema
  SHEET_SCHEMA_SQL,
  // Query templates
  GET_USER_TABLES_SQL,
  GET_TABLE_COLUMNS_SQL,
  GET_SHEET_BY_TABLE_NAME_SQL,
  GET_SHEET_COLUMNS_SQL,
  GET_COLUMN_DEPENDENCIES_SQL,
  GET_DEPENDENT_FORMULAS_SQL,
  GET_SHEET_CELLS_SQL,
  GET_STALE_CELLS_SQL,
} from "./schema";
