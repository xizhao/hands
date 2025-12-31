"use client";

/**
 * @component BarChart
 * @category static
 * @description Bar chart for comparing categorical data.
 * Supports vertical/horizontal orientation and stacked bars.
 * Works standalone or inside LiveValue for live SQL data.
 * @keywords chart, bar, column, comparison, category, visualization
 * @example
 * <BarChart data={data} xKey="category" yKey="value" />
 * <BarChart data={data} xKey="month" yKey={["sales", "costs"]} stacked />
 */

import { createPlatePlugin, PlateElement, type PlateElementProps, useElement } from "platejs/react";
import { memo, useMemo } from "react";

import { BAR_CHART_KEY, type TBarChartElement, type VegaLiteSpec } from "../../../types";
import { detectFormat } from "../../lib/format";
import { useLiveValueData } from "./context";
import { VegaChart } from "./vega-chart";
import { barChartToVegaSpec } from "./vega-spec";

// ============================================================================
// Standalone Component
// ============================================================================

export interface BarChartProps {
  /** Chart data array */
  data?: Record<string, unknown>[];
  /** Data key for X axis (categories) */
  xKey?: string;
  /** Data key(s) for Y axis (values) */
  yKey?: string | string[];
  /** Chart height in pixels */
  height?: number;
  /** Show legend */
  showLegend?: boolean;
  /** Show grid lines */
  showGrid?: boolean;
  /** Show tooltip on hover */
  showTooltip?: boolean;
  /** Stack bars on top of each other */
  stacked?: boolean;
  /** Bar orientation */
  layout?: "vertical" | "horizontal";
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
 * Standalone BarChart component.
 * Uses Vega-Lite for rendering with canvas for performance.
 * Supports data from props or LiveValue context.
 */
export function BarChart({
  data: propData,
  xKey,
  yKey = "value",
  height = 300,
  showLegend = false,
  showGrid = true,
  showTooltip = true,
  stacked = false,
  layout = "vertical",
  colors,
  className,
  xFormat,
  yFormat,
  vegaSpec: propVegaSpec,
}: BarChartProps) {
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
  const spec = barChartToVegaSpec({
    xKey,
    yKey,
    showLegend,
    showGrid,
    stacked,
    layout,
    xFormat: resolvedFormats.xFormat ?? undefined,
    yFormat: resolvedFormats.yFormat ?? undefined,
  });

  return <VegaChart spec={spec} height={height} data={propData} className={className} />;
}

// ============================================================================
// Plate Plugin
// ============================================================================

function BarChartElement(props: PlateElementProps) {
  const element = useElement<TBarChartElement>();

  return (
    <PlateElement {...props} as="div" className="my-2 relative">
      <BarChart
        xKey={element.xKey as string | undefined}
        yKey={element.yKey as string | string[] | undefined}
        height={(element.height as number | undefined) ?? 300}
        showLegend={element.showLegend as boolean | undefined}
        showGrid={element.showGrid as boolean | undefined}
        showTooltip={element.showTooltip as boolean | undefined}
        stacked={element.stacked as boolean | undefined}
        layout={element.layout as "vertical" | "horizontal" | undefined}
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
 * BarChart Plugin - bar chart visualization.
 */
export const BarChartPlugin = createPlatePlugin({
  key: BAR_CHART_KEY,
  node: {
    isElement: true,
    isInline: true, // Inline in Slate model to allow nesting in LiveValue; visual is still block
    isVoid: true,
    component: memo(BarChartElement),
  },
});

// ============================================================================
// Element Factory
// ============================================================================

export interface CreateBarChartOptions {
  xKey?: string;
  yKey?: string | string[];
  height?: number;
  showLegend?: boolean;
  showGrid?: boolean;
  showTooltip?: boolean;
  stacked?: boolean;
  layout?: "vertical" | "horizontal";
  colors?: string[];
  xFormat?: string;
  yFormat?: string;
  vegaSpec?: VegaLiteSpec;
}

/**
 * Create a BarChart element for insertion into editor.
 */
export function createBarChartElement(options?: CreateBarChartOptions): TBarChartElement {
  return {
    type: BAR_CHART_KEY,
    xKey: options?.xKey,
    yKey: options?.yKey,
    height: options?.height ?? 300,
    showLegend: options?.showLegend ?? false,
    showGrid: options?.showGrid ?? true,
    showTooltip: options?.showTooltip ?? true,
    stacked: options?.stacked ?? false,
    layout: options?.layout ?? "vertical",
    colors: options?.colors,
    xFormat: options?.xFormat,
    yFormat: options?.yFormat,
    vegaSpec: options?.vegaSpec,
    children: [{ text: "" }],
  };
}

export { BAR_CHART_KEY };
