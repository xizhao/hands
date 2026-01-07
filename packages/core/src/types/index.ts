/**
 * @hands/core - Core Types
 *
 * Shared types for the Hands component library.
 */

import type { TElement, TText } from "platejs";

// Component metadata for validation
export type {
  ComponentConstraints,
  ComponentMeta,
  ComponentSchema,
  PropRule,
} from "./component-meta";

// ============================================================================
// Element Keys
// ============================================================================

export const LIVE_VALUE_KEY = "live_value"; // Block - for charts/tables
export const LIVE_VALUE_INLINE_KEY = "live_value_inline"; // Inline - for text values
export const LIVE_ACTION_KEY = "live_action";
export const BUTTON_KEY = "button";
export const INPUT_KEY = "input";
export const SELECT_KEY = "select";
export const OPTION_KEY = "option";
export const CHECKBOX_KEY = "checkbox";
export const TEXTAREA_KEY = "textarea";
export const METRIC_KEY = "metric";
export const BADGE_KEY = "badge";
export const PROGRESS_KEY = "progress";
export const ALERT_KEY = "alert";
export const LOADER_KEY = "loader";
export const LINE_CHART_KEY = "line_chart";
export const BAR_CHART_KEY = "bar_chart";
export const AREA_CHART_KEY = "area_chart";
export const PIE_CHART_KEY = "pie_chart";
export const SCATTER_CHART_KEY = "scatter_chart";
export const HISTOGRAM_CHART_KEY = "histogram_chart";
export const HEATMAP_CHART_KEY = "heatmap_chart";
export const BOXPLOT_CHART_KEY = "boxplot_chart";
export const MAP_CHART_KEY = "map_chart";
export const INTERACTIVE_MAP_KEY = "interactive_map";
export const CHART_KEY = "chart"; // Generic Vega-Lite chart
export const DATA_GRID_KEY = "data_grid";
export const KANBAN_KEY = "kanban";
export const COLUMN_GROUP_KEY = "column_group";
export const COLUMN_KEY = "column";
export const PAGE_EMBED_KEY = "page_embed";
/** @deprecated Use PAGE_EMBED_KEY instead */
export const BLOCK_KEY = PAGE_EMBED_KEY;
export const TABS_KEY = "tabs";
export const TAB_KEY = "tab";

// ============================================================================
// Validation Constants (for MDX validation)
// ============================================================================

/** Valid display modes for LiveValue */
export const VALID_DISPLAY_MODES = ["auto", "inline", "list", "table"] as const;

/** Valid button variants */
export const VALID_BUTTON_VARIANTS = ["default", "outline", "ghost", "destructive"] as const;

/** Valid input types */
export const VALID_INPUT_TYPES = ["text", "email", "number", "password", "tel", "url"] as const;

/** All stdlib component names (for validation) */
export const STDLIB_COMPONENT_NAMES = [
  "LiveValue",
  "LiveAction",
  "Button",
  "Input",
  "Select",
  "Checkbox",
  "Textarea",
  "Metric",
  "Badge",
  "Progress",
  "Alert",
  "Loader",
  "LineChart",
  "BarChart",
  "AreaChart",
  "PieChart",
  "ScatterChart",
  "HistogramChart",
  "HeatmapChart",
  "BoxPlotChart",
  "MapChart",
  "InteractiveMap",
  "Chart",
  "DataGrid",
  "Kanban",
  "Columns",
  "Column",
  "Tabs",
  "Tab",
] as const;

// ============================================================================
// Display Types
// ============================================================================

/**
 * Display mode for LiveValue component.
 * - "auto": Auto-select based on data shape (default)
 * - "inline": Single value badge (1×1 data)
 * - "list": Bullet list (N×1 data)
 * - "table": HTML table (N×M data)
 */
export type DisplayMode = "auto" | "inline" | "list" | "table";

/**
 * Column configuration for table display mode.
 */
export interface ColumnConfig {
  /** Column key matching the data field */
  key: string;
  /** Display label for column header */
  label: string;
  /** Column width in pixels */
  width?: number;
  /** Enable sorting on this column */
  sortable?: boolean;
  /** Enable filtering on this column */
  filterable?: boolean;
}

