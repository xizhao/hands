/**
 * useRuntimeState - Consolidated runtime lifecycle state machine
 *
 * Replaces fragmented hooks (useActiveRuntime, useRuntimeStatus, useDbReady, etc.)
 * with a single source of truth that eliminates race conditions.
 *
 * State Machine Phases:
 *   not-started → starting → process-ready → db-booting → db-ready → fully-ready
 *                                                            ↓
 *                                                          error
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef } from "react";

// ============================================================================
// Types
// ============================================================================

/** Tauri command response type (matches Rust backend) */
interface TauriRuntimeStatus {
  running: boolean;
  workbook_id: string;
  directory: string;
  runtime_port: number;
  postgres_port: number;
  worker_port: number;
  message: string;
}

/** Workbook manifest from runtime */
export interface WorkbookManifest {
  workbookId: string;
  workbookDir: string;
  blocks: Array<{ id: string; title: string; path: string; parentDir: string; description?: string; uninitialized?: boolean }>;
  sources?: Array<{
    id: string;
    name: string;
    title: string;
    description: string;
    schedule?: string;
    secrets: string[];
    missingSecrets: string[];
    path: string;
    spec?: string;
  }>;
  actions?: Array<{
    id: string;
    name: string;
    description?: string;
    schedule?: string;
    triggers: Array<"manual" | "webhook" | "schedule" | "pg_notify">;
    path: string;
  }>;
  tables?: string[];
  isEmpty: boolean;
}

/** Table schema from runtime */
export interface TableSchema {
  table_name: string;
  columns: Array<{ name: string; type: string; nullable: boolean }>;
}

/** Runtime service status from /status endpoint */
interface RuntimeServiceStatus {
  db: { ready: boolean };
  vite: { ready: boolean; port?: number; error?: string };
  editor: { ready: boolean; port?: number; restartCount?: number };
}

interface RuntimeStatusResponse {
  workbookId: string;
  workbookDir: string;
  services: RuntimeServiceStatus;
  buildErrors: string[];
}

/**
 * Runtime lifecycle phases - explicit discriminated union
 */
export type RuntimePhase =
  | { phase: "not-started" }
  | { phase: "starting"; workbookId: string }
  | { phase: "process-ready"; workbookId: string; port: number }
  | {
      phase: "db-booting";
      workbookId: string;
      port: number;
      manifest: WorkbookManifest;
    }
  | {
      phase: "db-ready";
      workbookId: string;
      port: number;
      manifest: WorkbookManifest;
    }
  | {
      phase: "fully-ready";
      workbookId: string;
      port: number;
      manifest: WorkbookManifest;
      schema: TableSchema[];
    }
  | { phase: "error"; workbookId: string; error: string };

/**
 * Flattened runtime state for convenient access
 */
export interface RuntimeState {
  /** Current phase of the runtime lifecycle */
  currentPhase: RuntimePhase;

  /** Convenience accessors */
  workbookId: string | null;
  workbookDirectory: string | null;
  port: number | null;
  manifest: WorkbookManifest | null;
  schema: TableSchema[];

  /** Stable loading states - don't flicker during background polls */
  isStarting: boolean;
  isDbBooting: boolean;
  isDbReady: boolean;
  isFullyReady: boolean;

  /** Error state */
  error: string | null;
}

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Single source of truth for runtime state
 *
 * Consolidates:
 * - useActiveRuntime (Tauri IPC)
 * - useRuntimeStatus (HTTP /status)
 * - useManifest (HTTP /workbook/manifest)
 * - useDbSchema (HTTP /postgres/schema)
 * - useDbReady (derived)
 *
 * Key improvements:
 * - Schema query guarded on DB readiness (no 503 races)
 * - Uses isPending not isFetching (no flicker)
 * - Single state machine with clear phase transitions
 */
