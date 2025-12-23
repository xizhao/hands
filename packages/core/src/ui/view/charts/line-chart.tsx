"use client";

/**
 * @component LineChart
 * @category static
 * @description Line chart for visualizing trends over time or continuous data.
 * Works standalone or inside LiveValue for live SQL data.
 * @keywords chart, line, graph, trend, time series, visualization
 * @example
 * <LineChart data={data} xKey="date" yKey="revenue" />
 * <LineChart data={data} xKey="month" yKey={["sales", "expenses"]} showLegend />
 */

import {
  createPlatePlugin,
  PlateElement,
  type PlateElementProps,
  useElement,
  useSelected,
} from "platejs/react";
import { memo, useMemo } from "react";
import { CartesianGrid, Line, LineChart as RechartsLineChart, XAxis, YAxis } from "recharts";

import { LINE_CHART_KEY, type TLineChartElement } from "../../../types";
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

export interface LineChartProps {
  /** Chart data array */
  data?: Record<string, unknown>[];
  /** Data key for X axis */
  xKey?: string;
  /** Data key(s) for Y axis */
  yKey?: string | string[];
  /** Chart height in pixels */
  height?: number;
  /** Show legend */
  showLegend?: boolean;
  /** Show grid lines */
  showGrid?: boolean;
  /** Show tooltip on hover */
  showTooltip?: boolean;
  /** Curve type */
  curve?: "linear" | "monotone" | "step";
  /** Show dots on data points */
  showDots?: boolean;
  /** Custom colors */
  colors?: string[];
  /** Chart config for labels/icons */
  config?: ChartConfig;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Standalone LineChart component.
 * Uses data from props or LiveValue context.
 * Responsive: adjusts legend, grid, and tick density based on container size.
 */
export function LineChart({
  data: propData,
  xKey,
  yKey = "value",
  height = 300,
  showLegend = false,
  showGrid = true,
  showTooltip = true,
  curve = "monotone",
  showDots = true,
  colors = DEFAULT_COLORS,
  config: propConfig,
  className,
}: LineChartProps) {
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

  const curveType = curve === "linear" ? "linear" : curve === "step" ? "step" : "monotone";

  // Responsive: combine user prefs with container size
  const effectiveShowLegend = showLegend && responsive.showLegend;
  const effectiveShowGrid = showGrid && responsive.showGrid;
  const effectiveShowDots = showDots && !responsive.isCompact;

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

  return (
    <div ref={containerRef} className="w-full">
      <ChartContainer config={chartConfig} className={className} style={{ height, width: "100%" }}>
        <RechartsLineChart
          data={data as object[]}
          accessibilityLayer
          margin={responsive.margins}
        >
          {effectiveShowGrid && <CartesianGrid vertical={false} />}
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
          {showTooltip && <ChartTooltip content={<ChartTooltipContent />} />}
          {effectiveShowLegend && <ChartLegend content={<ChartLegendContent />} />}
          {resolvedYKeys.map((key) => (
            <Line
              key={key}
              type={curveType}
              dataKey={key}
              stroke={`var(--color-${key})`}
              strokeWidth={responsive.isCompact ? 1.5 : 2}
              dot={effectiveShowDots ? { fill: `var(--color-${key})`, r: responsive.isSmall ? 2 : 3 } : false}
              activeDot={{ r: responsive.isSmall ? 4 : 6 }}
            />
          ))}
        </RechartsLineChart>
      </ChartContainer>
    </div>
  );
}

// ============================================================================
// Plate Plugin
// ============================================================================

function LineChartElement(props: PlateElementProps) {
  const element = useElement<TLineChartElement>();
  const selected = useSelected();

  return (
    <PlateElement
      {...props}
      as="div"
      className="my-2"
    >
      <LineChart
        xKey={element.xKey as string | undefined}
        yKey={element.yKey as string | string[] | undefined}
        height={(element.height as number | undefined) ?? 300}
        showLegend={element.showLegend as boolean | undefined}
        showGrid={element.showGrid as boolean | undefined}
        showTooltip={element.showTooltip as boolean | undefined}
        curve={element.curve as "linear" | "monotone" | "step" | undefined}
        showDots={element.showDots as boolean | undefined}
        colors={element.colors as string[] | undefined}
      />
      <span className="hidden">{props.children}</span>
    </PlateElement>
  );
}

/**
 * LineChart Plugin - line chart visualization.
 */
export const LineChartPlugin = createPlatePlugin({
  key: LINE_CHART_KEY,
  node: {
    isElement: true,
    isInline: true, // Inline in Slate model to allow nesting in LiveValue; visual is still block
    isVoid: true,
    component: memo(LineChartElement),
  },
});

// ============================================================================
// Element Factory
// ============================================================================

export interface CreateLineChartOptions {
  xKey?: string;
  yKey?: string | string[];
  height?: number;
  showLegend?: boolean;
  showGrid?: boolean;
  showTooltip?: boolean;
  curve?: "linear" | "monotone" | "step";
  showDots?: boolean;
  colors?: string[];
}

/**
 * Create a LineChart element for insertion into editor.
 */
export function createLineChartElement(options?: CreateLineChartOptions): TLineChartElement {
  return {
    type: LINE_CHART_KEY,
    xKey: options?.xKey,
    yKey: options?.yKey,
    height: options?.height ?? 300,
    showLegend: options?.showLegend ?? false,
    showGrid: options?.showGrid ?? true,
    showTooltip: options?.showTooltip ?? true,
    curve: options?.curve ?? "monotone",
    showDots: options?.showDots ?? true,
    colors: options?.colors,
    children: [{ text: "" }],
  };
}

export { LINE_CHART_KEY };