// ============================================================================
// Static Element Types (Display-only)
// ============================================================================

/**
 * LiveValue element - displays data in various formats.
 * Data can come from a SQL query or be passed directly as static data.
 *
 * @example
 * ```tsx
 * <LiveValue query="SELECT count(*) FROM users" />
 * <LiveValue query="SELECT name FROM users" display="list" />
 * <LiveValue data={[{name: "Alice"}, {name: "Bob"}]} display="table" />
 * ```
 */
export interface TLiveValueElement extends TElement {
  type: typeof LIVE_VALUE_KEY;
  /** SQL query string - optional if data is provided */
  query?: string;
  /** Static data to display directly (skips query execution) */
  data?: Record<string, unknown>[];
  /** Display mode - auto-selects based on data shape if not specified */
  display?: DisplayMode;
  /** Named parameters for the query */
  params?: Record<string, unknown>;
  /** For table mode: column configuration */
  columns?: ColumnConfig[] | "auto";
  /** CSS class for the container */
  className?: string;
  /** Children are the template content with {{field}} bindings */
  children: (TElement | TText)[];
}

// ============================================================================
// Active Element Types (Event-driven)
// ============================================================================

/**
 * LiveAction element - container that wraps interactive form controls
 * and triggers SQL write operations on submit.
 *
 * @example
 * ```tsx
 * <LiveAction sql="UPDATE tasks SET status = {{status}} WHERE id = 1">
 *   <ActionSelect name="status" options={[{value: "done", label: "Done"}]} />
 *   <ActionButton>Update</ActionButton>
 * </LiveAction>
 * ```
 */
export interface TLiveActionElement extends TElement {
  type: typeof LIVE_ACTION_KEY;
  /** SQL statement to execute (UPDATE, INSERT, DELETE) */
  sql?: string;
  /** Alternative: action ID reference */
  src?: string;
  /** Named parameters for SQL */
  params?: Record<string, unknown>;
  /** Children are the interactive content */
  children: (TElement | TText)[];
}

/**
 * Button element - triggers the parent LiveAction on click.
 */
export interface TButtonElement extends TElement {
  type: typeof BUTTON_KEY;
  /** Button label - uses children text if not specified */
  label?: string;
  /** Button variant styling */
  variant?: "default" | "outline" | "ghost" | "destructive";
  /** Children are the button content */
  children: (TElement | TText)[];
}

/** Built-in mask pattern names for ActionInput */
export type MaskPatternKey =
  | "phone"
  | "ssn"
  | "date"
  | "time"
  | "creditCard"
  | "creditCardExpiry"
  | "zipCode"
  | "zipCodeExtended"
  | "currency"
  | "percentage"
  | "licensePlate"
  | "ipv4"
  | "macAddress"
  | "isbn"
  | "ein";

/** Custom mask pattern configuration */
export interface MaskPatternConfig {
  /** Pattern string where # = digit placeholder */
  pattern: string;
}

/**
 * Input element - text input for form data with optional masking and validation.
 *
 * @example Basic input
 * { type: "input", name: "email", inputType: "email" }
 *
 * @example Phone with mask
 * { type: "input", name: "phone", mask: "phone" }
 *
 * @example Currency
 * { type: "input", name: "amount", mask: "currency", currency: "EUR", locale: "de-DE" }
 *
 * @example Custom mask
 * { type: "input", name: "code", mask: { pattern: "##-####-##" } }
 */
export interface TInputElement extends TElement {
  type: typeof INPUT_KEY;
  /** Field name for form binding (used in {{name}} SQL substitution) */
  name: string;
  /** Input type (ignored when mask is set) */
  inputType?: "text" | "email" | "number" | "password" | "tel" | "url";
  /** Placeholder text */
  placeholder?: string;
  /** Default value */
  defaultValue?: string;
  /** Whether field is required */
  required?: boolean;
  /** Input pattern for validation (HTML5 pattern attribute) */
  pattern?: string;
  /** Min value (for number) */
  min?: number | string;
  /** Max value (for number) */
  max?: number | string;
  /** Step value (for number) */
  step?: number;
  /**
   * Input mask - preset name or custom pattern.
   * Presets: phone, ssn, date, time, creditCard, creditCardExpiry,
   * zipCode, zipCodeExtended, currency, percentage, ipv4, ein
   */
  mask?: MaskPatternKey | MaskPatternConfig;
  /** Currency code for currency mask (default: USD) */
  currency?: string;
  /** Locale for currency formatting (default: en-US) */
  locale?: string;
  /** Children are the label text */
  children: (TElement | TText)[];
}

