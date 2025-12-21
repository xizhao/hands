/**
 * @hands/core/stdlib/static
 *
 * Static display components - render data without user interaction.
 */

export {
  ALERT_KEY,
  Alert,
  AlertPlugin,
  type AlertProps,
  createAlertElement,
} from "./alert";
export {
  BADGE_KEY,
  Badge,
  BadgePlugin,
  type BadgeProps,
  createBadgeElement,
} from "./badge";
export {
  autoDetectColumns,
  createLiveValueElement,
  type DisplayType,
  formatCellValue,
  LIVE_VALUE_KEY,
  LiveValueDisplay,
  LiveValuePlugin,
  type LiveValueProps,
  resolveDisplayMode,
  selectDisplayType,
} from "./live-value";
export {
  createMetricElement,
  METRIC_KEY,
  Metric,
  MetricPlugin,
  type MetricProps,
} from "./metric";
export {
  createProgressElement,
  PROGRESS_KEY,
  Progress,
  ProgressPlugin,
  type ProgressProps,
} from "./progress";
export {
  createLoaderElement,
  LOADER_KEY,
  Loader,
  LoaderPlugin,
  type LoaderProps,
  type LoaderVariant,
  type LoaderSize,
  type LoaderColor,
  type LoaderSpeed,
} from "./loader";

// DataGrid
export {
  createDataGridElement,
  type CreateDataGridOptions,
  DATA_GRID_KEY,
  DataGrid,
  DataGridPlugin,
  type DataGridProps,
} from "./data-grid";

// Charts
export {
  // Chart primitives (shadcn-style)
  type ChartConfig,
  ChartContainer,
  ChartContext,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
  ChartTooltip,
  ChartTooltipContent,
  useChart,
  // Context and hooks
  type LiveValueContextData,
  LiveValueProvider,
  type LiveValueProviderProps,
  useLiveValueData,
  useRequiredLiveValueData,
  // LineChart
  createLineChartElement,
  type CreateLineChartOptions,
  LINE_CHART_KEY,
  LineChart,
  LineChartPlugin,
  type LineChartProps,
  // BarChart
  BAR_CHART_KEY,
  BarChart,
  BarChartPlugin,
  type BarChartProps,
  type CreateBarChartOptions,
  createBarChartElement,
  // AreaChart
  AREA_CHART_KEY,
  AreaChart,
  AreaChartPlugin,
  type AreaChartProps,
  type CreateAreaChartOptions,
  createAreaChartElement,
  // PieChart
  createPieChartElement,
  type CreatePieChartOptions,
  PIE_CHART_KEY,
  PieChart,
  PieChartPlugin,
  type PieChartProps,
} from "./charts";
