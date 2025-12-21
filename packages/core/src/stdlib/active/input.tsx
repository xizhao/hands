"use client";

/**
 * @component ActionInput
 * @category active
 * @description Text input that registers its value with parent LiveAction for SQL binding.
 * The `name` prop determines the {{name}} placeholder in SQL.
 * @keywords input, text, form, field, binding
 * @example
 * <LiveAction sql="UPDATE users SET name = {{name}} WHERE id = 1">
 *   <ActionInput name="name" placeholder="Enter name" />
 *   <ActionButton>Save</ActionButton>
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

import { INPUT_KEY, type TInputElement } from "../../types";
import { LiveActionContext } from "./live-action";

// ============================================================================
// Standalone Component
// ============================================================================

export interface ActionInputProps {
  /** Field name for form binding */
  name: string;
  /** Input type */
  type?: "text" | "email" | "number" | "password" | "tel" | "url";
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
 * Standalone input component for use outside Plate editor.
 */
export function ActionInput({
  name,
  type = "text",
  placeholder,
  defaultValue,
  value,
  onChange,
  disabled,
  required,
  label,
  className,
}: ActionInputProps) {
  const [internalValue, setInternalValue] = useState(defaultValue || "");
  const displayValue = value !== undefined ? value : internalValue;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
      <input
        id={name}
        name={name}
        type={type}
        value={displayValue}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  );
}

// ============================================================================
// Plate Plugin
// ============================================================================

function InputElement(props: PlateElementProps) {
  const element = useElement<TInputElement>();
  const selected = useSelected();
  const actionCtx = useContext(LiveActionContext);

  const { name, inputType = "text", placeholder, defaultValue, required } = element;

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
        <input
          type={inputType}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          disabled={isPending}
          required={required}
          contentEditable={false}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
        {!hasLabel && <span className="hidden">{props.children}</span>}
      </div>
    </PlateElement>
  );
}

/**
 * Input Plugin - text input for form binding.
 */
export const InputPlugin = createPlatePlugin({
  key: INPUT_KEY,
  node: {
    isElement: true,
    isInline: false,
    isVoid: false,
    component: memo(InputElement),
  },
});

// ============================================================================
// Element Factory
// ============================================================================

/**
 * Create an Input element for insertion into editor.
 */
export function createInputElement(
  name: string,
  options?: {
    inputType?: TInputElement["inputType"];
    placeholder?: string;
    defaultValue?: string;
    required?: boolean;
    label?: string;
  },
): TInputElement {
  return {
    type: INPUT_KEY,
    name,
    inputType: options?.inputType,
    placeholder: options?.placeholder,
    defaultValue: options?.defaultValue,
    required: options?.required,
    children: options?.label ? [{ text: options.label }] : [{ text: "" }],
  };
}

export { INPUT_KEY };
