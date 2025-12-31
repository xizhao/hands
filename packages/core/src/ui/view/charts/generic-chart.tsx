"use client";

/**
 * @component Chart
 * @category static
 * @description Generic chart component for full Vega-Lite specifications.
 * Use this for AI-generated advanced charts like boxplots, heatmaps, scatter matrices.
 * Works standalone or inside LiveValue for live SQL data.
 * @keywords chart, vega, visualization, custom, advanced
 * @example
 * <Chart vegaSpec={{ mark: "boxplot", encoding: { x: { field: "category" }, y: { field: "value" } } }} />
 * <Chart vegaSpec={{ mark: "rect", encoding: { x: { field: "x" }, y: { field: "y" }, color: { field: "value" } } }} />
 */

import { createPlatePlugin, PlateElement, type PlateElementProps, useElement } from "platejs/react";
import { memo } from "react";

import { CHART_KEY, type TChartElement, type VegaLiteSpec } from "../../../types";
import { VegaChart } from "./vega-chart";

// ============================================================================
// Standalone Component
// ============================================================================

export interface ChartProps {
  /** Full Vega-Lite specification */
  vegaSpec: VegaLiteSpec;
  /** Override data (takes precedence over spec data and context) */
  data?: Record<string, unknown>[];
  /** Chart height in pixels */
  height?: number;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Generic Chart component for full Vega-Lite specifications.
 *
 * This component is designed for AI-generated advanced visualizations
 * that go beyond the simplified props of LineChart, BarChart, etc.
 *
 * Supports:
 * - Any Vega-Lite mark type (boxplot, heatmap, scatter matrix, etc.)
 * - Custom transforms, aggregations, and calculations
 * - Multi-layer and faceted charts
 * - Data from props, spec, or LiveValue context
 */
export function Chart({ vegaSpec, data, height = 300, className }: ChartProps) {
  return <VegaChart spec={vegaSpec} height={height} data={data} className={className} />;
}

// ============================================================================
// Plate Plugin
// ============================================================================

function ChartElement(props: PlateElementProps) {
  const element = useElement<TChartElement>();

  // vegaSpec is required for this element type
  if (!element.vegaSpec) {
    return (
      <PlateElement {...props} as="div" className="my-2 relative">
        <div className="w-full h-[200px] flex items-center justify-center bg-muted/30 rounded-lg">
          <span className="text-muted-foreground text-sm">No Vega-Lite spec provided</span>
        </div>
        <span className="absolute top-0 left-0 opacity-0 pointer-events-none">
          {props.children}
        </span>
      </PlateElement>
    );
  }

  return (
    <PlateElement {...props} as="div" className="my-2 relative">
      <Chart
        vegaSpec={element.vegaSpec as VegaLiteSpec}
        height={(element.height as number | undefined) ?? 300}
      />
      <span className="absolute top-0 left-0 opacity-0 pointer-events-none">{props.children}</span>
    </PlateElement>
  );
}

/**
 * Chart Plugin - generic Vega-Lite visualization.
 */
export const ChartPlugin = createPlatePlugin({
  key: CHART_KEY,
  node: {
    isElement: true,
    isInline: true, // Inline in Slate model to allow nesting in LiveValue; visual is still block
    isVoid: true,
    component: memo(ChartElement),
  },
});

// ============================================================================
// Element Factory
// ============================================================================

export interface CreateChartOptions {
  /** Full Vega-Lite specification (required) */
  vegaSpec: VegaLiteSpec;
  /** Chart height in pixels */
  height?: number;
}

/**
 * Create a Chart element for insertion into editor.
 */
export function createChartElement(options: CreateChartOptions): TChartElement {
  return {
    type: CHART_KEY,
    vegaSpec: options.vegaSpec,
    height: options.height ?? 300,
    children: [{ text: "" }],
  };
}

export { CHART_KEY };
