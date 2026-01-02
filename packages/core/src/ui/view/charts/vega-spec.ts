/**
 * Vega-Lite Spec Converters
 *
 * Converts simplified chart props (xKey, yKey, etc.) to Vega-Lite specifications.
 * This allows backward compatibility with existing chart components while using
 * Vega-Lite under the hood.
 */

import type { VegaLiteSpec } from "../../../types";

// ============================================================================
// Types for Simplified Props
// ============================================================================

/** Shared format props for charts with X/Y axes */
export interface ChartFormatProps {
  /** X-axis format (d3-format string) */
  xFormat?: string;
  /** Y-axis format (d3-format string) */
  yFormat?: string;
}

export interface LineChartSpecProps extends ChartFormatProps {
  xKey?: string;
  yKey?: string | string[];
  showLegend?: boolean;
  showGrid?: boolean;
  curve?: "linear" | "monotone" | "step";
  showDots?: boolean;
}

export interface BarChartSpecProps extends ChartFormatProps {
  xKey?: string;
  yKey?: string | string[];
  showLegend?: boolean;
  showGrid?: boolean;
  stacked?: boolean;
  layout?: "vertical" | "horizontal";
}

export interface AreaChartSpecProps extends ChartFormatProps {
  xKey?: string;
  yKey?: string | string[];
  showLegend?: boolean;
  showGrid?: boolean;
  curve?: "linear" | "monotone" | "step";
  stacked?: boolean;
  fillOpacity?: number;
}

