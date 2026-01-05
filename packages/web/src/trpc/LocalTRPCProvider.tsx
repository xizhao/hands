/**
 * Local tRPC Provider
 *
 * Provides tRPC context that routes to in-browser procedures instead of HTTP.
 * Uses a custom link that directly calls local procedure handlers.
 * Page storage is handled by LocalAdapter (hands-local IndexedDB).
 */

import type { QueryClient } from "@tanstack/react-query";
import type { TRPCLink, Operation } from "@trpc/client";
import type { ReactNode } from "react";
import { useCallback, useMemo, useRef } from "react";
import { useLocalDatabase } from "../db/LocalDatabaseProvider";
import { trpc } from "../lib/trpc";
import { type LocalTRPCContext, executeProcedure } from "./local-router";
import { listPages, getPage, savePage, deletePage } from "../platform/LocalAdapter";

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
// Extract title from frontmatter
// ============================================================================

function extractTitle(content: string): string {
  const match = content.match(/^---\s*\n[\s\S]*?title:\s*["']?(.+?)["']?\s*\n[\s\S]*?---/);
  return match?.[1]?.trim() ?? "Untitled";
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
  const localDb = useLocalDatabase();

  // Refs for stable context
  const localDbRef = useRef(localDb);
  localDbRef.current = localDb;

  // Create context getter (uses refs for stability)
  const getContext = useCallback((): LocalTRPCContext => {
    const db = localDbRef.current;
    const workbookId = db.workbookId;

    return {
      query: db.query,
      execute: db.execute,
      getSchema: () => db.schema,
      workbookId,
      notifyChange: db.notifyChange,
      dataVersion: db.dataVersion,

      // Page operations - use LocalAdapter's storage (hands-local IndexedDB)
      getPages: async () => {
        if (!workbookId) return [];
        const pages = await listPages(workbookId);
        return pages.map((p) => ({
          path: p.path,
          title: extractTitle(p.content),
        }));
      },
      getPage: async (path: string) => {
        if (!workbookId) return null;
        const page = await getPage(workbookId, path);
        return page ? { content: page.content, title: extractTitle(page.content) } : null;
      },
      savePage: async (path: string, content: string, _title?: string) => {
        if (!workbookId) throw new Error("No workbook open");
        await savePage(workbookId, path, content);
      },
      deletePage: async (path: string) => {
        if (!workbookId) throw new Error("No workbook open");
        await deletePage(workbookId, path);
      },
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
