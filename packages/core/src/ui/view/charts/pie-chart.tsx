"use client";

/**
 * @component PieChart
 * @category static
 * @description Pie/donut chart for showing proportional data.
 * Set innerRadius > 0 to create a donut chart.
 * Works standalone or inside LiveValue for live SQL data.
 * @keywords chart, pie, donut, proportion, percentage, visualization
 * @example
 * <PieChart data={data} valueKey="count" nameKey="category" />
 * <PieChart data={data} valueKey="amount" nameKey="type" innerRadius={60} />
 */

import { createPlatePlugin, PlateElement, type PlateElementProps, useElement } from "platejs/react";
import { memo } from "react";

import { PIE_CHART_KEY, type TPieChartElement, type VegaLiteSpec } from "../../../types";
import { VegaChart } from "./vega-chart";
import { pieChartToVegaSpec } from "./vega-spec";

// ============================================================================
// Standalone Component
// ============================================================================

export interface PieChartProps {
  /** Chart data array */
  data?: Record<string, unknown>[];
  /** Data key for slice values */
  valueKey?: string;
  /** Data key for slice labels */
  nameKey?: string;
  /** Chart height in pixels */
  height?: number;
  /** Inner radius for donut chart (0 = pie, >0 = donut) */
  innerRadius?: number;
  /** Show legend */
  showLegend?: boolean;
  /** Show labels on slices */
  showLabels?: boolean;
  /** Custom colors */
  colors?: string[];
  /** Additional CSS classes */
  className?: string;
  /**
   * Full Vega-Lite specification.
   * If provided, overrides the simplified props above.
   */
  vegaSpec?: VegaLiteSpec;
}

/**
 * Standalone PieChart component.
 * Uses Vega-Lite for rendering with canvas for performance.
 * Supports data from props or LiveValue context.
 */
export function PieChart({
  data,
  valueKey = "value",
  nameKey = "name",
  height = 300,
  innerRadius = 0,
  showLegend = true,
  showLabels = false,
  colors,
  className,
  vegaSpec: propVegaSpec,
}: PieChartProps) {
  // If full vegaSpec provided, use it directly
  if (propVegaSpec) {
    return <VegaChart spec={propVegaSpec} height={height} data={data} className={className} />;
  }

  // Convert simplified props to Vega-Lite spec
  const spec = pieChartToVegaSpec({
    valueKey,
    nameKey,
    showLegend,
    showLabels,
    innerRadius,
  });

  return <VegaChart spec={spec} height={height} data={data} className={className} />;
}

// ============================================================================
// Plate Plugin
// ============================================================================

function PieChartElement(props: PlateElementProps) {
  const element = useElement<TPieChartElement>();

  return (
    <PlateElement {...props} as="div" className="my-2">
      <PieChart
        valueKey={element.valueKey as string | undefined}
        nameKey={element.nameKey as string | undefined}
        height={(element.height as number | undefined) ?? 300}
        innerRadius={(element.innerRadius as number | undefined) ?? 0}
        showLegend={element.showLegend as boolean | undefined}
        showLabels={element.showLabels as boolean | undefined}
        colors={element.colors as string[] | undefined}
        vegaSpec={element.vegaSpec as VegaLiteSpec | undefined}
      />
      <span className="hidden">{props.children}</span>
    </PlateElement>
  );
}

/**
 * PieChart Plugin - pie/donut chart visualization.
 */
export const PieChartPlugin = createPlatePlugin({
  key: PIE_CHART_KEY,
  node: {
    isElement: true,
    isInline: true, // Inline in Slate model to allow nesting in LiveValue; visual is still block
    isVoid: true,
    component: memo(PieChartElement),
  },
});

// ============================================================================
// Element Factory
// ============================================================================

export interface CreatePieChartOptions {
  valueKey?: string;
  nameKey?: string;
  height?: number;
  innerRadius?: number;
  showLegend?: boolean;
  showLabels?: boolean;
  colors?: string[];
  vegaSpec?: VegaLiteSpec;
}

/**
 * Create a PieChart element for insertion into editor.
 */
export function createPieChartElement(options?: CreatePieChartOptions): TPieChartElement {
  return {
    type: PIE_CHART_KEY,
    valueKey: options?.valueKey,
    nameKey: options?.nameKey,
    height: options?.height ?? 300,
    innerRadius: options?.innerRadius ?? 0,
    showLegend: options?.showLegend ?? true,
    showLabels: options?.showLabels ?? false,
    colors: options?.colors,
    vegaSpec: options?.vegaSpec,
    children: [{ text: "" }],
  };
}

export { PIE_CHART_KEY };
