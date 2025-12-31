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

import { Database, ExternalLink } from "lucide-react";
import {
  createPlatePlugin,
  PlateElement,
  type PlateElementProps,
  useEditorRef,
  useElement,
  useReadOnly,
  useSelected,
} from "platejs/react";
import { memo, useCallback, useState } from "react";
import { assertReadOnlySQL } from "../../primitives/sql-validation";

import {
  type ColumnConfig,
  type ComponentMeta,
  type DataGridColumnConfig,
  type DisplayMode,
  LIVE_VALUE_INLINE_KEY,
  LIVE_VALUE_KEY,
  type TLiveValueElement,
} from "../../types";
import { Button } from "../components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/dialog";
import { DataGrid } from "../data/data-grid";
import { useViewportVisibility } from "../lib/virtualization";
import { extractTableName, LiveControlsMenu, LiveQueryEditor } from "../livecontrol";
import { useLiveQuery, useNavigateToTable } from "../query-provider";
import { LiveValueProvider } from "./charts/context";

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
 * @deprecated Use extractTableName from livecontrol instead
 */
export function extractTableFromQuery(sql: string): string | null {
  return extractTableName(sql, "query");
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
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-destructive/10 text-destructive text-xs">
        Error
      </span>
    );
  }
  if (isLoading) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-600 dark:text-violet-400 animate-pulse">
        ...
      </span>
    );
  }
  if (!data || data.length === 0) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
        —
      </span>
    );
  }

  const value = Object.values(data[0])[0];
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-600 dark:text-violet-400 font-medium tabular-nums">
      {formatCellValue(value)}
    </span>
  );
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
 * Placeholder for off-screen LiveValue elements.
 * Shows a subtle outline with type indicator.
 */
