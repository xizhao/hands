/**
 * @hands/core/stdlib
 *
 * Hands Standard Library - Components for building interactive data applications.
 *
 * ## Categories
 *
 * ### View Components
 * Display-only components that render data without user interaction.
 * - `LiveValue` - Display SQL query results (inline/list/table)
 * - `Metric` - KPI display (number + label + change indicator)
 * - `Badge` - Inline status indicator
 * - `Progress` - Progress bar for completion status
 * - `Alert` - Callout message box
 * - `Loader` - Animated loading indicator
 * - Charts: `LineChart`, `BarChart`, `AreaChart`, `PieChart`
 *
 * ### Action Components
 * Interactive components that trigger discrete actions via LiveAction.
 * - `LiveAction` - Container for form controls that executes SQL on submit
 * - `ActionButton` - Button to trigger parent action
 * - `ActionInput` - Text input with form binding
 * - `ActionSelect` - Dropdown with form binding
 * - `ActionCheckbox` - Checkbox with form binding
 * - `ActionTextarea` - Multiline text with form binding
 *
 * ### Data Components
 * Self-contained data management with CRUD operations.
 * - `DataGrid` - High-performance editable data grid
 * - `Kanban` - Drag-and-drop board for grouped data
 */

// Re-export view components
export * from "./view";
// Re-export action components
export * from "./action";
// Re-export data components
export * from "./data";
// Re-export SQL validation utilities
export * from "./sql-validation";
// Re-export serialization rules and helpers
export * from "./serialization";
// Re-export query provider (for apps to implement data fetching)
export * from "./query-provider";
// Re-export custom block factory
export * from "./custom-block";

// Import kits
import { ActionKit } from "./action";
import { DataKit } from "./data";
import {
  AlertPlugin,
  AreaChartPlugin,
  BadgePlugin,
  BarChartPlugin,
  LineChartPlugin,
  LiveValuePlugin,
  LiveValueInlinePlugin,
  LoaderPlugin,
  MetricPlugin,
  PieChartPlugin,
  ProgressPlugin,
} from "./view";

/**
 * Chart plugins only - for apps that provide their own LiveValue implementation.
 */
export const ChartKit = [
  LineChartPlugin,
  BarChartPlugin,
  AreaChartPlugin,
  PieChartPlugin,
] as const;

/**
 * View component plugins for Plate editor.
 */
export const ViewKit = [
  LiveValuePlugin,
  LiveValueInlinePlugin,
  MetricPlugin,
  BadgePlugin,
  ProgressPlugin,
  AlertPlugin,
  LoaderPlugin,
  ...ChartKit,
] as const;

/**
 * All stdlib plugins for Plate editor.
 */
export const StdlibKit = [...ViewKit, ...ActionKit, ...DataKit] as const;

// Legacy aliases for backward compatibility
export { ActionKit as ActiveKit };
export { ViewKit as StaticKit };
