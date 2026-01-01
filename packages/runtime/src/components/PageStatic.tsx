// Types from core
import type {
  TAlertElement,
  TAreaChartElement,
  TBadgeElement,
  TBarChartElement,
  TBoxPlotChartElement,
  TChartElement,
  THeatmapChartElement,
  THistogramChartElement,
  TLineChartElement,
  TLiveValueElement,
  TLoaderElement,
  TMapChartElement,
  TMetricElement,
  TPieChartElement,
  TProgressElement,
  TScatterChartElement,
  TTabElement,
  TTabsElement,
} from "@hands/core/types";
// Helpers from core (re-exported in view)
import { formatCellValue, selectDisplayType } from "@hands/core/ui/view";
// Base plugins - import DIRECTLY to avoid pulling in React deps from index
import { BaseBasicBlocksKit } from "@hands/editor/plugins/basic-blocks-base-kit";
import { BaseBasicMarksKit } from "@hands/editor/plugins/basic-marks-base-kit";
import { BaseCalloutKit } from "@hands/editor/plugins/callout-base-kit";
import { BaseCodeBlockKit } from "@hands/editor/plugins/code-block-base-kit";
import { BaseColumnKit } from "@hands/editor/plugins/column-base-kit";
import { BaseLinkKit } from "@hands/editor/plugins/link-base-kit";
import { BaseListKit } from "@hands/editor/plugins/list-base-kit";
import { BaseMediaKit } from "@hands/editor/plugins/media-base-kit";
import { BaseMentionKit } from "@hands/editor/plugins/mention-base-kit";
import { BaseTableKit } from "@hands/editor/plugins/table-base-kit";
import { BaseTocKit } from "@hands/editor/plugins/toc-base-kit";
import { BaseToggleKit } from "@hands/editor/plugins/toggle-base-kit";
import type { TElement, Value } from "platejs";
import { createSlateEditor, createSlatePlugin } from "platejs";
import { PlateStatic } from "platejs/static";
import { Suspense } from "react";
// Database access
import { getDb, kyselySql, runWithDbMode } from "../db/dev";
// Chart and view components (use client - will be hydrated by rwsdk)
import {
  // View components
  Alert,
  AreaChart,
  Badge,
  BarChart,
  BoxPlotChart,
  Chart,
  DataGrid,
  HeatmapChart,
  HistogramChart,
  LineChart,
  LiveValueProvider,
  Loader,
  MapChart,
  Metric,
  PieChart,
  Progress,
  // Additional charts
  ScatterChart,
  Tab,
  Tabs,
  TooltipProvider,
} from "./charts-client";

/** RSC block element in Plate value */
interface RscBlockElement extends TElement {
  type: "rsc-block";
  blockId: string;
  blockProps?: Record<string, unknown>;
}

// Simple display components for RSC
function InlineDisplay({ data }: { data: Record<string, unknown>[] }) {
  if (!data || data.length === 0) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
        —
      </span>
    );
  }
  const value = Object.values(data[0])[0];
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-600 dark:text-violet-400 font-medium tabular-nums">
      {formatCellValue(value)}
    </span>
  );
}

function ListDisplay({ data }: { data: Record<string, unknown>[] }) {
  if (!data || data.length === 0) {
    return <div className="text-muted-foreground text-sm">No items</div>;
  }
  const key = Object.keys(data[0])[0];
  return (
    <ul className="list-disc list-inside space-y-0.5">
      {data.map((row, i) => (
        <li key={i} className="text-sm">
          {formatCellValue(row[key])}
        </li>
      ))}
    </ul>
  );
}

function TableDisplay({ data }: { data: Record<string, unknown>[] }) {
  return (
    <DataGrid
      data={data}
      columns="auto"
      height={Math.min(400, 36 + data.length * 36)}
      readOnly
      enableSearch={data.length > 10}
      enablePaste={false}
    />
  );
}

interface PageStaticProps {
  value: Value;
  /** Block components keyed by ID */
  blocks: Record<string, React.FC<Record<string, unknown>>>;
}

