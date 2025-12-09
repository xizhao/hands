import * as React from "react";
import { cn } from "@/lib/utils";

export interface LineChartProps<T extends Record<string, unknown>> {
  data: T[];
  x: keyof T;
  y: keyof T;
  className?: string;
  height?: number;
  color?: string;
  showArea?: boolean;
  showDots?: boolean;
  formatX?: (value: unknown) => string;
  formatY?: (value: number) => string;
}

export function LineChart<T extends Record<string, unknown>>({
  data,
  x,
  y,
  className,
  height = 200,
  color = "hsl(var(--primary))",
  showArea = false,
  showDots = true,
  formatX = (v) => String(v),
  formatY = (v) => v.toLocaleString(),
}: LineChartProps<T>) {
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
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const padding = { top: 20, right: 20, bottom: 30, left: 50 };
  const width = 400;
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const points = data.map((d, i) => ({
    x: padding.left + (i / (data.length - 1 || 1)) * chartWidth,
    y: padding.top + chartHeight - ((Number(d[y]) || 0) - min) / range * chartHeight,
    label: formatX(d[x]),
    value: Number(d[y]) || 0,
  }));

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  const areaPath = `${linePath} L ${points[points.length - 1].x} ${padding.top + chartHeight} L ${padding.left} ${padding.top + chartHeight} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("w-full", className)}
      style={{ height }}
    >
      {/* Y axis labels */}
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
        {formatY(min)}
      </text>

      {/* Grid lines */}
      <line
        x1={padding.left}
        y1={padding.top}
        x2={padding.left + chartWidth}
        y2={padding.top}
        stroke="currentColor"
        strokeOpacity={0.1}
      />
      <line
        x1={padding.left}
        y1={padding.top + chartHeight / 2}
        x2={padding.left + chartWidth}
        y2={padding.top + chartHeight / 2}
        stroke="currentColor"
        strokeOpacity={0.1}
      />
      <line
        x1={padding.left}
        y1={padding.top + chartHeight}
        x2={padding.left + chartWidth}
        y2={padding.top + chartHeight}
        stroke="currentColor"
        strokeOpacity={0.1}
      />

      {/* Area fill */}
      {showArea && (
        <path d={areaPath} fill={color} fillOpacity={0.1} />
      )}

      {/* Line */}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Dots */}
      {showDots &&
        points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={3}
            fill={color}
          />
        ))}

      {/* X axis labels (first and last) */}
      {points.length > 0 && (
        <>
          <text
            x={points[0].x}
            y={height - 8}
            textAnchor="start"
            className="fill-muted-foreground text-[10px]"
          >
            {points[0].label}
          </text>
          <text
            x={points[points.length - 1].x}
            y={height - 8}
            textAnchor="end"
            className="fill-muted-foreground text-[10px]"
          >
            {points[points.length - 1].label}
          </text>
        </>
      )}
    </svg>
  );
}
