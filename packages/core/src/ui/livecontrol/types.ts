/**
 * Types for LiveControl components
 */

export type LiveControlType = "query" | "action";

export interface LiveControlsMenuProps {
  /** Type of live element - determines icon and validation rules */
  type: LiveControlType;
  /** Current SQL query or action statement */
  sql?: string;
  /** Extracted table name (shown as label) */
  tableName?: string;
  /** Handler for View Data action */
  onViewData?: () => void;
  /** Handler for Edit action (opens LiveQueryEditor) */
  onEdit?: () => void;
  /** The live element content to wrap */
  children: React.ReactNode;
  /** Whether to show as inline (for inline LiveValue) */
  inline?: boolean;
  /** Whether the element is currently selected in editor */
  selected?: boolean;
  /** Whether the editor is in read-only mode */
  readOnly?: boolean;
}

export interface LiveQueryEditorProps {
  /** Initial SQL query */
  initialQuery: string;
  /** Type of query - determines validation (read-only vs mutations) */
  type: LiveControlType;
  /** Called when user applies changes */
  onApply: (newQuery: string) => void;
  /** Called when user cancels */
  onCancel: () => void;
  /** Whether the editor is open */
  open: boolean;
  /** Called when open state changes */
  onOpenChange: (open: boolean) => void;
  /** Database schema for autocomplete (optional, fetched from context if not provided) */
  schema?: TableInfo[];
}

export interface QueryBuilderState {
  mode: "visual" | "sql";
  table: string | null;
  selectedColumns: string[]; // empty = SELECT *
  filters: FilterCondition[];
  groupBy: string[];
  orderBy: OrderByClause[];
  limit: number | null;
  rawSql: string;
}

export interface FilterCondition {
  id: string;
  column: string;
  operator: FilterOperator;
  value: string | number | null;
}

export type FilterOperator =
  | "="
  | "!="
  | ">"
  | "<"
  | ">="
  | "<="
  | "LIKE"
  | "NOT LIKE"
  | "IN"
  | "NOT IN"
  | "IS NULL"
  | "IS NOT NULL";

export interface OrderByClause {
  column: string;
  direction: "ASC" | "DESC";
}

export interface TableInfo {
  table_name: string;
  columns: ColumnInfo[];
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
}
