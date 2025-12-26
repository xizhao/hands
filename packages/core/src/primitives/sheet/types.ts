/**
 * Sheet Primitive Types
 *
 * The Sheet primitive encapsulates a SQLite table with rich metadata,
 * formulas, and editor state. It's the core abstraction that the manifest understands.
 *
 * Sheet = SQLite Table + Column Metadata + Formulas + Editor State
 */

import type { ColumnType } from "../schema/types";

// Re-export for convenience
export type { ColumnType };

// =============================================================================
// Sheet & Column Definitions
// =============================================================================

/**
 * A Sheet wraps a SQLite table with metadata, formulas, and editor state.
 */
export interface Sheet {
  /** Unique identifier */
  id: string;
  /** Underlying SQLite table name */
  tableName: string;
  /** User-friendly display name */
  displayName: string;

  /** Column definitions with metadata */
  columns: SheetColumn[];
  /** Display order of columns (array of column IDs) */
  columnOrder: string[];

  /** Generated SQL view name for computed columns (e.g., "_view_orders_computed") */
  computedViewName?: string;
  /** Version number, incremented when view is regenerated */
  computedViewVersion: number;

  /** ISO timestamp of creation */
  createdAt: string;
  /** ISO timestamp of last update */
  updatedAt: string;
}

/**
 * A column within a sheet, extending the raw SQLite column with metadata.
 */
export interface SheetColumn {
  /** Unique identifier */
  id: string;
  /** SQL column name in the underlying table */
  name: string;
  /** User-friendly display name */
  displayName: string;
  /** SQLite column type */
  type: ColumnType;

  /** Whether this is a formula (computed) column */
  isFormula: boolean;
  /** Formula expression using column names (e.g., "=price * quantity") */
  formula?: string;
  /** Compiled SQL expression (e.g., "price * quantity") */
  sqlExpression?: string;

  /** Display width in pixels */
  width?: number;
  /** Whether column is hidden */
  hidden?: boolean;
  /** Whether column is frozen (sticky) */
  frozen?: boolean;

  /** ISO timestamp of creation */
  createdAt: string;
  /** ISO timestamp of last update */
  updatedAt: string;
}

// =============================================================================
// Cell References & Ranges
// =============================================================================

/**
 * A reference to a column or specific cell.
 * Uses column names directly (e.g., "price", "quantity").
 *
 * Examples:
 * - { column: "price", row: null } - entire column
 * - { column: "price", row: 1 } - specific cell (row 1)
 */
export interface CellRef {
  /** Column name (e.g., "price", "quantity") */
  column: string;
  /** Row number (1-based), null for entire column reference */
  row: number | null;
}

/**
 * A range of cells.
 *
 * Examples:
 * - { start: { column: "price", row: 1 }, end: { column: "price", row: 10 } }
 * - { start: { column: "price", row: null }, end: { column: "quantity", row: null } }
 */
export interface RangeRef {
  /** Start of the range */
  start: CellRef;
  /** End of the range */
  end: CellRef;
}

// =============================================================================
// Formula AST (Abstract Syntax Tree)
// =============================================================================

/**
 * A parsed formula represented as an AST node.
 * Used by the parser and compiler.
 */
export type FormulaNode =
  | NumberNode
  | StringNode
  | BooleanNode
  | CellNode
  | RangeNode
  | FunctionNode
  | BinaryOpNode
  | UnaryOpNode
  | ParenthesesNode;

export interface NumberNode {
  type: "number";
  value: number;
}

export interface StringNode {
  type: "string";
  value: string;
}

export interface BooleanNode {
  type: "boolean";
  value: boolean;
}

export interface CellNode {
  type: "cell";
  ref: CellRef;
}

export interface RangeNode {
  type: "range";
  ref: RangeRef;
}

export interface FunctionNode {
  type: "function";
  name: string;
  args: FormulaNode[];
}

export interface BinaryOpNode {
  type: "binary_op";
  operator: BinaryOperator;
  left: FormulaNode;
  right: FormulaNode;
}

export interface UnaryOpNode {
  type: "unary_op";
  operator: UnaryOperator;
  operand: FormulaNode;
}

export interface ParenthesesNode {
  type: "parentheses";
  expression: FormulaNode;
}

export type BinaryOperator =
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "^"
  | "&" // string concatenation
  | "="
  | "<>"
  | "<"
  | ">"
  | "<="
  | ">=";

export type UnaryOperator = "+" | "-";

// =============================================================================
// Formula Compilation
// =============================================================================

/**
 * Result of compiling a formula to SQL.
 */
export interface CompiledFormula {
  /** Original Excel formula */
  originalFormula: string;
  /** Compiled SQL expression */
  sqlExpression: string;
  /** Inferred result type */
  resultType: ColumnType;
  /** Dependencies on other cells/columns */
  dependencies: FormulaDependency[];
  /** Any errors encountered during compilation */
  errors: FormulaError[];
}

/**
 * A dependency of a formula on another cell or column.
 */
export interface FormulaDependency {
  /** Unique identifier */
  id: string;
  /** ID of the formula column or cell that has this dependency */
  formulaId: string;
  /** Type of formula (column-level or cell-level) */
  formulaType: "column" | "cell";
  /** Sheet ID that this formula depends on */
  dependsOnSheetId: string;
  /** Column name (null = depends on whole table) */
  dependsOnColumn?: string;
  /** Row ID (null = depends on all rows) */
  dependsOnRow?: string;
}

/**
 * An error encountered during formula parsing or compilation.
 */
export interface FormulaError {
  /** Error category */
  type: "parse" | "reference" | "type" | "circular" | "unsupported";
  /** Human-readable error message */
  message: string;
  /** Position in the formula string (for parse errors) */
  position?: {
    start: number;
    end: number;
  };
}

// =============================================================================
// Cell-Level Formulas
// =============================================================================

/**
 * A formula applied to a specific cell (not a whole column).
 */
export interface SheetCell {
  /** Unique identifier */
  id: string;
  /** Sheet this cell belongs to */
  sheetId: string;
  /** Row ID (rowid in SQLite) */
  rowId: string;
  /** Column ID */
  columnId: string;
  /** Original Excel formula */
  formula: string;
  /** Compiled SQL expression */
  sqlExpression: string;
  /** Cached computed value (for display) */
  cachedValue?: string;
  /** Whether the cached value is stale */
  isStale: boolean;
  /** ISO timestamp of creation */
  createdAt: string;
  /** ISO timestamp of last update */
  updatedAt: string;
}

// =============================================================================
// Future Expansion (placeholders)
// =============================================================================

/**
 * Access control for a sheet (future).
 */
export interface SheetACL {
  // TODO: Define access control structure
  _placeholder?: never;
}

/**
 * Versioning configuration for a sheet (future).
 */
export interface SheetVersionConfig {
  // TODO: Define versioning structure
  _placeholder?: never;
}

/**
 * Validation rules for a sheet (future).
 */
export interface SheetValidationRules {
  // TODO: Define validation rules structure
  _placeholder?: never;
}

/**
 * Extended sheet metadata for future features.
 */
export interface SheetMeta {
  accessControl?: SheetACL;
  versioning?: SheetVersionConfig;
  validation?: SheetValidationRules;
}
