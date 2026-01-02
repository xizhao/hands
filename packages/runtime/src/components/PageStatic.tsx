// Types from core
import {
  ALERT_KEY,
  AREA_CHART_KEY,
  BADGE_KEY,
  BAR_CHART_KEY,
  BOXPLOT_CHART_KEY,
  CHART_KEY,
  DATA_GRID_KEY,
  HEATMAP_CHART_KEY,
  HISTOGRAM_CHART_KEY,
  LINE_CHART_KEY,
  LIVE_VALUE_INLINE_KEY,
  LIVE_VALUE_KEY,
  LOADER_KEY,
  MAP_CHART_KEY,
  METRIC_KEY,
  PIE_CHART_KEY,
  PROGRESS_KEY,
  SCATTER_CHART_KEY,
  TAB_KEY,
  TABS_KEY,
  type DataGridColumnConfig,
  type DbAdapter,
  type TAlertElement,
  type TAreaChartElement,
  type TBadgeElement,
  type TBarChartElement,
  type TBoxPlotChartElement,
  type TChartElement,
  type THeatmapChartElement,
  type THistogramChartElement,
  type TLineChartElement,
  type TLiveValueElement,
  type TLoaderElement,
  type TMapChartElement,
  type TMetricElement,
  type TPieChartElement,
  type TProgressElement,
  type TScatterChartElement,
  type TTabElement,
  type TTabsElement,
} from "@hands/core/types";

// RSC block key is runtime-specific
const RSC_BLOCK_KEY = "rsc-block";
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
    return <span>—</span>;
  }
  const value = Object.values(data[0])[0];
  return <span>{formatCellValue(value)}</span>;
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
  /** Database adapter for query execution */
  db: DbAdapter;
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
  db,
}: {
  query: string;
  params?: Record<string, unknown>;
  children: React.ReactNode;
  display?: "auto" | "inline" | "list" | "table";
  hasChildren: boolean;
  db: DbAdapter;
}) {
  let data: Record<string, unknown>[] = [];
  let error: Error | null = null;

  try {
    // Execute raw SQL query using db adapter
    console.log("[LiveValue] Executing query:", query);
    const result = await db.executeQuery(query);
    data = result.rows;
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

/**
 * Inline LiveValue RSC - renders inline within text (no wrapper div)
 */
async function LiveValueInlineRSC({
  element,
  db,
}: {
  element: TLiveValueElement;
  db: DbAdapter;
}) {
  const { query, data: staticData } = element;

  // Static data - no fetch needed
  if (staticData) {
    return <InlineDisplay data={staticData} />;
  }

  // No query
  if (!query) {
    return <InlineDisplay data={[]} />;
  }

  // Fetch data
  let data: Record<string, unknown>[] = [];
  try {
    const result = await db.executeQuery(query);
    data = result.rows;
  } catch (e) {
    console.error("[LiveValueInline] Query failed:", e);
    return <span>—</span>;
  }

  return <InlineDisplay data={data} />;
}

function LiveValueRSC({
  element,
  children,
  db,
}: {
  element: TLiveValueElement;
  children: React.ReactNode;
  db: DbAdapter;
}) {
  const { query, data: staticData, display } = element;
  const hasChildren = hasMeaningfulChildren(element);
  const isInlineDisplay = display === "inline";

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

    // For inline display, don't wrap in block div
    if (isInlineDisplay) {
      return (
        <LiveValueProvider
          data={staticData}
          tableName={tableName}
          query={query}
          isLoading={false}
          error={null}
        >
          {content}
        </LiveValueProvider>
      );
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
    if (isInlineDisplay) {
      return <InlineDisplay data={[]} />;
    }
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
  if (isInlineDisplay) {
    return (
      <Suspense
        fallback={
          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-muted/30 animate-pulse text-xs">
            ...
          </span>
        }
      >
        <LiveValueDataFetcher
          query={query}
          params={element.params}
          display={display}
          hasChildren={hasChildren}
          db={db}
        >
          {children}
        </LiveValueDataFetcher>
      </Suspense>
    );
  }

  return (
    <div className="my-2">
      <Suspense fallback={<div className="w-full h-48 animate-pulse bg-muted/30 rounded-lg" />}>
        <LiveValueDataFetcher
          query={query}
          params={element.params}
          display={display}
          hasChildren={hasChildren}
          db={db}
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

// LiveValuePlugin is created dynamically in PageStatic to capture db from props
function createLiveValuePlugin(db: DbAdapter) {
  return createSlatePlugin({
    key: LIVE_VALUE_KEY,
    node: {
      type: LIVE_VALUE_KEY,
      isElement: true,
      isVoid: false,
      component: ({ element, children }) => (
        <LiveValueRSC element={element as TLiveValueElement} db={db}>{children}</LiveValueRSC>
      ),
    },
  });
}

// Inline LiveValue - renders inline within text (no div wrapper)
function createLiveValueInlinePlugin(db: DbAdapter) {
  return createSlatePlugin({
    key: LIVE_VALUE_INLINE_KEY,
    node: {
      type: LIVE_VALUE_INLINE_KEY,
      isElement: true,
      isInline: true,
      isVoid: true,
      component: ({ element }) => (
        <Suspense fallback={<span>…</span>}>
          <LiveValueInlineRSC element={element as TLiveValueElement} db={db} />
        </Suspense>
      ),
    },
  });
}

const BarChartPlugin = createSlatePlugin({
  key: BAR_CHART_KEY,
  node: {
    type: BAR_CHART_KEY,
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
          showTooltip={el.showTooltip}
          stacked={el.stacked}
          layout={el.layout}
          colors={el.colors}
          xFormat={el.xFormat}
          yFormat={el.yFormat}
        />
      );
    },
  },
});

const LineChartPlugin = createSlatePlugin({
  key: LINE_CHART_KEY,
  node: {
    type: LINE_CHART_KEY,
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
          showTooltip={el.showTooltip}
          curve={el.curve}
          showDots={el.showDots}
          colors={el.colors}
          xFormat={el.xFormat}
          yFormat={el.yFormat}
        />
      );
    },
  },
});

const AreaChartPlugin = createSlatePlugin({
  key: AREA_CHART_KEY,
  node: {
    type: AREA_CHART_KEY,
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
          showTooltip={el.showTooltip}
          stacked={el.stacked}
          curve={el.curve}
          fillOpacity={el.fillOpacity}
          colors={el.colors}
          xFormat={el.xFormat}
          yFormat={el.yFormat}
        />
      );
    },
  },
});

