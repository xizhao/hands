"use client";

/**
 * Client-only chart and data components
 *
 * These components are marked "use client" to ensure they're only
 * loaded on the client side. RSC will serialize them as references.
 */

// Re-export chart components for use in RSC
export {
  // Core charts
  BarChart,
  LineChart,
  AreaChart,
  PieChart,
  Chart,
  LiveValueProvider,
  // Additional charts
  ScatterChart,
  HistogramChart,
  HeatmapChart,
  BoxPlotChart,
  MapChart,
  // View components
  Alert,
  Badge,
  Metric,
  Progress,
  Loader,
  Tabs,
  Tab,
} from "@hands/core/ui/view";

// Re-export DataGrid for table display in LiveValue
export { DataGrid } from "@hands/core/ui/data";

// Re-export TooltipProvider for DataGrid (requires context)
export { TooltipProvider } from "@hands/core/ui/components";
