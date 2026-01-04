"use client";

/**
 * Client-only chart and data components
 *
 * These components are marked "use client" to ensure they're only
 * loaded on the client side. RSC will serialize them as references.
 */

// Re-export TooltipProvider for DataGrid (requires context)
export { TooltipProvider } from "@hands/core/ui/components";

// Re-export DataGrid for table display in LiveValue
export { DataGrid } from "@hands/core/ui/data";
// Re-export chart components for use in RSC
export {
  // View components
  Alert,
  AreaChart,
  Badge,
  // Core charts
  BarChart,
  BoxPlotChart,
  Chart,
  HeatmapChart,
  HistogramChart,
  // Interactive maps
  InteractiveMap,
  LineChart,
  LiveValueProvider,
  Loader,
  MapChart,
  MapControls,
  MapMarker,
  Metric,
  PieChart,
  Progress,
  // Additional charts
  ScatterChart,
  Tab,
  Tabs,
} from "@hands/core/ui/view";

// Re-export LocalStateProvider for page-level ephemeral state
export { LocalStateProvider } from "@hands/core/ui";
