"use client";

/**
 * @component LiveValue
 * @category view
 * @description Displays live SQL query results. Auto-selects display format based on data shape:
 * inline (1×1), list (N×1), or table (N×M). Supports template mode with {{field}} bindings.
 * @keywords sql, query, data, display, table, list, inline, live, reactive
 * @example
 * <LiveValue sql="SELECT count(*) FROM users" />
 * <LiveValue sql="SELECT name FROM users" display="list" />
 * <LiveValue sql="SELECT * FROM tasks WHERE status = 'active'" display="table" />
 */

import {
  createPlatePlugin,
  PlateElement,
  type PlateElementProps,
  useElement,
  useReadOnly,
  useSelected,
} from "platejs/react";
import { memo } from "react";

import {
  type ColumnConfig,
  type DataGridColumnConfig,
  type DisplayMode,
  LIVE_VALUE_KEY,
  type TLiveValueElement,
} from "../../types";
import { assertReadOnlySQL } from "../sql-validation";
import { LiveValueProvider } from "./charts/context";
import { DataGrid } from "../data/data-grid";
import { useMockData } from "../../test-utils/mock-data-provider";

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
export function resolveDisplayMode(
  displayProp: DisplayMode | undefined,
  data: Record<string, unknown>[],
): DisplayType {
  if (!displayProp || displayProp === "auto") {
    return selectDisplayType(data);
  }
  return displayProp;
}

// ============================================================================
// Rendering Helpers
// ============================================================================

export function autoDetectColumns(data: Record<string, unknown>[]): ColumnConfig[] {
  if (data.length === 0) return [];
  const firstRow = data[0];
  return Object.keys(firstRow).map((key) => ({
    key,
    label: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " "),
  }));
}

export function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value instanceof Date) return value.toLocaleDateString();
  return String(value);
}

// ============================================================================
// Display Components
// ============================================================================

interface DisplayProps {
  data: Record<string, unknown>[];
  columns?: ColumnConfig[];
  isLoading?: boolean;
  error?: Error | null;
  className?: string;
}

