/**
 * Table Data Hook - Infinite Scroll Edition
 *
 * Uses PRAGMA table_info for schema, db.query for data operations.
 * Supports infinite scroll with sparse data cache and ID-based selections.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  generateInsertSql,
  generateUpdateSql,
  generateDeleteSql,
  generateBulkDeleteSql,
  generateSelectSql,
  generateCountSql,
  generateAddColumnSql,
  generateDropColumnSql,
  generateRenameColumnSql,
  generateAlterColumnTypeSql,
} from "@hands/editor/sql";

export interface UseTableDataOptions {
  source?: string; // Kept for API compatibility (unused)
  table: string;
  pageSize?: number;
  sort?: string;
  sortDirection?: "asc" | "desc";
}

export interface ColumnDefinition {
  name: string;
  type: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  defaultValue?: unknown;
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

const CHUNK_SIZE = 100;

export function useTableData(options: UseTableDataOptions) {
  const { table, pageSize = CHUNK_SIZE, sort, sortDirection } = options;

  // Track mounted state to prevent state updates after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Schema from PRAGMA table_info (actual column types and primary key)
  const [schemaInfo, setSchemaInfo] = useState<{
    columns: ColumnDefinition[];
    primaryKeyColumn: string;
  } | null>(null);

  // Sparse data cache
  const [cache, setCache] = useState<DataCache>({
    rows: new Map(),
    loadedRanges: [],
    totalRows: 0,
  });

  const pendingRequests = useRef<Set<string>>(new Set());
  const dbQuery = trpc.db.query.useMutation();

  // Clear cache and schema when TABLE changes (not sort)
  useEffect(() => {
    setSchemaInfo(null);
    setCache({ rows: new Map(), loadedRanges: [], totalRows: 0 });
    pendingRequests.current.clear();
  }, [table]);

  // Clear only row data when SORT changes (preserve totalRows and schema)
  useEffect(() => {
    setCache((prev) => ({
      rows: new Map(),
      loadedRanges: [],
      totalRows: prev.totalRows, // Keep the count - it doesn't change with sort
    }));
    pendingRequests.current.clear();
  }, [sort, sortDirection]);

  // Fetch schema from SQLite
  useEffect(() => {
    if (!table) return;

    let cancelled = false;

    dbQuery
      .mutateAsync({ sql: `PRAGMA table_info("${table}")` })
      .then((result) => {
        if (cancelled || !mountedRef.current) return;

        const rows = result.rows as Array<{
          cid: number;
          name: string;
          type: string;
          notnull: number;
          dflt_value: unknown;
          pk: number;
        }>;

        const columns: ColumnDefinition[] = rows.map((row) => ({
          name: row.name,
          type: row.type || "TEXT",
          nullable: row.notnull === 0,
          isPrimaryKey: row.pk > 0,
          defaultValue: row.dflt_value,
        }));

        const pkColumn = rows.find((r) => r.pk > 0)?.name ?? columns[0]?.name ?? "id";
        setSchemaInfo({ columns, primaryKeyColumn: pkColumn });
      })
      .catch(console.error);

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table]);

  // Fetch row count
  useEffect(() => {
    if (!table) return;

    let cancelled = false;

    dbQuery
      .mutateAsync({ sql: generateCountSql(table) })
      .then((result) => {
        if (cancelled || !mountedRef.current) return;
        const count = (result.rows[0] as { count: number })?.count ?? 0;
        setCache((prev) => ({ ...prev, totalRows: count }));
      })
      .catch(console.error);

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table]);

  // Use schema info or empty defaults while loading
  const columns = schemaInfo?.columns ?? [];
  const primaryKeyColumn = schemaInfo?.primaryKeyColumn ?? "id";

  // Load a range of rows
  const loadRange = useCallback(
    async (startRow: number, endRow: number) => {
      const start = Math.max(0, startRow);
      const end = Math.min(endRow, cache.totalRows);
      if (start >= end) return;

      const chunkStart = Math.floor(start / pageSize) * pageSize;
      const chunkEnd = Math.ceil(end / pageSize) * pageSize;

      for (let offset = chunkStart; offset < chunkEnd; offset += pageSize) {
        const requestKey = `${offset}-${offset + pageSize}`;

        if (pendingRequests.current.has(requestKey)) continue;
        if (isRangeLoaded(cache.loadedRanges, offset, offset + pageSize)) continue;

        pendingRequests.current.add(requestKey);

        try {
          const result = await dbQuery.mutateAsync({
            sql: generateSelectSql({
              table,
              orderBy: sort,
              orderDirection: sortDirection,
              limit: pageSize,
              offset,
            }),
          });

          if (result.rows && mountedRef.current) {
            setCache((prev) => {
              const newRows = new Map(prev.rows);
              const rows = result.rows as TableRow[];
              rows.forEach((row, i) => {
                newRows.set(offset + i, row);
              });

              const newRanges = mergeRanges([
                ...prev.loadedRanges,
                { start: offset, end: offset + rows.length },
              ]);

              return { ...prev, rows: newRows, loadedRanges: newRanges };
            });
          }
        } catch (error) {
          console.error("Failed to load rows:", error);
        } finally {
          pendingRequests.current.delete(requestKey);
        }
      }
    },
    [table, pageSize, cache.totalRows, cache.loadedRanges, sort, sortDirection, dbQuery],
  );

  const getRow = useCallback((index: number): TableRow | undefined => cache.rows.get(index), [cache.rows]);
  const isRowLoaded = useCallback((index: number): boolean => cache.rows.has(index), [cache.rows]);
  const getRowId = useCallback((row: TableRow): string => String(row[primaryKeyColumn]), [primaryKeyColumn]);

  const getRowIndexById = useCallback(
    (id: string): number | undefined => {
      for (const [index, row] of cache.rows.entries()) {
        if (String(row[primaryKeyColumn]) === id) return index;
      }
      return undefined;
    },
    [cache.rows, primaryKeyColumn],
  );

  // Invalidate cache: clear rows but preserve totalRows so grid knows data exists
  // This triggers the grid to refetch visible rows
  const invalidateCache = useCallback(() => {
    setCache((prev) => ({
      rows: new Map(),
      loadedRanges: [],
      totalRows: prev.totalRows  // Keep row count so grid doesn't show "no data"
    }));
  }, []);

  // CRUD via sql-builder
  const createRow = useCallback(
    async (data: Record<string, unknown>) => {
      await dbQuery.mutateAsync({
        sql: generateInsertSql(table, data),
      });
      invalidateCache();
    },
    [table, dbQuery, invalidateCache],
  );

  const updateRow = useCallback(
    async (id: string, data: Record<string, unknown>) => {
      await dbQuery.mutateAsync({
        sql: generateUpdateSql(table, primaryKeyColumn, id, data),
      });
      invalidateCache();
    },
    [table, primaryKeyColumn, dbQuery, invalidateCache],
  );

  const deleteRow = useCallback(
    async (id: string) => {
      await dbQuery.mutateAsync({
        sql: generateDeleteSql(table, primaryKeyColumn, id),
      });
      invalidateCache();
    },
    [table, primaryKeyColumn, dbQuery, invalidateCache],
  );

  const bulkDelete = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      await dbQuery.mutateAsync({
        sql: generateBulkDeleteSql(table, primaryKeyColumn, ids),
      });
      invalidateCache();
    },
    [table, primaryKeyColumn, dbQuery, invalidateCache],
  );

  const bulkUpdate = useCallback(
    async (updates: Array<{ id: string; data: Record<string, unknown> }>) => {
      // Execute updates sequentially (SQLite doesn't support bulk UPDATE easily)
      for (const { id, data } of updates) {
        await dbQuery.mutateAsync({
          sql: generateUpdateSql(table, primaryKeyColumn, id, data),
        });
      }
      invalidateCache();
    },
    [table, primaryKeyColumn, dbQuery, invalidateCache],
  );

  // Column operations (ALTER TABLE)
  const renameColumn = useCallback(
    async (oldName: string, newName: string) => {
      await dbQuery.mutateAsync({
        sql: generateRenameColumnSql(table, oldName, newName),
      });
      invalidateCache();
    },
    [table, dbQuery, invalidateCache],
  );

  const changeColumnType = useCallback(
    async (columnName: string, newType: string) => {
      await dbQuery.mutateAsync({
        sql: generateAlterColumnTypeSql(table, columnName, newType),
      });
      invalidateCache();
    },
    [table, dbQuery, invalidateCache],
  );

  const addColumn = useCallback(
    async (
      columnName: string,
      columnType: string,
      options?: { nullable?: boolean; defaultValue?: unknown }
    ) => {
      await dbQuery.mutateAsync({
        sql: generateAddColumnSql(table, columnName, columnType, options),
      });
      invalidateCache();
    },
    [table, dbQuery, invalidateCache],
  );

  const dropColumn = useCallback(
    async (columnName: string) => {
      await dbQuery.mutateAsync({
        sql: generateDropColumnSql(table, columnName),
      });
      invalidateCache();
    },
    [table, dbQuery, invalidateCache],
  );

  return {
    getRow,
    isRowLoaded,
    loadRange,
    totalRows: cache.totalRows,
    loadedCount: cache.rows.size,
    getRowId,
    getRowIndexById,
    primaryKeyColumn,
    columns,
    isLoading: !schemaInfo,
    isFetching: dbQuery.isPending,
    isError: dbQuery.isError,
    error: dbQuery.error,
    isMutating: dbQuery.isPending,
    createRow,
    updateRow,
    deleteRow,
    bulkDelete,
    bulkUpdate,
    // Column operations
    renameColumn,
    changeColumnType,
    addColumn,
    dropColumn,
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

