"use client";

/**
 * @component Metric
 * @category static
 * @description KPI display for showing a single metric value with optional label and change indicator.
 * Perfect for dashboards showing counts, percentages, or any key performance indicator.
 * Can consume data from parent LiveValue context or use direct value prop.
 * @keywords metric, kpi, number, stat, dashboard, counter, value, indicator
 * @example
 * // Standalone with direct value
 * <Metric label="Total Users" value={1234} />
 * <Metric label="Revenue" value={50000} prefix="$" change={12.5} />
 *
 * // With LiveValue data context (value comes from query)
 * <LiveValue query="SELECT SUM(amount) as value FROM orders">
 *   <Metric label="Total Revenue" prefix="$" />
 * </LiveValue>
 */

import {
  createPlatePlugin,
  PlateElement,
  type PlateElementProps,
  useElement,
  useSelected,
} from "platejs/react";
import { memo, useMemo } from "react";

import { METRIC_KEY, type TMetricElement } from "../../types";
import { formatValue as d3FormatValue, detectFormat } from "../lib/format";
import { useLiveValueData, type LiveValueContextData } from "./charts/context";

// ============================================================================
// Standalone Component
// ============================================================================

export interface MetricProps {
  /** The metric value to display */
  value: number | string;
  /** Label describing the metric */
  label?: string;
  /** Prefix before the value (e.g., "$") */
  prefix?: string;
  /** Suffix after the value (e.g., "%") */
  suffix?: string;
  /** Change value (positive/negative) */
  change?: number;
  /** Label for the change (e.g., "vs last month") */
  changeLabel?: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /**
   * Format string (d3-format).
   * Auto-detected from context column name if not provided.
   */
  format?: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Format a number for display.
 * Uses d3-format if provided, otherwise falls back to toLocaleString.
 */
function formatMetricValue(value: number | string, format?: string): string {
  if (typeof value === "string") return value;
  if (format) {
    return d3FormatValue(value, format);
  }
  return value.toLocaleString();
}

/**
 * Check if value is a template placeholder like {{value}}
 */
function isTemplatePlaceholder(value: unknown): boolean {
  return typeof value === "string" && /^\{\{.+\}\}$/.test(value);
}

/**
 * Extract value from LiveValue context data.
 * Looks for 'value' key first, then falls back to first column of first row.
 */
function extractValueFromContextData(data: Record<string, unknown>[]): number | string | undefined {
  if (!data || data.length === 0) return undefined;
  const row = data[0];
  // Look for explicit 'value' key first
  if ("value" in row) {
    const v = row.value;
    if (typeof v === "number" || typeof v === "string") return v;
  }
  // Fall back to first column
  const keys = Object.keys(row);
  if (keys.length > 0) {
    const v = row[keys[0]];
    if (typeof v === "number" || typeof v === "string") return v;
  }
  return undefined;
}

/**
 * Standalone Metric component for use outside Plate editor.
 * Can consume data from parent LiveValue context or use direct value prop.
 */
export function Metric({
  value: propValue,
  label,
  prefix,
  suffix,
  change,
  changeLabel,
  size = "md",
  format: propFormat,
  className,
}: MetricProps) {
  // Get data from LiveValue context if available
  const ctx = useLiveValueData();

  // Resolve value: if prop is a template placeholder or undefined, extract from context
  const resolvedValue = useMemo(() => {
    if (propValue !== undefined && !isTemplatePlaceholder(propValue)) {
      return propValue;
    }
    if (ctx?.data) {
      return extractValueFromContextData(ctx.data) ?? "—";
    }
    return "—";
  }, [propValue, ctx?.data]);

  // Auto-detect format if not provided and we have context data
  const resolvedFormat = useMemo(() => {
    if (propFormat) return propFormat;
    if (!ctx?.data || ctx.data.length === 0) return undefined;

    // Try to detect format from the column used for value
    const row = ctx.data[0];
    const key = "value" in row ? "value" : Object.keys(row)[0];
    if (!key) return undefined;

    const values = ctx.data.map((d) => d[key]);
    return detectFormat(key, values) ?? undefined;
  }, [propFormat, ctx?.data]);

  const sizeClasses = {
    sm: { value: "text-xl font-semibold", label: "text-xs", change: "text-xs" },
    md: { value: "text-3xl font-bold", label: "text-sm", change: "text-sm" },
    lg: { value: "text-5xl font-bold", label: "text-base", change: "text-sm" },
  };

  const classes = sizeClasses[size];

  return (
    <div className={`flex flex-col ${className || ""}`}>
      {label && <span className={`text-muted-foreground ${classes.label}`}>{label}</span>}
      <span className={`tabular-nums ${classes.value}`}>
        {prefix}
        {formatMetricValue(resolvedValue, resolvedFormat)}
        {suffix}
      </span>
      {change !== undefined && (
        <span
          className={`flex items-center gap-1 ${classes.change} ${
            change > 0 ? "text-success" : change < 0 ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {change > 0 ? "+" : ""}
          {change.toFixed(1)}%
          {changeLabel && <span className="text-muted-foreground">{changeLabel}</span>}
        </span>
      )}
    </div>
  );
}

// ============================================================================
// Plate Plugin
// ============================================================================

function MetricElement(props: PlateElementProps) {
  const element = useElement<TMetricElement>();
  const _selected = useSelected();
  const liveValueCtx = useLiveValueData();

  const { value, label, prefix, suffix, change, changeLabel, size, format } = element;

  // Show loading state when inside LiveValue and loading
  const isLoading = liveValueCtx?.isLoading ?? false;
  const error = liveValueCtx?.error ?? null;

  return (
    <PlateElement {...props} as="div" className="inline-block my-2">
      {isLoading ? (
        <div className="animate-pulse">
          <Metric value="..." label={label} prefix={prefix} suffix={suffix} size={size} />
        </div>
      ) : error ? (
        <Metric value="Error" label={label} size={size} className="text-destructive" />
      ) : (
        <Metric
          value={value ?? "—"}
          label={label}
          prefix={prefix}
          suffix={suffix}
          change={change}
          changeLabel={changeLabel}
          size={size}
          format={format}
        />
      )}
      <span className="hidden">{props.children}</span>
    </PlateElement>
  );
}

/**
 * Metric Plugin - KPI display for dashboards.
 */
export const MetricPlugin = createPlatePlugin({
  key: METRIC_KEY,
  node: {
    isElement: true,
    isInline: false,
    isVoid: true,
    component: memo(MetricElement),
  },
});

// ============================================================================
// Element Factory
// ============================================================================

/**
 * Create a Metric element for insertion into editor.
 */
export function createMetricElement(
  value: number | string,
  options?: {
    label?: string;
    prefix?: string;
    suffix?: string;
    change?: number;
    changeLabel?: string;
    size?: "sm" | "md" | "lg";
    format?: string;
  },
): TMetricElement {
  return {
    type: METRIC_KEY,
    value,
    label: options?.label,
    prefix: options?.prefix,
    suffix: options?.suffix,
    change: options?.change,
    changeLabel: options?.changeLabel,
    size: options?.size,
    format: options?.format,
    children: [{ text: "" }],
  };
}

export { METRIC_KEY };
