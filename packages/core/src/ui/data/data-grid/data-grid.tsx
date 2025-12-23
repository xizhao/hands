"use client";

/**
 * @component DataGrid
 * @category data
 * @description High-performance editable data grid with virtualization, keyboard navigation,
 * and comprehensive cell editing. Supports sorting, searching, and clipboard operations.
 * @keywords grid, table, data, spreadsheet, edit, sort, filter, virtual
 * @example
 * <DataGrid data={data} />
 * <DataGrid data={data} height={400} readOnly />
 * <DataGrid data={data} columns={[{key: "name", label: "Name"}, {key: "email", label: "Email"}]} />
 */

import type { ColumnDef } from "@tanstack/react-table";
import {
  createPlatePlugin,
  PlateElement,
  type PlateElementProps,
  useElement,
  useSelected,
} from "platejs/react";
import { memo, useMemo } from "react";

import { DataGrid as DiceDataGrid } from "../../components/data-grid/data-grid";
import { useDataGrid } from "../../hooks/use-data-grid";
import type { CellOpts } from "../../../types/data-grid";
import {
  DATA_GRID_KEY,
  type DataGridColumnConfig,
  type TDataGridElement,
} from "../../../types";
import { useLiveValueData } from "../../view/charts/context";

// ============================================================================
// Column Auto-Detection
// ============================================================================

function inferCellVariant(value: unknown): CellOpts {
  if (typeof value === "boolean") {
    return { variant: "checkbox" };
  }
  if (typeof value === "number") {
    return { variant: "number" };
  }
  if (value instanceof Date) {
    return { variant: "date" };
  }
  if (typeof value === "string") {
    // Check if it looks like a URL
    if (value.startsWith("http://") || value.startsWith("https://")) {
      return { variant: "url" };
    }
    // Check if it looks like a date
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      return { variant: "date" };
    }
    // Long text if > 100 chars
    if (value.length > 100) {
      return { variant: "long-text" };
    }
  }
  return { variant: "short-text" };
}

function autoDetectColumns<TData extends Record<string, unknown>>(
  data: TData[],
): ColumnDef<TData>[] {
  if (data.length === 0) return [];

  const firstRow = data[0];
  return Object.keys(firstRow).map((key) => ({
    id: key,
    accessorKey: key,
    header: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " "),
    meta: {
      label: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " "),
      cell: inferCellVariant(firstRow[key]),
    },
    minSize: 100,
    size: 180,
  }));
}

function configToColumnDefs<TData extends Record<string, unknown>>(
  config: DataGridColumnConfig[],
): ColumnDef<TData>[] {
  return config.map((col) => {
    const cellOpts: CellOpts = col.type
      ? col.type === "select" || col.type === "multi-select"
        ? { variant: col.type, options: col.options ?? [] }
        : { variant: col.type }
      : { variant: "short-text" };

    return {
      id: col.key,
      accessorKey: col.key,
      header: col.label ?? col.key.charAt(0).toUpperCase() + col.key.slice(1).replace(/_/g, " "),
      meta: {
        label: col.label ?? col.key.charAt(0).toUpperCase() + col.key.slice(1).replace(/_/g, " "),
        cell: cellOpts,
      },
      size: col.width ?? 180,
      minSize: 60,
    };
  });
}

// ============================================================================
// DataGrid Component
// ============================================================================

export interface DataGridProps<TData extends Record<string, unknown> = Record<string, unknown>> {
  /** Data to display (overrides context) */
  data?: TData[];
  /** Column configuration - auto-detect if not specified */
  columns?: DataGridColumnConfig[] | "auto";
  /** Grid height in pixels */
  height?: number;
  /** Read-only mode */
  readOnly?: boolean;
  /** Enable search */
  enableSearch?: boolean;
  /** Enable paste from clipboard */
  enablePaste?: boolean;
  /** Callback when data changes */
  onDataChange?: (data: TData[]) => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * High-performance data grid component.
 * Consumes data from LiveValue context or props.
 */
export function DataGrid<TData extends Record<string, unknown> = Record<string, unknown>>({
  data: propData,
  columns: columnConfig,
  height = 400,
  readOnly = false,
  enableSearch = true,
  enablePaste = true,
  onDataChange,
  className,
}: DataGridProps<TData>) {
  // Get data from context if not provided via props
  const ctx = useLiveValueData();
  const data = (propData ?? ctx?.data ?? []) as TData[];
  const isLoading = ctx?.isLoading ?? false;
  const error = ctx?.error ?? null;

  // Generate columns
  const columns = useMemo<ColumnDef<TData>[]>(() => {
    if (columnConfig && columnConfig !== "auto") {
      return configToColumnDefs<TData>(columnConfig);
    }
    return autoDetectColumns<TData>(data);
  }, [columnConfig, data]);

  // Use the Dice UI data grid hook
  const dataGrid = useDataGrid<TData>({
    data,
    columns,
    onDataChange,
    readOnly,
    enableSearch,
    enablePaste,
  });

  // Handle loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        <div className="size-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
        <span className="ml-2">Loading...</span>
      </div>
    );
  }

  // Handle error state
  if (error) {
    return (
      <div className="p-4 text-destructive text-sm">
        Error loading data: {error.message}
      </div>
    );
  }

  // Handle empty state
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground text-sm">
        No data
      </div>
    );
  }

  return (
    <DiceDataGrid
      {...dataGrid}
      height={height}
      className={className}
    />
  );
}

// ============================================================================
// Plate Plugin
// ============================================================================

function DataGridElement(props: PlateElementProps) {
  const element = useElement<TDataGridElement>();
  const selected = useSelected();

  const columns = element.columns as DataGridColumnConfig[] | "auto" | undefined;
  const height = element.height as number | undefined;
  const readOnly = element.readOnly as boolean | undefined;
  const enableSearch = element.enableSearch as boolean | undefined;
  const enablePaste = element.enablePaste as boolean | undefined;

  return (
    <PlateElement
      {...props}
      as="div"
      className={`my-2 ${selected ? "ring-1 ring-primary/30 ring-offset-2 rounded" : ""}`}
    >
      <DataGrid
        columns={columns}
        height={height ?? 400}
        readOnly={readOnly ?? true}
        enableSearch={enableSearch ?? true}
        enablePaste={enablePaste ?? false}
      />
      <span className="hidden">{props.children}</span>
    </PlateElement>
  );
}

/**
 * DataGrid Plugin - high-performance editable data grid.
 */
export const DataGridPlugin = createPlatePlugin({
  key: DATA_GRID_KEY,
  node: {
    isElement: true,
    isInline: false,
    isVoid: true,
    component: memo(DataGridElement),
  },
});

// ============================================================================
// Element Factory
// ============================================================================

export interface CreateDataGridOptions {
  columns?: DataGridColumnConfig[] | "auto";
  height?: number;
  readOnly?: boolean;
  enableSearch?: boolean;
  enablePaste?: boolean;
}

/**
 * Create a DataGrid element for insertion into editor.
 */
export function createDataGridElement(
  options?: CreateDataGridOptions,
): TDataGridElement {
  return {
    type: DATA_GRID_KEY,
    columns: options?.columns,
    height: options?.height ?? 400,
    readOnly: options?.readOnly ?? true,
    enableSearch: options?.enableSearch ?? true,
    enablePaste: options?.enablePaste ?? false,
    children: [{ text: "" }],
  };
}

export { DATA_GRID_KEY };
