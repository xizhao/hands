"use client";

/**
 * LiveQuery Provider
 *
 * Context provider for SQL query execution. Applications provide their own
 * implementation (e.g., tRPC, REST API, WebSocket) via this provider.
 *
 * @example
 * ```tsx
 * // In your app's root:
 * import { LiveQueryProvider } from '@hands/core/stdlib';
 *
 * function App() {
 *   return (
 *     <LiveQueryProvider
 *       useQuery={(sql, params) => {
 *         // Your query implementation (tRPC, fetch, etc.)
 *         return useTRPCQuery(sql, params);
 *       }}
 *       useMutation={() => {
 *         // Your mutation implementation
 *         return useTRPCMutation();
 *       }}
 *     >
 *       <Editor />
 *     </LiveQueryProvider>
 *   );
 * }
 * ```
 */

import { createContext, useContext, type ReactNode } from "react";

// ============================================================================
// Types
// ============================================================================

/**
 * Result of a query hook.
 */
export interface QueryResult<T = Record<string, unknown>[]> {
  /** Query result data */
  data: T | undefined;
  /** Whether query is loading */
  isLoading: boolean;
  /** Error from query execution */
  error: Error | null;
  /** Refetch the query */
  refetch?: () => void;
}

/**
 * Result of a mutation hook.
 */
export interface MutationResult {
  /** Execute the mutation */
  mutate: (sql: string, params?: Record<string, unknown>) => Promise<void>;
  /** Whether mutation is in progress */
  isPending: boolean;
  /** Error from mutation execution */
  error: Error | null;
}

/**
 * Query hook type - returns reactive query result.
 */
export type UseQueryHook = (
  sql: string,
  params?: Record<string, unknown>,
) => QueryResult;

/**
 * Mutation hook type - returns mutation function and state.
 */
export type UseMutationHook = () => MutationResult;

/**
 * Table schema for autocomplete and validation.
 */
export interface TableSchema {
  table_name: string;
  columns: Array<{
    name: string;
    type: string;
    nullable: boolean;
  }>;
}

/**
 * Context value for LiveQuery provider.
 */
export interface LiveQueryContextValue {
  /** Hook for executing read queries */
  useQuery: UseQueryHook;
  /** Hook for executing mutations */
  useMutation: UseMutationHook;
  /** Optional callback to navigate to a table view */
  onNavigateToTable?: (tableName: string) => void;
  /** Database schema for autocomplete */
  schema?: TableSchema[];
}

// ============================================================================
// Context
// ============================================================================

const LiveQueryContext = createContext<LiveQueryContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

export interface LiveQueryProviderProps {
  /** Query hook implementation */
  useQuery: UseQueryHook;
  /** Mutation hook implementation */
  useMutation: UseMutationHook;
  /** Optional callback to navigate to a table view */
  onNavigateToTable?: (tableName: string) => void;
  /** Database schema for autocomplete */
  schema?: TableSchema[];
  /** Children */
  children: ReactNode;
}

/**
 * Provider for SQL query execution.
 *
 * Applications must wrap their editor with this provider and supply
 * implementations for query and mutation hooks.
 */
export function LiveQueryProvider({
  useQuery,
  useMutation,
  onNavigateToTable,
  schema,
  children,
}: LiveQueryProviderProps) {
  return (
    <LiveQueryContext.Provider value={{ useQuery, useMutation, onNavigateToTable, schema }}>
      {children}
    </LiveQueryContext.Provider>
  );
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Access the LiveQuery context.
 * Returns null if not inside a LiveQueryProvider.
 */
export function useLiveQueryContext(): LiveQueryContextValue | null {
  return useContext(LiveQueryContext);
}

/**
 * Execute a SQL query. Returns reactive query result.
 *
 * @param sql - SQL query string
 * @param params - Optional query parameters
 * @returns Query result with data, loading, and error states
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { data, isLoading, error } = useLiveQuery("SELECT * FROM users");
 *   if (isLoading) return <div>Loading...</div>;
 *   if (error) return <div>Error: {error.message}</div>;
 *   return <div>{JSON.stringify(data)}</div>;
 * }
 * ```
 */
export function useLiveQuery(
  sql: string,
  params?: Record<string, unknown>,
): QueryResult {
  const ctx = useContext(LiveQueryContext);

  // Context MUST be present. The LiveQueryProvider must wrap all components that use useLiveQuery.
  // This is enforced because ctx.useQuery calls multiple hooks internally, and we need consistent
  // hook counts between renders. Throwing synchronously ensures we catch the issue immediately.
  if (!ctx) {
    throw new Error(
      `[useLiveQuery] No LiveQueryProvider found. ` +
      `Components using useLiveQuery must be wrapped in LiveQueryProvider. ` +
      `SQL: ${sql?.slice(0, 50) ?? "(none)"}`
    );
  }

  return ctx.useQuery(sql, params);
}

/**
 * Get a mutation function for executing SQL mutations.
 *
 * @returns Mutation function and state
 *
 * @example
 * ```tsx
 * function MyForm() {
 *   const { mutate, isPending, error } = useLiveMutation();
 *
 *   const handleSubmit = async () => {
 *     await mutate("UPDATE users SET name = 'John' WHERE id = 1");
 *   };
 *
 *   return <button onClick={handleSubmit} disabled={isPending}>Save</button>;
 * }
 * ```
 */
export function useLiveMutation(): MutationResult {
  const ctx = useContext(LiveQueryContext);

  // Context MUST be present. The LiveQueryProvider must wrap all components that use useLiveMutation.
  // This is enforced because ctx.useMutation calls multiple hooks internally, and we need consistent
  // hook counts between renders. Throwing synchronously ensures we catch the issue immediately.
  if (!ctx) {
    throw new Error(
      `[useLiveMutation] No LiveQueryProvider found. ` +
      `Components using useLiveMutation must be wrapped in LiveQueryProvider.`
    );
  }

  return ctx.useMutation();
}

/**
 * Get the navigation callback for navigating to table views.
 * Returns undefined if no callback is configured.
 */
export function useNavigateToTable(): ((tableName: string) => void) | undefined {
  const ctx = useContext(LiveQueryContext);
  return ctx?.onNavigateToTable;
}

/**
 * Get the database schema for autocomplete.
 * Returns empty array if no schema is configured.
 */
export function useSchema(): TableSchema[] {
  const ctx = useContext(LiveQueryContext);
  return ctx?.schema ?? [];
}
