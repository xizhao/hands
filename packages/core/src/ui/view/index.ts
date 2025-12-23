/**
 * @hands/core/ui/view
 *
 * View components - display-only rendering without user interaction.
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
  LiveValueInlinePlugin,
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

// Charts
export {
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
  // Generic Chart (Vega-Lite spec)
  CHART_KEY,
  Chart,
  ChartPlugin,
  type ChartProps,
  type CreateChartOptions,
  createChartElement,
  // ScatterChart
  SCATTER_CHART_KEY,
  ScatterChart,
  ScatterChartPlugin,
  type ScatterChartProps,
  createScatterChartElement,
  // HistogramChart
  HISTOGRAM_CHART_KEY,
  HistogramChart,
  HistogramChartPlugin,
  type HistogramChartProps,
  createHistogramChartElement,
  // HeatmapChart
  HEATMAP_CHART_KEY,
  HeatmapChart,
  HeatmapChartPlugin,
  type HeatmapChartProps,
  createHeatmapChartElement,
  // BoxPlotChart
  BOXPLOT_CHART_KEY,
  BoxPlotChart,
  BoxPlotChartPlugin,
  type BoxPlotChartProps,
  createBoxPlotChartElement,
  // MapChart
  MAP_CHART_KEY,
  MapChart,
  MapChartPlugin,
  type MapChartProps,
  createMapChartElement,
} from "./charts";

// Block embedding
export {
  Block,
  BLOCK_KEY,
  BlockPlugin,
  BlockProvider,
  type BlockProps,
  type CreateBlockOptions,
  createBlockElement,
  useBlockParams,
} from "./block";

export {
  createTabsElement,
  Tab,
  TabPlugin,
  type TabProps,
  TAB_KEY,
  Tabs,
  TabsPlugin,
  type TabsProps,
  TABS_KEY,
} from "./tabs";
