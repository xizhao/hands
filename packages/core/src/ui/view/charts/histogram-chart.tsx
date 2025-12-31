"use client";

/**
 * HistogramChart - Distribution visualization
 *
 * Automatically bins continuous data to show frequency distribution.
 */

import { createPlatePlugin, PlateElement, type PlateElementProps, useElement } from "platejs/react";
import { memo } from "react";

import {
  HISTOGRAM_CHART_KEY,
  type THistogramChartElement,
  type VegaLiteSpec,
} from "../../../types";
import { VegaChart } from "./vega-chart";

// ============================================================================
// Standalone Component
// ============================================================================

export interface HistogramChartProps {
  /** Data key for the values to bin */
  valueKey?: string;
  /** Number of bins (default: auto) */
  binCount?: number;
  /** Chart height in pixels */
  height?: number;
  /** Override data */
  data?: Record<string, unknown>[];
  /** Show tooltip on hover */
  showTooltip?: boolean;
  /** Bar color */
  color?: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Build Vega-Lite spec for histogram
 */
function buildHistogramSpec(props: HistogramChartProps): VegaLiteSpec {
  const { valueKey = "value", binCount, color } = props;

  const encoding: Record<string, unknown> = {
    x: {
      bin: binCount ? { maxbins: binCount } : true,
      field: valueKey,
      type: "quantitative",
    },
    y: { aggregate: "count", type: "quantitative" },
  };

  if (color) {
    encoding.color = { value: color };
  }

  if (props.showTooltip !== false) {
    encoding.tooltip = [
      { bin: true, field: valueKey, type: "quantitative", title: "Range" },
      { aggregate: "count", type: "quantitative", title: "Count" },
    ];
  }

  return {
    mark: "bar",
    encoding,
  };
}

export function HistogramChart(props: HistogramChartProps) {
  const spec = buildHistogramSpec(props);
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

function HistogramChartElement(props: PlateElementProps) {
  const element = useElement<THistogramChartElement>();

  return (
    <PlateElement {...props} as="div" className="my-2 relative">
      <HistogramChart
        valueKey={element.valueKey}
        binCount={element.binCount}
        height={element.height}
        showTooltip={element.showTooltip}
        color={element.color}
      />
      <span className="absolute top-0 left-0 opacity-0 pointer-events-none">{props.children}</span>
    </PlateElement>
  );
}

export const HistogramChartPlugin = createPlatePlugin({
  key: HISTOGRAM_CHART_KEY,
  node: {
    isElement: true,
    isInline: true,
    isVoid: true,
    component: memo(HistogramChartElement),
  },
});

export function createHistogramChartElement(
  options: Partial<Omit<THistogramChartElement, "type" | "children">> = {},
): THistogramChartElement {
  return {
    type: HISTOGRAM_CHART_KEY,
    valueKey: options.valueKey as string | undefined,
    binCount: options.binCount as number | undefined,
    height: (options.height as number | undefined) ?? 300,
    showTooltip: options.showTooltip as boolean | undefined,
    color: options.color as string | undefined,
    children: [{ text: "" }],
  };
}

export { HISTOGRAM_CHART_KEY };
