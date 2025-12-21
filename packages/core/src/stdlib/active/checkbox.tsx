"use client";

/**
 * @component ActionCheckbox
 * @category active
 * @description Checkbox that registers its value with parent LiveAction for SQL binding.
 * The `name` prop determines the {{name}} placeholder in SQL (returns true/false).
 * @keywords checkbox, boolean, toggle, form, field, binding
 * @example
 * <LiveAction sql="UPDATE tasks SET done = {{done}} WHERE id = 1">
 *   <ActionCheckbox name="done">Mark as complete</ActionCheckbox>
 *   <ActionButton>Save</ActionButton>
 * </LiveAction>
 */

import { memo, useState, useRef, useEffect, useContext } from "react";
import { createPlatePlugin, PlateElement, type PlateElementProps, useElement, useSelected } from "platejs/react";

import { CHECKBOX_KEY, type TCheckboxElement } from "../../types";
import { LiveActionContext } from "./live-action";

// ============================================================================
// Standalone Component
// ============================================================================

export interface ActionCheckboxProps {
  /** Field name for form binding */
  name: string;
  /** Default checked state */
  defaultChecked?: boolean;
  /** Current checked state (controlled) */
  checked?: boolean;
  /** Change handler */
  onChange?: (checked: boolean) => void;
  /** Disabled state */
  disabled?: boolean;
  /** Required field */
  required?: boolean;
  /** Label content */
  children?: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Standalone checkbox component for use outside Plate editor.
 */
export function ActionCheckbox({
  name,
  defaultChecked,
  checked,
  onChange,
  disabled,
  required,
  children,
  className,
}: ActionCheckboxProps) {
  const [internalChecked, setInternalChecked] = useState(defaultChecked || false);
  const displayChecked = checked !== undefined ? checked : internalChecked;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.checked;
    setInternalChecked(newValue);
    onChange?.(newValue);
  };

  return (
    <label
      className={`flex items-center gap-2 cursor-pointer ${disabled ? "cursor-not-allowed opacity-50" : ""} ${className || ""}`}
    >
      <input
        type="checkbox"
        name={name}
        checked={displayChecked}
        onChange={handleChange}
        disabled={disabled}
        required={required}
        className="h-4 w-4 rounded border border-input bg-background text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed"
      />
      {children && <span className="text-sm">{children}</span>}
    </label>
  );
}

// ============================================================================
// Plate Plugin
// ============================================================================

function CheckboxElement(props: PlateElementProps) {
  const element = useElement<TCheckboxElement>();
  const selected = useSelected();
  const actionCtx = useContext(LiveActionContext);

  const { name, defaultChecked, required } = element;

  const [checked, setChecked] = useState(defaultChecked || false);
  const checkedRef = useRef(checked);
  checkedRef.current = checked;

  // Register with parent LiveAction
  useEffect(() => {
    if (!actionCtx || !name) return;

    actionCtx.registerField(name, () => checkedRef.current);

    return () => actionCtx.unregisterField(name);
  }, [actionCtx, name]);

  const isPending = actionCtx?.isPending ?? false;

  return (
    <PlateElement
      {...props}
      as="div"
      className={`my-2 rounded-md p-0.5 ${selected ? "ring-2 ring-ring ring-offset-1" : ""}`}
    >
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          disabled={isPending}
          required={required}
          contentEditable={false}
          className="h-4 w-4 rounded border border-input bg-background text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed"
        />
        <span className="text-sm">{props.children}</span>
      </label>
    </PlateElement>
  );
}

/**
 * Checkbox Plugin - boolean input for form binding.
 */
export const CheckboxPlugin = createPlatePlugin({
  key: CHECKBOX_KEY,
  node: {
    isElement: true,
    isInline: false,
    isVoid: false,
    component: memo(CheckboxElement),
  },
});

// ============================================================================
// Element Factory
// ============================================================================

/**
 * Create a Checkbox element for insertion into editor.
 */
export function createCheckboxElement(
  name: string,
  options?: {
    defaultChecked?: boolean;
    required?: boolean;
    label?: string;
  }
): TCheckboxElement {
  return {
    type: CHECKBOX_KEY,
    name,
    defaultChecked: options?.defaultChecked,
    required: options?.required,
    children: options?.label ? [{ text: options.label }] : [{ text: "" }],
  };
}

export { CHECKBOX_KEY };
