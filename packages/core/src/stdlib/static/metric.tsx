"use client";

/**
 * @component Metric
 * @category static
 * @description KPI display for showing a single metric value with optional label and change indicator.
 * Perfect for dashboards showing counts, percentages, or any key performance indicator.
 * @keywords metric, kpi, number, stat, dashboard, counter, value, indicator
 * @example
 * <Metric label="Total Users" value={1234} />
 * <Metric label="Revenue" value={50000} prefix="$" change={12.5} />
 * <Metric label="Error Rate" value={0.5} suffix="%" change={-8} changeLabel="vs last week" />
 */

import {
  createPlatePlugin,
  PlateElement,
  type PlateElementProps,
  useElement,
  useSelected,
} from "platejs/react";
import { memo } from "react";

import { METRIC_KEY, type TMetricElement } from "../../types";

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
  /** Additional CSS classes */
  className?: string;
}

/**
 * Format a number for display (with thousands separators).
 */
function formatValue(value: number | string): string {
  if (typeof value === "string") return value;
  return value.toLocaleString();
}

/**
 * Standalone Metric component for use outside Plate editor.
 */
export function Metric({
  value,
  label,
  prefix,
  suffix,
  change,
  changeLabel,
  size = "md",
  className,
}: MetricProps) {
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
        {formatValue(value)}
        {suffix}
      </span>
      {change !== undefined && (
        <span
          className={`flex items-center gap-1 ${classes.change} ${
            change > 0 ? "text-green-600" : change < 0 ? "text-red-600" : "text-muted-foreground"
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
  const selected = useSelected();

  const { value, label, prefix, suffix, change, changeLabel, size } = element;

  return (
    <PlateElement
      {...props}
      as="div"
      className={`inline-block my-2 rounded-md p-2 ${selected ? "ring-2 ring-ring ring-offset-1" : ""}`}
    >
      <Metric
        value={value ?? "—"}
        label={label}
        prefix={prefix}
        suffix={suffix}
        change={change}
        changeLabel={changeLabel}
        size={size}
      />
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
    children: [{ text: "" }],
  };
}

export { METRIC_KEY };
