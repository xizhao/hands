"use client";

/**
 * @component ActionSelect
 * @category active
 * @description Dropdown select that registers its value with parent LiveAction for SQL binding.
 * The `name` prop determines the {{name}} placeholder in SQL.
 * @keywords select, dropdown, form, field, binding, options
 * @example
 * <LiveAction sql="UPDATE tasks SET status = {{status}} WHERE id = 1">
 *   <ActionSelect
 *     name="status"
 *     options={[
 *       { value: "pending", label: "Pending" },
 *       { value: "done", label: "Done" }
 *     ]}
 *   />
 *   <ActionButton>Update</ActionButton>
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

import { SELECT_KEY, type TSelectElement } from "../../types";
import { LiveActionContext } from "./live-action";

// ============================================================================
// Types
// ============================================================================

export interface SelectOption {
  value: string;
  label: string;
}

// ============================================================================
// Standalone Component
// ============================================================================

export interface ActionSelectProps {
  /** Field name for form binding */
  name: string;
  /** Select options */
  options: SelectOption[];
  /** Placeholder text */
  placeholder?: string;
  /** Default value */
  defaultValue?: string;
  /** Current value (controlled) */
  value?: string;
  /** Value change handler */
  onChange?: (value: string) => void;
  /** Disabled state */
  disabled?: boolean;
  /** Required field */
  required?: boolean;
  /** Label text */
  label?: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Standalone select component for use outside Plate editor.
 */
export function ActionSelect({
  name,
  options,
  placeholder = "Select...",
  defaultValue,
  value,
  onChange,
  disabled,
  required,
  label,
  className,
}: ActionSelectProps) {
  const [internalValue, setInternalValue] = useState(defaultValue || "");
  const displayValue = value !== undefined ? value : internalValue;

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = e.target.value;
    setInternalValue(newValue);
    onChange?.(newValue);
  };

  return (
    <div className={`flex flex-col gap-1.5 ${className || ""}`}>
      {label && (
        <label htmlFor={name} className="text-sm font-medium">
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </label>
      )}
      <select
        id={name}
        name={name}
        value={displayValue}
        onChange={handleChange}
        disabled={disabled}
        required={required}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ============================================================================
// Plate Plugin
// ============================================================================

function SelectElement(props: PlateElementProps) {
  const element = useElement<TSelectElement>();
  const selected = useSelected();
  const actionCtx = useContext(LiveActionContext);

  const { name, options = [], placeholder = "Select...", defaultValue, required } = element;

  const [value, setValue] = useState(defaultValue || "");
  const valueRef = useRef(value);
  valueRef.current = value;

  // Register with parent LiveAction
  useEffect(() => {
    if (!actionCtx || !name) return;

    actionCtx.registerField(name, () => valueRef.current);

    return () => actionCtx.unregisterField(name);
  }, [actionCtx, name]);

  const isPending = actionCtx?.isPending ?? false;

  // Check if element has label content in children
  const hasLabel = element.children?.some(
    (child) => "text" in child && typeof child.text === "string" && child.text.trim(),
  );

  return (
    <PlateElement
      {...props}
      as="div"
      className={`my-2 rounded-md p-0.5 ${selected ? "ring-2 ring-ring ring-offset-1" : ""}`}
    >
      <div className="flex flex-col gap-1.5">
        {hasLabel && <label className="text-sm font-medium">{props.children}</label>}
        <select
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={isPending}
          required={required}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="" disabled>
            {placeholder}
          </option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {!hasLabel && <span className="hidden">{props.children}</span>}
      </div>
    </PlateElement>
  );
}

/**
 * Select Plugin - dropdown for form binding.
 */
export const SelectPlugin = createPlatePlugin({
  key: SELECT_KEY,
  node: {
    isElement: true,
    isInline: false,
    isVoid: false,
    component: memo(SelectElement),
  },
});

// ============================================================================
// Element Factory
// ============================================================================

/**
 * Create a Select element for insertion into editor.
 */
export function createSelectElement(
  name: string,
  options: SelectOption[],
  config?: {
    placeholder?: string;
    defaultValue?: string;
    required?: boolean;
    label?: string;
  },
): TSelectElement {
  return {
    type: SELECT_KEY,
    name,
    options,
    placeholder: config?.placeholder,
    defaultValue: config?.defaultValue,
    required: config?.required,
    children: config?.label ? [{ text: config.label }] : [{ text: "" }],
  };
}

export { SELECT_KEY };