function InlineDisplay({ data, isLoading, error }: DisplayProps) {
  if (error) {
    return <span className="text-destructive text-xs">Error</span>;
  }
  if (isLoading) {
    return <span className="text-muted-foreground animate-pulse">...</span>;
  }
  if (!data || data.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  const value = Object.values(data[0])[0];
  return <span className="font-medium tabular-nums">{formatCellValue(value)}</span>;
}

function ListDisplay({ data, isLoading, error }: DisplayProps) {
  if (error) {
    return <div className="text-destructive text-sm">Error loading data</div>;
  }
  if (isLoading) {
    return <div className="text-muted-foreground animate-pulse">Loading...</div>;
  }
  if (!data || data.length === 0) {
    return <div className="text-muted-foreground text-sm">No items</div>;
  }

  const key = Object.keys(data[0])[0];
  return (
    <ul className="list-disc list-inside space-y-0.5">
      {data.map((row, i) => (
        <li key={i} className="text-sm">
          {formatCellValue(row[key])}
        </li>
      ))}
    </ul>
  );
}

function TableDisplay({ data, columns, isLoading, error }: DisplayProps) {
  // Convert ColumnConfig to DataGridColumnConfig
  const gridColumns: DataGridColumnConfig[] | undefined = columns?.map((col) => ({
    key: col.key,
    label: col.label,
    width: col.width,
  }));

  return (
    <DataGrid
      data={data}
      columns={gridColumns ?? "auto"}
      height={Math.min(400, 36 + data.length * 36)} // Auto-size based on rows
      readOnly
      enableSearch={data.length > 10}
      enablePaste={false}
    />
  );
}

// ============================================================================
// Main Component
// ============================================================================

export interface LiveValueProps {
  /** Data to display */
  data: Record<string, unknown>[];
  /** Loading state */
  isLoading?: boolean;
  /** Error state */
  error?: Error | null;
  /** Display mode override */
  display?: DisplayMode;
  /** Column configuration for table mode */
  columns?: ColumnConfig[];
  /** Additional CSS classes */
  className?: string;
}

/**
 * Renders data in the appropriate display format.
 * Use this for custom integrations outside Plate editor.
 */
export function LiveValueDisplay({
  data,
  isLoading,
  error,
  display,
  columns,
  className,
}: LiveValueProps) {
  const displayType = resolveDisplayMode(display, data);

  const props: DisplayProps = { data, columns, isLoading, error, className };

  switch (displayType) {
    case "inline":
      return <InlineDisplay {...props} />;
    case "list":
      return <ListDisplay {...props} />;
    case "table":
      return <TableDisplay {...props} />;
  }
}

// ============================================================================
// Plate Plugin
// ============================================================================

/**
 * Check if element has meaningful children (not just empty text nodes).
 * Returns true if children contain actual components like charts.
 */
function hasMeaningfulChildren(element: TLiveValueElement): boolean {
  if (!element.children || element.children.length === 0) return false;
  // Check if it's just a single empty text node (the default for void elements)
  if (element.children.length === 1) {
    const child = element.children[0];
    if ("text" in child && child.text === "") return false;
  }
  return true;
}

/**
 * LiveValue Plate element component.
 *
 * Two modes:
 * 1. **Provider mode** (has children): Wraps children in data context, they handle display
 *    <LiveValue query="..."><BarChart xKey="x" yKey="y" /></LiveValue>
 *
 * 2. **Auto-display mode** (no children): Picks display format based on data shape
 *    <LiveValue query="..." /> → inline (1×1), list (N×1), or table (N×M)
 *    <LiveValue query="..." display="table" /> → force table
 */
function LiveValueElement(props: PlateElementProps) {
  const element = useElement<TLiveValueElement>();
  const selected = useSelected();
  const readOnly = useReadOnly();

  const { query: _query, display, columns } = element;

  // Check for mock data (for testing) or use real query results
  const mockData = useMockData();

  // TODO: Use context provider for data fetching (will use _query)
  // For now, use mock data if available, otherwise show placeholder
  const data: Record<string, unknown>[] = mockData?.data ?? [];
  const isLoading = mockData?.isLoading ?? false;
  const error = mockData?.error ?? null;

  // Mode: provider (children handle display) vs auto-display (we handle display)
  const isProviderMode = hasMeaningfulChildren(element);

  // Block vs inline wrapper
  const displayType = resolveDisplayMode(display, data);
  const isInline = displayType === "inline" && !isProviderMode;

  return (
    <PlateElement
      {...props}
      as={isInline ? "span" : "div"}
      className={selected && !readOnly ? "ring-2 ring-ring ring-offset-1 rounded" : undefined}
    >
      <LiveValueProvider data={data} isLoading={isLoading} error={error}>
        {isProviderMode ? (
          // Provider mode: children render themselves with data context
          props.children
        ) : (
          // Auto-display mode: we pick the display format
          <>
            <LiveValueDisplay
              data={data}
              isLoading={isLoading}
              error={error}
              display={display}
              columns={columns === "auto" ? undefined : columns}
            />
            <span className="hidden">{props.children}</span>
          </>
        )}
      </LiveValueProvider>
    </PlateElement>
  );
}

/**
 * LiveValue Plugin - displays live SQL query results.
 *
 * Note: Not marked as void so children (charts, etc.) render correctly.
 * When no meaningful children, falls back to auto-display mode.
 */
export const LiveValuePlugin = createPlatePlugin({
  key: LIVE_VALUE_KEY,
  node: {
    isElement: true,
    isInline: false, // Block element when containing charts
    isVoid: false, // Allow children to render
    component: memo(LiveValueElement),
  },
});

// ============================================================================
// Element Factory
// ============================================================================

/**
 * Create a LiveValue element for insertion into editor.
 * Throws if the query is not read-only (SELECT, WITH, EXPLAIN, etc.)
 */
export function createLiveValueElement(
  query: string,
  options?: {
    display?: DisplayMode;
    params?: Record<string, unknown>;
    columns?: ColumnConfig[] | "auto";
  },
): TLiveValueElement {
  // Validate that the query is read-only
  assertReadOnlySQL(query);

  return {
    type: LIVE_VALUE_KEY,
    query,
    display: options?.display,
    params: options?.params,
    columns: options?.columns,
    children: [{ text: "" }],
  };
}

export { LIVE_VALUE_KEY };