export function useRuntimeState(): RuntimeState {
  // 1. Tauri process state - source of truth for "is runtime running"
  const tauriQuery = useQuery({
    queryKey: ["active-runtime"],
    queryFn: () => invoke<TauriRuntimeStatus | null>("get_active_runtime"),
    staleTime: Infinity, // Only updates via mutations
    refetchOnWindowFocus: false,
  });

  const port = tauriQuery.data?.runtime_port ?? null;
  const workbookId = tauriQuery.data?.workbook_id ?? null;
  const workbookDirectory = tauriQuery.data?.directory ?? null;

  // 2. Runtime status - polls for service readiness
  const statusQuery = useQuery({
    queryKey: ["runtime-status", port],
    queryFn: async (): Promise<RuntimeStatusResponse | null> => {
      if (!port) return null;
      const response = await fetch(`http://localhost:${port}/status`);
      if (!response.ok) return null;
      return response.json();
    },
    enabled: !!port,
    staleTime: 0,
    refetchInterval: (query) => {
      const data = query.state.data;
      const allReady = data?.services?.db?.ready && data?.services?.vite?.ready;
      return allReady ? 10_000 : 1_000; // Fast poll during boot, slow when ready
    },
  });

  // 3. Manifest - fetch when port is available
  const manifestQuery = useQuery({
    queryKey: ["manifest", port],
    queryFn: async (): Promise<WorkbookManifest> => {
      const res = await fetch(`http://localhost:${port}/workbook/manifest`);
      if (!res.ok) throw new Error("Failed to fetch manifest");
      return res.json();
    },
    enabled: !!port,
    staleTime: 0,
    refetchInterval: 1_000,
  });

  // 4. Schema - ONLY fetch when DB is confirmed ready
  const dbReady = statusQuery.data?.services?.db?.ready ?? false;
  const schemaQuery = useQuery({
    queryKey: ["db-schema", workbookId, port],
    queryFn: async (): Promise<TableSchema[]> => {
      const response = await fetch(`http://localhost:${port}/postgres/schema`);
      if (!response.ok) {
        // Throw on 503 to trigger retry (don't cache empty array!)
        if (response.status === 503) {
          throw new Error("Database not ready");
        }
        throw new Error(`Schema fetch failed: ${response.status}`);
      }
      return response.json();
    },
    enabled: !!port && !!workbookId && dbReady, // Guard on dbReady!
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: (failureCount, error) => {
      // Retry 503s (DB booting) up to 5 times with backoff
      if (error instanceof Error && error.message === "Database not ready") {
        return failureCount < 5;
      }
      return failureCount < 2;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * (attemptIndex + 1), 5000),
  });

  // Compute phase based on query states
  // Use isPending (not isFetching) to avoid flicker during background polls
  const currentPhase = useMemo((): RuntimePhase => {
    // No runtime configured
    if (!tauriQuery.data) {
      return { phase: "not-started" };
    }

    const { workbook_id, runtime_port } = tauriQuery.data;

    // Runtime process starting/crashed
    if (!runtime_port || runtime_port <= 0) {
      return { phase: "starting", workbookId: workbook_id };
    }

    // Process ready but manifest not yet loaded
    if (!manifestQuery.data) {
      return {
        phase: "process-ready",
        workbookId: workbook_id,
        port: runtime_port,
      };
    }

    const manifest = manifestQuery.data;

    // Check DB status from /status endpoint
    if (!statusQuery.data?.services?.db?.ready) {
      return {
        phase: "db-booting",
        workbookId: workbook_id,
        port: runtime_port,
        manifest,
      };
    }

    // DB ready but schema not yet loaded
    if (!schemaQuery.data || schemaQuery.isPending) {
      return {
        phase: "db-ready",
        workbookId: workbook_id,
        port: runtime_port,
        manifest,
      };
    }

    // Fully operational
    return {
      phase: "fully-ready",
      workbookId: workbook_id,
      port: runtime_port,
      manifest,
      schema: schemaQuery.data,
    };
  }, [tauriQuery.data, statusQuery.data, manifestQuery.data, schemaQuery.data, schemaQuery.isPending]);

  // Build flattened state with stable loading flags
  return useMemo(
    () => ({
      currentPhase,
      workbookId,
      workbookDirectory,
      port,
      manifest: "manifest" in currentPhase ? currentPhase.manifest : null,
      schema: "schema" in currentPhase ? currentPhase.schema : [],
      isStarting: currentPhase.phase === "starting",
      isDbBooting: currentPhase.phase === "db-booting",
      isDbReady:
        currentPhase.phase === "db-ready" ||
        currentPhase.phase === "fully-ready",
      isFullyReady: currentPhase.phase === "fully-ready",
      error: currentPhase.phase === "error" ? currentPhase.error : null,
    }),
    [currentPhase, workbookId, workbookDirectory, port],
  );
}

