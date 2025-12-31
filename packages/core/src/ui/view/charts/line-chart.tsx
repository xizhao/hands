"use client";

/**
 * @component LineChart
 * @category static
 * @description Line chart for visualizing trends over time or continuous data.
 * Works standalone or inside LiveValue for live SQL data.
 * @keywords chart, line, graph, trend, time series, visualization
 * @example
 * <LineChart data={data} xKey="date" yKey="revenue" />
 * <LineChart data={data} xKey="month" yKey={["sales", "expenses"]} showLegend />
 */

import { createPlatePlugin, PlateElement, type PlateElementProps, useElement } from "platejs/react";
import { memo, useMemo } from "react";

import { LINE_CHART_KEY, type TLineChartElement, type VegaLiteSpec } from "../../../types";
import { detectFormat } from "../../lib/format";
import { useLiveValueData } from "./context";
import { VegaChart } from "./vega-chart";
import { lineChartToVegaSpec } from "./vega-spec";

// ============================================================================
// Standalone Component
// ============================================================================

export interface LineChartProps {
  /** Chart data array */
  data?: Record<string, unknown>[];
  /** Data key for X axis */
  xKey?: string;
  /** Data key(s) for Y axis */
  yKey?: string | string[];
  /** Chart height in pixels */
  height?: number;
  /** Show legend */
  showLegend?: boolean;
  /** Show grid lines */
  showGrid?: boolean;
  /** Show tooltip on hover */
  showTooltip?: boolean;
  /** Curve type */
  curve?: "linear" | "monotone" | "step";
  /** Show dots on data points */
  showDots?: boolean;
  /** Custom colors */
  colors?: string[];
  /** Additional CSS classes */
  className?: string;
  /**
   * X-axis format (d3-format string).
   * Auto-detected from column name if not provided.
   */
  xFormat?: string;
  /**
   * Y-axis format (d3-format string).
   * Auto-detected from column name if not provided.
   */
  yFormat?: string;
  /**
   * Full Vega-Lite specification.
   * If provided, overrides the simplified props above.
   */
  vegaSpec?: VegaLiteSpec;
}

/**
 * Standalone LineChart component.
 * Uses Vega-Lite for rendering with canvas for performance.
 * Supports data from props or LiveValue context.
 */
export function LineChart({
  data: propData,
  xKey,
  yKey = "value",
  height = 300,
  showLegend = false,
  showGrid = true,
  showTooltip = true,
  curve = "monotone",
  showDots = true,
  colors,
  className,
  xFormat,
  yFormat,
  vegaSpec: propVegaSpec,
}: LineChartProps) {
  // Get data from LiveValue context if not provided via props
  const ctx = useLiveValueData();
  const data = propData ?? ctx?.data;

  // Auto-detect formats if not provided
  const resolvedFormats = useMemo(() => {
    if (!data || data.length === 0) return { xFormat, yFormat };

    // Get first yKey for detection (multi-series uses first)
    const firstYKey = Array.isArray(yKey) ? yKey[0] : yKey;
    const yValues = data.map((d) => d[firstYKey]);

    return {
      xFormat:
        xFormat ??
        (xKey
          ? detectFormat(
              xKey,
              data.map((d) => d[xKey]),
            )
          : null),
      yFormat: yFormat ?? detectFormat(firstYKey, yValues),
    };
  }, [data, xKey, yKey, xFormat, yFormat]);

  // If full vegaSpec provided, use it directly
  if (propVegaSpec) {
    return <VegaChart spec={propVegaSpec} height={height} data={propData} className={className} />;
  }

  // Convert simplified props to Vega-Lite spec
  const spec = lineChartToVegaSpec({
    xKey,
    yKey,
    showLegend,
    showGrid,
    curve,
    showDots,
    xFormat: resolvedFormats.xFormat ?? undefined,
    yFormat: resolvedFormats.yFormat ?? undefined,
  });

  return <VegaChart spec={spec} height={height} data={propData} className={className} />;
}

// ============================================================================
// Plate Plugin
// ============================================================================

function LineChartElement(props: PlateElementProps) {
  const element = useElement<TLineChartElement>();

  return (
    <PlateElement {...props} as="div" className="my-2 relative">
      <LineChart
        xKey={element.xKey as string | undefined}
        yKey={element.yKey as string | string[] | undefined}
        height={(element.height as number | undefined) ?? 300}
        showLegend={element.showLegend as boolean | undefined}
        showGrid={element.showGrid as boolean | undefined}
        showTooltip={element.showTooltip as boolean | undefined}
        curve={element.curve as "linear" | "monotone" | "step" | undefined}
        showDots={element.showDots as boolean | undefined}
        colors={element.colors as string[] | undefined}
        xFormat={element.xFormat as string | undefined}
        yFormat={element.yFormat as string | undefined}
        vegaSpec={element.vegaSpec as VegaLiteSpec | undefined}
      />
      <span className="absolute top-0 left-0 opacity-0 pointer-events-none">{props.children}</span>
    </PlateElement>
  );
}

/**
 * LineChart Plugin - line chart visualization.
 */
export const LineChartPlugin = createPlatePlugin({
  key: LINE_CHART_KEY,
  node: {
    isElement: true,
    isInline: true, // Inline in Slate model to allow nesting in LiveValue; visual is still block
    isVoid: true,
    component: memo(LineChartElement),
  },
});

// ============================================================================
// Element Factory
// ============================================================================

export interface CreateLineChartOptions {
  xKey?: string;
  yKey?: string | string[];
  height?: number;
  showLegend?: boolean;
  showGrid?: boolean;
  showTooltip?: boolean;
  curve?: "linear" | "monotone" | "step";
  showDots?: boolean;
  colors?: string[];
  xFormat?: string;
  yFormat?: string;
  vegaSpec?: VegaLiteSpec;
}

/**
 * Create a LineChart element for insertion into editor.
 */
export function createLineChartElement(options?: CreateLineChartOptions): TLineChartElement {
  return {
    type: LINE_CHART_KEY,
    xKey: options?.xKey,
    yKey: options?.yKey,
    height: options?.height ?? 300,
    showLegend: options?.showLegend ?? false,
    showGrid: options?.showGrid ?? true,
    showTooltip: options?.showTooltip ?? true,
    curve: options?.curve ?? "monotone",
    showDots: options?.showDots ?? true,
    colors: options?.colors,
    xFormat: options?.xFormat,
    yFormat: options?.yFormat,
    vegaSpec: options?.vegaSpec,
    children: [{ text: "" }],
  };
}

export { LINE_CHART_KEY };
