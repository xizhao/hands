"use client";

/**
 * @component Textarea
 * @category action
 * @description Multiline text input that registers its value with parent LiveAction for SQL binding.
 * The `name` prop determines the {{name}} placeholder in SQL.
 * @keywords textarea, multiline, text, form, field, binding
 * @example
 * <LiveAction sql="UPDATE posts SET content = {{content}} WHERE id = 1">
 *   <Textarea name="content" placeholder="Enter content..." rows={5} />
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

import { TEXTAREA_KEY, type TTextareaElement, type ComponentMeta } from "../../types";
import { LiveActionContext } from "./live-action";

// ============================================================================
// Standalone Component
// ============================================================================

export interface TextareaProps {
  /** Field name for form binding */
  name: string;
  /** Placeholder text */
  placeholder?: string;
  /** Default value */
  defaultValue?: string;
  /** Current value (controlled) */
  value?: string;
  /** Value change handler */
  onChange?: (value: string) => void;
  /** Number of visible rows */
  rows?: number;
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
 * Standalone textarea component for use outside Plate editor.
 */
export function Textarea({
  name,
  placeholder,
  defaultValue,
  value,
  onChange,
  rows = 3,
  disabled,
  required,
  label,
  className,
}: TextareaProps) {
  const [internalValue, setInternalValue] = useState(defaultValue || "");
  const displayValue = value !== undefined ? value : internalValue;

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
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
      <textarea
        id={name}
        name={name}
        value={displayValue}
        onChange={handleChange}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        required={required}
        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-y"
      />
    </div>
  );
}

// ============================================================================
// Plate Plugin
// ============================================================================

function TextareaElement(props: PlateElementProps) {
  const element = useElement<TTextareaElement>();
  const selected = useSelected();
  const actionCtx = useContext(LiveActionContext);

  const { name, placeholder, defaultValue, rows = 3, required } = element;

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
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          disabled={isPending}
          required={required}
          contentEditable={false}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-y"
        />
        {!hasLabel && <span className="hidden">{props.children}</span>}
      </div>
    </PlateElement>
  );
}

/**
 * Textarea Plugin - multiline text input for form binding.
 */
export const TextareaPlugin = createPlatePlugin({
  key: TEXTAREA_KEY,
  node: {
    isElement: true,
    isInline: false,
    isVoid: false,
    component: memo(TextareaElement),
  },
});

// ============================================================================
// Element Factory
// ============================================================================

/**
 * Create a Textarea element for insertion into editor.
 */
export function createTextareaElement(
  name: string,
  options?: {
    placeholder?: string;
    defaultValue?: string;
    rows?: number;
    required?: boolean;
    label?: string;
  },
): TTextareaElement {
  return {
    type: TEXTAREA_KEY,
    name,
    placeholder: options?.placeholder,
    defaultValue: options?.defaultValue,
    rows: options?.rows,
    required: options?.required,
    children: options?.label ? [{ text: options.label }] : [{ text: "" }],
  };
}

export { TEXTAREA_KEY };

// ============================================================================
// Component Metadata (for validation/linting)
// ============================================================================

export const TextareaMeta: ComponentMeta = {
  category: "action",
  requiredProps: ["name"],
  constraints: {
    requireParent: ["LiveAction"],
  },
};

