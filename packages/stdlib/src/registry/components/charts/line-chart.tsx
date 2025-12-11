/** @jsxImportSource react */
"use client"

import * as React from "react"
import { Line, LineChart as RechartsLineChart, CartesianGrid, XAxis, YAxis, Area } from "recharts"
import { cn } from "../../../lib/utils.js"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "../ui/chart.js"

export interface LineChartProps<T extends Record<string, unknown>> {
  /** Data array to visualize */
  data: T[]
  /** X-axis key (category/label) */
  x?: keyof T
  /** Y-axis key(s) - can be single key or array for multi-series */
  y?: keyof T | (keyof T)[]
  /** Alias for x */
  xKey?: keyof T
  /** Alias for y */
  yKey?: keyof T | (keyof T)[]
  /** Additional CSS classes */
  className?: string
  /** Chart height in pixels */
  height?: number
  /** Primary color for single series */
  color?: string
  /** Colors for multiple series */
  colors?: string[]
  /** Show area fill under line */
  showArea?: boolean
  /** Show dots on data points */
  showDots?: boolean
  /** Show grid lines */
  showGrid?: boolean
  /** Show X axis */
  showXAxis?: boolean
  /** Show Y axis */
  showYAxis?: boolean
  /** Show tooltip on hover */
  showTooltip?: boolean
  /** Show legend */
  showLegend?: boolean
  /** Line curve type */
  curveType?: "linear" | "monotone" | "step" | "natural"
  /** Line stroke width */
  strokeWidth?: number
  /** Dot radius */
  dotRadius?: number
  /** Custom chart config for theming */
  chartConfig?: ChartConfig
  /** Format function for X axis labels */
  formatX?: (value: unknown) => string
  /** Format function for Y axis values */
  formatY?: (value: number) => string
  /** Chart title */
  title?: string
}

export function LineChart<T extends Record<string, unknown>>({
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
  showArea = false,
  showDots = true,
  showGrid = true,
  showXAxis = true,
  showYAxis = true,
  showTooltip = true,
  showLegend = false,
  curveType = "monotone",
  strokeWidth = 2,
  dotRadius = 4,
  chartConfig: externalConfig,
  formatX,
  formatY,
  title,
}: LineChartProps<T>) {
  // Support both x/y and xKey/yKey prop names
  const xAxisKey = (xProp ?? xKey ?? "x") as string
  const yAxisKeys = React.useMemo(() => {
    const yValue = yProp ?? yKey ?? "y"
    return Array.isArray(yValue) ? yValue.map(String) : [String(yValue)]
  }, [yProp, yKey])

  // Build chart config from y keys
  const chartConfig = React.useMemo<ChartConfig>(() => {
    if (externalConfig) return externalConfig

    const config: ChartConfig = {}
    yAxisKeys.forEach((key, index) => {
      config[key] = {
        label: key.charAt(0).toUpperCase() + key.slice(1),
        color: yAxisKeys.length === 1 ? color : colors[index % colors.length],
      }
    })
    return config
  }, [externalConfig, yAxisKeys, color, colors])

  if (!data || data.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center text-muted-foreground rounded-lg border border-dashed",
          className
        )}
        style={{ height }}
      >
        No data available
      </div>
    )
  }

  return (
    <div className={cn("w-full", className)}>
      {title && (
        <h3 className="text-sm font-medium mb-2 text-foreground">{title}</h3>
      )}
      <ChartContainer config={chartConfig} className={cn("min-h-[200px] w-full")} style={{ height }}>
        <RechartsLineChart
          data={data}
          margin={{ top: 10, right: 10, left: 10, bottom: 10 }}
        >
          {showGrid && (
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
          )}

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
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={formatY}
            />
          )}

          {showTooltip && (
            <ChartTooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={<ChartTooltipContent />}
            />
          )}

          {showLegend && (
            <ChartLegend content={<ChartLegendContent />} />
          )}

          {yAxisKeys.map((key, index) => {
            const lineColor = chartConfig[key]?.color || colors[index % colors.length]
            return (
              <React.Fragment key={key}>
                {showArea && (
                  <defs>
                    <linearGradient id={`fill-${key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={lineColor} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={lineColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                )}
                <Line
                  dataKey={key}
                  type={curveType}
                  stroke={lineColor}
                  strokeWidth={strokeWidth}
                  dot={showDots ? { r: dotRadius, fill: lineColor } : false}
                  activeDot={showDots ? { r: dotRadius + 2 } : false}
                  fill={showArea ? `url(#fill-${key})` : "none"}
                />
              </React.Fragment>
            )
          })}
        </RechartsLineChart>
      </ChartContainer>
    </div>
  )
}

export default LineChart
