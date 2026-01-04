/**
 * @hands/core/ui
 *
 * Hands UI Library - Components for building interactive data applications.
 *
 * ## Categories
 *
 * ### View Components
 * Display-only components that render data without user interaction.
 * - `LiveValue` - Display SQL query results (inline/list/table)
 * - `Block` - Embed reusable MDX blocks or create with AI
 * - `Metric` - KPI display (number + label + change indicator)
 * - `Badge` - Inline status indicator
 * - `Progress` - Progress bar for completion status
 * - `Alert` - Callout message box
 * - `Loader` - Animated loading indicator
 * - Charts: `LineChart`, `BarChart`, `AreaChart`, `PieChart`, `Chart` (generic Vega-Lite),
 *   `ScatterChart`, `HistogramChart`, `HeatmapChart`, `BoxPlotChart`, `MapChart`
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

// Re-export action components
export * from "./action";
// Re-export data components
export * from "./data";
// Re-export virtualization utilities (for performance optimization)
export * from "./lib/virtualization";
// Re-export query provider (for apps to implement data fetching)
export * from "./query-provider";
// Re-export view components
export * from "./view";

// Import kits
import { ActionKit } from "./action";
import { DataKit } from "./data";
import {
  AlertPlugin,
  AreaChartPlugin,
  BadgePlugin,
  BarChartPlugin,
  BlockPlugin,
  BoxPlotChartPlugin,
  ChartPlugin,
  HeatmapChartPlugin,
  HistogramChartPlugin,
  InteractiveMapPlugin,
  LineChartPlugin,
  LiveValueInlinePlugin,
  LiveValuePlugin,
  LoaderPlugin,
  MapChartPlugin,
  MetricPlugin,
  PieChartPlugin,
  ProgressPlugin,
  ScatterChartPlugin,
  TabPlugin,
  TabsPlugin,
} from "./view";

/**
 * Chart plugins only - for apps that provide their own LiveValue implementation.
 */
export const ChartKit = [
  LineChartPlugin,
  BarChartPlugin,
  AreaChartPlugin,
  PieChartPlugin,
  ChartPlugin,
  ScatterChartPlugin,
  HistogramChartPlugin,
  HeatmapChartPlugin,
  BoxPlotChartPlugin,
  MapChartPlugin,
  InteractiveMapPlugin,
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
  BlockPlugin,
  TabsPlugin,
  TabPlugin,
  ...ChartKit,
] as const;

/**
 * All UI plugins for Plate editor.
 */
export const UIKit = [...ViewKit, ...ActionKit, ...DataKit] as const;

// Legacy aliases for backward compatibility
export { ActionKit as ActiveKit };
export { ViewKit as StaticKit };
export { UIKit as StdlibKit };
