/**
 * Sheet Metadata SQL Schemas
 *
 * These tables store sheet metadata in the runtime database,
 * extending raw SQLite tables with formulas, display options, etc.
 */

// =============================================================================
// Table Creation SQL
// =============================================================================

/**
 * SQL to create the _sheets table.
 * Links to underlying SQLite tables and stores sheet-level metadata.
 */
export const CREATE_SHEETS_TABLE = `
CREATE TABLE IF NOT EXISTS _sheets (
  id TEXT PRIMARY KEY,
  table_name TEXT NOT NULL UNIQUE,
  display_name TEXT,
  column_order TEXT NOT NULL DEFAULT '[]',
  computed_view_name TEXT,
  computed_view_version INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
)`;

/**
 * SQL to create the _sheet_columns table.
 * Extends raw SQLite columns with metadata, formulas, and display options.
 */
export const CREATE_SHEET_COLUMNS_TABLE = `
CREATE TABLE IF NOT EXISTS _sheet_columns (
  id TEXT PRIMARY KEY,
  sheet_id TEXT NOT NULL REFERENCES _sheets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_name TEXT,
  type TEXT NOT NULL,
  is_formula INTEGER DEFAULT 0,
  formula TEXT,
  sql_expression TEXT,
  width INTEGER,
  hidden INTEGER DEFAULT 0,
  frozen INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(sheet_id, name)
)`;

/**
 * SQL to create the _sheet_dependencies table.
 * Tracks which columns depend on which other columns for invalidation.
 */
export const CREATE_SHEET_DEPENDENCIES_TABLE = `
CREATE TABLE IF NOT EXISTS _sheet_dependencies (
  id TEXT PRIMARY KEY,
  column_id TEXT NOT NULL REFERENCES _sheet_columns(id) ON DELETE CASCADE,
  depends_on_sheet_id TEXT NOT NULL REFERENCES _sheets(id),
  depends_on_column TEXT,
  depends_on_row TEXT
)`;

/**
 * SQL to create the _sheet_cells table.
 * Stores cell-level formulas (for individual cells, not whole columns).
 */
export const CREATE_SHEET_CELLS_TABLE = `
CREATE TABLE IF NOT EXISTS _sheet_cells (
  id TEXT PRIMARY KEY,
  sheet_id TEXT NOT NULL REFERENCES _sheets(id) ON DELETE CASCADE,
  row_id TEXT NOT NULL,
  column_id TEXT NOT NULL REFERENCES _sheet_columns(id) ON DELETE CASCADE,
  formula TEXT NOT NULL,
  sql_expression TEXT NOT NULL,
  cached_value TEXT,
  is_stale INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(sheet_id, row_id, column_id)
)`;

/**
 * SQL to create indexes for the sheet tables.
 */
export const CREATE_SHEET_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_sheet_columns_sheet_id ON _sheet_columns(sheet_id);
CREATE INDEX IF NOT EXISTS idx_sheet_dependencies_column_id ON _sheet_dependencies(column_id);
CREATE INDEX IF NOT EXISTS idx_sheet_dependencies_target ON _sheet_dependencies(depends_on_sheet_id, depends_on_column);
CREATE INDEX IF NOT EXISTS idx_sheet_cells_sheet_id ON _sheet_cells(sheet_id);
CREATE INDEX IF NOT EXISTS idx_sheet_cells_stale ON _sheet_cells(is_stale) WHERE is_stale = 1
`;

// =============================================================================
// All Tables Combined
// =============================================================================

/**
 * All sheet metadata table creation statements.
 */
export const SHEET_SCHEMA_SQL = [
  CREATE_SHEETS_TABLE,
  CREATE_SHEET_COLUMNS_TABLE,
  CREATE_SHEET_DEPENDENCIES_TABLE,
  CREATE_SHEET_CELLS_TABLE,
  CREATE_SHEET_INDEXES,
].join(";\n");

// =============================================================================
// Query Templates
// =============================================================================

/**
 * Query to get all user tables (excluding system tables).
 */
export const GET_USER_TABLES_SQL = `
SELECT name FROM sqlite_master
WHERE type = 'table'
  AND name NOT LIKE '\\_%' ESCAPE '\\'
  AND name NOT LIKE 'sqlite_%'
ORDER BY name
`;

/**
 * Query to get table column info.
 */
export const GET_TABLE_COLUMNS_SQL = `PRAGMA table_info(?)`;

/**
 * Query to get a sheet by table name.
 */
export const GET_SHEET_BY_TABLE_NAME_SQL = `
SELECT * FROM _sheets WHERE table_name = ?
`;

/**
 * Query to get columns for a sheet.
 */
export const GET_SHEET_COLUMNS_SQL = `
SELECT * FROM _sheet_columns
WHERE sheet_id = ?
ORDER BY name
`;

/**
 * Query to get dependencies for a column.
 */
export const GET_COLUMN_DEPENDENCIES_SQL = `
SELECT * FROM _sheet_dependencies
WHERE column_id = ?
`;

/**
 * Query to get dependent formulas (for invalidation).
 */
export const GET_DEPENDENT_FORMULAS_SQL = `
SELECT DISTINCT sc.id, sc.sheet_id, sc.name, sc.formula
FROM _sheet_columns sc
JOIN _sheet_dependencies sd ON sd.column_id = sc.id
WHERE sd.depends_on_sheet_id = ?
  AND (sd.depends_on_column = ? OR sd.depends_on_column IS NULL)
`;

/**
 * Query to get cell formulas for a sheet.
 */
export const GET_SHEET_CELLS_SQL = `
SELECT * FROM _sheet_cells
WHERE sheet_id = ?
`;

/**
 * Query to get stale cell formulas.
 */
export const GET_STALE_CELLS_SQL = `
SELECT * FROM _sheet_cells
WHERE is_stale = 1
`;
