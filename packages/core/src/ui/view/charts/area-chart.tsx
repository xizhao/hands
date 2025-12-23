"use client";

/**
 * @component AreaChart
 * @category static
 * @description Area chart for visualizing trends with filled regions.
 * Supports stacking for comparing cumulative values.
 * @keywords chart, area, filled, trend, cumulative, visualization
 * @example
 * <AreaChart data={data} xKey="date" yKey="pageviews" />
 * <AreaChart data={data} xKey="month" yKey={["revenue", "costs"]} stacked />
 */

import {
  createPlatePlugin,
  PlateElement,
  type PlateElementProps,
  useElement,
  useSelected,
} from "platejs/react";
import { memo, useMemo } from "react";
import { Area, AreaChart as RechartsAreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { AREA_CHART_KEY, type TAreaChartElement } from "../../../types";
import {
  ChartContainer,
  type ChartConfig,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "./chart";
import { useLiveValueData } from "./context";

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

export interface AreaChartProps {
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
  /** Stack areas on top of each other */
  stacked?: boolean;
  /** Area fill opacity (0-1) */
  fillOpacity?: number;
  /** Custom colors */
  colors?: string[];
  /** Chart config for labels/icons */
  config?: ChartConfig;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Standalone AreaChart component.
 * Uses data from props or LiveValue context.
 */
export function AreaChart({
  data: propData,
  xKey,
  yKey = "value",
  height = 300,
  showLegend = false,
  showGrid = true,
  showTooltip = true,
  curve = "monotone",
  stacked = false,
  fillOpacity = 0.4,
  colors = DEFAULT_COLORS,
  config: propConfig,
  className,
}: AreaChartProps) {
  const ctx = useLiveValueData();
  const data = propData ?? ctx?.data ?? [];

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

  if (ctx?.isLoading) {
    return (
      <div
        className={`flex items-center justify-center bg-muted/30 rounded-lg animate-pulse ${className ?? ""}`}
        style={{ height }}
      >
        <span className="text-muted-foreground text-sm">Loading chart...</span>
      </div>
    );
  }

  if (ctx?.error) {
    return (
      <div
        className={`flex items-center justify-center bg-destructive/10 rounded-lg ${className ?? ""}`}
        style={{ height }}
      >
        <span className="text-destructive text-sm">Error loading data</span>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div
        className={`flex items-center justify-center bg-muted/30 rounded-lg ${className ?? ""}`}
        style={{ height }}
      >
        <span className="text-muted-foreground text-sm">No data</span>
      </div>
    );
  }

  return (
    <ChartContainer config={chartConfig} className={className} style={{ height }}>
      <RechartsAreaChart data={data as object[]} accessibilityLayer>
        {showGrid && <CartesianGrid vertical={false} />}
        <XAxis dataKey={resolvedXKey} tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} tickMargin={8} />
        {showTooltip && <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />}
        {showLegend && <ChartLegend content={<ChartLegendContent />} />}
        {resolvedYKeys.map((key) => (
          <Area
            key={key}
            type={curveType}
            dataKey={key}
            stroke={`var(--color-${key})`}
            fill={`var(--color-${key})`}
            fillOpacity={fillOpacity}
            stackId={stacked ? "stack" : undefined}
          />
        ))}
      </RechartsAreaChart>
    </ChartContainer>
  );
}

// ============================================================================
// Plate Plugin
// ============================================================================

function AreaChartElement(props: PlateElementProps) {
  const element = useElement<TAreaChartElement>();
  const selected = useSelected();

  return (
    <PlateElement
      {...props}
      as="div"
      className={`my-4 rounded-lg p-2 ${selected ? "ring-1 ring-primary/30 ring-offset-2" : ""}`}
    >
      <AreaChart
        xKey={element.xKey as string | undefined}
        yKey={element.yKey as string | string[] | undefined}
        height={(element.height as number | undefined) ?? 300}
        showLegend={element.showLegend as boolean | undefined}
        showGrid={element.showGrid as boolean | undefined}
        showTooltip={element.showTooltip as boolean | undefined}
        curve={element.curve as "linear" | "monotone" | "step" | undefined}
        stacked={element.stacked as boolean | undefined}
        fillOpacity={(element.fillOpacity as number | undefined) ?? 0.4}
        colors={element.colors as string[] | undefined}
      />
      <span className="hidden">{props.children}</span>
    </PlateElement>
  );
}

/**
 * AreaChart Plugin - area chart visualization.
 */
export const AreaChartPlugin = createPlatePlugin({
  key: AREA_CHART_KEY,
  node: {
    isElement: true,
    isInline: true, // Inline in Slate model to allow nesting in LiveValue; visual is still block
    isVoid: true,
    component: memo(AreaChartElement),
  },
});

// ============================================================================
// Element Factory
// ============================================================================

export interface CreateAreaChartOptions {
  xKey?: string;
  yKey?: string | string[];
  height?: number;
  showLegend?: boolean;
  showGrid?: boolean;
  showTooltip?: boolean;
  curve?: "linear" | "monotone" | "step";
  stacked?: boolean;
  fillOpacity?: number;
  colors?: string[];
}

/**
 * Create an AreaChart element for insertion into editor.
 */
export function createAreaChartElement(options?: CreateAreaChartOptions): TAreaChartElement {
  return {
    type: AREA_CHART_KEY,
    xKey: options?.xKey,
    yKey: options?.yKey,
    height: options?.height ?? 300,
    showLegend: options?.showLegend ?? false,
    showGrid: options?.showGrid ?? true,
    showTooltip: options?.showTooltip ?? true,
    curve: options?.curve ?? "monotone",
    stacked: options?.stacked ?? false,
    fillOpacity: options?.fillOpacity ?? 0.4,
    colors: options?.colors,
    children: [{ text: "" }],
  };
}

export { AREA_CHART_KEY };
