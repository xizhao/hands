"use client";

/**
 * @component Checkbox
 * @category action
 * @description Checkbox that registers its value with parent LiveAction for SQL binding.
 * The `name` prop determines the {{name}} placeholder in SQL (returns true/false).
 * @keywords checkbox, boolean, toggle, form, field, binding
 * @example
 * <LiveAction sql="UPDATE tasks SET done = {{done}} WHERE id = 1">
 *   <Checkbox name="done">Mark as complete</Checkbox>
 *   <Button>Save</Button>
 * </LiveAction>
 */

import {
  createPlatePlugin,
  PlateElement,
  type PlateElementProps,
  useElement,
  useSelected,
} from "platejs/react";
import { memo, useContext, useEffect, useRef, useState } from "react";
import { CHECKBOX_KEY, type ComponentMeta, type TCheckboxElement } from "../../types";
import { Checkbox as BaseCheckbox } from "../components/checkbox";
import { Label } from "../components/label";
import { LiveActionContext } from "./live-action";

// ============================================================================
// Standalone Component
// ============================================================================

export interface CheckboxProps {
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
  label?: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Standalone checkbox component for use outside Plate editor.
 * Wraps shadcn Checkbox with label and form binding support.
 */
export function Checkbox({
  name,
  defaultChecked,
  checked,
  onChange,
  disabled,
  required,
  label,
  className,
}: CheckboxProps) {
  const [internalChecked, setInternalChecked] = useState(defaultChecked || false);
  const displayChecked = checked !== undefined ? checked : internalChecked;

  const handleChange = (value: boolean | "indeterminate") => {
    const newValue = value === true;
    setInternalChecked(newValue);
    onChange?.(newValue);
  };

  return (
    <div className={`flex items-center gap-2 ${className || ""}`}>
      <BaseCheckbox
        id={name}
        name={name}
        checked={displayChecked}
        onCheckedChange={handleChange}
        disabled={disabled}
        required={required}
      />
      {label && (
        <Label
          htmlFor={name}
          className={disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}
        >
          {label}
        </Label>
      )}
    </div>
  );
}

// ============================================================================
// Plate Plugin
// ============================================================================

function CheckboxElement(props: PlateElementProps) {
  const element = useElement<TCheckboxElement>();
  const _selected = useSelected();
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
    <PlateElement {...props} as="div" className="my-2">
      <div className="flex items-center gap-2">
        <BaseCheckbox
          checked={checked}
          onCheckedChange={(value) => setChecked(value === true)}
          disabled={isPending}
          required={required}
        />
        <Label className="cursor-pointer">{props.children}</Label>
      </div>
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
  },
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

// ============================================================================
// Component Metadata (for validation/linting)
// ============================================================================

export const CheckboxMeta: ComponentMeta = {
  category: "action",
  requiredProps: ["name"],
  constraints: {
    requireParent: ["LiveAction"],
  },
};
