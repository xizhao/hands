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
// Block embedding
export {
  BLOCK_KEY,
  Block,
  BlockPlugin,
  type BlockProps,
  BlockProvider,
  type CreateBlockOptions,
  createBlockElement,
  useBlockParams,
} from "./block";
// Charts
export {
  // AreaChart
  AREA_CHART_KEY,
  AreaChart,
  AreaChartPlugin,
  type AreaChartProps,
  // BarChart
  BAR_CHART_KEY,
  BarChart,
  BarChartPlugin,
  type BarChartProps,
  // BoxPlotChart
  BOXPLOT_CHART_KEY,
  BoxPlotChart,
  BoxPlotChartPlugin,
  type BoxPlotChartProps,
  // Generic Chart (Vega-Lite spec)
  CHART_KEY,
  Chart,
  ChartPlugin,
  type ChartProps,
  type CreateAreaChartOptions,
  type CreateBarChartOptions,
  type CreateChartOptions,
  type CreateLineChartOptions,
  type CreatePieChartOptions,
  createAreaChartElement,
  createBarChartElement,
  createBoxPlotChartElement,
  createChartElement,
  createHeatmapChartElement,
  createHistogramChartElement,
  // LineChart
  createLineChartElement,
  createMapChartElement,
  // PieChart
  createPieChartElement,
  createScatterChartElement,
  // HeatmapChart
  HEATMAP_CHART_KEY,
  HeatmapChart,
  HeatmapChartPlugin,
  type HeatmapChartProps,
  // HistogramChart
  HISTOGRAM_CHART_KEY,
  HistogramChart,
  HistogramChartPlugin,
  type HistogramChartProps,
  LINE_CHART_KEY,
  LineChart,
  LineChartPlugin,
  type LineChartProps,
  // Context and hooks
  type LiveValueContextData,
  LiveValueProvider,
  type LiveValueProviderProps,
  // MapChart
  MAP_CHART_KEY,
  MapChart,
  MapChartPlugin,
  type MapChartProps,
  PIE_CHART_KEY,
  PieChart,
  PieChartPlugin,
  type PieChartProps,
  // ScatterChart
  SCATTER_CHART_KEY,
  ScatterChart,
  ScatterChartPlugin,
  type ScatterChartProps,
  useLiveValueData,
  useRequiredLiveValueData,
} from "./charts";
export {
  autoDetectColumns,
  createLiveValueElement,
  type DisplayType,
  formatCellValue,
  LIVE_VALUE_KEY,
  LiveValueDisplay,
  LiveValueInlinePlugin,
  LiveValuePlugin,
  type LiveValueProps,
  resolveDisplayMode,
  selectDisplayType,
} from "./live-value";
export {
  createLoaderElement,
  LOADER_KEY,
  Loader,
  type LoaderColor,
  LoaderPlugin,
  type LoaderProps,
  type LoaderSize,
  type LoaderSpeed,
  type LoaderVariant,
} from "./loader";
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
  createTabsElement,
  TAB_KEY,
  TABS_KEY,
  Tab,
  TabPlugin,
  type TabProps,
  Tabs,
  TabsPlugin,
  type TabsProps,
} from "./tabs";

// Interactive Maps (MapLibre GL)
export {
  createInteractiveMapElement,
  INTERACTIVE_MAP_KEY,
  InteractiveMap,
  InteractiveMapElement,
  InteractiveMapPlugin,
  type InteractiveMapProps,
  MapControls,
  type MapControlsProps,
  MapMarker,
  type MapMarkerProps,
  MapPopup,
  type MapPopupProps,
  useMap,
} from "./maps";
