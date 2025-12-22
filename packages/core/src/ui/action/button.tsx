"use client";

/**
 * @component Button
 * @category action
 * @description Button that triggers the parent LiveAction's SQL execution on click.
 * Must be used inside a LiveAction container.
 * @keywords button, submit, action, trigger, form
 * @example
 * <LiveAction sql="UPDATE tasks SET done = true WHERE id = 1">
 *   <Button>Mark Complete</Button>
 * </LiveAction>
 */

import { createPlatePlugin, PlateElement, type PlateElementProps, useElement } from "platejs/react";
import { memo, useContext } from "react";

import { Button as BaseButton, type ButtonProps as BaseButtonProps } from "../components/button";
import { BUTTON_KEY, type TButtonElement } from "../../types";
import { Loader } from "../view/loader";
import { LiveActionContext } from "./live-action";

// ============================================================================
// Standalone Component
// ============================================================================

export interface ButtonProps extends Omit<BaseButtonProps, "onClick"> {
  /** Click handler - usually connected to LiveAction.trigger */
  onClick?: () => void;
  /** Loading state */
  isLoading?: boolean;
}

/**
 * Button component with loading state support.
 * Works standalone or inside LiveAction to trigger SQL execution.
 */
export function Button({
  onClick,
  disabled,
  isLoading,
  children,
  ...props
}: ButtonProps) {
  return (
    <BaseButton
      type="button"
      onClick={onClick}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && <Loader variant="spinner" size="xs" className="mr-1" />}
      {children}
    </BaseButton>
  );
}

// ============================================================================
// Plate Plugin
// ============================================================================

function ButtonElement(props: PlateElementProps) {
  const element = useElement<TButtonElement>();
  const { variant = "default" } = element;

  // Optional LiveAction context - Button works standalone too
  const actionCtx = useContext(LiveActionContext);

  const handleClick = () => {
    // If inside LiveAction, trigger it
    actionCtx?.trigger();
  };

  return (
    <PlateElement {...props} as="span">
      <Button
        variant={variant}
        onClick={handleClick}
        isLoading={actionCtx?.isPending}
      >
        {props.children}
      </Button>
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
    isInline: false, // Changed from true - inline elements get stripped during normalization
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
