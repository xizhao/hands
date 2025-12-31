"use client";

/**
 * DesktopEditorProvider
 *
 * Single provider that wires up desktop's tRPC to both:
 * - EditorProvider (AI features: generateMdx, copilot)
 * - LiveQueryProvider (SQL queries: LiveValue, LiveAction)
 */

import { useCallback, useMemo, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
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
  const navigate = useNavigate();
  const { data: runtime } = useActiveRuntime();
  const runtimePort = runtime?.runtime_port ?? null;

  // Get domains from tRPC (source of truth for tables)
  const { data: domainsData } = trpc.domains.list.useQuery();

  // Navigation callback for LiveValue "View in Tables" button
  const handleNavigateToTable = useCallback((tableName: string) => {
    navigate({
      to: "/tables/$tableId",
      params: { tableId: tableName },
    } as any);
  }, [navigate]);

  // Get tables for AI context (from domains)
  const tables = useMemo(() => {
    return (domainsData?.domains ?? []).map((d) => ({
      name: d.id,
      columns: d.columns.map((c) => c.name),
    }));
  }, [domainsData?.domains]);

  // Create tRPC adapter for EditorProvider (AI features)
  const generateMdx = trpc.ai.generateMdx.useMutation();
  const generateMdxBlock = trpc.ai.generateMdxBlock.useMutation();
  const generateHint = trpc.ai.generateHint.useMutation();
  const generateHintsBatch = trpc.ai.generateHintsBatch.useMutation();

  const editorTrpc = useMemo<EditorTrpcClient>(() => ({
    ai: {
      generateMdx: { mutate: (input) => generateMdx.mutateAsync({ ...input, tables: input.tables ?? tables }) },
      generateMdxBlock: { mutate: (input) => generateMdxBlock.mutateAsync({ ...input, tables: input.tables ?? tables }) },
      generateHint: { mutate: (input) => generateHint.mutateAsync(input) },
      generateHintsBatch: { mutate: (input) => generateHintsBatch.mutateAsync(input) },
    },
  }), [generateMdx.mutateAsync, generateMdxBlock.mutateAsync, generateHint.mutateAsync, generateHintsBatch.mutateAsync, tables]);

  // Query adapter for LiveQueryProvider (SQL queries)
  // This is a hook that wraps useDesktopLiveQuery
  const useQueryAdapter = (
    sql: string,
    params?: Record<string, unknown>,
  ): QueryResult => {
    const paramsArray = params ? Object.values(params) : undefined;

    // eslint-disable-next-line react-hooks/rules-of-hooks
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
    <EditorProvider trpc={editorTrpc} tables={tables}>
      <LiveQueryProvider
        useQuery={useQueryAdapter}
        useMutation={useMutationAdapter}
        onNavigateToTable={handleNavigateToTable}
      >
        {children}
      </LiveQueryProvider>
    </EditorProvider>
  );
}
