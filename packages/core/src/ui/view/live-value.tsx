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
import { memo, useState } from "react";
import { Database, ExternalLink } from "lucide-react";

import {
  type ColumnConfig,
  type DataGridColumnConfig,
  type DisplayMode,
  LIVE_VALUE_KEY,
  LIVE_VALUE_INLINE_KEY,
  type TLiveValueElement,
  type ComponentMeta,
} from "../../types";
import { assertReadOnlySQL } from "../../primitives/sql-validation";
import { LiveValueProvider } from "./charts/context";
import { DataGrid } from "../data/data-grid";
import { useLiveQuery, useNavigateToTable } from "../query-provider";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../components/dialog";
import { Button } from "../components/button";

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

/**
 * Extract table name(s) from a SQL query.
 * Returns the first table found in FROM clause.
 */
export function extractTableFromQuery(sql: string): string | null {
  // Match FROM tablename or FROM "tablename" or FROM `tablename`
  const fromMatch = sql.match(/\bFROM\s+["`]?(\w+)["`]?/i);
  if (fromMatch) {
    return fromMatch[1];
  }
  return null;
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
// Interactive Wrapper
// ============================================================================

interface LiveValueInteractiveProps {
  /** The SQL query */
  query: string;
  /** The data from the query */
  data: Record<string, unknown>[];
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Children to wrap */
  children: React.ReactNode;
  /** Whether the element is inline */
  isInline?: boolean;
}

/**
 * Interactive wrapper that adds tooltip (on hover) and modal (on click) to LiveValue.
 * Shows query info on hover, opens data management modal on click.
 */
function LiveValueInteractive({
  query,
  data,
  isLoading,
  error,
  children,
  isInline,
}: LiveValueInteractiveProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const navigateToTable = useNavigateToTable();
  const tableName = extractTableFromQuery(query);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDialogOpen(true);
  };

  const handleNavigateToTable = () => {
    if (tableName && navigateToTable) {
      navigateToTable(tableName);
      setDialogOpen(false);
    }
  };

  return (
    <>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              onClick={handleClick}
              className="cursor-pointer hover:bg-accent/50 rounded transition-colors"
              style={{ display: isInline ? "inline" : "block" }}
            >
              {children}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-sm">
            <div className="flex items-center gap-2 text-xs">
              <Database className="h-3 w-3 text-muted-foreground" />
              <span className="font-medium">{tableName ?? "Query"}</span>
            </div>
            <code className="mt-1 block text-[10px] text-muted-foreground font-mono truncate max-w-[280px]">
              {query}
            </code>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              {tableName ? `Data from ${tableName}` : "Query Data"}
            </DialogTitle>
            <DialogDescription asChild>
              <code className="text-xs font-mono bg-muted px-2 py-1 rounded block mt-1">
                {query}
              </code>
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-auto">
            {isLoading ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                Loading...
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-32 text-destructive">
                Error: {error.message}
              </div>
            ) : (
              <DataGrid
                data={data}
                columns="auto"
                height={Math.min(400, Math.max(150, 36 + data.length * 36))}
                readOnly={false}
                enableSearch={data.length > 5}
                enablePaste={false}
              />
            )}
          </div>

          {tableName && navigateToTable && (
            <div className="flex justify-end pt-4 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={handleNavigateToTable}
                className="gap-2"
              >
                <ExternalLink className="h-3 w-3" />
                View in Tables
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
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

  const { query, display, columns, params } = element;

  // Execute query via provider (tRPC, REST, etc.)
  const { data: queryData, isLoading, error } = useLiveQuery(query, params);
  const data: Record<string, unknown>[] = queryData ?? [];

  // Mode: provider (children handle display) vs auto-display (we handle display)
  const isProviderMode = hasMeaningfulChildren(element);

  // Provider mode: idiomatic pass-through like LiveAction
  if (isProviderMode) {
    return (
      <PlateElement {...props}>
        <LiveValueProvider data={data} isLoading={isLoading} error={error}>
          {props.children}
        </LiveValueProvider>
      </PlateElement>
    );
  }

  // Auto-display mode: we pick the display format
  const displayType = resolveDisplayMode(display, data);
  const isInline = displayType === "inline";

  return (
    <PlateElement
      {...props}
      as={isInline ? "span" : "div"}
      className={selected && !readOnly ? "ring-2 ring-ring ring-offset-1 rounded" : undefined}
    >
      <LiveValueProvider data={data} isLoading={isLoading} error={error}>
        <span contentEditable={false} style={{ userSelect: "none" }}>
          <LiveValueInteractive
            query={query}
            data={data}
            isLoading={isLoading}
            error={error}
            isInline={isInline}
          >
            <LiveValueDisplay
              data={data}
              isLoading={isLoading}
              error={error}
              display={display}
              columns={columns === "auto" ? undefined : columns}
            />
          </LiveValueInteractive>
        </span>
      </LiveValueProvider>
    </PlateElement>
  );
}

/**
 * LiveValue Plugin (Block) - for charts and complex content.
 * Used when LiveValue has meaningful children (charts, tables, etc.)
 */
export const LiveValuePlugin = createPlatePlugin({
  key: LIVE_VALUE_KEY,
  node: {
    isElement: true,
    isInline: false,
    isVoid: false,
    isContainer: true, // Allows element children but no text insertion
    component: memo(LiveValueElement),
  },
});

/**
 * LiveValue Inline Plugin - for simple values in text.
 * Used when LiveValue has no children (e.g., "I have <LiveValue/> apples")
 */
export const LiveValueInlinePlugin = createPlatePlugin({
  key: LIVE_VALUE_INLINE_KEY,
  node: {
    isElement: true,
    isInline: true, // Inline for use in paragraphs
    isVoid: true, // No children
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

// ============================================================================
// Component Metadata (for validation/linting)
// ============================================================================

export const LiveValueMeta: ComponentMeta = {
  category: "view",
  requiredProps: ["query"],
  propRules: {
    query: { type: "sql", required: true },
    display: { enum: ["auto", "inline", "list", "table"] },
  },
  constraints: {
    // LiveValue should NOT contain form controls
    forbidChild: ["Button", "Input", "Select", "Checkbox", "Textarea"],
  },
};
