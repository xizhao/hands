/**
 * Chart Block - Renders data visualizations
 *
 * Note: This renders a lightweight SVG chart for SSR.
 * For interactive charts, the client can hydrate with a charting library.
 */
import * as React from "react";

export type ChartType = "line" | "bar" | "pie" | "area";

export interface ChartBlockProps {
  type: ChartType;
  data: Array<{ label: string; value: number }>;
  title?: string;
  xAxis?: string;
  yAxis?: string;
  color?: string;
}

export function ChartBlock({
  type,
  data,
  title,
  xAxis,
  yAxis,
  color = "#3b82f6",
}: ChartBlockProps) {
  if (!data || data.length === 0) {
    return (
      <div className="p-4 rounded-lg border border-border bg-muted/50">
        <p className="text-muted-foreground text-sm">No chart data</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {title && (
        <div className="px-4 py-2 bg-muted/50 border-b border-border">
          <h3 className="text-sm font-medium">{title}</h3>
        </div>
      )}
      <div className="p-4">
        {type === "bar" && (
          <BarChart data={data} color={color} xAxis={xAxis} yAxis={yAxis} />
        )}
        {type === "line" && (
          <LineChart data={data} color={color} xAxis={xAxis} yAxis={yAxis} />
        )}
        {type === "pie" && <PieChart data={data} />}
        {type === "area" && (
          <AreaChart data={data} color={color} xAxis={xAxis} yAxis={yAxis} />
        )}
      </div>
    </div>
  );
}

interface ChartProps {
  data: Array<{ label: string; value: number }>;
  color: string;
  xAxis?: string;
  yAxis?: string;
}

function BarChart({ data, color }: ChartProps) {
  const max = Math.max(...data.map((d) => d.value));
  const barWidth = Math.max(20, Math.min(60, 300 / data.length));

  return (
    <svg
      viewBox={`0 0 ${data.length * (barWidth + 10) + 40} 200`}
      className="w-full h-48"
    >
      {data.map((d, i) => {
        const height = (d.value / max) * 150;
        const x = i * (barWidth + 10) + 30;
        const y = 180 - height;
        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={height}
              fill={color}
              rx={2}
            />
            <text
              x={x + barWidth / 2}
              y={195}
              textAnchor="middle"
              className="text-[10px] fill-muted-foreground"
            >
              {truncateLabel(d.label, 8)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function LineChart({ data, color }: ChartProps) {
  const max = Math.max(...data.map((d) => d.value));
  const width = 400;
  const height = 200;
  const padding = 30;

  const points = data.map((d, i) => {
    const x = padding + (i / (data.length - 1)) * (width - 2 * padding);
    const y = height - padding - (d.value / max) * (height - 2 * padding);
    return `${x},${y}`;
  });

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-48">
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={2}
      />
      {data.map((d, i) => {
        const x = padding + (i / (data.length - 1)) * (width - 2 * padding);
        const y = height - padding - (d.value / max) * (height - 2 * padding);
        return (
          <circle key={i} cx={x} cy={y} r={4} fill={color} />
        );
      })}
    </svg>
  );
}

function AreaChart({ data, color }: ChartProps) {
  const max = Math.max(...data.map((d) => d.value));
  const width = 400;
  const height = 200;
  const padding = 30;

  const points = data.map((d, i) => {
    const x = padding + (i / (data.length - 1)) * (width - 2 * padding);
    const y = height - padding - (d.value / max) * (height - 2 * padding);
    return `${x},${y}`;
  });

  const areaPath =
    `M${padding},${height - padding} ` +
    points.join(" L") +
    ` L${width - padding},${height - padding} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-48">
      <path d={areaPath} fill={color} fillOpacity={0.2} />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={2}
      />
    </svg>
  );
}

function PieChart({ data }: { data: Array<{ label: string; value: number }> }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const colors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];
  let currentAngle = 0;

  return (
    <svg viewBox="0 0 200 200" className="w-48 h-48 mx-auto">
      {data.map((d, i) => {
        const angle = (d.value / total) * 360;
        const startAngle = currentAngle;
        const endAngle = currentAngle + angle;
        currentAngle = endAngle;

        const startRad = ((startAngle - 90) * Math.PI) / 180;
        const endRad = ((endAngle - 90) * Math.PI) / 180;

        const x1 = 100 + 80 * Math.cos(startRad);
        const y1 = 100 + 80 * Math.sin(startRad);
        const x2 = 100 + 80 * Math.cos(endRad);
        const y2 = 100 + 80 * Math.sin(endRad);

        const largeArc = angle > 180 ? 1 : 0;

        return (
          <path
            key={i}
            d={`M100,100 L${x1},${y1} A80,80 0 ${largeArc},1 ${x2},${y2} Z`}
            fill={colors[i % colors.length]}
          />
        );
      })}
    </svg>
  );
}

function truncateLabel(label: string, maxLen: number): string {
  if (label.length <= maxLen) return label;
  return label.slice(0, maxLen - 1) + "...";
}
