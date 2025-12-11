// Core types
export * from "./types/index.js"

// Source utilities
export { defineSource } from "./sources/types.js"

// Component registry (single source of truth for RSC components)
export {
  // Runtime registry for worker template
  rscComponents,
  // Individual components
  Button,
  buttonVariants,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Badge,
  badgeVariants,
  MetricCard,
  DataTable,
  BarChart,
  LineChart,
} from "./registry/index.js"

// Component types
export type {
  BarChartProps,
  LineChartProps,
  DataTableProps,
  DataTableColumn,
} from "./registry/index.js"
