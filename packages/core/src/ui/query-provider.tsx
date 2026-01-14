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

import { createContext, type ReactNode, useContext, useState, useEffect } from "react";

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
export type UseQueryHook = (sql: string, params?: Record<string, unknown>) => QueryResult;

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
export function useLiveQuery(sql: string, params?: Record<string, unknown>): QueryResult {
  const ctx = useContext(LiveQueryContext);

  // Context MUST be present. The LiveQueryProvider must wrap all components that use useLiveQuery.
  // This is enforced because ctx.useQuery calls multiple hooks internally, and we need consistent
  // hook counts between renders. Throwing synchronously ensures we catch the issue immediately.
  if (!ctx) {
    throw new Error(
      `[useLiveQuery] No LiveQueryProvider found. ` +
        `Components using useLiveQuery must be wrapped in LiveQueryProvider. ` +
        `SQL: ${sql?.slice(0, 50) ?? "(none)"}`,
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
        `Components using useLiveMutation must be wrapped in LiveQueryProvider.`,
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

// ============================================================================
// Source Fetch (URL data loading)
// ============================================================================

/**
 * Parsed content from a URL source.
 */
export interface SourceContent {
  /** Page/article title */
  title?: string;
  /** Extracted main content (markdown for HTML, raw for JSON) */
  content: string;
  /** Short excerpt/summary */
  excerpt?: string;
  /** Author/byline */
  byline?: string;
  /** Original URL */
  url: string;
  /** Content type */
  contentType: "html" | "json" | "text";
  /** For JSON: the parsed data */
  jsonData?: unknown;
}

/**
 * Configuration for source fetching.
 */
export interface SourceFetchConfig {
  /** CORS proxy URL prefix (e.g., "https://corsproxy.io/?") */
  corsProxy?: string;
  /** Custom fetch function (for SSR or testing) */
  fetcher?: typeof fetch;
}

const SourceFetchContext = createContext<SourceFetchConfig>({});

/**
 * Provider for source fetch configuration.
 */
export function SourceFetchProvider({
  corsProxy,
  fetcher,
  children,
}: SourceFetchConfig & { children: ReactNode }) {
  return (
    <SourceFetchContext.Provider value={{ corsProxy, fetcher }}>
      {children}
    </SourceFetchContext.Provider>
  );
}

/**
 * Hook to fetch and parse content from a URL.
 *
 * For HTML pages, extracts main article content using Readability.
 * For JSON APIs, returns the parsed JSON data.
 *
 * Returns data as array for compatibility with LiveValue:
 * [{ title, content, excerpt, byline, url, ... }]
 *
 * @example
 * ```tsx
 * const { data, isLoading, error } = useSourceFetch("https://example.com/article");
 * // data = [{ title: "Article Title", content: "...", url: "..." }]
 * ```
 */
export function useSourceFetch(url: string | undefined): QueryResult<Record<string, unknown>[]> {
  const config = useContext(SourceFetchContext);
  const [state, setState] = useState<{
    data: Record<string, unknown>[] | undefined;
    isLoading: boolean;
    error: Error | null;
  }>({
    data: undefined,
    isLoading: !!url,
    error: null,
  });

  useEffect(() => {
    if (!url) {
      setState({ data: undefined, isLoading: false, error: null });
      return;
    }

    let cancelled = false;
    setState((s) => ({ ...s, isLoading: true, error: null }));

    fetchAndParse(url, config)
      .then((result) => {
        if (!cancelled) {
          // Convert to array format for LiveValue compatibility
          // Cast through unknown to satisfy TypeScript
          setState({
            data: [result as unknown as Record<string, unknown>],
            isLoading: false,
            error: null,
          });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            data: undefined,
            isLoading: false,
            error: err instanceof Error ? err : new Error(String(err)),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [url, config.corsProxy]);

  return state;
}

/**
 * Fetch and parse content from a URL.
 */
async function fetchAndParse(url: string, config: SourceFetchConfig): Promise<SourceContent> {
  const fetcher = config.fetcher ?? fetch;

  // Apply CORS proxy if configured
  const targetUrl = config.corsProxy
    ? `${config.corsProxy}${encodeURIComponent(url)}`
    : url;

  const response = await fetcher(targetUrl);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();

  // Handle JSON
  if (contentType.includes("application/json")) {
    try {
      const jsonData = JSON.parse(text);
      return {
        url,
        contentType: "json",
        content: JSON.stringify(jsonData, null, 2),
        jsonData,
      };
    } catch {
      // Fall through to text handling
    }
  }

  // Handle HTML - extract main content
  if (contentType.includes("text/html")) {
    return parseHtmlContent(text, url);
  }

  // Plain text
  return {
    url,
    contentType: "text",
    content: text,
  };
}

/**
 * Parse HTML content and extract main article.
 * Uses Readability for extraction and converts to markdown.
 */
async function parseHtmlContent(html: string, url: string): Promise<SourceContent> {
  // Dynamic import to avoid bundling issues in SSR
  const [{ Readability }, TurndownService] = await Promise.all([
    import("@mozilla/readability"),
    import("turndown").then((m) => m.default),
  ]);

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const reader = new Readability(doc);
  const article = reader.parse();

  if (!article?.content) {
    // Fallback: return raw HTML truncated
    return {
      url,
      contentType: "html",
      content: html.slice(0, 5000),
      title: doc.title || undefined,
    };
  }

  // Convert to markdown
  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
  });
  const markdown = turndown.turndown(article.content);

  return {
    url,
    contentType: "html",
    title: article.title || undefined,
    content: markdown,
    excerpt: article.excerpt || undefined,
    byline: article.byline || undefined,
  };
}
