"use client";

/**
 * BoxPlotChart - Distribution statistics visualization
 *
 * Shows median, quartiles, and outliers for comparing distributions.
 */

import { createPlatePlugin, PlateElement, type PlateElementProps, useElement } from "platejs/react";
import { memo } from "react";

import { BOXPLOT_CHART_KEY, type TBoxPlotChartElement, type VegaLiteSpec } from "../../../types";
import { VegaChart } from "./vega-chart";

// ============================================================================
// Standalone Component
// ============================================================================

export interface BoxPlotChartProps {
  /** Data key for category (X axis) */
  categoryKey?: string;
  /** Data key for values (Y axis) */
  valueKey?: string;
  /** Chart height in pixels */
  height?: number;
  /** Override data */
  data?: Record<string, unknown>[];
  /** Show tooltip on hover */
  showTooltip?: boolean;
  /** Box color */
  color?: string;
  /** Orientation */
  orientation?: "vertical" | "horizontal";
  /** Additional CSS classes */
  className?: string;
}

/**
 * Build Vega-Lite spec for boxplot
 */
function buildBoxPlotSpec(props: BoxPlotChartProps): VegaLiteSpec {
  const { categoryKey = "category", valueKey = "value", color, orientation = "vertical" } = props;

  const isHorizontal = orientation === "horizontal";

  const encoding: Record<string, unknown> = isHorizontal
    ? {
        y: { field: categoryKey, type: "nominal" },
        x: { field: valueKey, type: "quantitative" },
      }
    : {
        x: { field: categoryKey, type: "nominal" },
        y: { field: valueKey, type: "quantitative" },
      };

  if (color) {
    encoding.color = { value: color };
  }

  return {
    mark: {
      type: "boxplot",
      extent: "min-max",
    },
    encoding,
  };
}

export function BoxPlotChart(props: BoxPlotChartProps) {
  const spec = buildBoxPlotSpec(props);
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

function BoxPlotChartElement(props: PlateElementProps) {
  const element = useElement<TBoxPlotChartElement>();

  return (
    <PlateElement {...props} as="div" className="my-2 relative">
      <BoxPlotChart
        categoryKey={element.categoryKey}
        valueKey={element.valueKey}
        height={element.height}
        showTooltip={element.showTooltip}
        color={element.color}
        orientation={element.orientation}
      />
      <span className="absolute top-0 left-0 opacity-0 pointer-events-none">{props.children}</span>
    </PlateElement>
  );
}

export const BoxPlotChartPlugin = createPlatePlugin({
  key: BOXPLOT_CHART_KEY,
  node: {
    isElement: true,
    isInline: true,
    isVoid: true,
    component: memo(BoxPlotChartElement),
  },
});

export function createBoxPlotChartElement(
  options: Partial<Omit<TBoxPlotChartElement, "type" | "children">> = {},
): TBoxPlotChartElement {
  return {
    type: BOXPLOT_CHART_KEY,
    categoryKey: options.categoryKey as string | undefined,
    valueKey: options.valueKey as string | undefined,
    height: (options.height as number | undefined) ?? 300,
    showTooltip: options.showTooltip as boolean | undefined,
    color: options.color as string | undefined,
    orientation: options.orientation as "vertical" | "horizontal" | undefined,
    children: [{ text: "" }],
  };
}

export { BOXPLOT_CHART_KEY };
