"use client";

/**
 * @component BarChart
 * @category static
 * @description Bar chart for comparing categorical data.
 * Supports vertical/horizontal orientation and stacked bars.
 * @keywords chart, bar, column, comparison, category, visualization
 * @example
 * <BarChart data={data} xKey="category" yKey="value" />
 * <BarChart data={data} xKey="month" yKey={["sales", "costs"]} stacked />
 */

import {
  createPlatePlugin,
  PlateElement,
  type PlateElementProps,
  useElement,
  useSelected,
} from "platejs/react";
import { memo, useMemo } from "react";
import { Bar, BarChart as RechartsBarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { BAR_CHART_KEY, type TBarChartElement } from "../../../types";
import {
  ChartContainer,
  type ChartConfig,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "./chart";
import { useLiveValueData } from "./context";
import { useContainerSize } from "./use-container-size";

// ============================================================================
// Default Colors
// ============================================================================

const DEFAULT_COLORS = [
  "hsl(var(--chart-1, 220 70% 50%))",
  "hsl(var(--chart-2, 160 60% 45%))",
  "hsl(var(--chart-3, 30 80% 55%))",
  "hsl(var(--chart-4, 280 65% 60%))",
  "hsl(var(--chart-5, 340 75% 55%))",
];

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
  /** Chart config for labels/icons */
  config?: ChartConfig;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Standalone BarChart component.
 * Uses data from props or LiveValue context.
 * Responsive: adjusts legend, grid, and tick density based on container size.
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
  colors = DEFAULT_COLORS,
  config: propConfig,
  className,
}: BarChartProps) {
  const ctx = useLiveValueData();
  const data = propData ?? ctx?.data ?? [];
  const { containerRef, responsive } = useContainerSize();

  // Auto-detect keys if not provided
  const resolvedXKey = useMemo(() => {
    if (xKey) return xKey;
    if (data.length === 0) return "x";
    const keys = Object.keys(data[0]);
    return keys[0] ?? "x";
  }, [xKey, data]);

  const resolvedYKeys = useMemo(() => {
    const keys = Array.isArray(yKey) ? yKey : [yKey];
    if (keys.length > 0 && keys[0] !== "value") return keys;
    if (data.length === 0) return ["value"];
    const allKeys = Object.keys(data[0]);
    const yKeys = allKeys.filter((k) => k !== resolvedXKey);
    return yKeys.length > 0 ? yKeys : ["value"];
  }, [yKey, data, resolvedXKey]);

  // Build chart config from keys and colors
  const chartConfig = useMemo<ChartConfig>(() => {
    if (propConfig) return propConfig;
    const config: ChartConfig = {};
    resolvedYKeys.forEach((key, i) => {
      config[key] = {
        label: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " "),
        color: colors[i % colors.length],
      };
    });
    return config;
  }, [propConfig, resolvedYKeys, colors]);

  // Responsive: combine user prefs with container size
  const effectiveShowLegend = showLegend && responsive.showLegend;
  const effectiveShowGrid = showGrid && responsive.showGrid;

  if (ctx?.isLoading) {
    return (
      <div
        ref={containerRef}
        className={`w-full flex items-center justify-center bg-muted/30 rounded-lg animate-pulse ${className ?? ""}`}
        style={{ height }}
      >
        <span className="text-muted-foreground text-sm">Loading chart...</span>
      </div>
    );
  }

  if (ctx?.error) {
    return (
      <div
        ref={containerRef}
        className={`w-full flex items-center justify-center bg-destructive/10 rounded-lg ${className ?? ""}`}
        style={{ height }}
      >
        <span className="text-destructive text-sm">Error loading data</span>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div
        ref={containerRef}
        className={`w-full flex items-center justify-center bg-muted/30 rounded-lg ${className ?? ""}`}
        style={{ height }}
      >
        <span className="text-muted-foreground text-sm">No data</span>
      </div>
    );
  }

  const isHorizontal = layout === "horizontal";

  return (
    <div ref={containerRef} className="w-full">
      <ChartContainer config={chartConfig} className={className} style={{ height, width: "100%" }}>
        <RechartsBarChart
          data={data as object[]}
          layout={isHorizontal ? "vertical" : "horizontal"}
          accessibilityLayer
          margin={responsive.margins}
        >
          {effectiveShowGrid && <CartesianGrid vertical={false} />}
          {isHorizontal ? (
            <>
              <YAxis
                dataKey={resolvedXKey}
                type="category"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={responsive.showAxisLabels ? undefined : false}
                width={responsive.isSmall ? 60 : 80}
              />
              <XAxis
                type="number"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={responsive.showAxisLabels ? undefined : false}
              />
            </>
          ) : (
            <>
              <XAxis
                dataKey={resolvedXKey}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={responsive.showAxisLabels ? undefined : false}
                interval="preserveStartEnd"
                minTickGap={responsive.isSmall ? 30 : 20}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={responsive.showAxisLabels ? undefined : false}
                width={responsive.isSmall ? 30 : 40}
              />
            </>
          )}
          {showTooltip && <ChartTooltip content={<ChartTooltipContent />} />}
          {effectiveShowLegend && <ChartLegend content={<ChartLegendContent />} />}
          {resolvedYKeys.map((key) => (
            <Bar
              key={key}
              dataKey={key}
              fill={`var(--color-${key})`}
              stackId={stacked ? "stack" : undefined}
              radius={responsive.isCompact ? [2, 2, 0, 0] : [4, 4, 0, 0]}
            />
          ))}
        </RechartsBarChart>
      </ChartContainer>
    </div>
  );
}

// ============================================================================
// Plate Plugin
// ============================================================================

function BarChartElement(props: PlateElementProps) {
  const element = useElement<TBarChartElement>();
  const selected = useSelected();

  return (
    <PlateElement
      {...props}
      as="div"
      className="my-2"
    >
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
      />
      <span className="hidden">{props.children}</span>
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
    children: [{ text: "" }],
  };
}

export { BAR_CHART_KEY };
