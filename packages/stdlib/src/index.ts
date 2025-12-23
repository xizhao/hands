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
} from "@hands/core/primitives";

// Component types
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

export * from "./types/index.js";
