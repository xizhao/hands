/**
 * Local tRPC Provider
 *
 * Provides tRPC context that routes to in-browser procedures instead of HTTP.
 * Uses a custom link that directly calls local procedure handlers.
 * Pages are stored in SQLite via OPFS (same database as user data tables).
 */

import type { QueryClient } from "@tanstack/react-query";
import type { TRPCLink, Operation } from "@trpc/client";
import type { ReactNode } from "react";
import { useCallback, useMemo, useRef, useEffect, useState } from "react";
import { useLocalDatabase, type TableSchema } from "../db/LocalDatabaseProvider";
import { trpc } from "../lib/trpc";
import { type LocalTRPCContext, executeProcedure } from "./local-router";
import { createPagesStorage, type DatabaseContext, type PagesContext } from "@hands/agent/browser";

// ============================================================================
// Simple Observable (no @trpc/server dependency)
// ============================================================================

interface Observer<T> {
  next: (value: T) => void;
  error: (err: unknown) => void;
  complete: () => void;
}

interface Observable<T> {
  subscribe: (observer: Observer<T>) => { unsubscribe: () => void };
}

function observable<T>(fn: (observer: Observer<T>) => (() => void) | void): Observable<T> {
  return {
    subscribe(observer: Observer<T>) {
      const cleanup = fn(observer);
      return {
        unsubscribe: () => {
          if (cleanup) cleanup();
        },
      };
    },
  };
}

// ============================================================================
// Create DatabaseContext from LocalDatabase hooks
// ============================================================================

function createDbContext(
  query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>,
  execute: (sql: string, params?: unknown[]) => Promise<void>,
  schema: TableSchema[],
  notifyChange: () => void
): DatabaseContext {
  return {
    query,
    execute,
    getSchema: () =>
      schema.map((t) => ({
        table_name: t.table_name,
        columns: t.columns,
      })),
    notifyChange,
  };
}

// ============================================================================
// Custom tRPC Link for Local Router
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createLocalLink(getContext: () => LocalTRPCContext): TRPCLink<any> {
  return () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ({ op }: { op: Operation<unknown> }) => {
      return observable((observer: Observer<{ result: { data: unknown } }>) => {
        const ctx = getContext();

        // Execute the procedure
        const executeProc = async () => {
          try {
            const result = await executeProcedure(ctx, op.path, op.input);

            observer.next({
              result: { data: result },
            });
            observer.complete();
          } catch (error) {
            observer.error(error);
          }
        };

        executeProc();

        return () => {
          // Cleanup if needed
        };
      });
    };
  };
}

// ============================================================================
// Provider Component
// ============================================================================

interface LocalTRPCProviderProps {
  children: ReactNode;
  queryClient: QueryClient;
}

export function LocalTRPCProvider({ children, queryClient }: LocalTRPCProviderProps) {
  const { query, execute, schema, notifyChange, dataVersion, workbookId, isReady, exportDatabase } = useLocalDatabase();
  const [pagesContext, setPagesContext] = useState<PagesContext | null>(null);

  // Create refs for stable callbacks
  const queryRef = useRef(query);
  const executeRef = useRef(execute);
  const schemaRef = useRef(schema);
  const notifyChangeRef = useRef(notifyChange);
  const dataVersionRef = useRef(dataVersion);
  const workbookIdRef = useRef(workbookId);
  const pagesContextRef = useRef(pagesContext);
  const exportDatabaseRef = useRef(exportDatabase);

  // Update refs on value changes
  useEffect(() => {
    queryRef.current = query;
    executeRef.current = execute;
    schemaRef.current = schema;
    notifyChangeRef.current = notifyChange;
    dataVersionRef.current = dataVersion;
    workbookIdRef.current = workbookId;
    pagesContextRef.current = pagesContext;
    exportDatabaseRef.current = exportDatabase;
  }, [query, execute, schema, notifyChange, dataVersion, workbookId, pagesContext, exportDatabase]);

  // Create pages storage when database is ready
  useEffect(() => {
    if (!isReady) {
      setPagesContext(null);
      return;
    }

    // Create database context for pages storage
    const dbContext = createDbContext(
      queryRef.current,
      executeRef.current,
      schemaRef.current,
      notifyChangeRef.current
    );

    // Create pages storage backed by SQLite
    const pages = createPagesStorage(dbContext);
    setPagesContext(pages);

    // Invalidate pages/tables queries now that context is ready
    // This ensures ContentTabBar refetches after database is open
    // Use predicate to match any query key starting with pages or tables
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey;
        if (Array.isArray(key) && Array.isArray(key[0])) {
          const path = key[0] as string[];
          return path[0] === "pages" || path[0] === "tables";
        }
        return false;
      },
    });

    console.log("[LocalTRPCProvider] Pages context created with SQLite storage");
  }, [isReady, queryClient]);

  // Create context getter (uses refs for stability)
  const getContext = useCallback((): LocalTRPCContext => {
    const pages = pagesContextRef.current;

    return {
      query: queryRef.current,
      execute: executeRef.current,
      getSchema: () => schemaRef.current,
      workbookId: workbookIdRef.current,
      notifyChange: notifyChangeRef.current,
      dataVersion: dataVersionRef.current,

      // Page operations - use SQLite storage via _pages table
      getPages: async () => {
        // Use the latest pagesContext from ref
        const currentPages = pagesContextRef.current;
        if (!currentPages) {
          console.warn("[LocalTRPCProvider] getPages called before pages context ready");
          return [];
        }
        const pageList = await currentPages.listPages();
        return pageList.map((p) => ({
          path: p.pageId.endsWith(".mdx") ? p.pageId : `${p.pageId}.mdx`,
          title: p.title,
        }));
      },
      getPage: async (path: string) => {
        const currentPages = pagesContextRef.current;
        if (!currentPages) {
          console.warn("[LocalTRPCProvider] getPage called before pages context ready");
          return null;
        }
        // Convert path to pageId (strip .mdx extension)
        const pageId = path.replace(/\.mdx$/, "");
        return currentPages.readPage(pageId);
      },
      savePage: async (path: string, content: string, _title?: string) => {
        const currentPages = pagesContextRef.current;
        if (!currentPages) throw new Error("Pages storage not ready");
        // Convert path to pageId (strip .mdx extension)
        const pageId = path.replace(/\.mdx$/, "");
        await currentPages.writePage(pageId, content);
        // Notify change to trigger React Query refetch
        notifyChangeRef.current();
      },
      deletePage: async (path: string) => {
        const currentPages = pagesContextRef.current;
        if (!currentPages) throw new Error("Pages storage not ready");
        // Convert path to pageId (strip .mdx extension)
        const pageId = path.replace(/\.mdx$/, "");
        await currentPages.deletePage(pageId);
        // Notify change to trigger React Query refetch
        notifyChangeRef.current();
      },

      // Export database for deployment
      exportDatabase: () => exportDatabaseRef.current(),
    };
  }, []);

  // Create tRPC client with local link
  const trpcClient = useMemo(() => {
    return trpc.createClient({
      links: [createLocalLink(getContext)],
    });
  }, [getContext]);

  // No blocking loading state here - EditorApp already shows Header + spinner
  // Individual tRPC queries will handle their own loading states via React Query

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      {children}
    </trpc.Provider>
  );
}