export interface PieChartSpecProps {
  valueKey?: string;
  nameKey?: string;
  showLegend?: boolean;
  showLabels?: boolean;
  innerRadius?: number;
  /** Value format for tooltips (d3-format string) */
  valueFormat?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Map curve type from Recharts naming to Vega-Lite interpolation
 */
function mapCurve(curve?: "linear" | "monotone" | "step"): string {
  switch (curve) {
    case "step":
      return "step";
    case "linear":
      return "linear";
    default:
      return "monotone";
  }
}

/**
 * Create a fold transform for multi-series data.
 * This transforms columns into rows for Vega-Lite's encoding.
 *
 * Input: [{ date: "Jan", sales: 100, costs: 50 }]
 * Output: [{ date: "Jan", key: "sales", value: 100 }, { date: "Jan", key: "costs", value: 50 }]
 */
function createFoldTransform(yKeys: string[]) {
  return {
    fold: yKeys,
    as: ["series", "value"],
  };
}

// ============================================================================
// Spec Converters
// ============================================================================

/**
 * Convert LineChart props to Vega-Lite spec.
 *
 * @example
 * ```ts
 * const spec = lineChartToVegaSpec({ xKey: "date", yKey: ["sales", "costs"] });
 * ```
 */
export function lineChartToVegaSpec(props: LineChartSpecProps): VegaLiteSpec {
  const {
    xKey = "x",
    yKey = "value",
    showLegend = false,
    showGrid = true,
    curve = "monotone",
    showDots = true,
    xFormat,
    yFormat,
  } = props;

  const yKeys = Array.isArray(yKey) ? yKey : [yKey];
  const isMultiSeries = yKeys.length > 1;
  const interpolation = mapCurve(curve);
  const yField = isMultiSeries ? "value" : yKeys[0];

  // Line chart with nearest-point tooltip for better interactivity
  const baseSpec: VegaLiteSpec = {
    $schema: "https://vega.github.io/schema/vega-lite/v6.json",
    // Add params for nearest-point tooltip selection
    params: [
      {
        name: "hover",
        select: {
          type: "point",
          on: "pointerover",
          nearest: true,
          clear: "pointerout",
        },
      },
    ],
    mark: {
      type: "line",
      interpolate: interpolation,
      point: showDots, // Built-in point markers
      tooltip: true,
    },
    encoding: {
      x: {
        field: xKey,
        type: "ordinal",
        axis: {
          grid: false,
          labelAngle: -45,
          labelLimit: 100,
          labelOverlap: "parity",
          ...(xFormat ? { format: xFormat } : {}),
        },
      },
      y: {
        field: yField,
        type: "quantitative",
        axis: {
          grid: showGrid,
          labelLimit: 80,
          ...(yFormat ? { format: yFormat } : {}),
        },
      },
      // Tooltip encoding for all fields
      tooltip: isMultiSeries
        ? [
            { field: xKey, type: "ordinal" as const, title: xKey },
            { field: "series", type: "nominal" as const, title: "Series" },
            { field: "value", type: "quantitative" as const, title: "Value" },
          ]
        : [
            { field: xKey, type: "ordinal" as const, title: xKey },
            { field: yField, type: "quantitative" as const, title: yField },
          ],
    },
  };

  // Handle multi-series with fold transform and color encoding
  if (isMultiSeries) {
    baseSpec.transform = [createFoldTransform(yKeys)];
    (baseSpec.encoding as Record<string, unknown>).color = {
      field: "series",
      type: "nominal",
      legend: showLegend ? {} : null,
    };
  }

  return baseSpec;
}

/**
 * Convert BarChart props to Vega-Lite spec.
 *
 * @example
 * ```ts
 * const spec = barChartToVegaSpec({ xKey: "category", yKey: "value", stacked: true });
 * ```
 */
export function barChartToVegaSpec(props: BarChartSpecProps): VegaLiteSpec {
  const {
    xKey = "x",
    yKey = "value",
    showLegend = false,
    showGrid = true,
    stacked = false,
    layout = "vertical",
    xFormat,
    yFormat,
  } = props;

  const yKeys = Array.isArray(yKey) ? yKey : [yKey];
  const isMultiSeries = yKeys.length > 1;
  const isHorizontal = layout === "horizontal";

  // For horizontal bars, swap x and y
  const categoryField = xKey;
  const valueField = isMultiSeries ? "value" : yKeys[0];

  // Format for category axis (usually X unless horizontal)
  const categoryFormat = isHorizontal ? yFormat : xFormat;
  // Format for value axis (usually Y unless horizontal)
  const valueFormat = isHorizontal ? xFormat : yFormat;

  const categoryEncoding = {
    field: categoryField,
    type: "nominal" as const,
    axis: {
      grid: false,
      labelAngle: isHorizontal ? 0 : -45,
      labelLimit: 100,
      labelOverlap: "parity",
      ...(categoryFormat ? { format: categoryFormat } : {}),
    },
  };

  const valueEncoding = {
    field: valueField,
    type: "quantitative" as const,
    axis: {
      grid: showGrid,
      labelLimit: 80,
      ...(valueFormat ? { format: valueFormat } : {}),
    },
    ...(stacked && isMultiSeries ? { stack: "zero" as const } : {}),
  };

  const baseSpec: VegaLiteSpec = {
    $schema: "https://vega.github.io/schema/vega-lite/v6.json",
    mark: {
      type: "bar",
      cornerRadiusEnd: 4,
      tooltip: true,
    },
    encoding: {
      x: isHorizontal ? valueEncoding : categoryEncoding,
      y: isHorizontal ? categoryEncoding : valueEncoding,
    },
  };

  // Handle multi-series
  if (isMultiSeries) {
    baseSpec.transform = [createFoldTransform(yKeys)];
    const encoding = baseSpec.encoding as Record<string, unknown>;
    encoding.color = {
      field: "series",
      type: "nominal",
      legend: showLegend ? {} : null,
    };

    // For grouped bars (not stacked), use xOffset
    if (!stacked && !isHorizontal) {
      encoding.xOffset = {
        field: "series",
        type: "nominal",
      };
    } else if (!stacked && isHorizontal) {
      encoding.yOffset = {
        field: "series",
        type: "nominal",
      };
    }
  }

  return baseSpec;
}

/**
 * Convert AreaChart props to Vega-Lite spec.
 *
 * @example
 * ```ts
 * const spec = areaChartToVegaSpec({ xKey: "date", yKey: "value", stacked: true });
 * ```
 */
export function areaChartToVegaSpec(props: AreaChartSpecProps): VegaLiteSpec {
  const {
    xKey = "x",
    yKey = "value",
    showLegend = false,
    showGrid = true,
    curve = "monotone",
    stacked = false,
    fillOpacity = 0.4,
    xFormat,
    yFormat,
  } = props;

  const yKeys = Array.isArray(yKey) ? yKey : [yKey];
  const isMultiSeries = yKeys.length > 1;
  const interpolation = mapCurve(curve);
  const yField = isMultiSeries ? "value" : yKeys[0];

  const baseSpec: VegaLiteSpec = {
    $schema: "https://vega.github.io/schema/vega-lite/v6.json",
    // Add params for nearest-point tooltip selection
    params: [
      {
        name: "hover",
        select: {
          type: "point",
          on: "pointerover",
          nearest: true,
          clear: "pointerout",
        },
      },
    ],
    mark: {
      type: "area",
      interpolate: interpolation,
      opacity: fillOpacity,
      line: true,
      point: true, // Add points for better hover detection
      tooltip: true,
    },
    encoding: {
      x: {
        field: xKey,
        type: "ordinal",
        axis: {
          grid: false,
          labelAngle: -45,
          labelLimit: 100,
          labelOverlap: "parity",
          ...(xFormat ? { format: xFormat } : {}),
        },
      },
      y: {
        field: yField,
        type: "quantitative",
        axis: {
          grid: showGrid,
          labelLimit: 80,
          ...(yFormat ? { format: yFormat } : {}),
        },
        ...(stacked && isMultiSeries ? { stack: "zero" as const } : {}),
      },
      // Tooltip encoding for all fields
      tooltip: isMultiSeries
        ? [
            { field: xKey, type: "ordinal" as const, title: xKey },
            { field: "series", type: "nominal" as const, title: "Series" },
            { field: "value", type: "quantitative" as const, title: "Value" },
          ]
        : [
            { field: xKey, type: "ordinal" as const, title: xKey },
            { field: yField, type: "quantitative" as const, title: yField },
          ],
    },
  };

  // Handle multi-series
  if (isMultiSeries) {
    baseSpec.transform = [createFoldTransform(yKeys)];
    (baseSpec.encoding as Record<string, unknown>).color = {
      field: "series",
      type: "nominal",
      legend: showLegend ? {} : null,
    };
  }

  return baseSpec;
}

/**
 * Convert PieChart props to Vega-Lite spec.
 *
 * @example
 * ```ts
 * const spec = pieChartToVegaSpec({ valueKey: "amount", nameKey: "category", innerRadius: 60 });
 * ```
 */
export function pieChartToVegaSpec(props: PieChartSpecProps): VegaLiteSpec {
  const {
    valueKey = "value",
    nameKey = "name",
    showLegend = true,
    showLabels = false,
    innerRadius = 0,
    valueFormat,
  } = props;

  const baseSpec: VegaLiteSpec = {
    $schema: "https://vega.github.io/schema/vega-lite/v6.json",
    mark: {
      type: "arc",
      innerRadius: innerRadius,
      stroke: "var(--background, #09090b)",
      strokeWidth: 2,
      tooltip: true,
    },
    encoding: {
      theta: {
        field: valueKey,
        type: "quantitative",
        stack: true,
        ...(valueFormat ? { format: valueFormat } : {}),
      },
      color: {
        field: nameKey,
        type: "nominal",
        legend: showLegend ? {} : null,
      },
      // Explicit tooltip encoding
      tooltip: [
        { field: nameKey, type: "nominal" as const, title: nameKey },
        { field: valueKey, type: "quantitative" as const, title: valueKey },
      ],
    },
  };

  // Add labels if requested
  if (showLabels) {
    // Use a layer to add text labels
    return {
      $schema: "https://vega.github.io/schema/vega-lite/v6.json",
      layer: [
        baseSpec,
        {
          mark: {
            type: "text",
            radius: innerRadius > 0 ? innerRadius + 40 : 80,
          },
          encoding: {
            theta: {
              field: valueKey,
              type: "quantitative",
              stack: true,
            },
            text: {
              field: nameKey,
              type: "nominal",
            },
            color: {
              value: "white",
            },
          },
        },
      ],
    };
  }

  return baseSpec;
}

// ============================================================================
// Auto-detect Spec Type
// ============================================================================

export type ChartType = "line" | "bar" | "area" | "pie";

/**
 * Auto-detect appropriate chart type based on data shape.
 * Useful when user doesn't specify a chart type.
 */
export function detectChartType(
  data: Record<string, unknown>[],
  xKey?: string,
  yKey?: string | string[],
): ChartType {
  if (!data || data.length === 0) return "bar";

  const firstRow = data[0];
  const keys = Object.keys(firstRow);

  // If only two columns and one is numeric percentage-like, suggest pie
  if (keys.length === 2) {
    const numericKey = keys.find((k) => typeof firstRow[k] === "number");
    const stringKey = keys.find((k) => typeof firstRow[k] === "string");
    if (numericKey && stringKey) {
      // If values look like percentages or proportions, suggest pie
      if (data.length <= 8) {
        return "pie";
      }
    }
  }

  // If x-axis looks like dates/time, suggest line
  const xValue = firstRow[xKey || keys[0]];
  if (typeof xValue === "string") {
    const datePattern =
      /^\d{4}[-/]\d{2}[-/]\d{2}|^\d{2}[-/]\d{2}[-/]\d{4}|^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i;
    if (datePattern.test(xValue)) {
      return "line";
    }
  }

  // Default to bar for categorical data
  return "bar";
}
