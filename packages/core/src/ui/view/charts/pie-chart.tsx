"use client";

/**
 * @component PieChart
 * @category static
 * @description Pie/donut chart for showing proportional data.
 * Set innerRadius > 0 to create a donut chart.
 * @keywords chart, pie, donut, proportion, percentage, visualization
 * @example
 * <PieChart data={data} valueKey="count" nameKey="category" />
 * <PieChart data={data} valueKey="amount" nameKey="type" innerRadius={60} />
 */

import {
  createPlatePlugin,
  PlateElement,
  type PlateElementProps,
  useElement,
  useSelected,
} from "platejs/react";
import { memo, useMemo } from "react";
import { Cell, Pie, PieChart as RechartsPieChart, Label } from "recharts";

import { PIE_CHART_KEY, type TPieChartElement } from "../../../types";
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
  "hsl(var(--chart-6, 200 65% 55%))",
  "hsl(var(--chart-7, 120 55% 45%))",
  "hsl(var(--chart-8, 45 85% 55%))",
];

// ============================================================================
// Standalone Component
// ============================================================================

export interface PieChartProps {
  /** Chart data array */
  data?: Record<string, unknown>[];
  /** Data key for slice values */
  valueKey?: string;
  /** Data key for slice labels */
  nameKey?: string;
  /** Chart height in pixels */
  height?: number;
  /** Inner radius for donut chart (0 = pie, >0 = donut) */
  innerRadius?: number;
  /** Show legend */
  showLegend?: boolean;
  /** Show labels on slices */
  showLabels?: boolean;
  /** Custom colors */
  colors?: string[];
  /** Chart config for labels/icons */
  config?: ChartConfig;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Standalone PieChart component.
 * Uses data from props or LiveValue context.
 */
export function PieChart({
  data: propData,
  valueKey,
  nameKey,
  height = 300,
  innerRadius = 0,
  showLegend = true,
  showLabels = false,
  colors = DEFAULT_COLORS,
  config: propConfig,
  className,
}: PieChartProps) {
  const ctx = useLiveValueData();
  const data = propData ?? ctx?.data ?? [];

  // Auto-detect keys if not provided
  const resolvedKeys = useMemo(() => {
    if (data.length === 0) {
      return { valueKey: "value", nameKey: "name" };
    }
    const keys = Object.keys(data[0]);
    // Try to find a numeric key for value
    const numericKey = keys.find((k) => {
      const sample = data[0][k];
      return typeof sample === "number";
    });
    // Try to find a string key for name
    const stringKey = keys.find((k) => {
      const sample = data[0][k];
      return typeof sample === "string";
    });

    return {
      valueKey: valueKey ?? numericKey ?? keys[1] ?? "value",
      nameKey: nameKey ?? stringKey ?? keys[0] ?? "name",
    };
  }, [valueKey, nameKey, data]);

  // Build chart config from data
  const chartConfig = useMemo<ChartConfig>(() => {
    if (propConfig) return propConfig;
    const config: ChartConfig = {};
    data.forEach((item, i) => {
      const name = String(item[resolvedKeys.nameKey] ?? `Item ${i}`);
      config[name] = {
        label: name,
        color: colors[i % colors.length],
      };
    });
    return config;
  }, [propConfig, data, resolvedKeys.nameKey, colors]);

  // Calculate total for center label
  const total = useMemo(() => {
    return data.reduce((sum, item) => {
      const val = item[resolvedKeys.valueKey];
      return sum + (typeof val === "number" ? val : 0);
    }, 0);
  }, [data, resolvedKeys.valueKey]);

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

  const outerRadius = Math.min(height / 2 - 40, 120);

  return (
    <ChartContainer config={chartConfig} className={`mx-auto ${className ?? ""}`} style={{ height }}>
      <RechartsPieChart accessibilityLayer>
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        <Pie
          data={data as Record<string, unknown>[]}
          dataKey={resolvedKeys.valueKey}
          nameKey={resolvedKeys.nameKey}
          cx="50%"
          cy="50%"
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          paddingAngle={2}
          label={
            showLabels
              ? ({ name, percent }: { name?: string; percent?: number }) =>
                  `${name ?? ""} (${((percent ?? 0) * 100).toFixed(0)}%)`
              : undefined
          }
          labelLine={showLabels}
        >
          {data.map((entry, index) => {
            const name = String(entry[resolvedKeys.nameKey] ?? `Item ${index}`);
            return <Cell key={`cell-${index}`} fill={`var(--color-${name})`} />;
          })}
          {innerRadius > 0 && (
            <Label
              content={({ viewBox }) => {
                if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                  return (
                    <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                      <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-3xl font-bold">
                        {total.toLocaleString()}
                      </tspan>
                      <tspan x={viewBox.cx} y={(viewBox.cy || 0) + 24} className="fill-muted-foreground">
                        Total
                      </tspan>
                    </text>
                  );
                }
              }}
            />
          )}
        </Pie>
        {showLegend && <ChartLegend content={<ChartLegendContent nameKey={resolvedKeys.nameKey} />} />}
      </RechartsPieChart>
    </ChartContainer>
  );
}

// ============================================================================
// Plate Plugin
// ============================================================================

function PieChartElement(props: PlateElementProps) {
  const element = useElement<TPieChartElement>();
  const selected = useSelected();

  return (
    <PlateElement
      {...props}
      as="div"
      className={`my-4 rounded-lg p-2 ${selected ? "ring-2 ring-ring ring-offset-2" : ""}`}
    >
      <PieChart
        valueKey={element.valueKey as string | undefined}
        nameKey={element.nameKey as string | undefined}
        height={(element.height as number | undefined) ?? 300}
        innerRadius={(element.innerRadius as number | undefined) ?? 0}
        showLegend={element.showLegend as boolean | undefined}
        showLabels={element.showLabels as boolean | undefined}
        colors={element.colors as string[] | undefined}
      />
      <span className="hidden">{props.children}</span>
    </PlateElement>
  );
}

/**
 * PieChart Plugin - pie/donut chart visualization.
 */
export const PieChartPlugin = createPlatePlugin({
  key: PIE_CHART_KEY,
  node: {
    isElement: true,
    isInline: true, // Inline in Slate model to allow nesting in LiveValue; visual is still block
    isVoid: true,
    component: memo(PieChartElement),
  },
});

// ============================================================================
// Element Factory
// ============================================================================

export interface CreatePieChartOptions {
  valueKey?: string;
  nameKey?: string;
  height?: number;
  innerRadius?: number;
  showLegend?: boolean;
  showLabels?: boolean;
  colors?: string[];
}

/**
 * Create a PieChart element for insertion into editor.
 */
export function createPieChartElement(options?: CreatePieChartOptions): TPieChartElement {
  return {
    type: PIE_CHART_KEY,
    valueKey: options?.valueKey,
    nameKey: options?.nameKey,
    height: options?.height ?? 300,
    innerRadius: options?.innerRadius ?? 0,
    showLegend: options?.showLegend ?? true,
    showLabels: options?.showLabels ?? false,
    colors: options?.colors,
    children: [{ text: "" }],
  };
}

export { PIE_CHART_KEY };
