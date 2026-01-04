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

/**
 * Animation props for charts (Vega-Lite 6.0+ timer selection)
 *
 * Enables frame-by-frame animation over a data field.
 * The chart will automatically cycle through distinct values of the animateBy field.
 *
 * @example
 * ```tsx
 * // Auto-animated chart
 * <LineChart data={data} xKey="country" yKey="gdp" animateBy="year" />
 *
 * // Controlled chart with external state
 * <Select name="year" options={years} />
 * <LineChart data={data} xKey="country" yKey="gdp" animateBy="year" frameValue="{{year}}" />
 * ```
 */
export interface AnimationProps {
  /**
   * Field to animate over (e.g., "year", "quarter", "month").
   * Enables auto-playing animation that cycles through each distinct value.
   *
   * Requirements:
   * - Field must exist as a column in your data
   * - Data should have multiple rows per frame value
   * - Query should be ordered by this field
   *
   * @example
   * // Data has year, country, gdp columns with multiple countries per year
   * <BarChart xKey="country" yKey="gdp" animateBy="year" />
   */
  animateBy?: string;

  /**
   * Specific frame value to display (disables auto-animation).
   * Use with `animateBy` to control which frame is shown externally.
   * Supports {{binding}} syntax to read from LocalState.
   *
   * @example
   * // Controlled by a Select component
   * <Select name="year" options={[2020, 2021, 2022]} />
   * <BarChart animateBy="year" frameValue="{{year}}" />
   */
  frameValue?: string | number;
}

export interface LineChartSpecProps extends ChartFormatProps, AnimationProps {
  xKey?: string;
  yKey?: string | string[];
  showLegend?: boolean;
  showGrid?: boolean;
  curve?: "linear" | "monotone" | "step";
  showDots?: boolean;
}

export interface BarChartSpecProps extends ChartFormatProps, AnimationProps {
  xKey?: string;
  yKey?: string | string[];
  showLegend?: boolean;
  showGrid?: boolean;
  stacked?: boolean;
  layout?: "vertical" | "horizontal";
}

export interface AreaChartSpecProps extends ChartFormatProps, AnimationProps {
  xKey?: string;
  yKey?: string | string[];
  showLegend?: boolean;
  showGrid?: boolean;
  curve?: "linear" | "monotone" | "step";
  stacked?: boolean;
  fillOpacity?: number;
}

export interface PieChartSpecProps extends AnimationProps {
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

/**
 * Apply animation params to a Vega-Lite spec (Vega-Lite 6.0+ feature).
 *
 * - If only `animateBy` is set: Uses timer selection to auto-cycle through frames
 * - If `frameValue` is also set: Filters to show only that specific frame (controlled mode)
 *
 * @example
 * ```ts
 * // Auto-animated
 * const spec = lineChartToVegaSpec({ xKey: "country", yKey: "gdp" });
 * const animatedSpec = applyAnimation(spec, { animateBy: "year" });
 *
 * // Controlled by external value
 * const controlledSpec = applyAnimation(spec, { animateBy: "year", frameValue: 2020 });
 * ```
 */
export function applyAnimation(
  spec: VegaLiteSpec,
  props: AnimationProps,
): VegaLiteSpec {
  const { animateBy, frameValue } = props;

  if (!animateBy) return spec;

  // If frameValue is set, use simple filter (controlled mode)
  if (frameValue !== undefined && frameValue !== null && frameValue !== "") {
    const filterTransform = {
      filter: `datum['${animateBy}'] == ${typeof frameValue === "string" ? `'${frameValue}'` : frameValue}`,
    };

    return {
      ...spec,
      transform: [...((spec.transform as unknown[]) || []), filterTransform],
    };
  }

  // Auto-animation mode: Timer selection that auto-advances through animation frames
  const animationParam = {
    name: "animation_frame",
    select: {
      type: "point",
      fields: [animateBy],
      on: "timer",
    },
  };

  // Filter transform to show only current frame
  const filterTransform = { filter: { param: "animation_frame" } };

  // Time encoding channel - drives the animation
  const timeEncoding = { field: animateBy, type: "ordinal" as const };

  const existingEncoding = (spec.encoding ?? {}) as Record<string, unknown>;

  return {
    ...spec,
    params: [...((spec.params as unknown[]) || []), animationParam],
    transform: [...((spec.transform as unknown[]) || []), filterTransform],
    encoding: {
      ...existingEncoding,
      time: timeEncoding,
    },
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
    animateBy,
      } = props;

  const yKeys = Array.isArray(yKey) ? yKey : [yKey];
  const isMultiSeries = yKeys.length > 1;
  const interpolation = mapCurve(curve);
  const yField = isMultiSeries ? "value" : yKeys[0];

  const baseSpec: VegaLiteSpec = {
    $schema: "https://vega.github.io/schema/vega-lite/v6.json",
    mark: {
      type: "line",
      interpolate: interpolation,
      strokeWidth: 2,
      point: showDots ? { filled: true, size: 50 } : false,
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

  // Apply animation if specified
  return applyAnimation(baseSpec, { animateBy, frameValue: props.frameValue });
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
    animateBy,
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

  // Build tooltip encoding based on series type
  const tooltipEncoding = isMultiSeries
    ? [
        { field: categoryField, type: "nominal" as const, title: categoryField },
        { field: "series", type: "nominal" as const, title: "Series" },
        { field: "value", type: "quantitative" as const, title: "Value" },
      ]
    : [
        { field: categoryField, type: "nominal" as const, title: categoryField },
        { field: valueField, type: "quantitative" as const, title: valueField },
      ];

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
      tooltip: tooltipEncoding,
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

  // Apply animation if specified
  return applyAnimation(baseSpec, { animateBy, frameValue: props.frameValue });
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
    animateBy,
      } = props;

  const yKeys = Array.isArray(yKey) ? yKey : [yKey];
  const isMultiSeries = yKeys.length > 1;
  const interpolation = mapCurve(curve);
  const yField = isMultiSeries ? "value" : yKeys[0];

  const baseSpec: VegaLiteSpec = {
    $schema: "https://vega.github.io/schema/vega-lite/v6.json",
    mark: {
      type: "area",
      interpolate: interpolation,
      opacity: fillOpacity,
      line: true,
      point: true,
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

  // Apply animation if specified
  return applyAnimation(baseSpec, { animateBy, frameValue: props.frameValue });
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
    animateBy,
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
    const layeredSpec: VegaLiteSpec = {
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
    // Apply animation if specified
    return applyAnimation(layeredSpec, { animateBy, frameValue: props.frameValue });
  }

  // Apply animation if specified
  return applyAnimation(baseSpec, { animateBy, frameValue: props.frameValue });
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
