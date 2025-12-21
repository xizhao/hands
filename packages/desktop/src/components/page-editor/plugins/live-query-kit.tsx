"use client";

/**
 * LiveValue Plugin - Desktop Implementation
 *
 * Single element for displaying live SQL data with multiple display modes.
 * This file provides the desktop-specific implementation with tRPC data fetching.
 *
 * Types and validation constants are imported from @hands/core.
 */

import { Lightning } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { createSlateEditor, type TElement, type TText } from "platejs";
import {
  createPlatePlugin,
  PlateElement,
  type PlateElementProps,
  useElement,
  useReadOnly,
  useSelected,
} from "platejs/react";
import { PlateStatic } from "platejs/static";
import { memo, useMemo, useCallback, useState, useEffect, useRef, createContext, useContext, type ReactNode } from "react";
import { toast } from "sonner";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useLiveQuery } from "@/lib/live-query";
import { useActiveRuntime } from "@/hooks/useWorkbook";
import { trpc } from "@/lib/trpc";
import { convertNodesSerialize } from "@platejs/markdown";
import { replaceTextBindings } from "../lib/live-query-context";

// Import types from @hands/core (single source of truth)
import {
  LIVE_VALUE_KEY,
  LIVE_ACTION_KEY,
  BUTTON_KEY,
  INPUT_KEY,
  SELECT_KEY,
  OPTION_KEY,
  CHECKBOX_KEY,
  TEXTAREA_KEY,
  type DisplayMode,
  type ColumnConfig,
  type TLiveValueElement,
  type TLiveActionElement,
  type TButtonElement,
  type TInputElement,
  type TSelectElement,
  type TOptionElement,
  type TCheckboxElement,
  type TTextareaElement,
  type LiveActionContextValue,
} from "@hands/core/types";

// Re-export types for consumers
export {
  LIVE_VALUE_KEY,
  LIVE_ACTION_KEY,
  BUTTON_KEY,
  INPUT_KEY,
  SELECT_KEY,
  OPTION_KEY,
  CHECKBOX_KEY,
  TEXTAREA_KEY,
  type DisplayMode,
  type ColumnConfig,
  type TLiveValueElement,
  type TLiveActionElement,
  type TButtonElement,
  type TInputElement,
  type TSelectElement,
  type TOptionElement,
  type TCheckboxElement,
  type TTextareaElement,
};

// ============================================================================
// LiveAction Context
// ============================================================================

const LiveActionContext = createContext<LiveActionContextValue | null>(null);

export function useLiveAction(): LiveActionContextValue {
  const ctx = useContext(LiveActionContext);
  if (!ctx) {
    throw new Error("useLiveAction must be used within a LiveAction element");
  }
  return ctx;
}

// ============================================================================
// Form Binding Substitution
// ============================================================================

/**
 * Substitute {{field}} bindings in SQL with form values.
 * Values are properly escaped for SQL.
 */
function substituteFormBindings(
  sql: string,
  formValues: Record<string, unknown>
): string {
  return sql.replace(/\{\{(\w+)\}\}/g, (match, field) => {
    if (!(field in formValues)) {
      console.warn(`[LiveAction] Form field {{${field}}} not found`);
      return "NULL";
    }

    const value = formValues[field];

    // SQL value formatting
    if (value === null || value === undefined || value === "") return "NULL";
    if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
    if (typeof value === "number") return String(value);

    // String: escape single quotes
    return `'${String(value).replace(/'/g, "''")}'`;
  });
}

// ============================================================================
// Display Type Selection
// ============================================================================

export type DisplayType = "inline" | "list" | "table";

/**
 * Select display type based on data shape.
 * Biases towards minimal/simplest display.
 */
export function selectDisplayType(data: Record<string, unknown>[]): DisplayType {
  if (!data || data.length === 0) return "table";

  const rowCount = data.length;
  const colCount = Object.keys(data[0]).length;

  // Single value (1×1) → inline
  if (rowCount === 1 && colCount === 1) {
    return "inline";
  }

  // Multiple rows, single col → list
  if (colCount === 1) {
    return "list";
  }

  // Everything else → table
  return "table";
}

/**
 * Resolve display mode from prop and data.
 * "auto" → select based on data shape
 */
function resolveDisplayMode(
  displayProp: DisplayMode | undefined,
  data: Record<string, unknown>[]
): DisplayType {
  if (!displayProp || displayProp === "auto") {
    return selectDisplayType(data);
  }
  return displayProp;
}

// ============================================================================
// Template Binding System
// ============================================================================

function hasTemplateContent(children: (TElement | TText)[]): boolean {
  if (!children || children.length === 0) return false;
  if (children.length === 1 && "text" in children[0] && !children[0].text) {
    return false;
  }
  return true;
}

function replaceBindings(
  node: TElement | TText,
  data: Record<string, unknown>,
  index?: number
): TElement | TText {
  if ("text" in node) {
    return {
      ...node,
      text: replaceTextBindings(String(node.text ?? ""), data, index),
    };
  }
  return {
    ...node,
    children: node.children?.map((child) => replaceBindings(child, data, index)) ?? [],
  };
}

function renderBoundTemplate(
  template: (TElement | TText)[],
  data: Record<string, unknown>,
  index: number
): ReactNode {
  const boundValue = template.map((node) =>
    replaceBindings(node, data, index)
  ) as TElement[];
  const editor = createSlateEditor({ value: boundValue });
  return <PlateStatic editor={editor} className="pointer-events-none" />;
}

// ============================================================================
// Rendering Helpers
// ============================================================================

function autoDetectColumns(data: Record<string, unknown>[]): ColumnConfig[] {
  if (data.length === 0) return [];
  const firstRow = data[0];
  return Object.keys(firstRow).map((key) => ({
    key,
    label: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " "),
  }));
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value instanceof Date) return value.toLocaleDateString();
  return String(value);
}

