// Core types

// Action utilities - re-exported from @hands/core for user convenience
export {
  type ActionContext,
  type ActionDefinition,
  type ActionLogger,
  type ActionNotify,
  type ActionRun,
  type ActionRunMeta,
  type ActionRunStatus,
  type ActionTrigger,
  type ActionTriggerType,
  type DiscoveredAction,
  defineAction,
  type SelectOptions,
  type TableClient,
} from "@hands/core/primitives";

// Component types
export type { BarChartProps } from "./registry/components/charts/bar-chart.js";
// Components - imported directly from source files
export { BarChart } from "./registry/components/charts/bar-chart.js";
export type { LineChartProps } from "./registry/components/charts/line-chart.js";
export { LineChart } from "./registry/components/charts/line-chart.js";
export type { DataTableColumn, DataTableProps } from "./registry/components/data/data-table.js";
export { DataTable } from "./registry/components/data/data-table.js";
export { MetricCard } from "./registry/components/data/metric-card.js";
export { Badge, badgeVariants } from "./registry/components/ui/badge.js";
export { Button, buttonVariants } from "./registry/components/ui/button.js";
export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./registry/components/ui/card.js";

// Source utilities (v2 - table containers)
export {
  type DiscoveredSource,
  type DiscoveredTable,
  defineSourceV2,
  type SourceDefinitionV2,
  type TableColumn,
  type TableDefinition,
  type TableSchema,
  type TableSubscription,
} from "./sources/types.js";
export * from "./types/index.js";