function LiveValuePlaceholder({
  viewportRef,
  isProviderMode,
  height = 200,
}: {
  viewportRef: React.RefObject<HTMLDivElement | null>;
  isProviderMode: boolean;
  height?: number;
}) {
  return (
    <div
      ref={viewportRef}
      className="w-full flex items-center justify-center bg-muted/5 rounded-lg border border-dashed border-muted-foreground/20"
      style={{ height: isProviderMode ? height : 36 }}
    >
      <span className="text-muted-foreground/40 text-xs font-medium">
        {isProviderMode ? "Chart" : "Data"}
      </span>
    </div>
  );
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
 *
 * Interactive features:
 * - Hover: Shows LiveControlsMenu with table name and actions
 * - View Data: Opens modal with DataGrid
 * - Edit: Opens LiveQueryEditor for SQL editing
 *
 * Performance:
 * - Viewport virtualization defers query execution and rendering until visible
 * - Uses shared IntersectionObserver for efficiency with many LiveValues
 */
function LiveValueElement(props: PlateElementProps) {
  const editor = useEditorRef();
  const element = useElement<TLiveValueElement>();
  const selected = useSelected();
  const readOnly = useReadOnly();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const navigateToTable = useNavigateToTable();

  // Check if this is a block element with children (charts) - these should be virtualized
  const isProviderMode = hasMeaningfulChildren(element);

  // Viewport virtualization - defer query execution until visible
  // Only virtualize block-level elements with children (charts, tables)
  // Inline elements are small enough to render immediately
  const { ref: viewportRef, isVisible } = useViewportVisibility({
    margin: "300px",
    // Skip virtualization for inline elements by starting them visible
    initialVisible: !isProviderMode,
  });

  // Extract element properties (needed for hooks below)
  const { query, data: staticData, display, columns, params } = element;
  const tableName = query ? extractTableName(query, "query") : null;

  // IMPORTANT: All hooks must be called before any early return to satisfy Rules of Hooks.
  // Query is only executed when visible (via empty query when not visible).
  const shouldQuery = isVisible && !staticData && !!query;
  const {
    data: queryData,
    isLoading: queryLoading,
    error: queryError,
  } = useLiveQuery(shouldQuery ? query : "", shouldQuery ? params : undefined);

  // Callback for applying query changes (must be called before early return)
  const handleApplyQuery = useCallback(
    (newQuery: string) => {
      try {
        const path = editor.api.findPath(element);
        if (path) {
          editor.tf.setNodes({ query: newQuery } as Partial<TLiveValueElement>, { at: path });
        }
      } catch (e) {
        console.error("Failed to update query:", e);
      }
    },
    [editor, element],
  );

  // Show placeholder for off-screen block elements
  // This early return is now AFTER all hooks have been called
  // Note: We don't render children here - they'll mount when visible.
  // Plate.js serialization works from element data, not rendered DOM.
  if (!isVisible) {
    return (
      <PlateElement {...props} as="div">
        <LiveValuePlaceholder viewportRef={viewportRef} isProviderMode={isProviderMode} />
      </PlateElement>
    );
  }

  // Resolve data source: static data takes priority over query
  const data: Record<string, unknown>[] = staticData ?? queryData ?? [];
  const isLoading = shouldQuery ? queryLoading : false;
  const error = shouldQuery ? queryError : null;

  // Mode: provider (children handle display) vs auto-display (we handle display)
  const displayType = resolveDisplayMode(display, data);
  const isInline = !isProviderMode && displayType === "inline";

  const handleViewData = () => {
    setDialogOpen(true);
  };

  const handleEdit = () => {
    setEditorOpen(true);
  };

  const handleNavigateToTable = () => {
    if (tableName && navigateToTable) {
      navigateToTable(tableName);
      setDialogOpen(false);
    }
  };

  // Content to display (either children for provider mode, or auto-display)
  const content = isProviderMode ? (
    props.children
  ) : (
    <LiveValueDisplay
      data={data}
      isLoading={isLoading}
      error={error}
      display={display}
      columns={columns === "auto" ? undefined : columns}
    />
  );

  return (
    <PlateElement {...props} as={isInline ? "span" : "div"}>
      <LiveValueProvider
        data={data}
        isLoading={isLoading}
        error={error}
        tableName={tableName}
        query={query}
      >
        <LiveControlsMenu
          type="query"
          sql={query}
          tableName={tableName ?? undefined}
          onViewData={handleViewData}
          onEdit={handleEdit}
          inline={isInline}
          selected={selected}
          readOnly={readOnly}
        >
          {content}
        </LiveControlsMenu>

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

        <LiveQueryEditor
          initialQuery={query ?? ""}
          type="query"
          onApply={handleApplyQuery}
          onCancel={() => {}}
          open={editorOpen}
          onOpenChange={setEditorOpen}
        />
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
 * Either query or data must be provided.
 * If query is provided, throws if not read-only (SELECT, WITH, EXPLAIN, etc.)
 */
export function createLiveValueElement(
  queryOrOptions:
    | string
    | {
        query?: string;
        data?: Record<string, unknown>[];
        display?: DisplayMode;
        params?: Record<string, unknown>;
        columns?: ColumnConfig[] | "auto";
      },
  legacyOptions?: {
    display?: DisplayMode;
    params?: Record<string, unknown>;
    columns?: ColumnConfig[] | "auto";
  },
): TLiveValueElement {
  // Handle legacy signature: createLiveValueElement(query, options)
  if (typeof queryOrOptions === "string") {
    assertReadOnlySQL(queryOrOptions);
    return {
      type: LIVE_VALUE_KEY,
      query: queryOrOptions,
      display: legacyOptions?.display,
      params: legacyOptions?.params,
      columns: legacyOptions?.columns,
      children: [{ text: "" }],
    };
  }

  // New signature: createLiveValueElement({ query?, data?, ... })
  const options = queryOrOptions;

  if (!options.query && !options.data) {
    throw new Error("LiveValue requires either query or data");
  }

  if (options.query) {
    assertReadOnlySQL(options.query);
  }

  return {
    type: LIVE_VALUE_KEY,
    query: options.query,
    data: options.data,
    display: options.display,
    params: options.params,
    columns: options.columns,
    children: [{ text: "" }],
  };
}

export { LIVE_VALUE_KEY };

// ============================================================================
// Component Metadata (for validation/linting)
// ============================================================================

export const LiveValueMeta: ComponentMeta = {
  category: "view",
  requiredProps: [], // Either query or data required, validated at runtime
  propRules: {
    query: { type: "sql", required: false },
    data: { type: "object", required: false },
    display: { enum: ["auto", "inline", "list", "table"] },
  },
  constraints: {
    // LiveValue should NOT contain form controls
    forbidChild: ["Button", "Input", "Select", "Checkbox", "Textarea"],
  },
};
