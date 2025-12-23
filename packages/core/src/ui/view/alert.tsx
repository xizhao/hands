"use client";

/**
 * @component Alert
 * @category static
 * @description Callout message box for displaying info, warnings, errors, or success messages.
 * Use to highlight important information or feedback to users.
 * @keywords alert, callout, message, info, warning, error, success, notification
 * @example
 * <Alert>This is an informational message.</Alert>
 * <Alert variant="success" title="Success!">Your changes have been saved.</Alert>
 * <Alert variant="warning">Please review before continuing.</Alert>
 * <Alert variant="destructive" title="Error">Something went wrong.</Alert>
 */

import {
  createPlatePlugin,
  PlateElement,
  type PlateElementProps,
  useElement,
  useSelected,
} from "platejs/react";
import { memo } from "react";

import { ALERT_KEY, type TAlertElement } from "../../types";

// ============================================================================
// Standalone Component
// ============================================================================

export interface AlertProps {
  /** Alert content */
  children: React.ReactNode;
  /** Optional title */
  title?: string;
  /** Visual variant */
  variant?: "default" | "success" | "warning" | "destructive";
  /** Additional CSS classes */
  className?: string;
}

/**
 * Standalone Alert component for use outside Plate editor.
 */
export function Alert({ children, title, variant = "default", className }: AlertProps) {
  const variantClasses = {
    default: "bg-muted border-border text-foreground",
    success: "bg-success/10 border-success/30 text-success",
    warning: "bg-warning/10 border-warning/30 text-warning",
    destructive: "bg-destructive/10 border-destructive/30 text-destructive",
  };

  const iconMap = {
    default: (
      <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
    success: (
      <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
    warning: (
      <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
    ),
    destructive: (
      <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  };

  return (
    <div
      className={`
        flex gap-3 rounded-lg border p-4
        ${variantClasses[variant]}
        ${className || ""}
      `}
      role="alert"
    >
      <div className="shrink-0 mt-0.5">{iconMap[variant]}</div>
      <div className="flex-1">
        {title && <h5 className="font-medium mb-1">{title}</h5>}
        <div className="text-sm">{children}</div>
      </div>
    </div>
  );
}

// ============================================================================
// Plate Plugin
// ============================================================================

function AlertElement(props: PlateElementProps) {
  const element = useElement<TAlertElement>();
  const selected = useSelected();

  const { title, variant = "default" } = element;

  return (
    <PlateElement
      {...props}
      as="div"
      className={`my-2 ${selected ? "ring-1 ring-primary/30 ring-offset-2 rounded-lg" : ""}`}
    >
      <Alert title={title} variant={variant}>
        {props.children}
      </Alert>
    </PlateElement>
  );
}

/**
 * Alert Plugin - callout message box.
 */
export const AlertPlugin = createPlatePlugin({
  key: ALERT_KEY,
  node: {
    isElement: true,
    isInline: false,
    isVoid: false,
    component: memo(AlertElement),
  },
});

// ============================================================================
// Element Factory
// ============================================================================

/**
 * Create an Alert element for insertion into editor.
 */
export function createAlertElement(
  message: string,
  options?: {
    title?: string;
    variant?: TAlertElement["variant"];
  },
): TAlertElement {
  return {
    type: ALERT_KEY,
    title: options?.title,
    variant: options?.variant,
    children: [{ text: message }],
  };
}

export { ALERT_KEY };
