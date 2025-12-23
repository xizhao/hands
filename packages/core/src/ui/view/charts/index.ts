/**
 * @hands/core/ui/view/charts
 *
 * Chart components for data visualization.
 * Charts can read data from LiveValue context or receive data via props.
 * Uses Vega-Lite for rendering with canvas for performance.
 */

// AreaChart
export {
  AREA_CHART_KEY,
  AreaChart,
  AreaChartPlugin,
  type AreaChartProps,
  type CreateAreaChartOptions,
  createAreaChartElement,
} from "./area-chart";
// BarChart
export {
  BAR_CHART_KEY,
  BarChart,
  BarChartPlugin,
  type BarChartProps,
  type CreateBarChartOptions,
  createBarChartElement,
} from "./bar-chart";
// Legacy chart primitives (for backward compatibility)
export {
  type ChartConfig,
  ChartContainer,
  ChartContext,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
  ChartTooltip,
  ChartTooltipContent,
  useChart,
} from "./chart";

// Context and hooks
export {
  type LiveValueContextData,
  LiveValueProvider,
  type LiveValueProviderProps,
  useLiveValueData,
  useRequiredLiveValueData,
} from "./context";

// Generic Chart (full Vega-Lite specs)
export {
  CHART_KEY,
  Chart,
  ChartPlugin,
  type ChartProps,
  type CreateChartOptions,
  createChartElement,
} from "./generic-chart";
// LineChart
export {
  type CreateLineChartOptions,
  createLineChartElement,
  LINE_CHART_KEY,
  LineChart,
  LineChartPlugin,
  type LineChartProps,
} from "./line-chart";
// PieChart
export {
  type CreatePieChartOptions,
  createPieChartElement,
  PIE_CHART_KEY,
  PieChart,
  PieChartPlugin,
  type PieChartProps,
} from "./pie-chart";
// Vega-Lite core renderer
export {
  ChartEmpty,
  ChartError,
  ChartSkeleton,
  VegaChart,
  type VegaChartProps,
  type VisualizationSpec,
} from "./vega-chart";
// Spec converters (simplified props → Vega-Lite spec)
export {
  type AreaChartSpecProps,
  areaChartToVegaSpec,
  type BarChartSpecProps,
  barChartToVegaSpec,
  type ChartType,
  detectChartType,
  type LineChartSpecProps,
  lineChartToVegaSpec,
  type PieChartSpecProps,
  pieChartToVegaSpec,
} from "./vega-spec";
// Vega theme bridge (CSS vars → Vega config)
export {
  createVegaConfig,
  useVegaTheme,
  type VegaConfig,
} from "./vega-theme";
