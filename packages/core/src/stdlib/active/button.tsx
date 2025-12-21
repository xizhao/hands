"use client";

/**
 * @component ActionButton
 * @category active
 * @description Button that triggers the parent LiveAction's SQL execution on click.
 * Must be used inside a LiveAction container.
 * @keywords button, submit, action, trigger, form
 * @example
 * <LiveAction sql="UPDATE tasks SET done = true WHERE id = 1">
 *   <ActionButton>Mark Complete</ActionButton>
 * </LiveAction>
 */

import { createPlatePlugin, PlateElement, type PlateElementProps, useElement } from "platejs/react";
import { memo, useContext } from "react";

import { BUTTON_KEY, type TButtonElement } from "../../types";
import { LiveActionContext } from "./live-action";

// ============================================================================
// Standalone Component
// ============================================================================

export interface ActionButtonProps {
  /** Button variant styling */
  variant?: "default" | "outline" | "ghost" | "destructive";
  /** Click handler - usually connected to LiveAction.trigger */
  onClick?: () => void;
  /** Disabled state */
  disabled?: boolean;
  /** Loading state */
  isLoading?: boolean;
  /** Button content */
  children: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Standalone button component for use outside Plate editor.
 */
export function ActionButton({
  variant = "default",
  onClick,
  disabled,
  isLoading,
  children,
  className,
}: ActionButtonProps) {
  const variantClasses = {
    default: "bg-primary text-primary-foreground hover:bg-primary/90",
    outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
    ghost: "hover:bg-accent hover:text-accent-foreground",
    destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isLoading}
      className={`
        inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium
        transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
        disabled:pointer-events-none disabled:opacity-50
        ${variantClasses[variant]}
        ${className || ""}
      `}
    >
      {isLoading && (
        <div className="size-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />
      )}
      {children}
    </button>
  );
}

// ============================================================================
// Plate Plugin
// ============================================================================

function ButtonElement(props: PlateElementProps) {
  const element = useElement<TButtonElement>();
  const { variant = "default" } = element;

  const actionCtx = useContext(LiveActionContext);

  const handleClick = () => {
    if (!actionCtx) {
      console.error("ActionButton must be inside a LiveAction");
      return;
    }
    actionCtx.trigger();
  };

  return (
    <PlateElement {...props} as="span">
      <ActionButton
        variant={variant}
        onClick={handleClick}
        isLoading={actionCtx?.isPending}
        disabled={!actionCtx}
      >
        {props.children}
      </ActionButton>
    </PlateElement>
  );
}

/**
 * Button Plugin - triggers parent LiveAction on click.
 */
export const ButtonPlugin = createPlatePlugin({
  key: BUTTON_KEY,
  node: {
    isElement: true,
    isInline: true,
    isVoid: false,
    component: memo(ButtonElement),
  },
});

// ============================================================================
// Element Factory
// ============================================================================

/**
 * Create a Button element for insertion into editor.
 */
export function createButtonElement(
  label: string,
  options?: {
    variant?: TButtonElement["variant"];
  },
): TButtonElement {
  return {
    type: BUTTON_KEY,
    label,
    variant: options?.variant,
    children: [{ text: label }],
  };
}

export { BUTTON_KEY };