/**
 * Select element - dropdown for form data.
 */
export interface TSelectElement extends TElement {
  type: typeof SELECT_KEY;
  /** Field name for form binding */
  name: string;
  /** Select options */
  options?: Array<{ value: string; label: string }>;
  /** Placeholder text */
  placeholder?: string;
  /** Default value */
  defaultValue?: string;
  /** Whether field is required */
  required?: boolean;
  /** Children are the label text */
  children: (TElement | TText)[];
}

/**
 * Option element - an option inside Select.
 */
export interface TOptionElement extends TElement {
  type: typeof OPTION_KEY;
  /** Option value */
  value: string;
  /** Children are the label text */
  children: (TElement | TText)[];
}

/**
 * Checkbox element - boolean input for form data.
 */
export interface TCheckboxElement extends TElement {
  type: typeof CHECKBOX_KEY;
  /** Field name for form binding */
  name: string;
  /** Default checked state */
  defaultChecked?: boolean;
  /** Whether field is required */
  required?: boolean;
  /** Children are the label text */
  children: (TElement | TText)[];
}

/**
 * Textarea element - multiline text input for form data.
 */
export interface TTextareaElement extends TElement {
  type: typeof TEXTAREA_KEY;
  /** Field name for form binding */
  name: string;
  /** Placeholder text */
  placeholder?: string;
  /** Default value */
  defaultValue?: string;
  /** Number of visible rows */
  rows?: number;
  /** Whether field is required */
  required?: boolean;
  /** Children are the label text */
  children: (TElement | TText)[];
}

/**
 * Kanban element - drag-and-drop board for displaying and mutating grouped data.
 * Must be wrapped in a LiveValue to receive data.
 *
 * The updateSql is auto-generated from the parent LiveValue's table name if not provided.
 * For example, if the parent query is `SELECT * FROM tasks` and groupByColumn is "status",
 * the generated SQL will be: `UPDATE tasks SET status = {{status}} WHERE id = {{id}}`
 *
 * @example
 * ```tsx
 * // Minimal - updateSql auto-generated from parent LiveValue
 * <LiveValue query="SELECT id, title, status FROM tasks">
 *   <Kanban groupByColumn="status" cardTitleField="title" />
 * </LiveValue>
 *
 * // Explicit updateSql (for custom logic or different table)
 * <LiveValue query="SELECT id, title, status FROM tasks">
 *   <Kanban
 *     groupByColumn="status"
 *     cardTitleField="title"
 *     updateSql="UPDATE tasks SET status = {{status}}, updated_at = NOW() WHERE id = {{id}}"
 *   />
 * </LiveValue>
 * ```
 */
export interface TKanbanElement extends TElement {
  type: typeof KANBAN_KEY;

  // Board configuration
  /** Column field to group cards by (e.g., "status") */
  groupByColumn: string;
  /** Explicit column order, or auto-detect from data */
  columnOrder?: string[];
  /**
   * Fixed columns to always display in this exact order.
   * Items not matching any fixed column are filtered out.
   * Takes precedence over columnOrder if both provided.
   */
  fixedColumns?: string[];

  // Card display
  /** Field to use as card title (e.g., "title") */
  cardTitleField: string;
  /** Additional fields to display on card */
  cardFields?: string[];

  // Mutation (like LiveAction)
  /** SQL UPDATE template with {{id}} and {{groupByColumn}} bindings. Auto-generated if not provided. */
  updateSql?: string;
  /** Primary key field name (default "id") */
  idField?: string;

  /** Children are unused (void element) */
  children: (TElement | TText)[];
}

// ============================================================================
// Static Display Element Types
// ============================================================================

/**
 * Metric element - KPI display with value, label, and change indicator.
 */
