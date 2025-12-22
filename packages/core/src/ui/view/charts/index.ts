/**
 * @hands/core/ui/view/charts
 *
 * Chart components for data visualization.
 * Charts can read data from LiveValue context or receive data via props.
 */

// Chart primitives (shadcn-style)
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

// LineChart
export {
  createLineChartElement,
  type CreateLineChartOptions,
  LINE_CHART_KEY,
  LineChart,
  LineChartPlugin,
  type LineChartProps,
} from "./line-chart";

// PieChart
export {
  createPieChartElement,
  type CreatePieChartOptions,
  PIE_CHART_KEY,
  PieChart,
  PieChartPlugin,
  type PieChartProps,
} from "./pie-chart";
