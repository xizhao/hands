"use client";

/**
 * EditorContext - tRPC context for editor AI features
 *
 * Provides tRPC access for AI features (copilot, @ mentions, prompts).
 *
 * @example
 * ```tsx
 * // With tRPC
 * <EditorProvider trpc={trpc} tables={tables}>
 *   <Editor />
 * </EditorProvider>
 *
 * // No backend (features gracefully disabled)
 * <Editor />
 * ```
 */

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

// ============================================================================
// Types
// ============================================================================

export interface GenerateMdxInput {
  prompt: string;
  tables?: Array<{ name: string; columns: string[] }>;
  errors?: string[];
  prefix?: string;
  suffix?: string;
  title?: string;
  description?: string;
}

export interface GenerateMdxBlockInput extends GenerateMdxInput {
  reasoning: "low" | "mid";
}

export interface GenerateMdxOutput {
  mdx: string;
}

export interface GenerateHintInput {
  content: string;
  context?: {
    tables?: string[];
    operation?: string;
  };
}

export interface GenerateHintOutput {
  hint: string;
  cached: boolean;
}

export interface GenerateHintsBatchInput {
  items: Array<{
    content: string;
    context?: {
      tables?: string[];
      operation?: string;
    };
  }>;
}

export interface GenerateHintsBatchOutput {
  hints: Array<{
    content: string;
    hint: string;
    cached: boolean;
  }>;
}

/**
 * tRPC client interface - what we need from desktop's tRPC
 */
export interface EditorTrpcClient {
  ai: {
    generateMdx: {
      mutate: (input: GenerateMdxInput) => Promise<GenerateMdxOutput>;
    };
    generateMdxBlock: {
      mutate: (input: GenerateMdxBlockInput) => Promise<GenerateMdxOutput>;
    };
    generateHint: {
      mutate: (input: GenerateHintInput) => Promise<GenerateHintOutput>;
    };
    generateHintsBatch: {
      mutate: (input: GenerateHintsBatchInput) => Promise<GenerateHintsBatchOutput>;
    };
  };
  db?: {
    schema: {
      query: () => Promise<Array<{
        table_name: string;
        columns: Array<{ name: string; type: string; nullable: boolean }>;
      }>>;
    };
    select: {
      query: (input: { sql: string; params?: unknown[] }) => Promise<{
        rows: unknown[];
        rowCount: number;
      }>;
    };
  };
}

/**
 * EditorProvider props
 */
export interface EditorProviderProps {
  children: ReactNode;
  /** tRPC client */
  trpc?: EditorTrpcClient;
  /** Database schema info for AI context */
  tables?: Array<{ name: string; columns: string[] }>;
}

/**
 * Context value
 */
interface EditorContextValue {
  /** tRPC client */
  trpc: EditorTrpcClient | null;
  /** Database tables for AI context */
  tables: Array<{ name: string; columns: string[] }>;
  /** Whether backend is available */
  hasBackend: boolean;
}

// ============================================================================
// Context
// ============================================================================

const EditorContext = createContext<EditorContextValue>({
  trpc: null,
  tables: [],
  hasBackend: false,
});

// ============================================================================
// Provider
// ============================================================================

export function EditorProvider({
  children,
  trpc,
  tables = [],
}: EditorProviderProps) {
  const value = useMemo<EditorContextValue>(() => ({
    trpc: trpc ?? null,
    tables,
    hasBackend: !!trpc,
  }), [trpc, tables]);

  return (
    <EditorContext.Provider value={value}>
      {children}
    </EditorContext.Provider>
  );
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Get the tRPC client
 */
export function useEditorTrpc(): EditorTrpcClient | null {
  return useContext(EditorContext).trpc;
}

/**
 * Get database tables for AI context
 */
export function useEditorTables(): Array<{ name: string; columns: string[] }> {
  return useContext(EditorContext).tables;
}

/**
 * Check if backend is available
 */
export function useHasBackend(): boolean {
  return useContext(EditorContext).hasBackend;
}

/**
 * Get full context
 */
export function useEditorContext(): EditorContextValue {
  return useContext(EditorContext);
}

/**
 * Get the editor API (tRPC methods for AI features)
 */
export function useEditorApi() {
  const { trpc, tables } = useContext(EditorContext);

  if (!trpc) return null;

  return {
    generateMdx: (input: Omit<GenerateMdxInput, 'tables'>) =>
      trpc.ai.generateMdx.mutate({ ...input, tables }),
    generateMdxBlock: (input: Omit<GenerateMdxBlockInput, 'tables'>) =>
      trpc.ai.generateMdxBlock.mutate({ ...input, tables }),
  };
}
