/**
 * Table Data Hook - Infinite Scroll Edition
 *
 * Provides type-safe CRUD operations for source tables using tRPC.
 * Supports infinite scroll with sparse data cache and ID-based selections.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";

export interface UseTableDataOptions {
  source: string;
  table: string;
  pageSize?: number;
  sort?: string; // Column to sort by
  sortDirection?: "asc" | "desc"; // Sort direction
}

export interface ColumnDefinition {
  name: string;
  type: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  defaultValue?: string;
}

export interface TableRow {
  [key: string]: unknown;
}

/** Sparse data cache for infinite scroll */
interface DataCache {
  rows: Map<number, TableRow>;
  loadedRanges: Array<{ start: number; end: number }>;
  totalRows: number;
}

const CHUNK_SIZE = 100; // Load rows in chunks of 100

export function useTableData(options: UseTableDataOptions) {
  const { source, table, pageSize = CHUNK_SIZE, sort, sortDirection } = options;

  // Build sort string for API (e.g., "name:asc")
  const sortParam = sort ? `${sort}:${sortDirection ?? "asc"}` : undefined;

  // Sparse data cache
  const [cache, setCache] = useState<DataCache>({
    rows: new Map(),
    loadedRanges: [],
    totalRows: 0,
  });

  // Track in-flight requests to avoid duplicates
  const pendingRequests = useRef<Set<string>>(new Set());

  // Fetch table schema
  const schemaQuery = trpc.sources.tables.schema.useQuery(
    { table },
    { staleTime: 60000, enabled: !!table },
  );

  // Get initial count via a list query with limit 1
  const initialQuery = trpc.sources.tables.list.useQuery(
    { table, limit: 1, offset: 0, sort: sortParam },
    { staleTime: 5000, enabled: !!table },
  );

  // Clear cache when sort changes (need to refetch all data with new order)
  useEffect(() => {
    setCache({ rows: new Map(), loadedRanges: [], totalRows: 0 });
  }, [sortParam]);

  // Update total rows when initial query completes
  useEffect(() => {
    const total = initialQuery.data?.total;
    if (total !== undefined) {
      setCache((prev) => ({ ...prev, totalRows: total }));
    }
  }, [initialQuery.data?.total]);

  // Transform schema into column definitions
  const columns = useMemo<ColumnDefinition[]>(() => {
    if (!schemaQuery.data) return [];
    return schemaQuery.data.columns;
  }, [schemaQuery.data]);

  // Get primary key column name
  const primaryKeyColumn = useMemo(() => {
    const pk = schemaQuery.data?.primaryKey?.[0];
    if (pk) return pk;
    return columns.find((c) => c.isPrimaryKey)?.name ?? "id";
  }, [columns, schemaQuery.data?.primaryKey]);

  // tRPC utils for manual fetching
  const utils = trpc.useUtils();

  // Load a range of rows (called on demand)
  const loadRange = useCallback(
    async (startRow: number, endRow: number) => {
      // Clamp to valid range
      const start = Math.max(0, startRow);
      const end = Math.min(endRow, cache.totalRows);
      if (start >= end) return;

      // Check which chunks we need to load
      const chunkStart = Math.floor(start / pageSize) * pageSize;
      const chunkEnd = Math.ceil(end / pageSize) * pageSize;

      for (let offset = chunkStart; offset < chunkEnd; offset += pageSize) {
        const requestKey = `${offset}-${offset + pageSize}`;

        // Skip if already loaded or pending
        if (pendingRequests.current.has(requestKey)) continue;
        if (isRangeLoaded(cache.loadedRanges, offset, offset + pageSize)) continue;

        pendingRequests.current.add(requestKey);

        try {
          const result = await utils.sources.tables.list.fetch({
            source,
            table,
            limit: pageSize,
            offset,
            sort: sortParam,
          });

          if (result.rows) {
            setCache((prev) => {
              const newRows = new Map(prev.rows);
              const rows = result.rows as TableRow[];
              rows.forEach((row, i) => {
                newRows.set(offset + i, row);
              });

              // Merge loaded range
              const newRanges = mergeRanges([
                ...prev.loadedRanges,
                { start: offset, end: offset + rows.length },
              ]);

              return {
                ...prev,
                rows: newRows,
                loadedRanges: newRanges,
                totalRows: result.total ?? prev.totalRows,
              };
            });
          }
        } catch (error) {
          console.error("Failed to load rows:", error);
        } finally {
          pendingRequests.current.delete(requestKey);
        }
      }
    },
    [source, table, pageSize, cache.totalRows, cache.loadedRanges, utils, sortParam],
  );

  // Get a row from cache (or undefined if not loaded)
  const getRow = useCallback(
    (index: number): TableRow | undefined => {
      return cache.rows.get(index);
    },
    [cache.rows],
  );

  // Check if a row is loaded
  const isRowLoaded = useCallback(
    (index: number): boolean => {
      return cache.rows.has(index);
    },
    [cache.rows],
  );

  // Get row ID from row data
  const getRowId = useCallback(
    (row: TableRow): string => {
      return String(row[primaryKeyColumn]);
    },
    [primaryKeyColumn],
  );

  // Get row index by ID (for selection mapping)
  const getRowIndexById = useCallback(
    (id: string): number | undefined => {
      for (const [index, row] of cache.rows.entries()) {
        if (String(row[primaryKeyColumn]) === id) {
          return index;
        }
      }
      return undefined;
    },
    [cache.rows, primaryKeyColumn],
  );

  // Mutations
  const createMutation = trpc.sources.tables.create.useMutation({
    onSuccess: () => {
      invalidateCache();
    },
  });

  const updateMutation = trpc.sources.tables.update.useMutation({
    onSuccess: () => {
      invalidateCache();
    },
  });

  const deleteMutation = trpc.sources.tables.delete.useMutation({
    onSuccess: () => {
      invalidateCache();
    },
  });

  const bulkUpdateMutation = trpc.sources.tables.bulkUpdate.useMutation({
    onSuccess: () => {
      invalidateCache();
    },
  });

  // Invalidate cache and refetch
  const invalidateCache = useCallback(() => {
    setCache({ rows: new Map(), loadedRanges: [], totalRows: 0 });
    initialQuery.refetch();
  }, [initialQuery]);

  // Mutation handlers
  const createRow = useCallback(
    async (data: Record<string, unknown>) => {
      return createMutation.mutateAsync({ source, table, data });
    },
    [source, table, createMutation],
  );

  const updateRow = useCallback(
    async (id: string, data: Record<string, unknown>) => {
      return updateMutation.mutateAsync({ source, table, id, data });
    },
    [source, table, updateMutation],
  );

  const deleteRow = useCallback(
    async (id: string) => {
      return deleteMutation.mutateAsync({ source, table, id });
    },
    [source, table, deleteMutation],
  );

  const bulkUpdate = useCallback(
    async (updates: Array<{ id: string; data: Record<string, unknown> }>) => {
      return bulkUpdateMutation.mutateAsync({ table, updates });
    },
    [table, bulkUpdateMutation],
  );

  const bulkDelete = useCallback(
    async (ids: string[]) => {
      await Promise.all(ids.map((id) => deleteMutation.mutateAsync({ source, table, id })));
    },
    [source, table, deleteMutation],
  );

  // Loading states
  const isLoading = schemaQuery.isLoading || initialQuery.isLoading;
  const isFetching = schemaQuery.isFetching || initialQuery.isFetching;
  const isError = schemaQuery.isError || initialQuery.isError;
  const error = schemaQuery.error ?? initialQuery.error;

  const isMutating =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending ||
    bulkUpdateMutation.isPending;

  return {
    // Data access
    getRow,
    isRowLoaded,
    loadRange,
    totalRows: cache.totalRows,
    loadedCount: cache.rows.size,

    // Row ID utilities
    getRowId,
    getRowIndexById,
    primaryKeyColumn,

    // Schema
    columns,

    // Loading states
    isLoading,
    isFetching,
    isError,
    error,
    isMutating,

    // Mutations
    createRow,
    updateRow,
    deleteRow,
    bulkUpdate,
    bulkDelete,

    // Cache management
    invalidateCache,
    refetch: invalidateCache,
  };
}

