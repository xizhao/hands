import type { TElement, Value } from "platejs";
import { createSlateEditor, createSlatePlugin } from "platejs";
import { Suspense } from "react";
import { PlateStatic } from "platejs/static";

// Base plugins - import DIRECTLY to avoid pulling in React deps from index
import { BaseBasicBlocksKit } from "@hands/editor/plugins/basic-blocks-base-kit";
import { BaseBasicMarksKit } from "@hands/editor/plugins/basic-marks-base-kit";
import { BaseLinkKit } from "@hands/editor/plugins/link-base-kit";
import { BaseTableKit } from "@hands/editor/plugins/table-base-kit";
import { BaseListKit } from "@hands/editor/plugins/list-base-kit";
import { BaseCodeBlockKit } from "@hands/editor/plugins/code-block-base-kit";
import { BaseCalloutKit } from "@hands/editor/plugins/callout-base-kit";
import { BaseToggleKit } from "@hands/editor/plugins/toggle-base-kit";
import { BaseColumnKit } from "@hands/editor/plugins/column-base-kit";
import { BaseMediaKit } from "@hands/editor/plugins/media-base-kit";
import { BaseMentionKit } from "@hands/editor/plugins/mention-base-kit";
import { BaseTocKit } from "@hands/editor/plugins/toc-base-kit";

// Chart components (use client - will be hydrated by rwsdk)
import {
  BarChart,
  LineChart,
  AreaChart,
  PieChart,
  Chart,
  LiveValueProvider,
} from "./charts-client";

// Database access
import { getDb, kyselySql, runWithDbMode } from "../db/dev";

/** RSC block element in Plate value */
interface RscBlockElement extends TElement {
  type: "rsc-block";
  blockId: string;
  blockProps?: Record<string, unknown>;
}

interface LiveValueElement extends TElement {
  type: "LiveValue";
  query?: string;
  data?: Record<string, unknown>[];
  display?: "auto" | "inline" | "list" | "table";
  params?: Record<string, unknown>;
}

interface ChartElement extends TElement {
  xKey?: string;
  yKey?: string | string[];
  height?: number;
  showLegend?: boolean;
  showGrid?: boolean;
  stacked?: boolean;
  layout?: "vertical" | "horizontal";
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
}: {
  query: string;
  params?: Record<string, unknown>;
  children: React.ReactNode;
}) {
  let data: Record<string, unknown>[] = [];
  let error: Error | null = null;

  try {
    // Execute raw SQL query using Kysely
    const db = getDb();
    const result = await runWithDbMode("block", async () => {
      const raw = kyselySql.raw(query);
      return raw.execute(db);
    });
    data = result.rows as Record<string, unknown>[];
  } catch (e) {
    error = e instanceof Error ? e : new Error(String(e));
    console.error("[LiveValue] Query failed:", error.message);
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

  return (
    <LiveValueProvider data={data} tableName={tableName} query={query} isLoading={false} error={null}>
      {children}
    </LiveValueProvider>
  );
}

function LiveValueRSC({
  element,
  children,
}: {
  element: LiveValueElement;
  children: React.ReactNode;
}) {
  const { query, data: staticData } = element;

  // Static data - no fetch needed
  if (staticData) {
    const tableMatch = query?.match(/FROM\s+["'`]?(\w+)["'`]?/i);
    const tableName = tableMatch ? tableMatch[1] : null;
    return (
      <div className="my-2">
        <LiveValueProvider data={staticData} tableName={tableName} query={query} isLoading={false} error={null}>
          {children}
        </LiveValueProvider>
      </div>
    );
  }

  // No query
  if (!query) {
    return (
      <div className="my-2">
        <LiveValueProvider data={[]} tableName={null} query={undefined} isLoading={false} error={null}>
          {children}
        </LiveValueProvider>
      </div>
    );
  }

  // Async fetch with Suspense
  return (
    <div className="my-2">
      <Suspense
        fallback={
          <div className="w-full h-48 animate-pulse bg-muted/30 rounded-lg" />
        }
      >
        <LiveValueDataFetcher query={query} params={element.params}>
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
  key: "LiveValue",
  node: {
    type: "LiveValue",
    isElement: true,
    isVoid: false,
    component: ({ element, children }) => (
      <LiveValueRSC element={element as LiveValueElement}>{children}</LiveValueRSC>
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
      const el = element as ChartElement;
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
      const el = element as ChartElement;
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
      const el = element as ChartElement;
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
      const el = element as ChartElement & { valueKey?: string; nameKey?: string };
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
      const el = element as TElement & { vegaSpec?: unknown };
      return <Chart vegaSpec={el.vegaSpec as any} height={300} />;
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
          return (
            <div className="text-red-500">
              Block not found: {element.blockId}
            </div>
          );
        }
        return (
          <Suspense
            fallback={
              <div className="animate-pulse bg-muted h-32 rounded-lg" />
            }
          >
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
    <article className="prose prose-slate max-w-none px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <PlateStatic editor={editor} />
      </div>
    </article>
  );
}