const PieChartPlugin = createSlatePlugin({
  key: PIE_CHART_KEY,
  node: {
    type: PIE_CHART_KEY,
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
          innerRadius={el.innerRadius}
          showLabels={el.showLabels}
          colors={el.colors}
        />
      );
    },
  },
});

const GenericChartPlugin = createSlatePlugin({
  key: CHART_KEY,
  node: {
    type: CHART_KEY,
    isElement: true,
    isVoid: true,
    isInline: true,
    component: ({ element }) => {
      const el = element as TChartElement;
      return <Chart vegaSpec={el.vegaSpec as any} height={el.height ?? 300} />;
    },
  },
});

// Additional Chart Plugins

const ScatterChartPlugin = createSlatePlugin({
  key: SCATTER_CHART_KEY,
  node: {
    type: SCATTER_CHART_KEY,
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
          colors={el.colors}
          opacity={el.opacity}
        />
      );
    },
  },
});

const HistogramChartPlugin = createSlatePlugin({
  key: HISTOGRAM_CHART_KEY,
  node: {
    type: HISTOGRAM_CHART_KEY,
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
  key: HEATMAP_CHART_KEY,
  node: {
    type: HEATMAP_CHART_KEY,
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
  key: BOXPLOT_CHART_KEY,
  node: {
    type: BOXPLOT_CHART_KEY,
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
  key: MAP_CHART_KEY,
  node: {
    type: MAP_CHART_KEY,
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
  key: ALERT_KEY,
  node: {
    type: ALERT_KEY,
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
  key: BADGE_KEY,
  node: {
    type: BADGE_KEY,
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
  key: METRIC_KEY,
  node: {
    type: METRIC_KEY,
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
  key: PROGRESS_KEY,
  node: {
    type: PROGRESS_KEY,
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
  key: LOADER_KEY,
  node: {
    type: LOADER_KEY,
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
  key: TABS_KEY,
  node: {
    type: TABS_KEY,
    isElement: true,
    isVoid: false,
    component: ({ element, children }) => {
      const el = element as TTabsElement;
      return <Tabs defaultValue={el.defaultValue}>{children}</Tabs>;
    },
  },
});

const TabPlugin = createSlatePlugin({
  key: TAB_KEY,
  node: {
    type: TAB_KEY,
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
  key: DATA_GRID_KEY,
  node: {
    type: DATA_GRID_KEY,
    isElement: true,
    isVoid: true,
    component: ({ element }) => {
      const el = element as TElement & {
        columns?: "auto" | DataGridColumnConfig[];
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
 * Base RSC plugins for page rendering (without LiveValue - that's added dynamically)
 * - Base structure plugins (paragraphs, headings, etc.)
 * - Client chart components (hydrated by rwsdk)
 */
const BaseRSCPlugins = [
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
  // Charts
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
export function PageStatic({ value, blocks, db }: PageStaticProps) {
  const RscBlockPlugin = createSlatePlugin({
    key: RSC_BLOCK_KEY,
    node: {
      type: RSC_BLOCK_KEY,
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
        if (element.type === RSC_BLOCK_KEY) return true;
        return origIsVoid(element);
      };
      return editor;
    },
  });

  // Create LiveValue plugins with db adapter
  const LiveValuePlugin = createLiveValuePlugin(db);
  const LiveValueInlinePlugin = createLiveValueInlinePlugin(db);

  const editor = createSlateEditor({
    value,
    plugins: [...BaseRSCPlugins, LiveValuePlugin, LiveValueInlinePlugin, RscBlockPlugin],
  });

  return (
    <TooltipProvider>
      {/* pl-14 gives clearance for the nav peek tab (40px + breathing room) */}
      <article className="prose prose-slate max-w-none pl-14 pr-4 pt-4 pb-6 sm:pl-16 sm:pr-6 lg:pl-20 lg:pr-8">
        <div className="mx-auto max-w-4xl">
          <PlateStatic editor={editor} />
        </div>
      </article>
    </TooltipProvider>
  );
}