export interface TMetricElement extends TElement {
  type: typeof METRIC_KEY;
  /** The metric value to display */
  value?: number | string;
  /** Label describing the metric */
  label?: string;
  /** Prefix before the value (e.g., "$") */
  prefix?: string;
  /** Suffix after the value (e.g., "%") */
  suffix?: string;
  /** Change value (positive/negative percentage) */
  change?: number;
  /** Label for the change (e.g., "vs last month") */
  changeLabel?: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /**
   * Format string (d3-format).
   * Auto-detected from context column name if not provided.
   */
  format?: string;
  /** Children are unused (void element) */
  children: (TElement | TText)[];
}

/**
 * Badge element - inline status indicator.
 */
export interface TBadgeElement extends TElement {
  type: typeof BADGE_KEY;
  /** Visual variant */
  variant?: "default" | "secondary" | "success" | "warning" | "destructive" | "outline";
  /** Children are the badge text */
  children: (TElement | TText)[];
}

/**
 * Progress element - progress bar for completion status.
 */
export interface TProgressElement extends TElement {
  type: typeof PROGRESS_KEY;
  /** Progress value (0-100) */
  value?: number;
  /** Maximum value (default 100) */
  max?: number;
  /** Show indeterminate loading animation */
  indeterminate?: boolean;
  /** Label text above the bar */
  label?: string;
  /** Show value as percentage */
  showValue?: boolean;
  /** Visual variant */
  variant?: "default" | "success" | "warning" | "destructive";
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Children are unused (void element) */
  children: (TElement | TText)[];
}

/**
 * Alert element - callout message box.
 */
export interface TAlertElement extends TElement {
  type: typeof ALERT_KEY;
  /** Optional title */
  title?: string;
  /** Visual variant */
  variant?: "default" | "success" | "warning" | "destructive";
  /** Children are the alert message content */
  children: (TElement | TText)[];
}

/**
 * Loader element - animated loading indicator with multiple styles.
 */
export interface TLoaderElement extends TElement {
  type: typeof LOADER_KEY;
  /** Loading animation style */
  variant?: "spinner" | "dots" | "bars" | "pulse" | "ring" | "bounce" | "wave" | "square" | "hands";
  /** Size of the loader */
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  /** Color variant */
  color?: "default" | "primary" | "secondary" | "muted";
  /** Optional label text below the loader */
  label?: string;
  /** Speed of animation */
  speed?: "slow" | "normal" | "fast";
  /** Children are unused (void element) */
  children: (TElement | TText)[];
}

// ============================================================================
// Chart Element Types
// ============================================================================

/**
 * Vega-Lite specification type.
 * This is a simplified type - the full spec is complex.
 * Use `import type { VisualizationSpec } from "react-vega"` for full typing.
 */
export type VegaLiteSpec = Record<string, unknown>;

/** Base chart configuration shared across all chart types */
export interface ChartBaseConfig {
  /** Data key for X axis */
  xKey?: string;
  /** Data key(s) for Y axis - single key or array for multi-series */
  yKey?: string | string[];
  /** Chart height in pixels */
  height?: number;
  /** Show legend */
  showLegend?: boolean;
  /** Show grid */
  showGrid?: boolean;
  /** Show tooltip on hover */
  showTooltip?: boolean;
  /** Custom colors for series */
  colors?: string[];
  /**
   * X-axis number format (d3-format string).
   * Examples: ",.0f" (commas), "$,.2s" (currency compact), ".1%" (percent)
   * If not provided, auto-detected from column name and values.
   */
  xFormat?: string;
  /**
   * Y-axis number format (d3-format string).
   * Examples: ",.0f" (commas), "$,.2s" (currency compact), ".1%" (percent)
   * If not provided, auto-detected from column name and values.
   */
  yFormat?: string;
  /**
   * Full Vega-Lite specification.
   * If provided, overrides the simplified props above.
   * Useful for AI-generated complex charts.
   */
  vegaSpec?: VegaLiteSpec;
  /**
   * Field to animate over (e.g., "year", "quarter").
   * Enables cycling through distinct values of this field.
   */
  animateBy?: string;
  /**
   * Specific frame value to display (disables auto-animation).
   * Use with animateBy to control which frame is shown externally.
   */
  frameValue?: string | number;
}

/**
 * LineChart element - displays data as a line graph.
 */
