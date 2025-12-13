/**
 * @component bar-chart
 * @name Bar Chart
 * @category charts
 * @description Compare values across categories with vertical or horizontal bars.
 * @icon bar-chart-2
 * @keywords bar, chart, graph, comparison, data
 * @example
 * <BarChart
 *   data={[
 *     { month: "Jan", sales: 4200 },
 *     { month: "Feb", sales: 3800 },
 *     { month: "Mar", sales: 5100 },
 *   ]}
 *   x="month"
 *   y="sales"
 *   height={300}
 * />
 */
/** @jsxImportSource react */
"use client";

import * as React from "react";
import { Bar, CartesianGrid, BarChart as RechartsBarChart, XAxis, YAxis } from "recharts";
import { cn } from "../../../lib/utils.js";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "../ui/chart.js";

export interface BarChartProps<T extends Record<string, unknown>> {
  /** Data array to visualize */
  data: T[];
  /** X-axis key (category/label) */
  x?: keyof T;
  /** Y-axis key(s) - can be single key or array for multi-series */
  y?: keyof T | (keyof T)[];
  /** Alias for x */
  xKey?: keyof T;
  /** Alias for y */
  yKey?: keyof T | (keyof T)[];
  /** Additional CSS classes */
  className?: string;
  /** Chart height in pixels */
  height?: number;
  /** Primary color for single series */
  color?: string;
  /** Colors for multiple series */
  colors?: string[];
  /** Horizontal bar chart */
  horizontal?: boolean;
  /** Show grid lines */
  showGrid?: boolean;
  /** Show X axis */
  showXAxis?: boolean;
  /** Show Y axis */
  showYAxis?: boolean;
  /** Show tooltip on hover */
  showTooltip?: boolean;
  /** Show legend */
  showLegend?: boolean;
  /** Bar radius for rounded corners */
  radius?: number;
  /** Custom chart config for theming */
  chartConfig?: ChartConfig;
  /** Format function for X axis labels */
  formatX?: (value: unknown) => string;
  /** Format function for Y axis values */
  formatY?: (value: number) => string;
  /** Chart title */
  title?: string;
}

export function BarChart<T extends Record<string, unknown>>({
  data,
  x: xProp,
  y: yProp,
  xKey,
  yKey,
  className,
  height = 300,
  color = "hsl(var(--primary))",
  colors = [
    "hsl(var(--chart-1, var(--primary)))",
    "hsl(var(--chart-2, 220 70% 50%))",
    "hsl(var(--chart-3, 160 60% 45%))",
    "hsl(var(--chart-4, 30 80% 55%))",
    "hsl(var(--chart-5, 280 65% 60%))",
  ],
  horizontal = false,
  showGrid = true,
  showXAxis = true,
  showYAxis = true,
  showTooltip = true,
  showLegend = false,
  radius = 4,
  chartConfig: externalConfig,
  formatX,
  formatY,
  title,
}: BarChartProps<T>) {
  // Support both x/y and xKey/yKey prop names
  const xAxisKey = (xProp ?? xKey ?? "x") as string;
  const yAxisKeys = React.useMemo(() => {
    const yValue = yProp ?? yKey ?? "y";
    return Array.isArray(yValue) ? yValue.map(String) : [String(yValue)];
  }, [yProp, yKey]);

  // Build chart config from y keys
  const chartConfig = React.useMemo<ChartConfig>(() => {
    if (externalConfig) return externalConfig;

    const config: ChartConfig = {};
    yAxisKeys.forEach((key, index) => {
      config[key] = {
        label: key.charAt(0).toUpperCase() + key.slice(1),
        color: yAxisKeys.length === 1 ? color : colors[index % colors.length],
      };
    });
    return config;
  }, [externalConfig, yAxisKeys, color, colors]);

  // Defensive check - data must be an array
  if (!Array.isArray(data)) {
    console.warn("[BarChart] data prop is not an array:", typeof data, data);
    return (
      <div
        className={cn(
          "flex items-center justify-center text-muted-foreground rounded-lg border border-dashed",
          className,
        )}
        style={{ height }}
      >
        Invalid data: expected array, got {typeof data}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center text-muted-foreground rounded-lg border border-dashed",
          className,
        )}
        style={{ height }}
      >
        No data available
      </div>
    );
  }

  return (
    <div className={cn("w-full", className)}>
      {title && <h3 className="text-sm font-medium mb-2 text-foreground">{title}</h3>}
      <ChartContainer
        config={chartConfig}
        className={cn("min-h-[200px] w-full")}
        style={{ height }}
      >
        <RechartsBarChart
          data={data}
          layout={horizontal ? "vertical" : "horizontal"}
          margin={{ top: 10, right: 10, left: 10, bottom: 10 }}
        >
          {showGrid && (
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={!horizontal}
              horizontal={horizontal || true}
            />
          )}

          {horizontal ? (
            <>
              {showYAxis && (
                <YAxis
                  dataKey={xAxisKey}
                  type="category"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={formatX}
                  width={80}
                />
              )}
              {showXAxis && (
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={formatY}
                />
              )}
            </>
          ) : (
            <>
              {showXAxis && (
                <XAxis
                  dataKey={xAxisKey}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={formatX}
                />
              )}
              {showYAxis && (
                <YAxis tickLine={false} axisLine={false} tickMargin={8} tickFormatter={formatY} />
              )}
            </>
          )}

          {showTooltip && (
            <ChartTooltip
              cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }}
              content={<ChartTooltipContent />}
            />
          )}

          {showLegend && <ChartLegend content={<ChartLegendContent />} />}

          {yAxisKeys.map((key, index) => (
            <Bar
              key={key}
              dataKey={key}
              fill={chartConfig[key]?.color || colors[index % colors.length]}
              radius={radius}
            />
          ))}
        </RechartsBarChart>
      </ChartContainer>
    </div>
  );
}

export default BarChart;
