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

import { Button, type ButtonProps } from "../../components/ui/button";
import { BUTTON_KEY, type TButtonElement } from "../../types";
import { Loader } from "../static/loader";
import { LiveActionContext } from "./live-action";

// ============================================================================
// Standalone Component
// ============================================================================

export interface ActionButtonProps extends Omit<ButtonProps, "onClick"> {
  /** Click handler - usually connected to LiveAction.trigger */
  onClick?: () => void;
  /** Loading state */
  isLoading?: boolean;
}

/**
 * Standalone button component for use outside Plate editor.
 * Wraps shadcn Button with loading state support.
 */
export function ActionButton({
  onClick,
  disabled,
  isLoading,
  children,
  ...props
}: ActionButtonProps) {
  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && <Loader variant="spinner" size="xs" className="mr-1" />}
      {children}
    </Button>
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
