/**
 * @hands/core - Core Types
 *
 * Shared types for the Hands component library.
 */

import type { TElement, TText } from "platejs";

// ============================================================================
// Element Keys
// ============================================================================

export const LIVE_VALUE_KEY = "live_value";
export const LIVE_ACTION_KEY = "live_action";
export const BUTTON_KEY = "button";
export const INPUT_KEY = "input";
export const SELECT_KEY = "select";
export const OPTION_KEY = "option";
export const CHECKBOX_KEY = "checkbox";
export const TEXTAREA_KEY = "textarea";

// ============================================================================
// Validation Constants (for MDX validation)
// ============================================================================

/** Valid display modes for LiveValue */
export const VALID_DISPLAY_MODES = ["auto", "inline", "list", "table"] as const;

/** Valid button variants */
export const VALID_BUTTON_VARIANTS = ["default", "outline", "ghost", "destructive"] as const;

/** Valid input types */
export const VALID_INPUT_TYPES = ["text", "email", "number", "password", "tel", "url"] as const;

/** All stdlib component names (for validation) */
export const STDLIB_COMPONENT_NAMES = [
  "LiveValue",
  "LiveAction",
  "Button",
  "Input",
  "Select",
  "Checkbox",
  "Textarea",
] as const;

// ============================================================================
// Display Types
// ============================================================================

/**
 * Display mode for LiveValue component.
 * - "auto": Auto-select based on data shape (default)
 * - "inline": Single value badge (1×1 data)
 * - "list": Bullet list (N×1 data)
 * - "table": HTML table (N×M data)
 */
export type DisplayMode = "auto" | "inline" | "list" | "table";

/**
 * Column configuration for table display mode.
 */
export interface ColumnConfig {
  /** Column key matching the data field */
  key: string;
  /** Display label for column header */
  label: string;
  /** Column width in pixels */
  width?: number;
  /** Enable sorting on this column */
  sortable?: boolean;
  /** Enable filtering on this column */
  filterable?: boolean;
}

// ============================================================================
// Static Element Types (Display-only)
// ============================================================================

/**
 * LiveValue element - displays SQL query results in various formats.
 *
 * @example
 * ```tsx
 * <LiveValue sql="SELECT count(*) FROM users" />
 * <LiveValue sql="SELECT name FROM users" display="list" />
 * <LiveValue sql="SELECT * FROM tasks" display="table" />
 * ```
 */
export interface TLiveValueElement extends TElement {
  type: typeof LIVE_VALUE_KEY;
  /** SQL query string */
  query: string;
  /** Display mode - auto-selects based on data shape if not specified */
  display?: DisplayMode;
  /** Named parameters for the query */
  params?: Record<string, unknown>;
  /** For table mode: column configuration */
  columns?: ColumnConfig[] | "auto";
  /** CSS class for the container */
  className?: string;
  /** Children are the template content with {{field}} bindings */
  children: (TElement | TText)[];
}

// ============================================================================
// Active Element Types (Event-driven)
// ============================================================================

/**
 * LiveAction element - container that wraps interactive form controls
 * and triggers SQL write operations on submit.
 *
 * @example
 * ```tsx
 * <LiveAction sql="UPDATE tasks SET status = {{status}} WHERE id = 1">
 *   <ActionSelect name="status" options={[{value: "done", label: "Done"}]} />
 *   <ActionButton>Update</ActionButton>
 * </LiveAction>
 * ```
 */
export interface TLiveActionElement extends TElement {
  type: typeof LIVE_ACTION_KEY;
  /** SQL statement to execute (UPDATE, INSERT, DELETE) */
  sql?: string;
  /** Alternative: action ID reference */
  src?: string;
  /** Named parameters for SQL */
  params?: Record<string, unknown>;
  /** Children are the interactive content */
  children: (TElement | TText)[];
}

/**
 * Button element - triggers the parent LiveAction on click.
 */
export interface TButtonElement extends TElement {
  type: typeof BUTTON_KEY;
  /** Button label - uses children text if not specified */
  label?: string;
  /** Button variant styling */
  variant?: "default" | "outline" | "ghost" | "destructive";
  /** Children are the button content */
  children: (TElement | TText)[];
}

/**
 * Input element - text input for form data.
 */
export interface TInputElement extends TElement {
  type: typeof INPUT_KEY;
  /** Field name for form binding (used in {{name}} SQL substitution) */
  name: string;
  /** Input type */
  inputType?: "text" | "email" | "number" | "password" | "tel" | "url";
  /** Placeholder text */
  placeholder?: string;
  /** Default value */
  defaultValue?: string;
  /** Whether field is required */
  required?: boolean;
  /** Input pattern for validation */
  pattern?: string;
  /** Min value (for number) */
  min?: number | string;
  /** Max value (for number) */
  max?: number | string;
  /** Step value (for number) */
  step?: number;
  /** Children are the label text */
  children: (TElement | TText)[];
}

/**
 * Select element - dropdown for form data.
 */
export interface TSelectElement extends TElement {
  type: typeof SELECT_KEY;
  /** Field name for form binding */
  name: string;
  /** Select options */
  options?: Array<{ value: string; label: string }>;
  /** Placeholder text */
  placeholder?: string;
  /** Default value */
  defaultValue?: string;
  /** Whether field is required */
  required?: boolean;
  /** Children are the label text */
  children: (TElement | TText)[];
}

/**
 * Option element - an option inside Select.
 */
export interface TOptionElement extends TElement {
  type: typeof OPTION_KEY;
  /** Option value */
  value: string;
  /** Children are the label text */
  children: (TElement | TText)[];
}

/**
 * Checkbox element - boolean input for form data.
 */
export interface TCheckboxElement extends TElement {
  type: typeof CHECKBOX_KEY;
  /** Field name for form binding */
  name: string;
  /** Default checked state */
  defaultChecked?: boolean;
  /** Whether field is required */
  required?: boolean;
  /** Children are the label text */
  children: (TElement | TText)[];
}

/**
 * Textarea element - multiline text input for form data.
 */
export interface TTextareaElement extends TElement {
  type: typeof TEXTAREA_KEY;
  /** Field name for form binding */
  name: string;
  /** Placeholder text */
  placeholder?: string;
  /** Default value */
  defaultValue?: string;
  /** Number of visible rows */
  rows?: number;
  /** Whether field is required */
  required?: boolean;
  /** Children are the label text */
  children: (TElement | TText)[];
}

// ============================================================================
// Context Types
// ============================================================================

/**
 * Context provided by LiveAction to its children.
 */
export interface LiveActionContextValue {
  /** Trigger the parent action's SQL execution */
  trigger: () => Promise<void>;
  /** Whether an action is currently executing */
  isPending: boolean;
  /** Last error from action execution */
  error: Error | null;
  /** Register a form field with the action */
  registerField: (name: string, getValue: () => unknown) => void;
  /** Unregister a form field */
  unregisterField: (name: string) => void;
}
