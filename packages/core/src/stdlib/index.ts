/**
 * @hands/core/stdlib
 *
 * Hands Standard Library - Components for building interactive data applications.
 *
 * ## Categories
 *
 * ### Static Components
 * Display-only components that render data without user interaction.
 * - `LiveValue` - Display SQL query results (inline/list/table)
 * - `Metric` - KPI display (number + label + change indicator)
 * - `Badge` - Inline status indicator
 * - `Progress` - Progress bar for completion status
 * - `Alert` - Callout message box
 * - `Loader` - Animated loading indicator
 * - `DataGrid` - High-performance editable data grid
 *
 * ### Chart Components
 * Data visualization components that work standalone or inside LiveValue.
 * - `LineChart` - Line graph for trends over time
 * - `BarChart` - Bar graph for categorical comparisons
 * - `AreaChart` - Filled area graph for cumulative trends
 * - `PieChart` - Pie/donut chart for proportional data
 *
 * ### Active Components
 * Interactive components that handle user input and execute SQL mutations.
 * - `LiveAction` - Container for form controls that executes SQL on submit
 * - `ActionButton` - Button to trigger parent action
 * - `ActionInput` - Text input with form binding
 * - `ActionSelect` - Dropdown with form binding
 * - `ActionCheckbox` - Checkbox with form binding
 * - `ActionTextarea` - Multiline text with form binding
 */

// Re-export active components
export * from "./active";
// Re-export SQL validation utilities
export * from "./sql-validation";
// Re-export static components
export * from "./static";
// Re-export serialization rules and helpers
export * from "./serialization";

import { ActiveKit } from "./active";
// Convenience kit exports
import {
  AlertPlugin,
  AreaChartPlugin,
  BadgePlugin,
  BarChartPlugin,
  DataGridPlugin,
  LineChartPlugin,
  LiveValuePlugin,
  LoaderPlugin,
  MetricPlugin,
  PieChartPlugin,
  ProgressPlugin,
} from "./static";

/**
 * Static component plugins for Plate editor.
 */
export const StaticKit = [
  LiveValuePlugin,
  MetricPlugin,
  BadgePlugin,
  ProgressPlugin,
  AlertPlugin,
  LoaderPlugin,
  DataGridPlugin,
  LineChartPlugin,
  BarChartPlugin,
  AreaChartPlugin,
  PieChartPlugin,
] as const;

/**
 * All stdlib plugins for Plate editor.
 */
export const StdlibKit = [...StaticKit, ...ActiveKit] as const;

export { ActiveKit };