// ============================================================================
// RSC LiveValue - async server component with Suspense
// ============================================================================

async function LiveValueDataFetcher({
  query,
  params,
  children,
  display,
  hasChildren,
}: {
  query: string;
  params?: Record<string, unknown>;
  children: React.ReactNode;
  display?: "auto" | "inline" | "list" | "table";
  hasChildren: boolean;
}) {
  let data: Record<string, unknown>[] = [];
  let error: Error | null = null;

  try {
    // Execute raw SQL query using Kysely
    console.log("[LiveValue] Executing query:", query);
    const db = getDb();
    const result = await runWithDbMode("block", async () => {
      const raw = kyselySql.raw(query);
      return raw.execute(db);
    });
    data = result.rows as Record<string, unknown>[];
    console.log("[LiveValue] Query result:", data.length, "rows");
  } catch (e) {
    error = e instanceof Error ? e : new Error(String(e));
    console.error("[LiveValue] Query failed:", error.message, error.stack);
  }

  if (error) {
    return (
      <div className="p-4 bg-destructive/10 rounded-lg text-destructive text-sm">
        Query error: {error.message}
      </div>
    );
  }

  const tableMatch = query.match(/FROM\s+["'`]?(\w+)["'`]?/i);
  const tableName = tableMatch ? tableMatch[1] : null;

  // If has children (charts), just provide context
  if (hasChildren) {
    return (
      <LiveValueProvider
        data={data}
        tableName={tableName}
        query={query}
        isLoading={false}
        error={null}
      >
        {children}
      </LiveValueProvider>
    );
  }

  // No children - render auto-display
  const displayType = display && display !== "auto" ? display : selectDisplayType(data);
  let content: React.ReactNode;
  switch (displayType) {
    case "inline":
      content = <InlineDisplay data={data} />;
      break;
    case "list":
      content = <ListDisplay data={data} />;
      break;
    default:
      content = <TableDisplay data={data} />;
      break;
  }

  return (
    <LiveValueProvider
      data={data}
      tableName={tableName}
      query={query}
      isLoading={false}
      error={null}
    >
      {content}
    </LiveValueProvider>
  );
}

/**
 * Check if element has meaningful children (not just empty text nodes).
 */
function hasMeaningfulChildren(element: TLiveValueElement): boolean {
  if (!element.children || element.children.length === 0) return false;
  if (element.children.length === 1) {
    const child = element.children[0];
    if ("text" in child && (child as { text: string }).text === "") return false;
  }
  return true;
}

function LiveValueRSC({
  element,
  children,
}: {
  element: TLiveValueElement;
  children: React.ReactNode;
}) {
  const { query, data: staticData, display } = element;
  const hasChildren = hasMeaningfulChildren(element);

  // Static data - no fetch needed
  if (staticData) {
    const tableMatch = query?.match(/FROM\s+["'`]?(\w+)["'`]?/i);
    const tableName = tableMatch ? tableMatch[1] : null;

    // Render auto-display if no children
    let content: React.ReactNode = children;
    if (!hasChildren) {
      const displayType = display && display !== "auto" ? display : selectDisplayType(staticData);
      switch (displayType) {
        case "inline":
          content = <InlineDisplay data={staticData} />;
          break;
        case "list":
          content = <ListDisplay data={staticData} />;
          break;
        default:
          content = <TableDisplay data={staticData} />;
          break;
      }
    }

    return (
      <div className="my-2">
        <LiveValueProvider
          data={staticData}
          tableName={tableName}
          query={query}
          isLoading={false}
          error={null}
        >
          {content}
        </LiveValueProvider>
      </div>
    );
  }

  // No query
  if (!query) {
    return (
      <div className="my-2">
        <LiveValueProvider
          data={[]}
          tableName={null}
          query={undefined}
          isLoading={false}
          error={null}
        >
          {hasChildren ? children : <div className="text-muted-foreground text-sm">No data</div>}
        </LiveValueProvider>
      </div>
    );
  }

  // Async fetch with Suspense
  return (
    <div className="my-2">
      <Suspense fallback={<div className="w-full h-48 animate-pulse bg-muted/30 rounded-lg" />}>
        <LiveValueDataFetcher
          query={query}
          params={element.params}
          display={display}
          hasChildren={hasChildren}
        >
          {children}
        </LiveValueDataFetcher>
      </Suspense>
    </div>
  );
}

// ============================================================================
// RSC Plugins
// ============================================================================

const LiveValuePlugin = createSlatePlugin({
  key: "live_value",
  node: {
    type: "live_value",
    isElement: true,
    isVoid: false,
    component: ({ element, children }) => (
      <LiveValueRSC element={element as TLiveValueElement}>{children}</LiveValueRSC>
    ),
  },
});

const BarChartPlugin = createSlatePlugin({
  key: "BarChart",
  node: {
    type: "BarChart",
    isElement: true,
    isVoid: true,
    isInline: true,
    component: ({ element }) => {
      const el = element as TBarChartElement;
      return (
        <BarChart
          xKey={el.xKey}
          yKey={el.yKey}
          height={el.height ?? 300}
          showLegend={el.showLegend}
          showGrid={el.showGrid}
          stacked={el.stacked}
          layout={el.layout}
        />
      );
    },
  },
});

const LineChartPlugin = createSlatePlugin({
  key: "LineChart",
  node: {
    type: "LineChart",
    isElement: true,
    isVoid: true,
    isInline: true,
    component: ({ element }) => {
      const el = element as TLineChartElement;
      return (
        <LineChart
          xKey={el.xKey}
          yKey={el.yKey}
          height={el.height ?? 300}
          showLegend={el.showLegend}
          showGrid={el.showGrid}
        />
      );
    },
  },
});

const AreaChartPlugin = createSlatePlugin({
  key: "AreaChart",
  node: {
    type: "AreaChart",
    isElement: true,
    isVoid: true,
    isInline: true,
    component: ({ element }) => {
      const el = element as TAreaChartElement;
      return (
        <AreaChart
          xKey={el.xKey}
          yKey={el.yKey}
          height={el.height ?? 300}
          showLegend={el.showLegend}
          showGrid={el.showGrid}
          stacked={el.stacked}
        />
      );
    },
  },
});

const PieChartPlugin = createSlatePlugin({
  key: "PieChart",
  node: {
    type: "PieChart",
    isElement: true,
    isVoid: true,
    isInline: true,
    component: ({ element }) => {
      const el = element as TPieChartElement;
      return (
        <PieChart
          valueKey={el.valueKey}
          nameKey={el.nameKey}
          height={el.height ?? 300}
          showLegend={el.showLegend}
        />
      );
    },
  },
});

const GenericChartPlugin = createSlatePlugin({
  key: "Chart",
  node: {
    type: "Chart",
    isElement: true,
    isVoid: true,
    isInline: true,
    component: ({ element }) => {
      const el = element as TChartElement;
      return <Chart vegaSpec={el.vegaSpec as any} height={300} />;
    },
  },
});

// Additional Chart Plugins

const ScatterChartPlugin = createSlatePlugin({
  key: "ScatterChart",
  node: {
    type: "ScatterChart",
    isElement: true,
    isVoid: true,
    isInline: true,
    component: ({ element }) => {
      const el = element as TScatterChartElement;
      return (
        <ScatterChart
          xKey={el.xKey}
          yKey={el.yKey}
          colorKey={el.colorKey}
          sizeKey={el.sizeKey}
          height={el.height ?? 300}
          showTooltip={el.showTooltip}
          opacity={el.opacity}
        />
      );
    },
  },
});

const HistogramChartPlugin = createSlatePlugin({
  key: "HistogramChart",
  node: {
    type: "HistogramChart",
    isElement: true,
    isVoid: true,
    isInline: true,
    component: ({ element }) => {
      const el = element as THistogramChartElement;
      return (
        <HistogramChart
          valueKey={el.valueKey}
          binCount={el.binCount}
          height={el.height ?? 300}
          showTooltip={el.showTooltip}
          color={el.color}
        />
      );
    },
  },
});

const HeatmapChartPlugin = createSlatePlugin({
  key: "HeatmapChart",
  node: {
    type: "HeatmapChart",
    isElement: true,
    isVoid: true,
    isInline: true,
    component: ({ element }) => {
      const el = element as THeatmapChartElement;
      return (
        <HeatmapChart
          xKey={el.xKey}
          yKey={el.yKey}
          valueKey={el.valueKey}
          height={el.height ?? 300}
          colorScheme={el.colorScheme}
          showTooltip={el.showTooltip}
        />
      );
    },
  },
});

const BoxPlotChartPlugin = createSlatePlugin({
  key: "BoxPlotChart",
  node: {
    type: "BoxPlotChart",
    isElement: true,
    isVoid: true,
    isInline: true,
    component: ({ element }) => {
      const el = element as TBoxPlotChartElement;
      return (
        <BoxPlotChart
          categoryKey={el.categoryKey}
          valueKey={el.valueKey}
          height={el.height ?? 300}
          showTooltip={el.showTooltip}
          color={el.color}
          orientation={el.orientation}
        />
      );
    },
  },
});

const MapChartPlugin = createSlatePlugin({
  key: "MapChart",
  node: {
    type: "MapChart",
    isElement: true,
    isVoid: true,
    isInline: true,
    component: ({ element }) => {
      const el = element as TMapChartElement;
      return (
        <MapChart
          mapType={el.mapType}
          geoKey={el.geoKey}
          idKey={el.idKey}
          valueKey={el.valueKey}
          latKey={el.latKey}
          lonKey={el.lonKey}
          height={el.height ?? 400}
          projection={el.projection}
          topology={el.topology}
          colorScheme={el.colorScheme}
          showTooltip={el.showTooltip}
        />
      );
    },
  },
});

// View Component Plugins

const AlertPlugin = createSlatePlugin({
  key: "Alert",
  node: {
    type: "Alert",
    isElement: true,
    isVoid: false,
    component: ({ element, children }) => {
      const el = element as TAlertElement;
      return (
        <Alert title={el.title} variant={el.variant}>
          {children}
        </Alert>
      );
    },
  },
});

const BadgePlugin = createSlatePlugin({
  key: "Badge",
  node: {
    type: "Badge",
    isElement: true,
    isVoid: false,
    isInline: true,
    component: ({ element, children }) => {
      const el = element as TBadgeElement;
      return <Badge variant={el.variant}>{children}</Badge>;
    },
  },
});

const MetricPlugin = createSlatePlugin({
  key: "Metric",
  node: {
    type: "Metric",
    isElement: true,
    isVoid: true,
    component: ({ element }) => {
      const el = element as TMetricElement;
      return (
        <Metric
          value={el.value ?? "—"}
          label={el.label}
          prefix={el.prefix}
          suffix={el.suffix}
          change={el.change}
          changeLabel={el.changeLabel}
          size={el.size}
        />
      );
    },
  },
});

const ProgressPlugin = createSlatePlugin({
  key: "Progress",
  node: {
    type: "Progress",
    isElement: true,
    isVoid: true,
    component: ({ element }) => {
      const el = element as TProgressElement;
      return (
        <Progress
          value={el.value}
          max={el.max}
          indeterminate={el.indeterminate}
          label={el.label}
          showValue={el.showValue}
          variant={el.variant}
          size={el.size}
        />
      );
    },
  },
});

const LoaderPlugin = createSlatePlugin({
  key: "Loader",
  node: {
    type: "Loader",
    isElement: true,
    isVoid: true,
    isInline: true,
    component: ({ element }) => {
      const el = element as TLoaderElement;
      return (
        <Loader
          variant={el.variant}
          size={el.size}
          color={el.color}
          label={el.label}
          speed={el.speed}
        />
      );
    },
  },
});

const TabsPlugin = createSlatePlugin({
  key: "Tabs",
  node: {
    type: "Tabs",
    isElement: true,
    isVoid: false,
    component: ({ element, children }) => {
      const el = element as TTabsElement;
      return <Tabs defaultValue={el.defaultValue}>{children}</Tabs>;
    },
  },
});

const TabPlugin = createSlatePlugin({
  key: "Tab",
  node: {
    type: "Tab",
    isElement: true,
    isVoid: false,
    component: ({ element, children }) => {
      const el = element as TTabElement;
      return (
        <Tab value={el.value} label={el.label}>
          {children}
        </Tab>
      );
    },
  },
});

// DataGrid plugin - renders within LiveValueProvider context
const DataGridPlugin = createSlatePlugin({
  key: "data_grid",
  node: {
    type: "data_grid",
    isElement: true,
    isVoid: true,
    component: ({ element }) => {
      const el = element as TElement & {
        columns?: "auto" | string[];
        height?: number;
        readOnly?: boolean;
        enableSearch?: boolean;
      };
      return (
        <DataGrid
          columns={el.columns ?? "auto"}
          height={el.height ?? 400}
          readOnly={el.readOnly ?? true}
          enableSearch={el.enableSearch ?? true}
          enablePaste={false}
        />
      );
    },
  },
});

/**
 * All RSC plugins for page rendering
 * - Base structure plugins (paragraphs, headings, etc.)
 * - RSC LiveValue (async + Suspense)
 * - Client chart components (hydrated by rwsdk)
 */
const RSCPlugins = [
  // Structure
  ...BaseBasicBlocksKit,
  ...BaseBasicMarksKit,
  ...BaseLinkKit,
  ...BaseTableKit,
  ...BaseListKit,
  ...BaseCodeBlockKit,
  ...BaseCalloutKit,
  ...BaseToggleKit,
  ...BaseColumnKit,
  ...BaseMediaKit,
  ...BaseMentionKit,
  ...BaseTocKit,
  // Data + Charts (RSC-aware)
  LiveValuePlugin,
  BarChartPlugin,
  LineChartPlugin,
  AreaChartPlugin,
  PieChartPlugin,
  GenericChartPlugin,
  // Additional charts
  ScatterChartPlugin,
  HistogramChartPlugin,
  HeatmapChartPlugin,
  BoxPlotChartPlugin,
  MapChartPlugin,
  // View components
  AlertPlugin,
  BadgePlugin,
  MetricPlugin,
  ProgressPlugin,
  LoaderPlugin,
  TabsPlugin,
  TabPlugin,
  DataGridPlugin,
];

/**
 * Server-side page renderer using PlateStatic
 *
 * Renders Plate value with:
 * - RSC LiveValue (async data fetching + Suspense)
 * - Client chart components (hydrated by rwsdk)
 * - RSC block embeds (user blocks)
 */
export function PageStatic({ value, blocks }: PageStaticProps) {
  const RscBlockPlugin = createSlatePlugin({
    key: "rsc-block",
    node: {
      type: "rsc-block",
      isVoid: true,
      isElement: true,
      component: ({ element }: { element: RscBlockElement }) => {
        if (!element.blockId) return null;
        const BlockComponent = blocks[element.blockId];
        if (!BlockComponent) {
          return <div className="text-red-500">Block not found: {element.blockId}</div>;
        }
        return (
          <Suspense fallback={<div className="animate-pulse bg-muted h-32 rounded-lg" />}>
            <BlockComponent {...(element.blockProps || {})} />
          </Suspense>
        );
      },
    },
    extendEditor: ({ editor }) => {
      const origIsVoid = editor.isVoid as (element: TElement) => boolean;
      editor.isVoid = (element: TElement) => {
        if (element.type === "rsc-block") return true;
        return origIsVoid(element);
      };
      return editor;
    },
  });

  const editor = createSlateEditor({
    value,
    plugins: [...RSCPlugins, RscBlockPlugin],
  });

  return (
    <TooltipProvider>
      {/* pl-14 gives clearance for the nav peek tab (40px + breathing room) */}
      <article className="prose prose-slate max-w-none pl-14 pr-4 py-6 sm:pl-16 sm:pr-6 lg:pl-20 lg:pr-8">
        <div className="mx-auto max-w-4xl">
          <PlateStatic editor={editor} />
        </div>
      </article>
    </TooltipProvider>
  );
}
