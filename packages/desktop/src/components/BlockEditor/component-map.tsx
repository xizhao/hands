/**
 * Component Map for Stdlib Components
 *
 * Maps component names from the registry to actual React components.
 * This allows dynamic rendering of stdlib components in the WYSIWYG editor.
 *
 * Note: Components are lazy-loaded to avoid import resolution issues with
 * workspace packages. This also improves bundle splitting.
 */

import { type ComponentType, lazy, Suspense, forwardRef } from 'react';

/**
 * Lazy wrapper that creates a component with Suspense fallback
 */
function createLazyComponent<P extends object>(
  loader: () => Promise<{ default: ComponentType<P> } | { [key: string]: ComponentType<P> }>,
  exportName?: string
): ComponentType<P> {
  const LazyComponent = lazy(async () => {
    const mod = await loader();
    if (exportName && exportName in mod) {
      return { default: (mod as Record<string, ComponentType<P>>)[exportName] };
    }
    return mod as { default: ComponentType<P> };
  });

  // Wrap in forwardRef to handle refs properly
  return forwardRef<unknown, P>((props, ref) => (
    <Suspense fallback={<div className="animate-pulse bg-muted h-8 rounded" />}>
      <LazyComponent {...props} ref={ref} />
    </Suspense>
  )) as unknown as ComponentType<P>;
}

// UI Components - lazy loaded
const Button = createLazyComponent(
  // @ts-expect-error - Dynamic import from workspace package
  () => import('@hands/stdlib/registry/components/ui/button'),
  'Button'
);

const Card = createLazyComponent(
  // @ts-expect-error - Dynamic import from workspace package
  () => import('@hands/stdlib/registry/components/ui/card'),
  'Card'
);

const CardHeader = createLazyComponent(
  // @ts-expect-error - Dynamic import from workspace package
  () => import('@hands/stdlib/registry/components/ui/card'),
  'CardHeader'
);

const CardTitle = createLazyComponent(
  // @ts-expect-error - Dynamic import from workspace package
  () => import('@hands/stdlib/registry/components/ui/card'),
  'CardTitle'
);

const CardDescription = createLazyComponent(
  // @ts-expect-error - Dynamic import from workspace package
  () => import('@hands/stdlib/registry/components/ui/card'),
  'CardDescription'
);

const CardContent = createLazyComponent(
  // @ts-expect-error - Dynamic import from workspace package
  () => import('@hands/stdlib/registry/components/ui/card'),
  'CardContent'
);

const CardFooter = createLazyComponent(
  // @ts-expect-error - Dynamic import from workspace package
  () => import('@hands/stdlib/registry/components/ui/card'),
  'CardFooter'
);

const Badge = createLazyComponent(
  // @ts-expect-error - Dynamic import from workspace package
  () => import('@hands/stdlib/registry/components/ui/badge'),
  'Badge'
);

// Data Components - lazy loaded
const MetricCard = createLazyComponent(
  // @ts-expect-error - Dynamic import from workspace package
  () => import('@hands/stdlib/registry/components/data/metric-card'),
  'MetricCard'
);

const DataTable = createLazyComponent(
  // @ts-expect-error - Dynamic import from workspace package
  () => import('@hands/stdlib/registry/components/data/data-table'),
  'DataTable'
);

// Chart Components - lazy loaded
const LineChart = createLazyComponent(
  // @ts-expect-error - Dynamic import from workspace package
  () => import('@hands/stdlib/registry/components/charts/line-chart'),
  'LineChart'
);

const BarChart = createLazyComponent(
  // @ts-expect-error - Dynamic import from workspace package
  () => import('@hands/stdlib/registry/components/charts/bar-chart'),
  'BarChart'
);

/**
 * Map of component names to their React components.
 * Keys match the displayName or export name of each component.
 */
export const STDLIB_COMPONENT_MAP: Record<string, ComponentType<any>> = {
  // UI Components
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Badge,

  // Data Components
  MetricCard,
  DataTable,

  // Chart Components
  LineChart,
  BarChart,
};

/**
 * Get a component by name from the stdlib registry
 */
export function getStdlibComponent(name: string): ComponentType<any> | undefined {
  return STDLIB_COMPONENT_MAP[name];
}

/**
 * Check if a component name exists in the stdlib
 */
export function isStdlibComponent(name: string): boolean {
  return name in STDLIB_COMPONENT_MAP;
}

/**
 * Get all available component names
 */
export function getStdlibComponentNames(): string[] {
  return Object.keys(STDLIB_COMPONENT_MAP);
}

/**
 * Default props for each component type.
 * These are used when inserting a new component.
 */
export const DEFAULT_COMPONENT_PROPS: Record<string, Record<string, unknown>> = {
  Button: {
    children: 'Button',
    variant: 'default',
    size: 'default',
  },
  Card: {},
  CardHeader: {},
  CardTitle: {
    children: 'Card Title',
  },
  CardDescription: {
    children: 'Card description goes here.',
  },
  CardContent: {},
  CardFooter: {},
  Badge: {
    children: 'Badge',
    variant: 'default',
  },
  MetricCard: {
    title: 'Metric',
    value: 0,
    description: 'Description',
  },
  DataTable: {
    data: [],
    columns: [],
  },
  LineChart: {
    data: [],
    x: 'x',
    y: 'y',
    height: 200,
  },
  BarChart: {
    data: [],
    x: 'x',
    y: 'y',
    height: 200,
  },
};

/**
 * Get default props for a component
 */
export function getDefaultProps(componentName: string): Record<string, unknown> {
  return DEFAULT_COMPONENT_PROPS[componentName] ?? {};
}

/**
 * Category icons for the component palette
 */
export const CATEGORY_ICONS = {
  ui: 'LayoutGrid',
  data: 'Database',
  charts: 'BarChart3',
} as const;
