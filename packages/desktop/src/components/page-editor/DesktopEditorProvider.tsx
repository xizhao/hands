"use client";

/**
 * DesktopEditorProvider
 *
 * Single provider that wires up desktop's tRPC to both:
 * - EditorProvider (AI features: generateMdx, copilot)
 * - LiveQueryProvider (SQL queries: LiveValue, LiveAction)
 */

import { useMemo, type ReactNode } from "react";
import {
  EditorProvider,
  type EditorTrpcClient,
} from "@hands/editor";
import {
  LiveQueryProvider,
  type QueryResult,
  type MutationResult,
} from "@hands/core/stdlib";
import { trpc } from "@/lib/trpc";
import { useLiveQuery as useDesktopLiveQuery } from "@/lib/live-query";
import { useActiveRuntime } from "@/hooks/useWorkbook";

interface DesktopEditorProviderProps {
  children: ReactNode;
}

export function DesktopEditorProvider({ children }: DesktopEditorProviderProps) {
  const { data: runtime } = useActiveRuntime();
  const runtimePort = runtime?.runtime_port ?? null;

  // Create tRPC adapter for EditorProvider (AI features)
  const generateMdx = trpc.ai.generateMdx.useMutation();
  const generateMdxBlock = trpc.ai.generateMdxBlock.useMutation();

  const editorTrpc = useMemo<EditorTrpcClient>(() => ({
    ai: {
      generateMdx: { mutate: (input) => generateMdx.mutateAsync(input) },
      generateMdxBlock: { mutate: (input) => generateMdxBlock.mutateAsync(input) },
    },
  }), [generateMdx.mutateAsync, generateMdxBlock.mutateAsync]);

  // Query adapter for LiveQueryProvider (SQL queries)
  const useQueryAdapter = (
    sql: string,
    params?: Record<string, unknown>,
  ): QueryResult => {
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
  };

  // Mutation adapter for LiveQueryProvider
  const dbMutation = trpc.db.query.useMutation();

  const useMutationAdapter = (): MutationResult => {
    const mutate = async (sql: string, params?: Record<string, unknown>) => {
      if (!runtimePort) {
        throw new Error("No runtime connected");
      }
      const paramsArray = params ? Object.values(params) : undefined;
      await dbMutation.mutateAsync({ sql, params: paramsArray });
    };

    return {
      mutate,
      isPending: dbMutation.isPending,
      error: dbMutation.error instanceof Error ? dbMutation.error : null,
    };
  };

  return (
    <EditorProvider trpc={editorTrpc}>
      <LiveQueryProvider
        useQuery={useQueryAdapter}
        useMutation={useMutationAdapter}
      >
        {children}
      </LiveQueryProvider>
    </EditorProvider>
  );
}
