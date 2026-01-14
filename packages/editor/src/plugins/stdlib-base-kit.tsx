/**
 * Stdlib Base Kit - Static Components for SSR
 *
 * Provides static (non-interactive) versions of stdlib components
 * for server-side rendering. Charts render as placeholders since
 * they require JavaScript for Vega-Lite canvas rendering.
 */

import type { ClaimStatus, TClaimElement, TEvidenceElement } from "@hands/core/types";
import type { TElement } from "platejs";
import { createSlatePlugin, type SlatePlugin } from "platejs";
import { SlateElement, type SlateElementProps } from "platejs/static";
import type * as React from "react";

// Element keys - using PascalCase to match serialized data from MDX
// The markdown/MDX parser outputs component names as-is (PascalCase)
const LIVE_VALUE_KEY = "LiveValue";
const LIVE_VALUE_INLINE_KEY = "LiveValueInline";
const LIVE_ACTION_KEY = "LiveAction";
const METRIC_KEY = "Metric";
const BADGE_KEY = "Badge";
const PROGRESS_KEY = "Progress";
const ALERT_KEY = "Alert";
const LOADER_KEY = "Loader";
const BUTTON_KEY = "Button";
const INPUT_KEY = "Input";
const SELECT_KEY = "Select";
const CHECKBOX_KEY = "Checkbox";
const TEXTAREA_KEY = "Textarea";
const LINE_CHART_KEY = "LineChart";
const BAR_CHART_KEY = "BarChart";
const AREA_CHART_KEY = "AreaChart";
const PIE_CHART_KEY = "PieChart";
const CHART_KEY = "Chart";
const SCATTER_CHART_KEY = "ScatterChart";
const HISTOGRAM_CHART_KEY = "HistogramChart";
const HEATMAP_CHART_KEY = "HeatmapChart";
const BOXPLOT_CHART_KEY = "BoxPlotChart";
const MAP_CHART_KEY = "MapChart";
const DATA_GRID_KEY = "DataGrid";
const KANBAN_KEY = "Kanban";
const TABS_KEY = "Tabs";
const TAB_KEY = "Tab";
const PAGE_EMBED_KEY = "Block";
const CLAIM_KEY = "Claim";  // PascalCase to match MDX tag
const EVIDENCE_KEY = "Evidence";  // PascalCase to match MDX tag

type DisplayMode = "auto" | "inline" | "list" | "table";

interface TLiveValueElement extends TElement {
  type: typeof LIVE_VALUE_KEY;
  query?: string;
  data?: Record<string, unknown>[];
  display?: DisplayMode;
  params?: Record<string, unknown>;
  columns?: { key: string; label: string; width?: number }[] | "auto";
  className?: string;
}

// ============================================================================
// Static Display Helpers
// ============================================================================

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value instanceof Date) return value.toLocaleDateString();
  return String(value);
}

function selectDisplayType(data: Record<string, unknown>[]): "inline" | "list" | "table" {
  if (!data || data.length === 0) return "table";
  const rowCount = data.length;
  const colCount = Object.keys(data[0]).length;
  if (rowCount === 1 && colCount === 1) return "inline";
  if (colCount === 1) return "list";
  return "table";
}

function resolveDisplayMode(
  displayProp: DisplayMode | undefined,
  data: Record<string, unknown>[],
): "inline" | "list" | "table" {
  if (!displayProp || displayProp === "auto") {
    return selectDisplayType(data);
  }
  return displayProp;
}

// ============================================================================
// LiveValue Static Components
// ============================================================================

