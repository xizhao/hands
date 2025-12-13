/**
 * Table Data Hook
 *
 * Provides type-safe CRUD operations for source tables using tRPC.
 * Handles pagination, mutations, and schema-based column definitions.
 */

import { useCallback, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";

export interface UseTableDataOptions {
  source: string;
  table: string;
  pageSize?: number;
  initialPage?: number;
}

export interface ColumnDefinition {
  name: string;
  type: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  defaultValue?: string;
}

export interface TableRow {
  id: string;
  [key: string]: unknown;
}

export interface PaginationState {
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
}

export function useTableData(options: UseTableDataOptions) {
  const { source, table, pageSize = 100, initialPage = 0 } = options;

  // Pagination state
  const [page, setPage] = useState(initialPage);

  // Fetch table schema - tRPC schema returns columns with: name, type, nullable, isPrimaryKey, defaultValue
  const schemaQuery = trpc.tables.schema.useQuery(
    { table },
    { staleTime: 60000 }, // Schema rarely changes
  );

  // Fetch table rows with pagination
  const rowsQuery = trpc.tables.list.useQuery({
    source,
    table,
    limit: pageSize,
    offset: page * pageSize,
  });

  // Transform schema into column definitions (already in correct format from tRPC)
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

  // Mutations
  const createMutation = trpc.tables.create.useMutation({
    onSuccess: () => {
      rowsQuery.refetch();
    },
  });

  const updateMutation = trpc.tables.update.useMutation({
    onSuccess: () => {
      rowsQuery.refetch();
    },
  });

  const deleteMutation = trpc.tables.delete.useMutation({
    onSuccess: () => {
      rowsQuery.refetch();
    },
  });

  const bulkUpdateMutation = trpc.tables.bulkUpdate.useMutation({
    onSuccess: () => {
      rowsQuery.refetch();
    },
  });

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

  // Pagination helpers using total from API response
  const totalRows = rowsQuery.data?.total ?? 0;
  const totalPages = Math.ceil(totalRows / pageSize);

  const goToPage = useCallback(
    (newPage: number) => {
      if (newPage >= 0 && newPage < totalPages) {
        setPage(newPage);
      }
    },
    [totalPages],
  );

  const nextPage = useCallback(() => {
    if (page < totalPages - 1) {
      setPage((p) => p + 1);
    }
  }, [page, totalPages]);

  const prevPage = useCallback(() => {
    if (page > 0) {
      setPage((p) => p - 1);
    }
  }, [page]);

  // Loading states
  const isLoading = schemaQuery.isLoading || rowsQuery.isLoading;
  const isFetching = schemaQuery.isFetching || rowsQuery.isFetching;
  const isError = schemaQuery.isError || rowsQuery.isError;
  const error = schemaQuery.error ?? rowsQuery.error;

  // Mutation states
  const isMutating =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending ||
    bulkUpdateMutation.isPending;

  return {
    // Data - rows come from rowsQuery.data.rows
    rows: (rowsQuery.data?.rows ?? []) as TableRow[],
    columns,
    primaryKeyColumn,

    // Loading states
    isLoading,
    isFetching,
    isError,
    error,
    isMutating,

    // Pagination
    pagination: {
      page,
      pageSize,
      totalRows,
      totalPages,
    } as PaginationState,
    goToPage,
    nextPage,
    prevPage,

    // Mutations
    createRow,
    updateRow,
    deleteRow,
    bulkUpdate,

    // Refetch
    refetch: () => {
      schemaQuery.refetch();
      rowsQuery.refetch();
    },
  };
}

/**
 * Hook to get all tables in the database
 */
export function useSourceTables() {
  return trpc.tables.listAll.useQuery();
}

/**
 * Hook to get table schema only
 */
export function useTableSchema(table: string) {
  const query = trpc.tables.schema.useQuery({ table }, { enabled: !!table });

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
  return trpc.sources.list.useQuery();
}

/**
 * Hook to get a single source by name
 */
export function useSource(name: string) {
  return trpc.sources.get.useQuery({ source: name }, { enabled: !!name });
}
