import registry from "../registry.json" with { type: "json" };

// ============================================
// Runtime Components - for RSC serialization
// ============================================

// UI Components
import { Button } from "./components/ui/button.js";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "./components/ui/card.js";
import { Badge } from "./components/ui/badge.js";

// Data Components
import { MetricCard } from "./components/data/metric-card.js";
import { DataTable } from "./components/data/data-table.js";

// Chart Components
import { BarChart } from "./components/charts/bar-chart.js";
import { LineChart } from "./components/charts/line-chart.js";

/**
 * Runtime component registry for RSC serialization.
 * The worker template imports this directly.
 * Add new components here to make them available in blocks.
 */
export const rscComponents = {
  // UI
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Badge,
  // Data
  MetricCard,
  DataTable,
  // Charts
  BarChart,
  LineChart,
} as const;

// Re-export components for direct imports
export {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Badge,
  MetricCard,
  DataTable,
  BarChart,
  LineChart,
};

// Re-export variant helpers and types
export { buttonVariants } from "./components/ui/button.js";
export { badgeVariants } from "./components/ui/badge.js";
export type { BarChartProps } from "./components/charts/bar-chart.js";
export type { LineChartProps } from "./components/charts/line-chart.js";
export type { DataTableProps, DataTableColumn } from "./components/data/data-table.js";

// Chart infrastructure (shadcn style)
export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "./components/ui/chart.js";
export type { ChartConfig } from "./components/ui/chart.js";

// ============================================
// Component Metadata Registry - for CLI
// ============================================

export interface ComponentMeta {
  name: string;
  category: string;
  description: string;
  files: string[];
  dependencies: string[];
  /** Plate KEYS value for block/inline types */
  plateKey?: string;
  /** Lucide icon name */
  icon?: string;
  /** Search keywords */
  keywords?: string[];
}

export interface CategoryMeta {
  name: string;
  description: string;
}

export interface Registry {
  name: string;
  version: string;
  components: Record<string, ComponentMeta>;
  categories: Record<string, CategoryMeta>;
}

// Export typed registry
export const componentRegistry = registry as Registry;

// Helper functions for querying

export function listComponents(category?: string): Array<{ key: string } & ComponentMeta> {
  return Object.entries(componentRegistry.components)
    .filter(([_, comp]) => !category || comp.category === category)
    .map(([key, comp]) => ({ key, ...comp }));
}

export function getComponent(name: string): (ComponentMeta & { key: string }) | undefined {
  const comp = componentRegistry.components[name];
  return comp ? { key: name, ...comp } : undefined;
}

export function searchComponents(query: string): Array<{ key: string } & ComponentMeta> {
  const q = query.toLowerCase();
  return Object.entries(componentRegistry.components)
    .filter(([key, comp]) =>
      key.includes(q) ||
      comp.name.toLowerCase().includes(q) ||
      comp.description.toLowerCase().includes(q) ||
      comp.category.includes(q)
    )
    .map(([key, comp]) => ({ key, ...comp }));
}

export function listCategories(): Array<{ key: string } & CategoryMeta> {
  return Object.entries(componentRegistry.categories)
    .map(([key, cat]) => ({ key, ...cat }));
}

export function getCategory(name: string): CategoryMeta | undefined {
  return componentRegistry.categories[name];
}