function LiveValueInlineStatic({ data }: { data: Record<string, unknown>[] }) {
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

function LiveValueListStatic({ data }: { data: Record<string, unknown>[] }) {
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

function LiveValueTableStatic({ data }: { data: Record<string, unknown>[] }) {
  if (!data || data.length === 0) {
    return <div className="text-muted-foreground text-sm">No data</div>;
  }
  const columns = Object.keys(data[0]);
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-border">
        <thead className="bg-muted/50">
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.map((row, i) => (
            <tr key={i}>
              {columns.map((col) => (
                <td key={col} className="px-3 py-2 text-sm whitespace-nowrap">
                  {formatCellValue(row[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LiveValueElementStatic(props: SlateElementProps) {
  const element = props.element as TLiveValueElement;
  const data = element.data ?? [];
  const displayType = resolveDisplayMode(element.display, data);

  // Check if has chart children (non-empty text)
  const hasChildren = element.children?.some((child) => !("text" in child && child.text === ""));

  // If has children, render them (charts will render as placeholders)
  if (hasChildren) {
    return (
      <SlateElement {...props} as="div" className="my-2">
        {props.children}
      </SlateElement>
    );
  }

  // No children - render data directly
  let content: React.ReactNode;
  switch (displayType) {
    case "inline":
      content = <LiveValueInlineStatic data={data} />;
      break;
    case "list":
      content = <LiveValueListStatic data={data} />;
      break;
    case "table":
      content = <LiveValueTableStatic data={data} />;
      break;
  }

  return (
    <SlateElement {...props} as={displayType === "inline" ? "span" : "div"} className="my-2">
      {content}
      {props.children}
    </SlateElement>
  );
}

function LiveValueInlineElementStatic(props: SlateElementProps) {
  const element = props.element as TLiveValueElement;
  const data = element.data ?? [];

  return (
    <SlateElement {...props} as="span">
      <LiveValueInlineStatic data={data} />
      {props.children}
    </SlateElement>
  );
}

// ============================================================================
// Chart Static Components (Placeholders)
// ============================================================================

interface ChartPlaceholderProps extends SlateElementProps {
  chartType: string;
}

function ChartPlaceholderStatic({ chartType, ...props }: ChartPlaceholderProps) {
  return (
    <SlateElement {...props} as="div">
      <div className="flex items-center justify-center h-64 bg-muted/20 rounded-lg border border-dashed border-muted-foreground/30">
        <div className="text-center text-muted-foreground">
          <div className="text-lg font-medium">{chartType}</div>
          <div className="text-sm">Interactive charts require JavaScript</div>
        </div>
      </div>
      {props.children}
    </SlateElement>
  );
}

function BarChartElementStatic(props: SlateElementProps) {
  return <ChartPlaceholderStatic chartType="Bar Chart" {...props} />;
}

function LineChartElementStatic(props: SlateElementProps) {
  return <ChartPlaceholderStatic chartType="Line Chart" {...props} />;
}

function AreaChartElementStatic(props: SlateElementProps) {
  return <ChartPlaceholderStatic chartType="Area Chart" {...props} />;
}

function PieChartElementStatic(props: SlateElementProps) {
  return <ChartPlaceholderStatic chartType="Pie Chart" {...props} />;
}

function ScatterChartElementStatic(props: SlateElementProps) {
  return <ChartPlaceholderStatic chartType="Scatter Chart" {...props} />;
}

function HistogramChartElementStatic(props: SlateElementProps) {
  return <ChartPlaceholderStatic chartType="Histogram" {...props} />;
}

function HeatmapChartElementStatic(props: SlateElementProps) {
  return <ChartPlaceholderStatic chartType="Heatmap" {...props} />;
}

function BoxPlotChartElementStatic(props: SlateElementProps) {
  return <ChartPlaceholderStatic chartType="Box Plot" {...props} />;
}

function MapChartElementStatic(props: SlateElementProps) {
  return <ChartPlaceholderStatic chartType="Map" {...props} />;
}

function GenericChartElementStatic(props: SlateElementProps) {
  return <ChartPlaceholderStatic chartType="Chart" {...props} />;
}

// ============================================================================
// UI Component Static Components
// ============================================================================

function MetricElementStatic(props: SlateElementProps) {
  const element = props.element as TElement & {
    value?: string | number;
    label?: string;
    change?: number;
  };
  return (
    <SlateElement {...props} as="div" className="my-2">
      <div className="inline-flex flex-col p-4 rounded-lg bg-muted/20">
        <span className="text-2xl font-bold tabular-nums">{element.value ?? "—"}</span>
        {element.label && <span className="text-sm text-muted-foreground">{element.label}</span>}
        {element.change !== undefined && (
          <span className={element.change >= 0 ? "text-green-600" : "text-red-600"}>
            {element.change >= 0 ? "+" : ""}
            {element.change}%
          </span>
        )}
      </div>
      {props.children}
    </SlateElement>
  );
}

function BadgeElementStatic(props: SlateElementProps) {
  const element = props.element as TElement & { label?: string; variant?: string };
  return (
    <SlateElement {...props} as="span">
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
        {element.label ?? props.children}
      </span>
    </SlateElement>
  );
}

function ProgressElementStatic(props: SlateElementProps) {
  const element = props.element as TElement & { value?: number; max?: number };
  const value = element.value ?? 0;
  const max = element.max ?? 100;
  const percent = Math.round((value / max) * 100);
  return (
    <SlateElement {...props} as="div" className="my-2">
      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary transition-all" style={{ width: `${percent}%` }} />
      </div>
      {props.children}
    </SlateElement>
  );
}

function AlertElementStatic(props: SlateElementProps) {
  const element = props.element as TElement & { variant?: string; title?: string };
  return (
    <SlateElement {...props} as="div" className="my-2">
      <div className="p-4 rounded-lg border bg-muted/20">
        {element.title && <div className="font-medium mb-1">{element.title}</div>}
        <div className="text-sm">{props.children}</div>
      </div>
    </SlateElement>
  );
}

function LoaderElementStatic(props: SlateElementProps) {
  return (
    <SlateElement {...props} as="span">
      <span className="inline-flex items-center text-muted-foreground">Loading...</span>
      {props.children}
    </SlateElement>
  );
}

// ============================================================================
// Action Components (Static - no interactivity)
// ============================================================================

function LiveActionElementStatic(props: SlateElementProps) {
  return (
    <SlateElement {...props} as="div" className="my-2">
      <div className="p-4 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/10">
        {props.children}
      </div>
    </SlateElement>
  );
}

function ButtonElementStatic(props: SlateElementProps) {
  const element = props.element as TElement & { label?: string };
  return (
    <SlateElement {...props} as="span">
      <span className="inline-flex items-center px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium">
        {element.label ?? props.children}
      </span>
    </SlateElement>
  );
}

function InputElementStatic(props: SlateElementProps) {
  const element = props.element as TElement & { placeholder?: string };
  return (
    <SlateElement {...props} as="span">
      <span className="inline-flex items-center px-3 py-2 rounded-md border bg-background text-sm text-muted-foreground">
        {element.placeholder ?? "Input"}
      </span>
      {props.children}
    </SlateElement>
  );
}

function SelectElementStatic(props: SlateElementProps) {
  const element = props.element as TElement & { placeholder?: string };
  return (
    <SlateElement {...props} as="span">
      <span className="inline-flex items-center px-3 py-2 rounded-md border bg-background text-sm text-muted-foreground">
        {element.placeholder ?? "Select..."}
      </span>
      {props.children}
    </SlateElement>
  );
}

function CheckboxElementStatic(props: SlateElementProps) {
  const element = props.element as TElement & { checked?: boolean; label?: string };
  return (
    <SlateElement {...props} as="span">
      <span className="inline-flex items-center gap-2">
        <span className="w-4 h-4 rounded border bg-background flex items-center justify-center">
          {element.checked && "✓"}
        </span>
        {element.label && <span className="text-sm">{element.label}</span>}
      </span>
      {props.children}
    </SlateElement>
  );
}

function TextareaElementStatic(props: SlateElementProps) {
  const element = props.element as TElement & { placeholder?: string };
  return (
    <SlateElement {...props} as="div" className="my-2">
      <div className="px-3 py-2 rounded-md border bg-background text-sm text-muted-foreground min-h-[80px]">
        {element.placeholder ?? "Enter text..."}
      </div>
      {props.children}
    </SlateElement>
  );
}

// ============================================================================
// Data Components (Static - readonly display)
// ============================================================================

function DataGridElementStatic(props: SlateElementProps) {
  const element = props.element as TElement & { data?: Record<string, unknown>[] };
  const data = element.data ?? [];
  return (
    <SlateElement {...props} as="div" className="my-2">
      <LiveValueTableStatic data={data} />
      {props.children}
    </SlateElement>
  );
}

function KanbanElementStatic(props: SlateElementProps) {
  return (
    <SlateElement {...props} as="div" className="my-2">
      <div className="flex items-center justify-center h-48 bg-muted/20 rounded-lg border border-dashed border-muted-foreground/30">
        <span className="text-muted-foreground">Kanban board (requires JavaScript)</span>
      </div>
      {props.children}
    </SlateElement>
  );
}

// ============================================================================
// Claim/Evidence Components (CKG - Claims Knowledge Graph)
// ============================================================================

function deriveClaimStatusStatic(element: TClaimElement): ClaimStatus {
  // Simple static derivation - no action context available in SSR
  if (element.refutes) return "refuted";
  if (element.source || (element.sources && element.sources.length > 0)) return "verified";
  return "unverified";
}

function ClaimElementStatic(props: SlateElementProps) {
  const element = props.element as TClaimElement;
  const status = deriveClaimStatusStatic(element);

  // Status dot colors
  const dotColor = {
    verified: "bg-green-500",
    refuted: "bg-red-500",
    partial: "bg-yellow-500",
    pending: "bg-blue-500",
    unverified: "bg-muted-foreground/40",
  }[status];

  return (
    <SlateElement {...props} as="div" className="relative py-0.5 pl-5">
      {/* Status dot */}
      <span
        className={`absolute left-1 top-1.5 inline-block size-2 rounded-full ${dotColor}`}
        title={status}
      />
      {/* Content */}
      <div className="text-sm">{props.children}</div>
    </SlateElement>
  );
}

function EvidenceElementStatic(props: SlateElementProps) {
  const element = props.element as TEvidenceElement;
  const verdictColor =
    element.verdict === "refutes" ? "text-red-600" : "text-green-600";
  const icon =
    element.evidenceType === "source"
      ? "📎"
      : element.evidenceType === "action"
        ? "⚙️"
        : "🤖";

  let label = "";
  if (element.evidenceType === "source" && element.url) {
    try {
      label = new URL(element.url).hostname.replace("www.", "");
    } catch {
      label = element.url.slice(0, 30);
    }
  } else if (element.evidenceType === "action" && element.actionId) {
    label = element.actionId;
  } else if (element.evidenceType === "llm" && element.confidence) {
    label = `${Math.round(element.confidence * 100)}%`;
  }

  return (
    <SlateElement
      {...props}
      as="span"
      className={`inline-flex items-center gap-1 text-xs rounded px-1.5 py-0.5 mx-0.5 ${
        element.verdict === "refutes" ? "bg-red-500/10" : "bg-green-500/10"
      } ${verdictColor}`}
    >
      <span>{icon}</span>
      {element.url ? (
        <a
          href={element.url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          {label}
        </a>
      ) : (
        <span>{label}</span>
      )}
    </SlateElement>
  );
}

// ============================================================================
// Layout Components
// ============================================================================

function TabsElementStatic(props: SlateElementProps) {
  return (
    <SlateElement {...props} as="div" className="my-2">
      <div className="border rounded-lg">{props.children}</div>
    </SlateElement>
  );
}

function TabElementStatic(props: SlateElementProps) {
  const element = props.element as TElement & { label?: string };
  return (
    <SlateElement {...props} as="div">
      <div className="p-4 border-t first:border-t-0">
        {element.label && (
          <div className="font-medium text-sm mb-2 text-muted-foreground">{element.label}</div>
        )}
        {props.children}
      </div>
    </SlateElement>
  );
}

function PageEmbedElementStatic(props: SlateElementProps) {
  const element = props.element as TElement & { src?: string };
  return (
    <SlateElement {...props} as="div" className="my-2">
      <div className="p-4 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/10">
        <span className="text-muted-foreground text-sm">
          Embedded: {element.src ?? "Unknown page"}
        </span>
      </div>
      {props.children}
    </SlateElement>
  );
}

// ============================================================================
// Base Plugins (without components - for .withComponent())
// ============================================================================

function createBasePlugin(
  key: string,
  options: {
    isVoid?: boolean;
    isInline?: boolean;
    isContainer?: boolean;
  },
): SlatePlugin {
  return createSlatePlugin({
    key,
    node: {
      type: key,
      isElement: true,
      isVoid: options.isVoid ?? false,
      isInline: options.isInline ?? false,
    },
  });
}

// LiveValue plugins
const BaseLiveValuePlugin = createBasePlugin(LIVE_VALUE_KEY, { isContainer: true });
const BaseLiveValueInlinePlugin = createBasePlugin(LIVE_VALUE_INLINE_KEY, {
  isVoid: true,
  isInline: true,
});

// Chart plugins (all void, inline for nesting in LiveValue)
const BaseLineChartPlugin = createBasePlugin(LINE_CHART_KEY, { isVoid: true, isInline: true });
const BaseBarChartPlugin = createBasePlugin(BAR_CHART_KEY, { isVoid: true, isInline: true });
const BaseAreaChartPlugin = createBasePlugin(AREA_CHART_KEY, { isVoid: true, isInline: true });
const BasePieChartPlugin = createBasePlugin(PIE_CHART_KEY, { isVoid: true, isInline: true });
const BaseScatterChartPlugin = createBasePlugin(SCATTER_CHART_KEY, {
  isVoid: true,
  isInline: true,
});
const BaseHistogramChartPlugin = createBasePlugin(HISTOGRAM_CHART_KEY, {
  isVoid: true,
  isInline: true,
});
const BaseHeatmapChartPlugin = createBasePlugin(HEATMAP_CHART_KEY, {
  isVoid: true,
  isInline: true,
});
const BaseBoxPlotChartPlugin = createBasePlugin(BOXPLOT_CHART_KEY, {
  isVoid: true,
  isInline: true,
});
const BaseMapChartPlugin = createBasePlugin(MAP_CHART_KEY, { isVoid: true, isInline: true });
const BaseChartPlugin = createBasePlugin(CHART_KEY, { isVoid: true, isInline: true });

// UI plugins
const BaseMetricPlugin = createBasePlugin(METRIC_KEY, { isVoid: true });
const BaseBadgePlugin = createBasePlugin(BADGE_KEY, { isVoid: true, isInline: true });
const BaseProgressPlugin = createBasePlugin(PROGRESS_KEY, { isVoid: true });
const BaseAlertPlugin = createBasePlugin(ALERT_KEY, {});
const BaseLoaderPlugin = createBasePlugin(LOADER_KEY, { isVoid: true, isInline: true });

// Action plugins
const BaseLiveActionPlugin = createBasePlugin(LIVE_ACTION_KEY, {});
const BaseButtonPlugin = createBasePlugin(BUTTON_KEY, { isVoid: true, isInline: true });
const BaseInputPlugin = createBasePlugin(INPUT_KEY, { isVoid: true, isInline: true });
const BaseSelectPlugin = createBasePlugin(SELECT_KEY, { isVoid: true, isInline: true });
const BaseCheckboxPlugin = createBasePlugin(CHECKBOX_KEY, { isVoid: true, isInline: true });
const BaseTextareaPlugin = createBasePlugin(TEXTAREA_KEY, { isVoid: true });

// Data plugins
const BaseDataGridPlugin = createBasePlugin(DATA_GRID_KEY, { isVoid: true });
const BaseKanbanPlugin = createBasePlugin(KANBAN_KEY, { isVoid: true });

// Layout plugins
const BaseTabsPlugin = createBasePlugin(TABS_KEY, {});
const BaseTabPlugin = createBasePlugin(TAB_KEY, {});
const BasePageEmbedPlugin = createBasePlugin(PAGE_EMBED_KEY, { isVoid: true });

// Claim/Evidence plugins (CKG)
const BaseClaimPlugin = createBasePlugin(CLAIM_KEY, {});
const BaseEvidencePlugin = createBasePlugin(EVIDENCE_KEY, { isVoid: true });

// ============================================================================
// Exports
// ============================================================================

/**
 * Base Stdlib Kit - Static components for SSR rendering.
 *
 * Provides non-interactive versions of all stdlib components.
 * Charts render as placeholders, data components show static data.
 */
export const BaseStdlibKit = [
  // LiveValue
  BaseLiveValuePlugin.withComponent(LiveValueElementStatic),
  BaseLiveValueInlinePlugin.withComponent(LiveValueInlineElementStatic),
  // Charts
  BaseLineChartPlugin.withComponent(LineChartElementStatic),
  BaseBarChartPlugin.withComponent(BarChartElementStatic),
  BaseAreaChartPlugin.withComponent(AreaChartElementStatic),
  BasePieChartPlugin.withComponent(PieChartElementStatic),
  BaseScatterChartPlugin.withComponent(ScatterChartElementStatic),
  BaseHistogramChartPlugin.withComponent(HistogramChartElementStatic),
  BaseHeatmapChartPlugin.withComponent(HeatmapChartElementStatic),
  BaseBoxPlotChartPlugin.withComponent(BoxPlotChartElementStatic),
  BaseMapChartPlugin.withComponent(MapChartElementStatic),
  BaseChartPlugin.withComponent(GenericChartElementStatic),
  // UI
  BaseMetricPlugin.withComponent(MetricElementStatic),
  BaseBadgePlugin.withComponent(BadgeElementStatic),
  BaseProgressPlugin.withComponent(ProgressElementStatic),
  BaseAlertPlugin.withComponent(AlertElementStatic),
  BaseLoaderPlugin.withComponent(LoaderElementStatic),
  // Actions
  BaseLiveActionPlugin.withComponent(LiveActionElementStatic),
  BaseButtonPlugin.withComponent(ButtonElementStatic),
  BaseInputPlugin.withComponent(InputElementStatic),
  BaseSelectPlugin.withComponent(SelectElementStatic),
  BaseCheckboxPlugin.withComponent(CheckboxElementStatic),
  BaseTextareaPlugin.withComponent(TextareaElementStatic),
  // Data
  BaseDataGridPlugin.withComponent(DataGridElementStatic),
  BaseKanbanPlugin.withComponent(KanbanElementStatic),
  // Layout
  BaseTabsPlugin.withComponent(TabsElementStatic),
  BaseTabPlugin.withComponent(TabElementStatic),
  BasePageEmbedPlugin.withComponent(PageEmbedElementStatic),
  // Claims (CKG)
  BaseClaimPlugin.withComponent(ClaimElementStatic),
  BaseEvidencePlugin.withComponent(EvidenceElementStatic),
];
