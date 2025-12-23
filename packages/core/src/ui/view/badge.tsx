"use client";

/**
 * @component Badge
 * @category static
 * @description Inline status indicator for labeling items with semantic colors.
 * Use for status indicators, tags, or category labels.
 * @keywords badge, tag, status, label, indicator, pill
 * @example
 * <Badge>Active</Badge>
 * <Badge variant="success">Completed</Badge>
 * <Badge variant="warning">Pending</Badge>
 * <Badge variant="destructive">Failed</Badge>
 */

import {
  createPlatePlugin,
  PlateElement,
  type PlateElementProps,
  useElement,
  useSelected,
} from "platejs/react";
import { memo } from "react";

import { BADGE_KEY, type TBadgeElement } from "../../types";

// ============================================================================
// Standalone Component
// ============================================================================

export interface BadgeProps {
  /** Badge content */
  children: React.ReactNode;
  /** Visual variant */
  variant?: "default" | "secondary" | "success" | "warning" | "destructive" | "outline";
  /** Additional CSS classes */
  className?: string;
}

/**
 * Standalone Badge component for use outside Plate editor.
 */
export function Badge({ children, variant = "default", className }: BadgeProps) {
  const variantClasses = {
    default: "bg-primary text-primary-foreground",
    secondary: "bg-secondary text-secondary-foreground",
    success: "bg-success/15 text-success dark:bg-success/20",
    warning: "bg-warning/15 text-warning dark:bg-warning/20",
    destructive: "bg-destructive/15 text-destructive dark:bg-destructive/20",
    outline: "border border-input bg-background text-foreground",
  };

  return (
    <span
      className={`
        inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium
        ${variantClasses[variant]}
        ${className || ""}
      `}
    >
      {children}
    </span>
  );
}

// ============================================================================
// Plate Plugin
// ============================================================================

function BadgeElement(props: PlateElementProps) {
  const element = useElement<TBadgeElement>();
  const selected = useSelected();

  const { variant = "default" } = element;

  return (
    <PlateElement
      {...props}
      as="span"
      className=""
    >
      <Badge variant={variant}>{props.children}</Badge>
    </PlateElement>
  );
}

/**
 * Badge Plugin - inline status indicator.
 */
export const BadgePlugin = createPlatePlugin({
  key: BADGE_KEY,
  node: {
    isElement: true,
    isInline: true,
    isVoid: false,
    component: memo(BadgeElement),
  },
});

// ============================================================================
// Element Factory
// ============================================================================

/**
 * Create a Badge element for insertion into editor.
 */
export function createBadgeElement(
  text: string,
  variant?: TBadgeElement["variant"],
): TBadgeElement {
  return {
    type: BADGE_KEY,
    variant,
    children: [{ text }],
  };
}

export { BADGE_KEY };
