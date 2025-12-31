"use client";

/**
 * ScatterChart - Scatter plot visualization
 *
 * Shows correlation between two variables with optional color/size encoding.
 */

import { createPlatePlugin, PlateElement, type PlateElementProps, useElement } from "platejs/react";
import { memo } from "react";

import { SCATTER_CHART_KEY, type TScatterChartElement, type VegaLiteSpec } from "../../../types";
import { VegaChart } from "./vega-chart";

// ============================================================================
// Standalone Component
// ============================================================================

export interface ScatterChartProps {
  /** Data key for X axis */
  xKey?: string;
  /** Data key for Y axis */
  yKey?: string;
  /** Data key for color encoding */
  colorKey?: string;
  /** Data key for size encoding */
  sizeKey?: string;
  /** Chart height in pixels */
  height?: number;
  /** Override data */
  data?: Record<string, unknown>[];
  /** Show tooltip on hover */
  showTooltip?: boolean;
  /** Point opacity (0-1) */
  opacity?: number;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Build Vega-Lite spec for scatter chart
 */
function buildScatterSpec(props: ScatterChartProps): VegaLiteSpec {
  const { xKey = "x", yKey = "y", colorKey, sizeKey, opacity = 0.7 } = props;

  const encoding: Record<string, unknown> = {
    x: { field: xKey, type: "quantitative" },
    y: { field: yKey, type: "quantitative" },
    opacity: { value: opacity },
  };

  if (colorKey) {
    encoding.color = { field: colorKey, type: "nominal" };
  }

  if (sizeKey) {
    encoding.size = { field: sizeKey, type: "quantitative" };
  }

  if (props.showTooltip !== false) {
    encoding.tooltip = [
      { field: xKey, type: "quantitative" },
      { field: yKey, type: "quantitative" },
      ...(colorKey ? [{ field: colorKey, type: "nominal" }] : []),
      ...(sizeKey ? [{ field: sizeKey, type: "quantitative" }] : []),
    ];
  }

  return {
    mark: { type: "point", filled: true },
    encoding,
  };
}

export function ScatterChart(props: ScatterChartProps) {
  const spec = buildScatterSpec(props);
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

function ScatterChartElement(props: PlateElementProps) {
  const element = useElement<TScatterChartElement>();

  return (
    <PlateElement {...props} as="div" className="my-2 relative">
      <ScatterChart
        xKey={element.xKey}
        yKey={element.yKey}
        colorKey={element.colorKey}
        sizeKey={element.sizeKey}
        height={element.height}
        showTooltip={element.showTooltip}
        opacity={element.opacity}
      />
      <span className="absolute top-0 left-0 opacity-0 pointer-events-none">{props.children}</span>
    </PlateElement>
  );
}

export const ScatterChartPlugin = createPlatePlugin({
  key: SCATTER_CHART_KEY,
  node: {
    isElement: true,
    isInline: true,
    isVoid: true,
    component: memo(ScatterChartElement),
  },
});

export function createScatterChartElement(
  options: Partial<Omit<TScatterChartElement, "type" | "children">> = {},
): TScatterChartElement {
  return {
    type: SCATTER_CHART_KEY,
    xKey: options.xKey as string | undefined,
    yKey: options.yKey as string | undefined,
    colorKey: options.colorKey as string | undefined,
    sizeKey: options.sizeKey as string | undefined,
    height: (options.height as number | undefined) ?? 300,
    showTooltip: options.showTooltip as boolean | undefined,
    opacity: options.opacity as number | undefined,
    children: [{ text: "" }],
  };
}

export { SCATTER_CHART_KEY };
