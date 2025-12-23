"use client";

/**
 * @component Progress
 * @category static
 * @description Progress bar for displaying completion status or loading states.
 * Supports determinate (with value) and indeterminate (loading) modes.
 * @keywords progress, bar, loading, percentage, completion, status
 * @example
 * <Progress value={75} />
 * <Progress value={45} label="Upload Progress" showValue />
 * <Progress indeterminate />
 */

import {
  createPlatePlugin,
  PlateElement,
  type PlateElementProps,
  useElement,
  useSelected,
} from "platejs/react";
import { memo } from "react";

import { PROGRESS_KEY, type TProgressElement } from "../../types";

// ============================================================================
// Standalone Component
// ============================================================================

export interface ProgressProps {
  /** Progress value (0-100) */
  value?: number;
  /** Maximum value (default 100) */
  max?: number;
  /** Show indeterminate loading animation */
  indeterminate?: boolean;
  /** Label text above the bar */
  label?: string;
  /** Show value as percentage */
  showValue?: boolean;
  /** Visual variant */
  variant?: "default" | "success" | "warning" | "destructive";
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Additional CSS classes */
  className?: string;
}

/**
 * Standalone Progress component for use outside Plate editor.
 */
export function Progress({
  value = 0,
  max = 100,
  indeterminate = false,
  label,
  showValue = false,
  variant = "default",
  size = "md",
  className,
}: ProgressProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  const variantClasses = {
    default: "bg-primary",
    success: "bg-success",
    warning: "bg-warning",
    destructive: "bg-destructive",
  };

  const sizeClasses = {
    sm: "h-1",
    md: "h-2",
    lg: "h-3",
  };

  return (
    <div className={`w-full ${className || ""}`}>
      {(label || showValue) && (
        <div className="flex justify-between mb-1">
          {label && <span className="text-sm font-medium text-foreground">{label}</span>}
          {showValue && !indeterminate && (
            <span className="text-sm text-muted-foreground">{Math.round(percentage)}%</span>
          )}
        </div>
      )}
      <div
        className={`w-full rounded-full bg-secondary overflow-hidden ${sizeClasses[size]}`}
        role="progressbar"
        aria-valuenow={indeterminate ? undefined : percentage}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {indeterminate ? (
          <div
            className={`h-full rounded-full ${variantClasses[variant]} animate-pulse`}
            style={{ width: "100%" }}
          />
        ) : (
          <div
            className={`h-full rounded-full transition-all duration-300 ${variantClasses[variant]}`}
            style={{ width: `${percentage}%` }}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Plate Plugin
// ============================================================================

function ProgressElement(props: PlateElementProps) {
  const element = useElement<TProgressElement>();
  const selected = useSelected();

  const { value, max, indeterminate, label, showValue, variant, size } = element;

  return (
    <PlateElement
      {...props}
      as="div"
      className="my-2"
    >
      <Progress
        value={value}
        max={max}
        indeterminate={indeterminate}
        label={label}
        showValue={showValue}
        variant={variant}
        size={size}
      />
      <span className="hidden">{props.children}</span>
    </PlateElement>
  );
}

/**
 * Progress Plugin - progress bar for completion status.
 */
export const ProgressPlugin = createPlatePlugin({
  key: PROGRESS_KEY,
  node: {
    isElement: true,
    isInline: false,
    isVoid: true,
    component: memo(ProgressElement),
  },
});

// ============================================================================
// Element Factory
// ============================================================================

/**
 * Create a Progress element for insertion into editor.
 */
export function createProgressElement(
  value: number,
  options?: {
    max?: number;
    label?: string;
    showValue?: boolean;
    variant?: TProgressElement["variant"];
    size?: TProgressElement["size"];
  },
): TProgressElement {
  return {
    type: PROGRESS_KEY,
    value,
    max: options?.max,
    label: options?.label,
    showValue: options?.showValue,
    variant: options?.variant,
    size: options?.size,
    children: [{ text: "" }],
  };
}

export { PROGRESS_KEY };