export interface TLineChartElement extends TElement, ChartBaseConfig {
  type: typeof LINE_CHART_KEY;
  /** Curve type for lines */
  curve?: "linear" | "monotone" | "step";
  /** Show dots on data points */
  showDots?: boolean;
  /** Children are unused (void element) */
  children: (TElement | TText)[];
}

/**
 * BarChart element - displays data as vertical bars.
 */
export interface TBarChartElement extends TElement, ChartBaseConfig {
  type: typeof BAR_CHART_KEY;
  /** Stack bars on top of each other */
  stacked?: boolean;
  /** Orientation of bars */
  layout?: "vertical" | "horizontal";
  /** Children are unused (void element) */
  children: (TElement | TText)[];
}

/**
 * AreaChart element - displays data as a filled area graph.
 */
export interface TAreaChartElement extends TElement, ChartBaseConfig {
  type: typeof AREA_CHART_KEY;
  /** Curve type for areas */
  curve?: "linear" | "monotone" | "step";
  /** Stack areas on top of each other */
  stacked?: boolean;
  /** Area fill opacity (0-1) */
  fillOpacity?: number;
  /** Children are unused (void element) */
  children: (TElement | TText)[];
}

/**
 * PieChart element - displays data as a pie/donut chart.
 */
export interface TPieChartElement extends TElement {
  type: typeof PIE_CHART_KEY;
  /** Data key for values */
  valueKey?: string;
  /** Data key for labels */
  nameKey?: string;
  /** Chart height in pixels */
  height?: number;
  /** Inner radius for donut chart (0 = pie, >0 = donut) */
  innerRadius?: number;
  /** Show legend */
  showLegend?: boolean;
  /** Show labels on slices */
  showLabels?: boolean;
  /** Custom colors for slices */
  colors?: string[];
  /**
   * Value format (d3-format string).
   * Examples: ",.0f" (commas), "$,.2s" (currency compact), ".1%" (percent)
   * If not provided, auto-detected from column name and values.
   */
  valueFormat?: string;
  /**
   * Full Vega-Lite specification.
   * If provided, overrides the simplified props above.
   */
  vegaSpec?: VegaLiteSpec;
  /** Field to animate over */
  animateBy?: string;
  /** Specific frame value to display */
  frameValue?: string | number;
  /** Children are unused (void element) */
  children: (TElement | TText)[];
}

/**
 * Generic Chart element - for full Vega-Lite specifications.
 * Used for advanced AI-generated charts that don't fit the simplified types.
 */
export interface TChartElement extends TElement {
  type: typeof CHART_KEY;
  /** Full Vega-Lite specification (required for this element type) */
  vegaSpec: VegaLiteSpec;
  /** Chart height in pixels */
  height?: number;
  /** Children are unused (void element) */
  children: (TElement | TText)[];
}

/**
 * ScatterChart element - displays data as a scatter plot.
 * Great for showing correlation between two variables.
 */
export interface TScatterChartElement extends TElement {
  type: typeof SCATTER_CHART_KEY;
  /** Data key for X axis */
  xKey?: string;
  /** Data key for Y axis */
  yKey?: string;
  /** Data key for color encoding (categorical grouping) */
  colorKey?: string;
  /** Data key for size encoding */
  sizeKey?: string;
  /** Chart height in pixels */
  height?: number;
  /** Show tooltip on hover */
  showTooltip?: boolean;
  /** Custom colors for groups */
  colors?: string[];
  /** Point opacity (0-1) */
  opacity?: number;
  /** Children are unused (void element) */
  children: (TElement | TText)[];
}

/**
 * HistogramChart element - displays distribution of a single variable.
 * Automatically bins continuous data.
 */
export interface THistogramChartElement extends TElement {
  type: typeof HISTOGRAM_CHART_KEY;
  /** Data key for the values to bin */
  valueKey?: string;
  /** Number of bins (default: auto) */
  binCount?: number;
  /** Chart height in pixels */
  height?: number;
  /** Show tooltip on hover */
  showTooltip?: boolean;
  /** Bar color */
  color?: string;
  /** Children are unused (void element) */
  children: (TElement | TText)[];
}

/**
 * HeatmapChart element - displays data as a colored matrix.
 * Great for showing patterns across two categorical dimensions.
 */
