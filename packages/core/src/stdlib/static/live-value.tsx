"use client";

/**
 * @component LiveValue
 * @category static
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
  type DisplayMode,
  LIVE_VALUE_KEY,
  type TLiveValueElement,
} from "../../types";
import { assertReadOnlySQL } from "../sql-validation";

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
  const cols = columns || autoDetectColumns(data);

  if (error) {
    return <div className="text-destructive text-sm">Error loading data</div>;
  }
  if (isLoading) {
    return <div className="text-muted-foreground animate-pulse">Loading...</div>;
  }
  if (!data || data.length === 0) {
    return <div className="text-muted-foreground text-sm">No data</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b">
            {cols.map((col) => (
              <th
                key={col.key}
                className="text-left p-2 font-medium text-muted-foreground"
                style={col.width ? { width: col.width } : undefined}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b last:border-0">
              {cols.map((col) => (
                <td key={col.key} className="p-2">
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
 * LiveValue Plate element component.
 * Requires a data provider context to fetch query results.
 */
function LiveValueElement(props: PlateElementProps) {
  const element = useElement<TLiveValueElement>();
  const selected = useSelected();
  const readOnly = useReadOnly();

  const { query: _query, display, columns, className } = element;

  // TODO: Use context provider for data fetching (will use _query)
  // For now, show placeholder in editor
  const data: Record<string, unknown>[] = [];
  const isLoading = false;
  const error = null;

  return (
    <PlateElement
      {...props}
      as="span"
      className={`inline-flex items-center ${selected && !readOnly ? "ring-2 ring-ring ring-offset-1 rounded" : ""} ${className || ""}`}
    >
      <LiveValueDisplay
        data={data}
        isLoading={isLoading}
        error={error}
        display={display}
        columns={columns === "auto" ? undefined : columns}
      />
      {/* Hidden children for Plate */}
      <span className="hidden">{props.children}</span>
    </PlateElement>
  );
}

/**
 * LiveValue Plugin - displays live SQL query results.
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
