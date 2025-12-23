"use client";

/**
 * HeatmapChart - Matrix visualization with color intensity
 *
 * Great for showing patterns across two categorical dimensions.
 */

import { createPlatePlugin, PlateElement, type PlateElementProps, useElement } from "platejs/react";
import { memo } from "react";

import {
  HEATMAP_CHART_KEY,
  type THeatmapChartElement,
  type VegaLiteSpec,
} from "../../../types";
import { VegaChart } from "./vega-chart";

// ============================================================================
// Standalone Component
// ============================================================================

export interface HeatmapChartProps {
  /** Data key for X axis (columns) */
  xKey?: string;
  /** Data key for Y axis (rows) */
  yKey?: string;
  /** Data key for color intensity */
  valueKey?: string;
  /** Chart height in pixels */
  height?: number;
  /** Override data */
  data?: Record<string, unknown>[];
  /** Color scheme (e.g., "blues", "reds", "viridis") */
  colorScheme?: string;
  /** Show tooltip on hover */
  showTooltip?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Build Vega-Lite spec for heatmap
 */
function buildHeatmapSpec(props: HeatmapChartProps): VegaLiteSpec {
  const {
    xKey = "x",
    yKey = "y",
    valueKey = "value",
    colorScheme = "blues",
  } = props;

  const encoding: Record<string, unknown> = {
    x: { field: xKey, type: "ordinal" },
    y: { field: yKey, type: "ordinal" },
    color: {
      field: valueKey,
      type: "quantitative",
      scale: { scheme: colorScheme },
    },
  };

  if (props.showTooltip !== false) {
    encoding.tooltip = [
      { field: xKey, type: "ordinal" },
      { field: yKey, type: "ordinal" },
      { field: valueKey, type: "quantitative" },
    ];
  }

  return {
    mark: "rect",
    encoding,
  };
}

export function HeatmapChart(props: HeatmapChartProps) {
  const spec = buildHeatmapSpec(props);
  return (
    <VegaChart
      spec={spec}
      height={props.height ?? 300}
      data={props.data}
      className={props.className}
    />
  );
}

// ============================================================================
// Plate Plugin
// ============================================================================

function HeatmapChartElement(props: PlateElementProps) {
  const element = useElement<THeatmapChartElement>();

  return (
    <PlateElement {...props} as="div" className="my-2 relative">
      <HeatmapChart
        xKey={element.xKey}
        yKey={element.yKey}
        valueKey={element.valueKey}
        height={element.height}
        colorScheme={element.colorScheme}
        showTooltip={element.showTooltip}
      />
      <span className="absolute top-0 left-0 opacity-0 pointer-events-none">{props.children}</span>
    </PlateElement>
  );
}

export const HeatmapChartPlugin = createPlatePlugin({
  key: HEATMAP_CHART_KEY,
  node: {
    isElement: true,
    isInline: true,
    isVoid: true,
    component: memo(HeatmapChartElement),
  },
});

export function createHeatmapChartElement(
  options: Partial<Omit<THeatmapChartElement, "type" | "children">> = {}
): THeatmapChartElement {
  return {
    type: HEATMAP_CHART_KEY,
    xKey: options.xKey as string | undefined,
    yKey: options.yKey as string | undefined,
    valueKey: options.valueKey as string | undefined,
    height: (options.height as number | undefined) ?? 300,
    colorScheme: options.colorScheme as string | undefined,
    showTooltip: options.showTooltip as boolean | undefined,
    children: [{ text: "" }],
  };
}

export { HEATMAP_CHART_KEY };