export interface THeatmapChartElement extends TElement {
  type: typeof HEATMAP_CHART_KEY;
  /** Data key for X axis (rows) */
  xKey?: string;
  /** Data key for Y axis (columns) */
  yKey?: string;
  /** Data key for color intensity */
  valueKey?: string;
  /** Chart height in pixels */
  height?: number;
  /** Color scheme (e.g., "blues", "reds", "viridis") */
  colorScheme?: string;
  /** Show tooltip on hover */
  showTooltip?: boolean;
  /** Children are unused (void element) */
  children: (TElement | TText)[];
}

/**
 * BoxPlotChart element - displays distribution statistics.
 * Shows median, quartiles, and outliers.
 */
export interface TBoxPlotChartElement extends TElement {
  type: typeof BOXPLOT_CHART_KEY;
  /** Data key for category (X axis) */
  categoryKey?: string;
  /** Data key for values (Y axis) */
  valueKey?: string;
  /** Chart height in pixels */
  height?: number;
  /** Show tooltip on hover */
  showTooltip?: boolean;
  /** Box color */
  color?: string;
  /** Orientation */
  orientation?: "vertical" | "horizontal";
  /** Children are unused (void element) */
  children: (TElement | TText)[];
}

/**
 * MapChart element - displays geographic data on a map.
 * Supports choropleth (filled regions) and point maps.
 */
export interface TMapChartElement extends TElement {
  type: typeof MAP_CHART_KEY;
  /** Map type */
  mapType?: "choropleth" | "point";
  /** Geographic feature key (e.g., "id" for GeoJSON features) */
  geoKey?: string;
  /** Data key for region/point identifier */
  idKey?: string;
  /** Data key for color value */
  valueKey?: string;
  /** For point maps: latitude key */
  latKey?: string;
  /** For point maps: longitude key */
  lonKey?: string;
  /** Chart height in pixels */
  height?: number;
  /** Geographic projection (e.g., "albersUsa", "mercator", "equalEarth") */
  projection?: string;
  /** TopoJSON URL or built-in dataset name */
  topology?: string;
  /** Color scheme for choropleth */
  colorScheme?: string;
  /** Show tooltip on hover */
  showTooltip?: boolean;
  /** Children are unused (void element) */
  children: (TElement | TText)[];
}

/**
 * InteractiveMap element - MapLibre GL based interactive map.
 * Supports pan/zoom, markers, popups, and custom styling.
 */
export interface InteractiveMapMarkerData {
  longitude: number;
  latitude: number;
  popup?: string;
  color?: string;
}

export interface TInteractiveMapElement extends TElement {
  type: typeof INTERACTIVE_MAP_KEY;
  /** Center longitude */
  longitude: number;
  /** Center latitude */
  latitude: number;
  /** Zoom level (0-22) */
  zoom: number;
  /** Map style: "light", "dark", or "voyager" */
  mapStyle?: "light" | "dark" | "voyager";
  /** Map height in pixels */
  height?: number;
  /** Markers to display */
  markers?: InteractiveMapMarkerData[];
  /** Show navigation controls */
  showControls?: boolean;
  /** Children are unused (void element) */
  children: (TElement | TText)[];
}

// ============================================================================
// DataGrid Types
// ============================================================================

/** Cell variant types supported by DataGrid */
export type DataGridCellVariant =
  | "short-text"
  | "long-text"
  | "number"
  | "date"
  | "checkbox"
  | "url"
  | "select"
  | "multi-select";

/** Column configuration for DataGrid */
export interface DataGridColumnConfig {
  /** Column key matching the data field */
  key: string;
  /** Display label for column header */
  label?: string;
  /** Column width in pixels */
  width?: number;
  /** Cell variant type */
  type?: DataGridCellVariant;
  /** Options for select/multi-select variants */
  options?: Array<{ value: string; label: string }>;
  /**
   * Format for numeric values (d3-format string).
   * Auto-detected from column name if not provided.
   */
  format?: string;
}

/**
 * DataGrid element - high-performance editable data grid.
 */
