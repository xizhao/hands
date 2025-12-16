/**
 * Table Data Hook - Infinite Scroll Edition
 *
 * Uses manifest for schema, db.query for data operations.
 * Supports infinite scroll with sparse data cache and ID-based selections.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRuntimeState } from "@/hooks/useRuntimeState";
import { trpc } from "@/lib/trpc";

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

  // Get schema from manifest
  const { manifest } = useRuntimeState();
  const tableSchema = manifest?.tables?.find((t) => t.name === table);

  // Build column definitions with reasonable defaults
  // First column is assumed to be primary key (common convention)
  const columns: ColumnDefinition[] = tableSchema?.columns.map((c, i) => ({
    name: c,
    type: "text", // Default type since manifest doesn't have type info
    nullable: i !== 0, // First column (PK) is not nullable
    isPrimaryKey: i === 0,
    defaultValue: undefined,
  })) ?? [];

  const primaryKeyColumn = columns[0]?.name ?? "id";

  // Build ORDER BY clause
  const orderBy = sort ? `ORDER BY "${sort}" ${sortDirection === "desc" ? "DESC" : "ASC"}` : "";

  // Sparse data cache
  const [cache, setCache] = useState<DataCache>({
    rows: new Map(),
    loadedRanges: [],
    totalRows: 0,
  });

  const pendingRequests = useRef<Set<string>>(new Set());
  const dbQuery = trpc.db.query.useMutation();

  // Get initial count
  useEffect(() => {
    if (!table) return;

    dbQuery
      .mutateAsync({ sql: `SELECT COUNT(*) as count FROM "${table}"` })
      .then((result) => {
        const count = (result.rows[0] as { count: number })?.count ?? 0;
        setCache((prev) => ({ ...prev, totalRows: count }));
      })
      .catch(console.error);
  }, [table]);

  // Clear cache when sort changes
  useEffect(() => {
    setCache({ rows: new Map(), loadedRanges: [], totalRows: 0 });
  }, [sort, sortDirection]);

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
            sql: `SELECT * FROM "${table}" ${orderBy} LIMIT ${pageSize} OFFSET ${offset}`,
          });

          if (result.rows) {
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
    [table, pageSize, cache.totalRows, cache.loadedRanges, orderBy, dbQuery],
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

  const invalidateCache = useCallback(() => {
    setCache({ rows: new Map(), loadedRanges: [], totalRows: 0 });
  }, []);

  // CRUD via raw SQL
  const createRow = useCallback(
    async (data: Record<string, unknown>) => {
      const cols = Object.keys(data);
      const vals = Object.values(data).map((v) => (typeof v === "string" ? `'${v}'` : v));
      await dbQuery.mutateAsync({
        sql: `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${vals.join(", ")})`,
      });
      invalidateCache();
    },
    [table, dbQuery, invalidateCache],
  );

  const updateRow = useCallback(
    async (id: string, data: Record<string, unknown>) => {
      const sets = Object.entries(data)
        .map(([k, v]) => `"${k}" = ${typeof v === "string" ? `'${v}'` : v}`)
        .join(", ");
      await dbQuery.mutateAsync({
        sql: `UPDATE "${table}" SET ${sets} WHERE "${primaryKeyColumn}" = '${id}'`,
      });
      invalidateCache();
    },
    [table, primaryKeyColumn, dbQuery, invalidateCache],
  );

  const deleteRow = useCallback(
    async (id: string) => {
      await dbQuery.mutateAsync({
        sql: `DELETE FROM "${table}" WHERE "${primaryKeyColumn}" = '${id}'`,
      });
      invalidateCache();
    },
    [table, primaryKeyColumn, dbQuery, invalidateCache],
  );

  const bulkDelete = useCallback(
    async (ids: string[]) => {
      const idList = ids.map((id) => `'${id}'`).join(", ");
      await dbQuery.mutateAsync({
        sql: `DELETE FROM "${table}" WHERE "${primaryKeyColumn}" IN (${idList})`,
      });
      invalidateCache();
    },
    [table, primaryKeyColumn, dbQuery, invalidateCache],
  );

  const bulkUpdate = useCallback(
    async (updates: Array<{ id: string; data: Record<string, unknown> }>) => {
      // Execute updates sequentially (SQLite doesn't support bulk UPDATE easily)
      for (const { id, data } of updates) {
        const sets = Object.entries(data)
          .map(([k, v]) => `"${k}" = ${typeof v === "string" ? `'${v.replace(/'/g, "''")}'` : v === null ? "NULL" : v}`)
          .join(", ");
        await dbQuery.mutateAsync({
          sql: `UPDATE "${table}" SET ${sets} WHERE "${primaryKeyColumn}" = '${id}'`,
        });
      }
      invalidateCache();
    },
    [table, primaryKeyColumn, dbQuery, invalidateCache],
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
    isLoading: !tableSchema,
    isFetching: dbQuery.isPending,
    isError: dbQuery.isError,
    error: dbQuery.error,
    isMutating: dbQuery.isPending,
    createRow,
    updateRow,
    deleteRow,
    bulkDelete,
    bulkUpdate,
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

