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

import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";

// ============================================================================
// Types
// ============================================================================

/** Tauri command response type (matches Rust backend) */
interface TauriRuntimeStatus {
  running: boolean;
  workbook_id: string;
  directory: string;
  runtime_port: number;
  message: string;
}

/** Workbook manifest from runtime */
export interface WorkbookManifest {
  workbookId: string;
  workbookDir: string;
  blocks: Array<{
    id: string;
    title: string;
    path: string;
    parentDir: string;
    description?: string;
    uninitialized?: boolean;
  }>;
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
    triggers: string[];
    path: string;
  }>;
  pages?: Array<{
    id: string;
    route: string;
    path: string;
    title: string;
  }>;
  tables?: Array<{
    name: string;
    columns: string[];
  }>;
  isEmpty: boolean;
}

/** Table schema from runtime */
export interface TableSchema {
  table_name: string;
  columns: Array<{ name: string; type: string; nullable: boolean }>;
}

// Note: Runtime status and manifest types are now provided by tRPC
// via @hands/workbook-server/trpc (AppRouter)

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

  // 2. Runtime status - polls for service readiness (tRPC)
  const statusQuery = trpc.status.get.useQuery(undefined, {
    enabled: !!port,
    staleTime: 0,
    refetchInterval: (query) => {
      const data = query.state.data;
      const allReady = data?.services?.runtime?.ready;
      return allReady ? 10_000 : 1_000; // Fast poll during boot, slow when ready
    },
  });

  // 3. Manifest - fetch when port is available (tRPC)
  const manifestQuery = trpc.workbook.manifest.useQuery(undefined, {
    enabled: !!port,
    staleTime: 0,
    refetchInterval: 1_000,
  });

  // 4. Schema - ONLY fetch when runtime is confirmed ready (tRPC)
  // The db.schema procedure checks runtime readiness via middleware,
  // but we still guard here to avoid unnecessary failed requests
  const runtimeReady = statusQuery.data?.services?.runtime?.ready ?? false;
  const schemaQuery = trpc.db.schema.useQuery(undefined, {
    enabled: !!port && !!workbookId && runtimeReady,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 3,
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

    // Check runtime status (includes SQLite database)
    if (!statusQuery.data?.services?.runtime?.ready) {
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
  }, [
    tauriQuery.data,
    statusQuery.data,
    manifestQuery.data,
    schemaQuery.data,
    schemaQuery.isPending,
  ]);

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
      isDbReady: currentPhase.phase === "db-ready" || currentPhase.phase === "fully-ready",
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
 * The schema is now fetched via tRPC, so we just need to ensure the query runs.
 */
export function usePrefetchOnDbReady() {
  const utils = trpc.useUtils();
  const { workbookId, isDbReady } = useRuntimeState();

  // Track which workbook we've prefetched for (not just "have we prefetched")
  const prefetchedForRef = useRef<string | null>(null);

  useEffect(() => {
    // Skip if missing required state
    if (!workbookId || !isDbReady) return;

    // Skip if already prefetched for THIS workbook
    if (prefetchedForRef.current === workbookId) return;

    const prefetch = async () => {
      console.log("[usePrefetchOnDbReady] Prefetching schema for:", workbookId);

      try {
        await utils.db.schema.prefetch();
        prefetchedForRef.current = workbookId;
        console.log("[usePrefetchOnDbReady] Schema prefetched for:", workbookId);
      } catch (err) {
        console.error("[usePrefetchOnDbReady] Prefetch failed:", err);
      }
    };

    prefetch();
  }, [workbookId, isDbReady, utils]);
}

// ============================================================================
// Minimal Tauri-only Hook (works outside TRPCProvider)
// ============================================================================

/**
 * Minimal runtime process info from Tauri IPC only.
 * Use this when you only need port/workbookId and are outside TRPCProvider.
 * Does NOT fetch status/manifest/schema (those require tRPC).
 */
export function useRuntimeProcess() {
  const tauriQuery = useQuery({
    queryKey: ["active-runtime"],
    queryFn: () => invoke<TauriRuntimeStatus | null>("get_active_runtime"),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  return {
    port: tauriQuery.data?.runtime_port ?? null,
    workbookId: tauriQuery.data?.workbook_id ?? null,
    workbookDirectory: tauriQuery.data?.directory ?? null,
    isLoading: tauriQuery.isPending,
  };
}

// ============================================================================
// Convenience Wrappers (thin wrappers for backward compatibility)
// ============================================================================

/**
 * Get just the runtime port
 * Works outside TRPCProvider (uses Tauri IPC only)
 */
export function useRuntimePort(): number | null {
  const { port } = useRuntimeProcess();
  return port;
}

/**
 * Get just the active workbook ID
 * Works outside TRPCProvider (uses Tauri IPC only)
 */
export function useActiveWorkbookId(): string | null {
  const { workbookId } = useRuntimeProcess();
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
 * Works outside TRPCProvider (uses Tauri IPC only)
 */
export function useActiveWorkbookDirectory(): string | null {
  const { workbookDirectory } = useRuntimeProcess();
  return workbookDirectory;
}