export interface TDataGridElement extends TElement {
  type: typeof DATA_GRID_KEY;
  /** Column configuration - auto-detect from data if not specified */
  columns?: DataGridColumnConfig[] | "auto";
  /** Grid height in pixels */
  height?: number;
  /** Read-only mode (no editing) */
  readOnly?: boolean;
  /** Enable search */
  enableSearch?: boolean;
  /** Enable paste from clipboard */
  enablePaste?: boolean;
  /** Children are unused (void element) */
  children: (TElement | TText)[];
}

// ============================================================================
// Context Types
// ============================================================================

/**
 * Context provided by LiveAction to its children.
 */
export interface LiveActionContextValue {
  /** Trigger the parent action's SQL execution */
  trigger: () => Promise<void>;
  /** Whether an action is currently executing */
  isPending: boolean;
  /** Last error from action execution */
  error: Error | null;
  /** Register a form field with the action */
  registerField: (name: string, getValue: () => unknown) => void;
  /** Unregister a form field */
  unregisterField: (name: string) => void;
}

// ============================================================================
// Column Layout Types
// ============================================================================

/**
 * ColumnGroup element - container for resizable columns (Notion-style layout).
 *
 * @example
 * ```tsx
 * <Columns>
 *   <Column width="50%">Left content</Column>
 *   <Column width="50%">Right content</Column>
 * </Columns>
 * ```
 */
export interface TColumnGroupElement extends TElement {
  type: typeof COLUMN_GROUP_KEY;
  /** Children are Column elements */
  children: TColumnElement[];
}

/**
 * Column element - individual column within a ColumnGroup.
 *
 * @example
 * ```tsx
 * <Column width="33.33%">Content here</Column>
 * ```
 */
export interface TColumnElement extends TElement {
  type: typeof COLUMN_KEY;
  /** Column width as CSS value (e.g., "50%", "200px", "1fr") */
  width?: string;
  /** Children are the column content */
  children: (TElement | TText)[];
}

// ============================================================================
// Tabs Layout Types
// ============================================================================

/**
 * Tabs element - container for tabbed navigation.
 *
 * @example
 * ```tsx
 * <Tabs defaultValue="overview">
 *   <Tab value="overview" label="Overview">Overview content</Tab>
 *   <Tab value="details" label="Details">Details content</Tab>
 * </Tabs>
 * ```
 */
export interface TTabsElement extends TElement {
  type: typeof TABS_KEY;
  /** Default active tab value */
  defaultValue?: string;
  /** Children are Tab elements */
  children: TTabElement[];
}

/**
 * Tab element - individual tab panel within Tabs.
 */
export interface TTabElement extends TElement {
  type: typeof TAB_KEY;
  /** Unique value for this tab */
  value: string;
  /** Display label for the tab trigger */
  label: string;
  /** Children are the tab content */
  children: (TElement | TText)[];
}

// ============================================================================
// Page Embed Element Types
// ============================================================================

/**
 * Page embed element - embeds reusable MDX pages/blocks inline.
 *
 * Modes:
 * 1. **Embed mode** (has src): Renders content from pages/blocks/{src}.mdx
 * 2. **Edit mode** (editing=true): Inline creation/editing
 * 3. **AI mode** (has prompt): AI-assisted content generation
 *
 * @example Embed existing page/block
 * ```tsx
 * <Page src="blocks/header" />
 * <Page src="blocks/user-card" params={{userId: 123}} />
 * ```
 *
 * @example AI generation
 * ```tsx
 * <Page prompt="create a metrics dashboard" />
 * ```
 */
export interface TPageEmbedElement extends TElement {
  type: typeof PAGE_EMBED_KEY;
  /** Path to the MDX file relative to pages/ (e.g., "blocks/header") */
  src?: string;
  /** Optional parameters to pass to the embedded page */
  params?: Record<string, unknown>;
  /** Whether the page is in editing/creation mode */
  editing?: boolean;
  /** AI prompt for content generation */
  prompt?: string;
  /** Height of the container (useful for loading states) */
  height?: number;
  /** CSS class for the container */
  className?: string;
  /** Children are unused (void element) */
  children: (TElement | TText)[];
}

/** @deprecated Use TPageEmbedElement instead */
export type TBlockElement = TPageEmbedElement;

// ============================================================================
// Database Adapter
// ============================================================================

export { type DbAdapter, type DbQueryResult } from "../db/context";