function extractQueryReference(sql: string | undefined): { table?: string; column?: string } {
  if (!sql) return {};
  const fromMatch = sql.match(/FROM\s+["']?(\w+)["']?/i);
  const selectMatch = sql.match(/SELECT\s+([\w,\s*]+)\s+FROM/i);

  const table = fromMatch?.[1];
  let column: string | undefined;

  if (selectMatch) {
    const cols = selectMatch[1].trim();
    if (cols !== "*") {
      column = cols.split(",")[0].trim().split(/\s+AS\s+/i)[0].trim();
    }
  }

  return { table, column };
}

// ============================================================================
// Display Components
// ============================================================================

interface DisplayProps {
  data: Record<string, unknown>[];
  query?: string;
  columns?: ColumnConfig[] | "auto";
  queryRef: { table?: string; column?: string };
  onTableClick?: () => void;
}

/** Inline value - single value as styled text */
function InlineDisplay({ data, queryRef, onTableClick }: DisplayProps) {
  const value = data[0][Object.keys(data[0])[0]];
  const displayValue = formatCellValue(value);

  const tooltipContent = useMemo(() => {
    if (queryRef.column && queryRef.table) {
      return (
        <div className="flex flex-col gap-0.5">
          <span className="opacity-70">from</span>
          <span>{queryRef.table}.{queryRef.column}</span>
        </div>
      );
    }
    if (queryRef.table) {
      return (
        <div className="flex flex-col gap-0.5">
          <span className="opacity-70">from</span>
          <span>{queryRef.table}</span>
        </div>
      );
    }
    return "Live Value";
  }, [queryRef]);

  const badge = (
    <span
      onClick={queryRef.table ? onTableClick : undefined}
      className={cn(
        "inline font-semibold text-violet-600 dark:text-violet-400 transition-colors",
        "underline decoration-dashed decoration-violet-400/50 underline-offset-2",
        queryRef.table
          ? "cursor-pointer hover:text-violet-700 dark:hover:text-violet-300 hover:decoration-violet-500"
          : "hover:decoration-violet-400"
      )}
    >
      <span className="tabular-nums">{displayValue}</span>
    </span>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent side="top" sideOffset={6}>
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Bullet list display */
function ListDisplay({ data }: DisplayProps) {
  const key = Object.keys(data[0])[0];
  return (
    <ul className="my-2 space-y-0.5 list-disc list-inside text-sm">
      {data.map((row, i) => (
        <li key={i}>{formatCellValue(row[key])}</li>
      ))}
    </ul>
  );
}

/** Table display */
function TableDisplay({ data, columns }: DisplayProps) {
  const resolvedColumns = columns === "auto" || !columns
    ? autoDetectColumns(data)
    : columns;

  return (
    <div className="my-4 overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-muted/50 border-b border-border">
            {resolvedColumns.map((col) => (
              <th
                key={col.key}
                className="px-4 py-2 text-left text-sm font-medium text-muted-foreground"
                style={col.width ? { width: col.width } : undefined}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
              {resolvedColumns.map((col) => (
                <td key={col.key} className="px-4 py-2 text-sm">
                  {formatCellValue(row[col.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// Loading & Error States
// ============================================================================

function LiveValueSkeleton({ isInline }: { isInline: boolean }) {
  if (isInline) {
    return (
      <span className="inline-block align-baseline animate-pulse">
        <span className="inline-block h-[1em] w-12 bg-muted/60 rounded-sm align-baseline" />
      </span>
    );
  }
  return (
    <div className="animate-pulse space-y-2 my-4">
      <div className="h-4 bg-muted/50 rounded w-3/4" />
      <div className="h-4 bg-muted/50 rounded w-1/2" />
      <div className="h-4 bg-muted/50 rounded w-2/3" />
    </div>
  );
}

function LiveValueError({
  error,
  onRetry,
  isInline,
  isRetrying,
}: {
  error: Error;
  onRetry: () => void;
  isInline: boolean;
  isRetrying?: boolean;
  retryCount?: number;
}) {
  // Show shimmer during retry (no error display, silent retry)
  if (isRetrying) {
    return <LiveValueSkeleton isInline={isInline} />;
  }

  // Final error state (after all retries exhausted)
  if (isInline) {
    return (
      <span
        className="text-destructive cursor-pointer hover:underline"
        onClick={onRetry}
        title={`${error.message} - Click to retry`}
      >
        error
      </span>
    );
  }
  return (
    <div className="my-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-destructive">Query Error</p>
          <p className="text-xs text-destructive/80 mt-1">{error.message}</p>
        </div>
        <button
          onClick={onRetry}
          className="px-3 py-1 text-xs bg-destructive/20 hover:bg-destructive/30 text-destructive rounded transition-colors"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

function LiveValueEmpty({ isInline }: { isInline: boolean }) {
  if (isInline) {
    return <span className="text-muted-foreground italic">—</span>;
  }
  return (
    <div className="my-4 text-center py-8 text-muted-foreground text-sm border border-dashed border-border rounded-lg">
      No data
    </div>
  );
}

// ============================================================================
// Main LiveValue Component
// ============================================================================

function LiveValueElement(props: PlateElementProps) {
  const element = useElement<TLiveValueElement>();
  const readOnly = useReadOnly();
  const selected = useSelected();
  const navigate = useNavigate();
  const { data: runtime } = useActiveRuntime();
  const runtimePort = runtime?.runtime_port ?? null;

  const { query, params, display, columns, className } = element;
  const template = element.children;
  const hasTemplate = hasTemplateContent(template);

  const paramArray = useMemo(() => {
    if (!params) return [];
    return Object.values(params);
  }, [params]);

  const { data, isLoading, error, isRetrying, retryCount, refetch } = useLiveQuery<Record<string, unknown>>({
    sql: query,
    params: paramArray,
    enabled: !!query && !!runtimePort,
    runtimePort,
  });

  const queryRef = useMemo(() => extractQueryReference(query), [query]);

  // Determine display mode
  const displayMode = useMemo(() => {
    if (!data || data.length === 0) return display === "inline" ? "inline" : "table";
    return resolveDisplayMode(display, data);
  }, [data, display]);

  const isInline = displayMode === "inline";

  const handleTableClick = useCallback(() => {
    if (queryRef.table) {
      navigate({ to: "/tables/$tableId", params: { tableId: queryRef.table } });
    }
  }, [navigate, queryRef.table]);

  // Render content based on display mode
  const content = useMemo(() => {
    if (isLoading) return <LiveValueSkeleton isInline={isInline} />;
    if (error) return <LiveValueError error={error} onRetry={refetch} isInline={isInline} isRetrying={isRetrying} retryCount={retryCount} />;
    if (!data || data.length === 0) return <LiveValueEmpty isInline={isInline} />;

    // Template mode (has children with bindings)
    if (hasTemplate) {
      const isSingleRow = data.length === 1;
      if (isSingleRow) {
        return (
          <div className="my-2">
            {renderBoundTemplate(template, data[0], 1)}
          </div>
        );
      }
      return (
        <div className="my-2 space-y-1">
          {data.map((row, rowIndex) => (
            <div key={rowIndex}>
              {renderBoundTemplate(template, row, rowIndex + 1)}
            </div>
          ))}
        </div>
      );
    }

    const displayProps: DisplayProps = {
      data,
      query,
      columns,
      queryRef,
      onTableClick: handleTableClick,
    };

    switch (displayMode) {
      case "inline":
        return <InlineDisplay {...displayProps} />;
      case "list":
        return <ListDisplay {...displayProps} />;
      case "table":
        return <TableDisplay {...displayProps} />;
    }
  }, [data, isLoading, error, isRetrying, retryCount, displayMode, hasTemplate, template, columns, query, queryRef, handleTableClick, refetch, isInline]);

  const showChip = selected && !readOnly && !isInline;

  // Inline rendering (no block wrapper)
  if (isInline) {
    return (
      <PlateElement
        {...props}
        attributes={{
          ...props.attributes,
          contentEditable: false,
          draggable: true,
        }}
        className={cn("inline-block align-baseline", className)}
      >
        {content}
        {props.children}
      </PlateElement>
    );
  }

  // Block rendering
  return (
    <PlateElement
      {...props}
      className={cn(
        "relative group rounded-lg transition-colors",
        "py-2 -mx-2 px-2",
        !selected && "hover:bg-muted/30",
        selected && !readOnly && "bg-muted/40 ring-2 ring-violet-500/50",
        className
      )}
    >
      <div contentEditable={false}>
        {showChip && (
          <div className="absolute -top-7 left-0 flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-violet-500/10 border border-violet-500/30 text-violet-600 dark:text-violet-400">
              <Lightning weight="fill" className="size-3.5" />
              <span className="text-xs font-medium">
                {queryRef.column ? (
                  <>
                    <span className="opacity-70">{queryRef.table}.</span>
                    {queryRef.column}
                  </>
                ) : queryRef.table ? (
                  queryRef.table
                ) : (
                  "Query"
                )}
              </span>
            </div>
          </div>
        )}
        {content}
      </div>
      <div className="hidden">{props.children}</div>
    </PlateElement>
  );
}

// ============================================================================
// LiveAction Component
// ============================================================================

function LiveActionElement(props: PlateElementProps) {
  const element = useElement<TLiveActionElement>();
  const { data: runtime } = useActiveRuntime();
  const runtimePort = runtime?.runtime_port ?? null;

  const { sql, params } = element;

  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Form field registration
  const fieldsRef = useRef<Map<string, () => unknown>>(new Map());

  const registerField = useCallback((name: string, getValue: () => unknown) => {
    fieldsRef.current.set(name, getValue);
  }, []);

  const unregisterField = useCallback((name: string) => {
    fieldsRef.current.delete(name);
  }, []);

  const getAllFormValues = useCallback(() => {
    const values: Record<string, unknown> = {};
    for (const [name, getValue] of fieldsRef.current) {
      values[name] = getValue();
    }
    return values;
  }, []);

  const dbQuery = trpc.db.query.useMutation({
    onError: () => {}, // Suppress global error handler - we show our own toast
  });

  const paramArray = useMemo(() => {
    if (!params) return [];
    return Object.values(params);
  }, [params]);

  const trigger = useCallback(async () => {
    if (!sql) {
      toast.error("No SQL configured for this action");
      return;
    }
    if (!runtimePort) {
      toast.error("Runtime not available");
      return;
    }

    setIsPending(true);
    setError(null);

    try {
      // Collect form values and substitute in SQL
      const formValues = getAllFormValues();
      const substitutedSql = substituteFormBindings(sql, formValues);

      await dbQuery.mutateAsync({ sql: substitutedSql, params: paramArray });
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      toast.error(`Action failed: ${e.message}`);
    } finally {
      setIsPending(false);
    }
  }, [sql, paramArray, runtimePort, dbQuery, getAllFormValues]);

  const contextValue = useMemo(
    () => ({ trigger, isPending, error, registerField, unregisterField }),
    [trigger, isPending, error, registerField, unregisterField]
  );

  return (
    <PlateElement {...props}>
      <LiveActionContext.Provider value={contextValue}>
        <div className="relative">
          {props.children}
          {isPending && (
            <div className="absolute inset-0 bg-background/50 flex items-center justify-center pointer-events-none">
              <div className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
            </div>
          )}
        </div>
      </LiveActionContext.Provider>
    </PlateElement>
  );
}

// ============================================================================
// ActionButton Component
// ============================================================================

/**
 * ButtonElement - A button that triggers the parent LiveAction.
 * Automatically wires up onClick to call useLiveAction().trigger().
 */
function ButtonElement(props: PlateElementProps) {
  const element = useElement<TButtonElement>();
  const { variant = "default" } = element;

  // Try to get context - will be null if not inside LiveAction
  const actionCtx = useContext(LiveActionContext);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (actionCtx) {
        actionCtx.trigger();
      } else {
        toast.error("ActionButton must be inside a LiveAction element");
      }
    },
    [actionCtx]
  );

  const isPending = actionCtx?.isPending ?? false;

  // Variant styles
  const variantStyles = {
    default: "bg-primary text-primary-foreground hover:bg-primary/90",
    outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
    ghost: "hover:bg-accent hover:text-accent-foreground",
    destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  };

  return (
    <PlateElement {...props} as="span">
      <button
        onClick={handleClick}
        disabled={isPending}
        contentEditable={false}
        className={cn(
          "inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium",
          "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:pointer-events-none disabled:opacity-50",
          variantStyles[variant]
        )}
      >
        {isPending ? (
          <>
            <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <span>Loading...</span>
          </>
        ) : (
          props.children
        )}
      </button>
    </PlateElement>
  );
}

// ============================================================================
// Form Control Components
// ============================================================================

/**
 * Check if element children have text content (not just empty text nodes).
 */
function hasLabelContent(element: { children?: Array<{ text?: string } | object> }): boolean {
  if (!element.children || element.children.length === 0) return false;
  // Check if any child has non-empty text
  return element.children.some((child) => {
    if ("text" in child && typeof child.text === "string") {
      return child.text.trim().length > 0;
    }
    // If it's an element (not text), assume it has content
    return true;
  });
}

/**
 * InputElement - Text input that registers with parent LiveAction.
 * Children are rendered as the label.
 */
function InputElement(props: PlateElementProps) {
  const element = useElement<TInputElement>();
  const selected = useSelected();
  const {
    name,
    inputType = "text",
    placeholder,
    defaultValue,
    required,
    pattern,
    min,
    max,
    step,
  } = element;

  const actionCtx = useContext(LiveActionContext);
  const [value, setValue] = useState(defaultValue ?? "");
  const valueRef = useRef(value);
  valueRef.current = value;

  // Register with parent LiveAction
  useEffect(() => {
    if (!actionCtx || !name) return;

    actionCtx.registerField(name, () => {
      // For number inputs, convert to number
      if (inputType === "number" && valueRef.current !== "") {
        return Number(valueRef.current);
      }
      return valueRef.current;
    });

    return () => actionCtx.unregisterField(name);
  }, [actionCtx, name, inputType]);

  const isPending = actionCtx?.isPending ?? false;
  const showLabel = hasLabelContent(element);

  return (
    <PlateElement
      {...props}
      as="div"
      className={cn(
        "my-2 rounded-md p-0.5",
        selected && "ring-2 ring-ring ring-offset-1"
      )}
    >
      <div className="flex flex-col gap-1.5">
        {showLabel && <Label className="text-sm font-medium">{props.children}</Label>}
        <Input
          type={inputType}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          required={required}
          pattern={pattern}
          min={min}
          max={max}
          step={step}
          disabled={isPending}
          contentEditable={false}
          className="w-full"
        />
        {!showLabel && <span className="hidden">{props.children}</span>}
      </div>
    </PlateElement>
  );
}

/**
 * SelectElement - Dropdown that registers with parent LiveAction.
 * Children are rendered as the label.
 */
function SelectElement(props: PlateElementProps) {
  const element = useElement<TSelectElement>();
  const selected = useSelected();
  const { name, placeholder, defaultValue } = element;

  // Ensure options is always an array (handle string/undefined cases)
  const rawOptions = element.options;
  const options: Array<{ value: string; label: string }> = useMemo(() => {
    if (Array.isArray(rawOptions)) return rawOptions;
    if (typeof rawOptions === "string") {
      try {
        const parsed = JSON.parse(rawOptions);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }, [rawOptions]);

  const actionCtx = useContext(LiveActionContext);
  const [value, setValue] = useState(defaultValue ?? "");
  const valueRef = useRef(value);
  valueRef.current = value;

  // Register with parent LiveAction
  useEffect(() => {
    if (!actionCtx || !name) return;

    actionCtx.registerField(name, () => valueRef.current);

    return () => actionCtx.unregisterField(name);
  }, [actionCtx, name]);

  const isPending = actionCtx?.isPending ?? false;
  const showLabel = hasLabelContent(element);

  return (
    <PlateElement
      {...props}
      as="div"
      className={cn(
        "my-2 rounded-md p-0.5",
        selected && "ring-2 ring-ring ring-offset-1"
      )}
    >
      <div className="flex flex-col gap-1.5">
        {showLabel && <Label className="text-sm font-medium">{props.children}</Label>}
        <Select value={value} onValueChange={setValue} disabled={isPending}>
          <SelectTrigger className="w-full" contentEditable={false}>
            <SelectValue placeholder={placeholder ?? "Select..."} />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!showLabel && <span className="hidden">{props.children}</span>}
      </div>
    </PlateElement>
  );
}

/**
 * CheckboxElement - Checkbox that registers with parent LiveAction.
 * Children are rendered as the label.
 */
function CheckboxElement(props: PlateElementProps) {
  const element = useElement<TCheckboxElement>();
  const selected = useSelected();
  const { name, defaultChecked } = element;

  const actionCtx = useContext(LiveActionContext);
  const [checked, setChecked] = useState(defaultChecked ?? false);
  const checkedRef = useRef(checked);
  checkedRef.current = checked;

  // Register with parent LiveAction
  useEffect(() => {
    if (!actionCtx || !name) return;

    actionCtx.registerField(name, () => checkedRef.current);

    return () => actionCtx.unregisterField(name);
  }, [actionCtx, name]);

  const isPending = actionCtx?.isPending ?? false;
  const showLabel = hasLabelContent(element);

  return (
    <PlateElement
      {...props}
      as="div"
      className={cn(
        "my-2 rounded-md p-0.5",
        selected && "ring-2 ring-ring ring-offset-1"
      )}
    >
      <div className="flex items-center gap-2">
        <Checkbox
          checked={checked}
          onCheckedChange={(c) => setChecked(c === true)}
          disabled={isPending}
          contentEditable={false}
        />
        {showLabel && <Label className="text-sm font-medium cursor-pointer">{props.children}</Label>}
        {!showLabel && <span className="hidden">{props.children}</span>}
      </div>
    </PlateElement>
  );
}

/**
 * TextareaElement - Multi-line input that registers with parent LiveAction.
 * Children are rendered as the label.
 */
function TextareaElement(props: PlateElementProps) {
  const element = useElement<TTextareaElement>();
  const selected = useSelected();
  const { name, placeholder, defaultValue, rows = 3 } = element;

  const actionCtx = useContext(LiveActionContext);
  const [value, setValue] = useState(defaultValue ?? "");
  const valueRef = useRef(value);
  valueRef.current = value;

  // Register with parent LiveAction
  useEffect(() => {
    if (!actionCtx || !name) return;

    actionCtx.registerField(name, () => valueRef.current);

    return () => actionCtx.unregisterField(name);
  }, [actionCtx, name]);

  const isPending = actionCtx?.isPending ?? false;
  const showLabel = hasLabelContent(element);

  return (
    <PlateElement
      {...props}
      as="div"
      className={cn(
        "my-2 rounded-md p-0.5",
        selected && "ring-2 ring-ring ring-offset-1"
      )}
    >
      <div className="flex flex-col gap-1.5">
        {showLabel && <Label className="text-sm font-medium">{props.children}</Label>}
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          disabled={isPending}
          contentEditable={false}
          className="w-full"
        />
        {!showLabel && <span className="hidden">{props.children}</span>}
      </div>
    </PlateElement>
  );
}

// ============================================================================
// Plugins
// ============================================================================

/**
 * LiveValue Plugin - inline element for SQL query results.
 * Display prop controls rendering (inline badge, list, or table).
 */
export const LiveValuePlugin = createPlatePlugin({
  key: LIVE_VALUE_KEY,
  node: {
    isElement: true,
    isInline: true,
    isVoid: true,
    component: memo(LiveValueElement),
  },
});

/**
 * LiveAction Plugin
 */
export const LiveActionPlugin = createPlatePlugin({
  key: LIVE_ACTION_KEY,
  node: {
    isElement: true,
    isVoid: false,
    isContainer: true,
    component: memo(LiveActionElement),
  },
});

/**
 * ActionButton Plugin - inline button that triggers parent LiveAction.
 */
export const ButtonPlugin = createPlatePlugin({
  key: BUTTON_KEY,
  node: {
    isElement: true,
    isInline: true,
    isVoid: false, // Has children (button text)
    component: memo(ButtonElement),
  },
});

/**
 * Input Plugin - block text input for form submission.
 * Children are the label text.
 */
export const InputPlugin = createPlatePlugin({
  key: INPUT_KEY,
  node: {
    isElement: true,
    isInline: false, // Block element for proper form layout
    isVoid: false,   // Has children (label text)
    component: memo(InputElement),
  },
});

/**
 * Select Plugin - block dropdown for form submission.
 * Children are the label text.
 */
export const SelectPlugin = createPlatePlugin({
  key: SELECT_KEY,
  node: {
    isElement: true,
    isInline: false, // Block element for proper form layout
    isVoid: false,   // Has children (label text)
    component: memo(SelectElement),
  },
});

/**
 * Checkbox Plugin - block checkbox for form submission.
 * Children are the label text.
 */
export const CheckboxPlugin = createPlatePlugin({
  key: CHECKBOX_KEY,
  node: {
    isElement: true,
    isInline: false, // Block element for proper form layout
    isVoid: false,   // Has children (label text)
    component: memo(CheckboxElement),
  },
});

/**
 * Textarea Plugin - block textarea for form submission.
 * Children are the label text.
 */
export const TextareaPlugin = createPlatePlugin({
  key: TEXTAREA_KEY,
  node: {
    isElement: true,
    isInline: false, // Block element
    isVoid: false,   // Has children (label text)
    component: memo(TextareaElement),
  },
});

export const LiveQueryKit = [
  LiveValuePlugin,
  LiveActionPlugin,
  ButtonPlugin,
  InputPlugin,
  SelectPlugin,
  CheckboxPlugin,
  TextareaPlugin,
];

// ============================================================================
// Insertion Helpers
// ============================================================================

/**
 * Create a LiveValue element.
 */
export function createLiveValueElement(
  query: string,
  options?: {
    display?: DisplayMode;
    params?: Record<string, unknown>;
    columns?: ColumnConfig[] | "auto";
    children?: (TElement | TText)[];
  }
): TLiveValueElement {
  return {
    type: LIVE_VALUE_KEY,
    query,
    display: options?.display,
    params: options?.params,
    columns: options?.columns,
    children: options?.children ?? [{ text: "" }],
  };
}

/**
 * Create a LiveAction element that wraps interactive content.
 */
export function createLiveActionElement(
  options: { sql?: string; src?: string; params?: Record<string, unknown> },
  children?: (TElement | TText)[]
): TLiveActionElement {
  return {
    type: LIVE_ACTION_KEY,
    sql: options.sql,
    src: options.src,
    params: options.params,
    children: children ?? [{ type: "p", children: [{ text: "" }] }],
  };
}

/**
 * Create an ActionButton element that triggers parent LiveAction.
 */
export function createButtonElement(
  label: string,
  variant?: TButtonElement["variant"]
): TButtonElement {
  return {
    type: BUTTON_KEY,
    variant,
    children: [{ text: label }],
  };
}

// ============================================================================
// Markdown Serialization
// ============================================================================

/**
 * Serialize LiveValue to MDX.
 *
 * Examples:
 *   <LiveValue query="SELECT COUNT(*) FROM users" />
 *   <LiveValue query="SELECT id FROM features" display="list" />
 *   <LiveValue query="SELECT * FROM orders" display="table" />
 *   <LiveValue query="SELECT name, value FROM metrics">
 *     # {{value}}
 *   </LiveValue>
 */
export const liveQueryMarkdownRule = {
  [LIVE_VALUE_KEY]: {
    serialize: (node: TLiveValueElement, options: any) => {
      const attributes: Array<{ type: "mdxJsxAttribute"; name: string; value: unknown }> = [
        { type: "mdxJsxAttribute", name: "query", value: node.query },
      ];

      if (node.display && node.display !== "auto") {
        attributes.push({ type: "mdxJsxAttribute", name: "display", value: node.display });
      }
      if (node.params && Object.keys(node.params).length > 0) {
        attributes.push({
          type: "mdxJsxAttribute",
          name: "params",
          value: { type: "mdxJsxAttributeValueExpression", value: JSON.stringify(node.params) },
        });
      }
      if (node.columns) {
        if (node.columns === "auto") {
          attributes.push({ type: "mdxJsxAttribute", name: "columns", value: "auto" });
        } else {
          attributes.push({
            type: "mdxJsxAttribute",
            name: "columns",
            value: { type: "mdxJsxAttributeValueExpression", value: JSON.stringify(node.columns) },
          });
        }
      }
      if (node.className) {
        attributes.push({ type: "mdxJsxAttribute", name: "className", value: node.className });
      }

      // Recursively serialize children (template content)
      const children = convertNodesSerialize(node.children || [], options);
      const firstChild = children[0] as { type: string; value?: string } | undefined;
      const hasContent = children.length > 0 && !(children.length === 1 && firstChild?.type === "text" && !firstChild?.value?.trim());

      return {
        type: hasContent ? "mdxJsxFlowElement" : "mdxJsxTextElement",
        name: "LiveValue",
        attributes,
        children: hasContent ? children : [],
      };
    },
  },

  [LIVE_ACTION_KEY]: {
    serialize: (node: TLiveActionElement, options: any) => {
      console.log('[LiveAction serialize] node:', JSON.stringify(node, null, 2));
      const attributes: Array<{ type: "mdxJsxAttribute"; name: string; value: unknown }> = [];

      if (node.sql) {
        attributes.push({ type: "mdxJsxAttribute", name: "sql", value: node.sql });
      }
      if (node.src) {
        attributes.push({ type: "mdxJsxAttribute", name: "src", value: node.src });
      }
      if (node.params && Object.keys(node.params).length > 0) {
        attributes.push({
          type: "mdxJsxAttribute",
          name: "params",
          value: { type: "mdxJsxAttributeValueExpression", value: JSON.stringify(node.params) },
        });
      }

      // Recursively serialize children
      const children = convertNodesSerialize(node.children || [], options);
      console.log('[LiveAction serialize] children result:', JSON.stringify(children, null, 2));

      return {
        type: "mdxJsxFlowElement",
        name: "LiveAction",
        attributes,
        children,
      };
    },
  },

  [BUTTON_KEY]: {
    serialize: (node: TButtonElement, options: any) => {
      const attributes: Array<{ type: "mdxJsxAttribute"; name: string; value: unknown }> = [];

      if (node.variant && node.variant !== "default") {
        attributes.push({ type: "mdxJsxAttribute", name: "variant", value: node.variant });
      }

      // Recursively serialize children
      const children = convertNodesSerialize(node.children || [], options);

      return {
        type: "mdxJsxTextElement",
        name: "Button",
        attributes,
        children,
      };
    },
  },

  [INPUT_KEY]: {
    serialize: (node: TInputElement, options: any) => {
      const attributes: Array<{ type: "mdxJsxAttribute"; name: string; value: unknown }> = [
        { type: "mdxJsxAttribute", name: "name", value: node.name },
      ];

      if (node.inputType && node.inputType !== "text") {
        attributes.push({ type: "mdxJsxAttribute", name: "type", value: node.inputType });
      }
      if (node.placeholder) {
        attributes.push({ type: "mdxJsxAttribute", name: "placeholder", value: node.placeholder });
      }
      if (node.defaultValue) {
        attributes.push({ type: "mdxJsxAttribute", name: "defaultValue", value: node.defaultValue });
      }
      if (node.required) {
        attributes.push({ type: "mdxJsxAttribute", name: "required", value: null });
      }
      if (node.pattern) {
        attributes.push({ type: "mdxJsxAttribute", name: "pattern", value: node.pattern });
      }
      if (node.min !== undefined) {
        attributes.push({
          type: "mdxJsxAttribute",
          name: "min",
          value: { type: "mdxJsxAttributeValueExpression", value: String(node.min) },
        });
      }
      if (node.max !== undefined) {
        attributes.push({
          type: "mdxJsxAttribute",
          name: "max",
          value: { type: "mdxJsxAttributeValueExpression", value: String(node.max) },
        });
      }
      if (node.step !== undefined) {
        attributes.push({
          type: "mdxJsxAttribute",
          name: "step",
          value: { type: "mdxJsxAttributeValueExpression", value: String(node.step) },
        });
      }

      // Serialize children (label text)
      const children = convertNodesSerialize(node.children || [], options);

      return {
        type: "mdxJsxFlowElement", // Block element
        name: "Input",
        attributes,
        children,
      };
    },
  },

  [SELECT_KEY]: {
    serialize: (node: TSelectElement, options: any) => {
      const attributes: Array<{ type: "mdxJsxAttribute"; name: string; value: unknown }> = [
        { type: "mdxJsxAttribute", name: "name", value: node.name },
      ];

      // Format options as JS object array syntax (not JSON - no quoted keys)
      if (node.options && node.options.length > 0) {
        const optionsJs = node.options
          .map((opt) => `{ value: ${JSON.stringify(opt.value)}, label: ${JSON.stringify(opt.label)} }`)
          .join(", ");
        attributes.push({
          type: "mdxJsxAttribute",
          name: "options",
          value: { type: "mdxJsxAttributeValueExpression", value: `[${optionsJs}]` },
        });
      }

      if (node.placeholder) {
        attributes.push({ type: "mdxJsxAttribute", name: "placeholder", value: node.placeholder });
      }
      if (node.defaultValue) {
        attributes.push({ type: "mdxJsxAttribute", name: "defaultValue", value: node.defaultValue });
      }
      if (node.required) {
        attributes.push({ type: "mdxJsxAttribute", name: "required", value: null });
      }

      // Serialize children (label text)
      const children = convertNodesSerialize(node.children || [], options);

      return {
        type: "mdxJsxFlowElement", // Block element
        name: "Select",
        attributes,
        children,
      };
    },
  },

  [CHECKBOX_KEY]: {
    serialize: (node: TCheckboxElement, options: any) => {
      const attributes: Array<{ type: "mdxJsxAttribute"; name: string; value: unknown }> = [
        { type: "mdxJsxAttribute", name: "name", value: node.name },
      ];

      if (node.defaultChecked) {
        attributes.push({ type: "mdxJsxAttribute", name: "defaultChecked", value: null });
      }

      // Serialize children (label text)
      const children = convertNodesSerialize(node.children || [], options);

      return {
        type: "mdxJsxFlowElement", // Block element
        name: "Checkbox",
        attributes,
        children,
      };
    },
  },

  [TEXTAREA_KEY]: {
    serialize: (node: TTextareaElement, options: any) => {
      const attributes: Array<{ type: "mdxJsxAttribute"; name: string; value: unknown }> = [
        { type: "mdxJsxAttribute", name: "name", value: node.name },
      ];

      if (node.placeholder) {
        attributes.push({ type: "mdxJsxAttribute", name: "placeholder", value: node.placeholder });
      }
      if (node.defaultValue) {
        attributes.push({ type: "mdxJsxAttribute", name: "defaultValue", value: node.defaultValue });
      }
      if (node.rows && node.rows !== 3) {
        attributes.push({
          type: "mdxJsxAttribute",
          name: "rows",
          value: { type: "mdxJsxAttributeValueExpression", value: String(node.rows) },
        });
      }
      if (node.required) {
        attributes.push({ type: "mdxJsxAttribute", name: "required", value: null });
      }

      // Serialize children (label text)
      const children = convertNodesSerialize(node.children || [], options);

      return {
        type: "mdxJsxFlowElement", // Block element
        name: "Textarea",
        attributes,
        children,
      };
    },
  },
};

// ============================================================================
// Markdown Deserialization
// ============================================================================

/**
 * Single canonical deserializer for LiveValue/LiveQuery MDX elements.
 *
 * Always returns inline type - Slate elements are always inline.
 * The display prop controls HOW it renders (badge vs table), not WHERE.
 */
export function deserializeLiveValue(
  node: { attributes?: Array<{ type: string; name: string; value: unknown }> }
): TLiveValueElement {
  const attributes = node.attributes || [];
  const props: Record<string, unknown> = {};

  for (const attr of attributes) {
    if (attr.type === "mdxJsxAttribute") {
      const name = attr.name;
      const value = attr.value;

      if (value === null || value === undefined) {
        props[name] = true;
      } else if (typeof value === "string") {
        props[name] = value;
      } else if (typeof value === "object" && value !== null) {
        const expr = value as Record<string, unknown>;
        if (expr.type === "mdxJsxAttributeValueExpression" && typeof expr.value === "string") {
          try {
            props[name] = JSON.parse(expr.value as string);
          } catch {
            props[name] = expr.value;
          }
        }
      }
    }
  }

  return {
    type: LIVE_VALUE_KEY,
    query: (props.query as string) || "",
    display: (props.display as DisplayMode | undefined) ?? "inline",
    params: props.params as Record<string, unknown> | undefined,
    columns: props.columns as ColumnConfig[] | "auto" | undefined,
    className: props.className as string | undefined,
    children: [{ text: "" }],
  };
}

export function deserializeLiveActionElement(
  node: {
    attributes?: Array<{ type: string; name: string; value: unknown }>;
  },
  options?: { children?: (TElement | TText)[] }
): TLiveActionElement {
  const attributes = node.attributes || [];
  const props: Record<string, unknown> = {};

  for (const attr of attributes) {
    if (attr.type === "mdxJsxAttribute") {
      const name = attr.name;
      const value = attr.value;

      if (value === null || value === undefined) {
        props[name] = true;
      } else if (typeof value === "string") {
        props[name] = value;
      } else if (typeof value === "object" && value !== null) {
        const expr = value as Record<string, unknown>;
        if (expr.type === "mdxJsxAttributeValueExpression" && typeof expr.value === "string") {
          try {
            props[name] = JSON.parse(expr.value as string);
          } catch {
            props[name] = expr.value;
          }
        }
      }
    }
  }

  // Use deserialized children from options, or fallback to empty paragraph
  const children = options?.children?.length
    ? options.children
    : [{ type: "p" as const, children: [{ text: "" }] }];

  return {
    type: LIVE_ACTION_KEY,
    sql: props.sql as string | undefined,
    src: props.src as string | undefined,
    params: props.params as Record<string, unknown> | undefined,
    children,
  };
}

/**
 * Deserialize <ActionButton> MDX element.
 */
export function deserializeButtonElement(
  node: {
    attributes?: Array<{ type: string; name: string; value: unknown }>;
  },
  options?: { children?: (TElement | TText)[] }
): TButtonElement {
  const attributes = node.attributes || [];
  const props: Record<string, unknown> = {};

  for (const attr of attributes) {
    if (attr.type === "mdxJsxAttribute") {
      const name = attr.name;
      const value = attr.value;

      if (value === null || value === undefined) {
        props[name] = true;
      } else if (typeof value === "string") {
        props[name] = value;
      }
    }
  }

  // Use deserialized children from options, or fallback to empty text
  const children = options?.children?.length
    ? options.children
    : [{ text: "" }];

  return {
    type: BUTTON_KEY,
    variant: props.variant as TButtonElement["variant"],
    children,
  };
}

/**
 * Helper to parse MDX attributes into a props object.
 */
function parseAttributes(
  node: { attributes?: Array<{ type: string; name: string; value: unknown }> }
): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const attr of node.attributes || []) {
    if (attr.type === "mdxJsxAttribute") {
      const name = attr.name;
      const value = attr.value;
      if (value === null || value === undefined) {
        props[name] = true;
      } else if (typeof value === "string") {
        props[name] = value;
      } else if (typeof value === "object" && value !== null) {
        const expr = value as Record<string, unknown>;
        if (expr.type === "mdxJsxAttributeValueExpression" && typeof expr.value === "string") {
          try {
            props[name] = JSON.parse(expr.value as string);
          } catch {
            props[name] = expr.value;
          }
        }
      }
    }
  }
  return props;
}

/**
 * Deserialize <Input> MDX element.
 * Children are the label text.
 */
export function deserializeInputElement(
  node: { attributes?: Array<{ type: string; name: string; value: unknown }> },
  options?: { children?: (TElement | TText)[] }
): TInputElement {
  const props = parseAttributes(node);

  // Use deserialized children from options, or fallback to empty text
  const children = options?.children?.length
    ? options.children
    : [{ text: "" }];

  return {
    type: INPUT_KEY,
    name: (props.name as string) || "",
    inputType: props.type as TInputElement["inputType"],
    placeholder: props.placeholder as string | undefined,
    defaultValue: props.defaultValue as string | undefined,
    required: props.required === true,
    pattern: props.pattern as string | undefined,
    min: props.min as number | string | undefined,
    max: props.max as number | string | undefined,
    step: props.step as number | undefined,
    children,
  };
}

/**
 * Deserialize <Select> MDX element.
 * Children are the label text.
 */
export function deserializeSelectElement(
  node: { attributes?: Array<{ type: string; name: string; value: unknown }> },
  options?: { children?: (TElement | TText)[] }
): TSelectElement {
  const props = parseAttributes(node);

  // Use deserialized children from options, or fallback to empty text
  const children = options?.children?.length
    ? options.children
    : [{ text: "" }];

  return {
    type: SELECT_KEY,
    name: (props.name as string) || "",
    options: (props.options as Array<{ value: string; label: string }>) || [],
    placeholder: props.placeholder as string | undefined,
    defaultValue: props.defaultValue as string | undefined,
    required: props.required === true,
    children,
  };
}

/**
 * Deserialize <Checkbox> MDX element.
 * Children are the label text.
 */
export function deserializeCheckboxElement(
  node: { attributes?: Array<{ type: string; name: string; value: unknown }> },
  options?: { children?: (TElement | TText)[] }
): TCheckboxElement {
  const props = parseAttributes(node);

  // Use deserialized children from options, or fallback to empty text
  const children = options?.children?.length
    ? options.children
    : [{ text: "" }];

  return {
    type: CHECKBOX_KEY,
    name: (props.name as string) || "",
    defaultChecked: props.defaultChecked === true,
    children,
  };
}

/**
 * Deserialize <Textarea> MDX element.
 * Children are the label text.
 */
export function deserializeTextareaElement(
  node: { attributes?: Array<{ type: string; name: string; value: unknown }> },
  options?: { children?: (TElement | TText)[] }
): TTextareaElement {
  const props = parseAttributes(node);

  // Use deserialized children from options, or fallback to empty text
  const children = options?.children?.length
    ? options.children
    : [{ text: "" }];

  return {
    type: TEXTAREA_KEY,
    name: (props.name as string) || "",
    placeholder: props.placeholder as string | undefined,
    defaultValue: props.defaultValue as string | undefined,
    rows: typeof props.rows === "number" ? props.rows : undefined,
    required: props.required === true,
    children,
  };
}

// ============================================================================
// Element Creators
// ============================================================================

/**
 * Create an ActionInput element.
 */
export function createInputElement(
  name: string,
  options?: Partial<Omit<TInputElement, "type" | "name" | "children">>
): TInputElement {
  return {
    type: INPUT_KEY,
    name,
    ...options,
    children: [{ text: "" }],
  };
}

/**
 * Create an ActionSelect element.
 */
export function createSelectElement(
  name: string,
  options: Array<{ value: string; label: string }>,
  rest?: Partial<Omit<TSelectElement, "type" | "name" | "options" | "children">>
): TSelectElement {
  return {
    type: SELECT_KEY,
    name,
    options,
    ...rest,
    children: [{ text: "" }],
  };
}

/**
 * Create an ActionCheckbox element.
 */
export function createCheckboxElement(
  name: string,
  options?: Partial<Omit<TCheckboxElement, "type" | "name" | "children">>
): TCheckboxElement {
  return {
    type: CHECKBOX_KEY,
    name,
    ...options,
    children: [{ text: "" }],
  };
}

/**
 * Create an ActionTextarea element.
 */
export function createTextareaElement(
  name: string,
  options?: Partial<Omit<TTextareaElement, "type" | "name" | "children">>
): TTextareaElement {
  return {
    type: TEXTAREA_KEY,
    name,
    ...options,
    children: [{ text: "" }],
  };
}

// ============================================================================
// Templates (for slash menu)
// ============================================================================

export const TEMPLATES = {
  metric: [
    { type: "h1", children: [{ text: "{{value}}" }] },
  ] as TElement[],

  "stat-card": [
    { type: "h3", children: [{ text: "{{value}}" }] },
    { type: "p", className: "text-muted-foreground text-sm", children: [{ text: "{{label}}" }] },
  ] as TElement[],

  "bullet-list": [
    { type: "p", children: [{ text: "• {{name}}" }] },
  ] as TElement[],

  "numbered-list": [
    { type: "p", children: [{ text: "{{_index}}. {{name}}" }] },
  ] as TElement[],

  card: [
    { type: "h3", children: [{ text: "{{title}}" }] },
    { type: "p", children: [{ text: "{{description}}" }] },
  ] as TElement[],

  row: [
    { type: "p", children: [
      { text: "{{name}}", bold: true },
      { text: " — " },
      { text: "{{value}}" },
    ]},
  ] as TElement[],

  table: [] as TElement[],
};

export type TemplateKey = keyof typeof TEMPLATES;
