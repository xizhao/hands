/** @jsxImportSource react */
import * as React from "react";
import { cn } from "@/lib/utils";

export interface BarChartProps<T extends Record<string, unknown>> {
  data: T[];
  x: keyof T;
  y: keyof T;
  className?: string;
  height?: number;
  color?: string;
  horizontal?: boolean;
  formatX?: (value: unknown) => string;
  formatY?: (value: number) => string;
}

export function BarChart<T extends Record<string, unknown>>({
  data,
  x,
  y,
  className,
  height = 200,
  color = "hsl(var(--primary))",
  horizontal = false,
  formatX = (v) => String(v),
  formatY = (v) => v.toLocaleString(),
}: BarChartProps<T>) {
  if (data.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center text-muted-foreground",
          className
        )}
        style={{ height }}
      >
        No data
      </div>
    );
  }

  const values = data.map((d) => Number(d[y]) || 0);
  const max = Math.max(...values);

  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  const width = 400;
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const barWidth = chartWidth / data.length * 0.7;
  const barGap = chartWidth / data.length * 0.15;

  const bars = data.map((d, i) => {
    const value = Number(d[y]) || 0;
    const barHeight = (value / max) * chartHeight;
    return {
      x: padding.left + i * (chartWidth / data.length) + barGap,
      y: padding.top + chartHeight - barHeight,
      width: barWidth,
      height: barHeight,
      label: formatX(d[x]),
      value,
    };
  });

  if (horizontal) {
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={cn("w-full", className)}
        style={{ height }}
      >
        {bars.map((bar, i) => {
          const barHeight = chartHeight / data.length * 0.7;
          const barY = padding.top + i * (chartHeight / data.length) + chartHeight / data.length * 0.15;
          const barWidth = (bar.value / max) * chartWidth;
          return (
            <g key={i}>
              <rect
                x={padding.left}
                y={barY}
                width={barWidth}
                height={barHeight}
                fill={color}
                rx={2}
              />
              <text
                x={padding.left - 8}
                y={barY + barHeight / 2}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-muted-foreground text-[10px]"
              >
                {bar.label}
              </text>
              <text
                x={padding.left + barWidth + 4}
                y={barY + barHeight / 2}
                dominantBaseline="middle"
                className="fill-foreground text-[10px]"
              >
                {formatY(bar.value)}
              </text>
            </g>
          );
        })}
      </svg>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("w-full", className)}
      style={{ height }}
    >
      {/* Y axis */}
      <text
        x={padding.left - 8}
        y={padding.top}
        textAnchor="end"
        className="fill-muted-foreground text-[10px]"
      >
        {formatY(max)}
      </text>
      <text
        x={padding.left - 8}
        y={padding.top + chartHeight}
        textAnchor="end"
        className="fill-muted-foreground text-[10px]"
      >
        0
      </text>

      {/* Grid line */}
      <line
        x1={padding.left}
        y1={padding.top + chartHeight}
        x2={padding.left + chartWidth}
        y2={padding.top + chartHeight}
        stroke="currentColor"
        strokeOpacity={0.1}
      />

      {/* Bars */}
      {bars.map((bar, i) => (
        <g key={i}>
          <rect
            x={bar.x}
            y={bar.y}
            width={bar.width}
            height={bar.height}
            fill={color}
            rx={2}
          />
          <text
            x={bar.x + bar.width / 2}
            y={height - 8}
            textAnchor="middle"
            className="fill-muted-foreground text-[10px]"
          >
            {bar.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
