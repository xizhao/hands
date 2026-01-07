/**
 * WebEditorProvider
 *
 * Provides LiveQueryProvider for the web app using LocalDatabaseProvider.
 * Wraps PageEditor to enable LiveValue SQL queries.
 *
 * Similar to DesktopEditorProvider but uses in-browser SQLite instead of tRPC.
 */

import { LiveQueryProvider, type MutationResult, type QueryResult, type TableSchema } from "@hands/core/stdlib";
import { useQuery as useTanstackQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useLocalDatabase } from "./LocalDatabaseProvider";

interface WebEditorProviderProps {
  children: ReactNode;
}

/**
 * Provider that wires up LocalDatabaseProvider to LiveQueryProvider.
 *
 * This enables LiveValue components in the editor to execute SQL queries
 * against the in-browser SQLite database.
 */
export function WebEditorProvider({ children }: WebEditorProviderProps) {
  const navigate = useNavigate();
  const { query, execute, dataVersion, schema, isReady, notifyChange } = useLocalDatabase();
  const queryClient = useQueryClient();

  // Navigation callback for LiveValue "View in Tables" button
  const handleNavigateToTable = useCallback(
    (tableName: string) => {
      navigate({
        to: "/w/$workbookId/tables/$tableId",
        params: { tableId: tableName },
        from: "/w/$workbookId",
      } as any);
    },
    [navigate],
  );

  // Schema is already in the correct format from LocalDatabaseProvider
  // Just pass it through to LiveQueryProvider
  const providerSchema = useMemo((): TableSchema[] => schema, [schema]);

  // Query adapter hook for LiveQueryProvider
  // This is called as a hook inside LiveValue components
  const useQueryAdapter = (sql: string, params?: Record<string, unknown>): QueryResult => {
    const paramsArray = params ? Object.values(params) : undefined;

    // Use TanStack Query with dataVersion as part of the key for reactivity
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const result = useTanstackQuery({
      queryKey: ["live-query", sql, paramsArray, dataVersion],
      queryFn: async () => {
        if (!isReady || !sql?.trim()) return [];
        return query<Record<string, unknown>>(sql, paramsArray);
      },
      enabled: isReady && !!sql?.trim(),
      staleTime: Infinity, // Only refetch when dataVersion changes (via queryKey)
      retry: false, // Don't retry on SQL errors
    });

    return {
      data: result.data ?? [],
      isLoading: result.isLoading,
      error: result.error instanceof Error ? result.error : null,
      refetch: async () => { await result.refetch(); },
    };
  };

  // Mutation adapter for LiveQueryProvider
  const useMutationAdapter = (): MutationResult => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [isPending, setIsPending] = useState(false);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [error, setError] = useState<Error | null>(null);

    // eslint-disable-next-line react-hooks/rules-of-hooks
    const mutate = useCallback(async (sql: string, params?: Record<string, unknown>) => {
      if (!isReady) {
        throw new Error("Database not ready");
      }

      setIsPending(true);
      setError(null);

      try {
        const paramsArray = params ? Object.values(params) : undefined;
        await execute(sql, paramsArray);
        notifyChange(); // Trigger reactivity
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        throw e;
      } finally {
        setIsPending(false);
      }
    }, [isReady, execute, notifyChange]);

    return { mutate, isPending, error };
  };

  return (
    <LiveQueryProvider
      useQuery={useQueryAdapter}
      useMutation={useMutationAdapter}
      onNavigateToTable={handleNavigateToTable}
      schema={providerSchema}
    >
      {children}
    </LiveQueryProvider>
  );
}
