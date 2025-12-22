"use client";

/**
 * @component Input
 * @description Text input with optional masking and automatic validation.
 *
 * @example
 * <Input name="email" label="Email" placeholder="you@example.com" />
 * <Input name="phone" label="Phone" mask="phone" />
 * <Input name="card" label="Card" mask="creditCard" />
 * <Input name="amount" label="Amount" mask="currency" />
 *
 * @masks phone, ssn, date, time, creditCard, creditCardExpiry, zipCode, currency, percentage, ipv4
 */

import {
  createPlatePlugin,
  PlateElement,
  type PlateElementProps,
  useElement,
  useSelected,
} from "platejs/react";
import { memo, useContext, useEffect, useRef, useState } from "react";

import {
  MaskInput,
  type MaskInputProps,
  type MaskPattern,
} from "../components/mask-input";
import { Label } from "../components/label";
import { INPUT_KEY, type TInputElement } from "../../types";
import { LiveActionContext } from "./live-action";

/** Built-in mask pattern names */
type MaskPatternKey =
  | "phone"
  | "ssn"
  | "date"
  | "time"
  | "creditCard"
  | "creditCardExpiry"
  | "zipCode"
  | "zipCodeExtended"
  | "currency"
  | "percentage"
  | "licensePlate"
  | "ipv4"
  | "macAddress"
  | "isbn"
  | "ein";

// ============================================================================
// Standalone Component
// ============================================================================

export interface InputProps {
  /** Field name for form binding */
  name: string;
  /** Input type (ignored when mask is set) */
  type?: "text" | "email" | "number" | "password" | "tel" | "url";
  /** Placeholder text */
  placeholder?: string;
  /** Default value */
  defaultValue?: string;
  /** Current value (controlled) */
  value?: string;
  /** Value change handler - receives both masked and unmasked values */
  onChange?: (value: string, unmaskedValue?: string) => void;
  /** Disabled state */
  disabled?: boolean;
  /** Required field */
  required?: boolean;
  /** Label text */
  label?: string;
  /** Additional CSS classes */
  className?: string;
  /**
   * Input mask. Preset name or custom `{ pattern: "##-##" }` where # = digit.
   * Validation is automatic - invalid inputs show red border.
   *
   * Presets: phone, ssn, date, time, creditCard, creditCardExpiry,
   * zipCode, zipCodeExtended, currency, percentage, ipv4, ein
   */
  mask?: MaskPatternKey | MaskPattern;
  /** Currency code for currency mask (default: USD) */
  currency?: string;
  /** Locale for currency formatting (default: en-US) */
  locale?: string;
}

/**
 * Input component with optional masking and validation.
 * Works standalone or inside LiveAction for SQL binding.
 */
export function Input({
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
  mask,
  currency,
  locale,
}: InputProps) {
  const [internalValue, setInternalValue] = useState(defaultValue || "");
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const displayValue = value !== undefined ? value : internalValue;

  const handleValueChange = (maskedValue: string, unmaskedValue: string) => {
    setInternalValue(maskedValue);
    onChange?.(maskedValue, unmaskedValue);
  };

  const handleValidate = (valid: boolean) => {
    setIsValid(valid);
  };

  // Show invalid when mask validation fails and has been touched
  const showInvalid = isValid === false;

  return (
    <div className={`flex flex-col gap-1.5 ${className || ""}`}>
      {label && (
        <Label htmlFor={name}>
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </Label>
      )}
      <MaskInput
        id={name}
        name={name}
        type={mask ? undefined : type}
        value={displayValue}
        onValueChange={handleValueChange}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        mask={mask}
        validationMode="onBlur"
        onValidate={handleValidate}
        currency={currency}
        locale={locale}
        invalid={showInvalid}
        className={showInvalid ? "border-destructive focus-visible:ring-destructive/20" : undefined}
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

  const {
    name,
    inputType = "text",
    placeholder,
    defaultValue,
    required,
    mask,
    currency,
    locale,
  } = element;

  const [value, setValue] = useState(defaultValue || "");
  const [unmaskedValue, setUnmaskedValue] = useState(defaultValue || "");
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const unmaskedRef = useRef(unmaskedValue);
  unmaskedRef.current = unmaskedValue;

  // Register with parent LiveAction - use unmasked value for SQL binding
  useEffect(() => {
    if (!actionCtx || !name) return;

    actionCtx.registerField(name, () => unmaskedRef.current);

    return () => actionCtx.unregisterField(name);
  }, [actionCtx, name]);

  const isPending = actionCtx?.isPending ?? false;

  // Check if element has label content in children
  const hasLabel = element.children?.some(
    (child) => "text" in child && typeof child.text === "string" && child.text.trim(),
  );

  const handleValueChange = (masked: string, unmasked: string) => {
    setValue(masked);
    setUnmaskedValue(unmasked);
  };

  const handleValidate = (valid: boolean) => {
    setIsValid(valid);
  };

  const showInvalid = isValid === false;

  return (
    <PlateElement
      {...props}
      as="div"
      className={`my-2 rounded-md p-0.5 ${selected ? "ring-2 ring-ring ring-offset-1" : ""}`}
    >
      <div className="flex flex-col gap-1.5">
        {hasLabel && <Label>{props.children}</Label>}
        <MaskInput
          type={mask ? undefined : inputType}
          value={value}
          onValueChange={handleValueChange}
          onValidate={handleValidate}
          placeholder={placeholder}
          disabled={isPending}
          required={required}
          mask={mask as MaskPatternKey | MaskPattern | undefined}
          validationMode="onBlur"
          currency={currency}
          locale={locale}
          invalid={showInvalid}
          className={showInvalid ? "border-destructive focus-visible:ring-destructive/20" : undefined}
          contentEditable={false}
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
 *
 * @example Basic text input
 * createInputElement("username", { placeholder: "Enter username" })
 *
 * @example Phone number with mask
 * createInputElement("phone", { mask: "phone", placeholder: "(555) 123-4567" })
 *
 * @example Currency input
 * createInputElement("amount", { mask: "currency", currency: "USD" })
 *
 * @example Custom mask pattern
 * createInputElement("code", { mask: { pattern: "##-####" } })
 */
export function createInputElement(
  name: string,
  options?: {
    /** Input type (ignored when mask is set) */
    inputType?: TInputElement["inputType"];
    /** Placeholder text */
    placeholder?: string;
    /** Default value */
    defaultValue?: string;
    /** Required field */
    required?: boolean;
    /** Label text */
    label?: string;
    /**
     * Input mask - preset name or custom pattern.
     * Presets: phone, ssn, date, time, creditCard, creditCardExpiry,
     * zipCode, zipCodeExtended, currency, percentage, ipv4, ein
     */
    mask?: TInputElement["mask"];
    /** Currency code for currency mask (default: USD) */
    currency?: string;
    /** Locale for currency formatting (default: en-US) */
    locale?: string;
  },
): TInputElement {
  return {
    type: INPUT_KEY,
    name,
    inputType: options?.inputType,
    placeholder: options?.placeholder,
    defaultValue: options?.defaultValue,
    required: options?.required,
    mask: options?.mask,
    currency: options?.currency,
    locale: options?.locale,
    children: options?.label ? [{ text: options.label }] : [{ text: "" }],
  };
}

export { INPUT_KEY };
