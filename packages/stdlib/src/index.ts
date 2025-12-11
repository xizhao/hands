// Core types
export * from "./types/index.js"

// Source utilities
export { defineSource } from "./sources/types.js"

// UI Components (for RSC rendering)
export { Button, buttonVariants } from "./registry/components/ui/button.js"
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "./registry/components/ui/card.js"
export { Badge, badgeVariants } from "./registry/components/ui/badge.js"

// Data Components
export { MetricCard } from "./registry/components/data/metric-card.js"
export { DataTable, type DataTableProps, type DataTableColumn } from "./registry/components/data/data-table.js"

// Chart Components
export { BarChart, type BarChartProps } from "./registry/components/charts/bar-chart.js"
export { LineChart, type LineChartProps } from "./registry/components/charts/line-chart.js"
