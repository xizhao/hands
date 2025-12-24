/**
 * Table Editor Types
 *
 * Defines the data provider interface and component props for the TableEditor.
 * This abstraction allows the editor to work with any data source.
 */

export interface ColumnDefinition {
  name: string;
  type: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  defaultValue?: unknown;
}

export interface TableRow {
  [key: string]: unknown;
}

/**
 * Pending change for SQL preview
 */
export interface PendingChange {
  type: "update" | "insert" | "delete";
  sql: string;
  rowId?: string;
  data?: Record<string, unknown>;
}

/**
 * Data provider interface for TableEditor.
 *
 * This abstraction allows the TableEditor component to work with any data source
 * (tRPC, REST API, local data, etc.) without knowing the implementation details.
 */
export interface TableEditorDataProvider {
  // Schema
  getColumns(): ColumnDefinition[];
  getPrimaryKeyColumn(): string;

  // Data access
  getTotalRows(): number;
  getLoadedCount(): number;
  getRow(index: number): TableRow | undefined;
  isRowLoaded(index: number): boolean;
  getRowId(row: TableRow): string;

  // Data loading (for infinite scroll)
  loadRange(startRow: number, endRow: number): Promise<void>;

  // Row operations (optional - only for editable mode)
  createRow?(data: Record<string, unknown>): Promise<void>;
  updateRow?(id: string, data: Record<string, unknown>): Promise<void>;
  deleteRow?(id: string): Promise<void>;
  bulkUpdate?(
    updates: Array<{ id: string; data: Record<string, unknown> }>
  ): Promise<void>;
  bulkDelete?(ids: string[]): Promise<void>;

  // Column operations (optional - for schema editing)
  renameColumn?(oldName: string, newName: string): Promise<void>;
  changeColumnType?(columnName: string, newType: string): Promise<void>;
  addColumn?(
    columnName: string,
    columnType: string,
    options?: { nullable?: boolean; defaultValue?: unknown }
  ): Promise<void>;
  dropColumn?(columnName: string): Promise<void>;

  // State
  isLoading: boolean;
  isFetching: boolean;
  isMutating: boolean;

  // Cache management
  invalidateCache(): void;
}

export interface TableEditorProps {
  /**
   * Data provider implementing the TableEditorDataProvider interface.
   * This provides all data access and mutation capabilities.
   */
  dataProvider: TableEditorDataProvider;

  /**
   * Table name to display in the toolbar.
   */
  tableName: string;

  /**
   * Additional CSS classes for the container.
   */
  className?: string;

  /**
   * Whether editing is enabled.
   * When true, cells can be edited and row operations are available.
   */
  editable?: boolean;

  /**
   * Callback when a row is clicked.
   */
  onRowClick?: (row: TableRow, index: number) => void;

  /**
   * Callback when sorting changes.
   */
  onSortChange?: (column: string | null, direction: "asc" | "desc") => void;
}
