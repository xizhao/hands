"use client";

/**
 * Stdlib Provider for Desktop
 *
 * Adapts desktop's tRPC-based hooks to core's LiveQueryProvider interface.
 * This allows core stdlib components (LiveValue, LiveAction, etc.) to work
 * with desktop's data fetching infrastructure.
 */

import type { ReactNode } from "react";
import {
  LiveQueryProvider as CoreLiveQueryProvider,
  type UseQueryHook,
  type UseMutationHook,
  type QueryResult,
  type MutationResult,
} from "@hands/core/stdlib";
import { useLiveQuery as useDesktopLiveQuery } from "@/lib/live-query";
import { trpc } from "@/lib/trpc";
import { useActiveRuntime } from "@/hooks/useWorkbook";

/**
 * Hook adapter: desktop's useLiveQuery → core's UseQueryHook interface
 */
function useQueryAdapter(
  sql: string,
  params?: Record<string, unknown>,
): QueryResult {
  const { data: runtime } = useActiveRuntime();
  const runtimePort = runtime?.runtime_port ?? null;

  // Convert Record params to array (desktop uses positional params)
  const paramsArray = params ? Object.values(params) : undefined;

  const result = useDesktopLiveQuery({
    sql,
    params: paramsArray,
    enabled: !!sql && sql.trim().length > 0,
    runtimePort,
  });

  return {
    data: result.data,
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

/**
 * Hook adapter: desktop's trpc mutation → core's UseMutationHook interface
 */
function useMutationAdapter(): MutationResult {
  const { data: runtime } = useActiveRuntime();
  const mutation = trpc.db.query.useMutation();

  const mutate = async (sql: string, params?: Record<string, unknown>) => {
    if (!runtime?.runtime_port) {
      throw new Error("No runtime connected");
    }

    const paramsArray = params ? Object.values(params) : undefined;
    await mutation.mutateAsync({ sql, params: paramsArray });
  };

  return {
    mutate,
    isPending: mutation.isPending,
    error: mutation.error instanceof Error ? mutation.error : null,
  };
}

interface StdlibProviderProps {
  children: ReactNode;
}

/**
 * Provider that enables core stdlib components in the desktop app.
 *
 * Wrap your Plate editor with this provider to enable LiveValue, LiveAction,
 * and other stdlib components that require data fetching.
 *
 * @example
 * ```tsx
 * <StdlibProvider>
 *   <Plate editor={editor}>
 *     <PlateContent />
 *   </Plate>
 * </StdlibProvider>
 * ```
 */
export function StdlibProvider({ children }: StdlibProviderProps) {
  return (
    <CoreLiveQueryProvider
      useQuery={useQueryAdapter}
      useMutation={useMutationAdapter}
    >
      {children}
    </CoreLiveQueryProvider>
  );
}