// Helper: Check if a range is fully loaded
function isRangeLoaded(
  loadedRanges: Array<{ start: number; end: number }>,
  start: number,
  end: number,
): boolean {
  for (const range of loadedRanges) {
    if (range.start <= start && range.end >= end) {
      return true;
    }
  }
  return false;
}

// Helper: Merge overlapping ranges
function mergeRanges(
  ranges: Array<{ start: number; end: number }>,
): Array<{ start: number; end: number }> {
  if (ranges.length === 0) return [];

  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push(current);
    }
  }

  return merged;
}

/**
 * Hook to get all tables in the database
 */
export function useSourceTables() {
  return trpc.sources.tables.listAll.useQuery();
}

/**
 * Hook to get table schema only
 */
export function useTableSchema(table: string) {
  const query = trpc.sources.tables.schema.useQuery(
    { table },
    { enabled: !!table },
  );

  return {
    ...query,
    columns: query.data?.columns ?? [],
    primaryKey: query.data?.primaryKey,
  };
}

/**
 * Hook to list all discovered sources
 */
export function useSources() {
  return trpc.sources.sources.list.useQuery();
}

/**
 * Hook to get a single source by name
 */
export function useSource(name: string) {
  return trpc.sources.sources.get.useQuery(
    { source: name },
    { enabled: !!name },
  );
}