// ============================================================================
// Prefetch Hook
// ============================================================================

/**
 * Prefetch schema when DB becomes ready
 *
 * Uses workbookId as key to ensure it runs exactly once per workbook.
 * Fixes the bug where hasPrefetched ref persisted across workbook switches.
 */
export function usePrefetchOnDbReady() {
  const queryClient = useQueryClient();
  const { port, workbookId, isDbReady } = useRuntimeState();

  // Track which workbook we've prefetched for (not just "have we prefetched")
  const prefetchedForRef = useRef<string | null>(null);

  useEffect(() => {
    // Skip if missing required state
    if (!workbookId || !port || !isDbReady) return;

    // Skip if already prefetched for THIS workbook
    if (prefetchedForRef.current === workbookId) return;

    const prefetch = async () => {
      console.log("[usePrefetchOnDbReady] Prefetching schema for:", workbookId);

      try {
        await queryClient.prefetchQuery({
          queryKey: ["db-schema", workbookId, port],
          queryFn: async () => {
            const response = await fetch(
              `http://localhost:${port}/postgres/schema`,
            );
            if (!response.ok) {
              throw new Error(`Schema fetch failed: ${response.status}`);
            }
            return response.json();
          },
          staleTime: 30_000,
        });

        // Mark as prefetched for THIS workbook
        prefetchedForRef.current = workbookId;
        console.log("[usePrefetchOnDbReady] Schema prefetched for:", workbookId);
      } catch (err) {
        console.error("[usePrefetchOnDbReady] Prefetch failed:", err);
      }
    };

    prefetch();
  }, [workbookId, port, isDbReady, queryClient]);
}

// ============================================================================
// Convenience Wrappers (thin wrappers for backward compatibility)
// ============================================================================

/**
 * Get just the runtime port
 * @deprecated Prefer useRuntimeState().port
 */
export function useRuntimePort(): number | null {
  const { port } = useRuntimeState();
  return port;
}

/**
 * Get just the active workbook ID
 * @deprecated Prefer useRuntimeState().workbookId
 */
export function useActiveWorkbookId(): string | null {
  const { workbookId } = useRuntimeState();
  return workbookId;
}

/**
 * Get just the manifest
 * @deprecated Prefer useRuntimeState().manifest
 */
export function useManifest() {
  const { manifest, error } = useRuntimeState();
  const port = useRuntimePort();

  // Return in the same shape as the old hook for compatibility
  return {
    data: manifest,
    isLoading: !manifest && !!port,
    error: error ? new Error(error) : null,
    refetch: () => {
      // No-op: useRuntimeState auto-refetches via internal queries
      // Consumers relying on refetch should migrate to useRuntimeState
    },
  };
}

/**
 * Get just the schema
 * @deprecated Prefer useRuntimeState().schema
 */
export function useDbSchema(_workbookId: string | null) {
  const { schema, isDbReady, isFullyReady } = useRuntimeState();

  return {
    data: schema,
    isLoading: isDbReady && !isFullyReady,
  };
}

/**
 * Check if DB is ready
 * @deprecated Prefer useRuntimeState().isDbReady
 */
export function useDbReady() {
  const { isDbReady, isStarting, isDbBooting } = useRuntimeState();

  return {
    isDbReady,
    isLoading: isStarting || isDbBooting,
  };
}

/**
 * Get just the active workbook directory
 * @deprecated Prefer useRuntimeState().workbookDirectory
 */
export function useActiveWorkbookDirectory(): string | null {
  const { workbookDirectory } = useRuntimeState();
  return workbookDirectory;
}
