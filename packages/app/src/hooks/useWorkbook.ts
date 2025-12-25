/**
 * Workbook Hooks
 *
 * React Query hooks for workbook management.
 * Uses the platform adapter for cross-platform compatibility.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePlatform } from "../platform";
import type { Workbook, RuntimeStatus } from "../platform/types";
import { trpc } from "@/lib/trpc";

// ============================================================================
// Types (re-exported for backward compatibility)
// ============================================================================

export interface WorkbookBlock {
  id: string;
  title: string;
  path: string;
  parentDir: string;
  description?: string;
}

export interface WorkbookSource {
  id: string;
  name: string;
  title: string;
  description: string;
  schedule?: string;
  secrets: string[];
  missingSecrets: string[];
  path: string;
  spec?: string;
}

export interface WorkbookManifest {
  workbookId: string;
  workbookDir: string;
  blocks: WorkbookBlock[];
  sources?: WorkbookSource[];
  actions?: Array<{
    id: string;
    name: string;
    description?: string;
    schedule?: string;
    triggers?: string[];
    path: string;
    valid: boolean;
    error?: string;
  }>;
  pages?: Array<{
    id: string;
    route: string;
    path: string;
    title: string;
  }>;
  tables?: string[];
  isEmpty: boolean;
}

export interface EvalResult {
  timestamp: number;
  duration: number;
  wrangler: {
    name: string;
    routes: { method: string; path: string }[];
    crons: { schedule: string; handler?: string }[];
    vars: Record<string, string>;
  } | null;
  typescript: {
    errors: Diagnostic[];
    warnings: Diagnostic[];
  };
  format: {
    fixed: string[];
    errors: string[];
  };
  unused: {
    exports: string[];
    files: string[];
  };
  services: {
    postgres: ServiceStatus;
    blockServer: ServiceStatus;
  };
}

export interface Diagnostic {
  file: string;
  line: number;
  column: number;
  message: string;
  code?: string;
  severity: "error" | "warning";
}

export interface ServiceStatus {
  up: boolean;
  port: number;
  pid?: number;
  error?: string;
}

export interface CreateWorkbookRequest {
  name: string;
  description?: string;
}

export interface WorkbookDatabaseInfo {
  workbook_id: string;
  database_name: string;
  connection_string: string;
  host: string;
  port: number;
  user: string;
}

export interface CreatePageResult {
  pageId: string;
  filePath: string;
}

// ============================================================================
// Query Keys (for cache management)
// ============================================================================

const PLATFORM_QUERY_KEYS = ["workbooks", "workbook", "active-runtime"];

// ============================================================================
// Runtime Hooks
// ============================================================================

/**
 * Source of truth for runtime state.
 * Returns the active workbook ID, directory, and runtime port.
 */
export function useActiveRuntime() {
  const platform = usePlatform();

  return useQuery({
    queryKey: ["active-runtime"],
    queryFn: () => platform.runtime.getStatus(),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

/**
 * Get the runtime port from active runtime.
 * Internal helper for hooks in this file.
 */
function useRuntimePort() {
  const { data } = useActiveRuntime();
  return data?.runtime_port ?? null;
}

// ============================================================================
// Workbook CRUD Hooks
// ============================================================================

/**
 * Fetch all workbooks.
 */
export function useWorkbooks() {
  const platform = usePlatform();

  return useQuery({
    queryKey: ["workbooks"],
    queryFn: () => platform.workbook.list(),
    select: (data) => [...data].sort((a, b) => b.last_opened_at - a.last_opened_at),
  });
}

/**
 * Fetch a single workbook by ID.
 */
export function useWorkbook(id: string | null) {
  const { data: workbooks } = useWorkbooks();

  return useQuery({
    queryKey: ["workbook", id],
    queryFn: () => {
      const workbook = workbooks?.find((w) => w.id === id);
      if (!workbook) throw new Error(`Workbook ${id} not found`);
      return workbook;
    },
    enabled: !!id && !!workbooks,
  });
}

/**
 * Create a new workbook.
 */
export function useCreateWorkbook() {
  const platform = usePlatform();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["workbook", "create"],
    mutationFn: (request: CreateWorkbookRequest) =>
      platform.workbook.create(request.name, request.description),
    onSuccess: (newWorkbook) => {
      queryClient.setQueryData<Workbook[]>(["workbooks"], (old) =>
        old ? [newWorkbook, ...old] : [newWorkbook]
      );
    },
  });
}

/**
 * Update workbook metadata.
 */
export function useUpdateWorkbook() {
  const platform = usePlatform();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["workbook", "update"],
    mutationFn: async (workbook: Workbook) => {
      if (platform.workbook.update) {
        return platform.workbook.update(workbook);
      }
      // Fallback: just return the workbook (web platform may not have update)
      return workbook;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<Workbook[]>(["workbooks"], (old) =>
        old?.map((w) => (w.id === updated.id ? updated : w))
      );
      queryClient.setQueryData(["workbook", updated.id], updated);
    },
  });
}

/**
 * Delete a workbook.
 */
export function useDeleteWorkbook() {
  const platform = usePlatform();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["workbook", "delete"],
    mutationFn: (id: string) => platform.workbook.delete(id),
    onSuccess: (_, deletedId) => {
      queryClient.setQueryData<Workbook[]>(["workbooks"], (old) =>
        old?.filter((w) => w.id !== deletedId)
      );
      queryClient.removeQueries({ queryKey: ["workbook", deletedId] });
      queryClient.removeQueries({ queryKey: ["runtime-status", deletedId] });
    },
  });
}

/**
 * Open a workbook and start its runtime.
 * This is the main entry point for working with a workbook.
 */
export function useOpenWorkbook() {
  const platform = usePlatform();
  const updateWorkbook = useUpdateWorkbook();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["workbook", "open"],
    mutationFn: async (workbook: Workbook) => {
      // 1. Set optimistic loading state
      queryClient.setQueryData<RuntimeStatus | null>(["active-runtime"], {
        running: false,
        workbook_id: workbook.id,
        directory: workbook.directory ?? "",
        runtime_port: 0,
        message: "Starting...",
      });

      // 2. Cancel in-flight queries
      await queryClient.cancelQueries();

      // 3. Clear runtime-related caches (keep platform queries)
      queryClient.removeQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          if (typeof key === "string" && PLATFORM_QUERY_KEYS.includes(key)) {
            return false;
          }
          return true;
        },
      });

      // 4. Update last_opened_at
      const updated: Workbook = {
        ...workbook,
        last_opened_at: Date.now(),
        updated_at: Date.now(),
      };
      await updateWorkbook.mutateAsync(updated);

      // 5. Open workbook (starts runtime)
      console.log("[useOpenWorkbook] Opening workbook:", workbook.id);
      const connection = await platform.workbook.open(workbook);
      console.log("[useOpenWorkbook] Workbook opened:", connection.tRpcUrl);

      // 6. Update runtime status
      queryClient.setQueryData<RuntimeStatus>(["active-runtime"], {
        running: true,
        workbook_id: workbook.id,
        directory: workbook.directory ?? "",
        runtime_port: connection.port,
        message: "Running",
      });

      return updated;
    },
  });
}

/**
 * Start workbook server manually.
 */
export function useStartWorkbookServer() {
  const platform = usePlatform();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["workbook-server", "start"],
    mutationFn: async ({ workbookId, directory }: { workbookId: string; directory: string }) => {
      // Create a mock workbook for the open call
      const workbook: Workbook = {
        id: workbookId,
        name: "",
        directory,
        created_at: 0,
        updated_at: 0,
        last_opened_at: 0,
      };
      return platform.workbook.open(workbook);
    },
    onSuccess: (connection) => {
      queryClient.setQueryData<RuntimeStatus>(["active-runtime"], {
        running: true,
        workbook_id: connection.workbookId,
        directory: "",
        runtime_port: connection.port,
        message: "Running",
      });
    },
  });
}

/**
 * Stop runtime for a workbook.
 */
export function useStopRuntime() {
  const platform = usePlatform();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["runtime", "stop"],
    mutationFn: (workbookId: string) => platform.runtime.stop(workbookId),
    onSuccess: (_, workbookId) => {
      queryClient.setQueryData<RuntimeStatus | null>(["active-runtime"], null);
      queryClient.removeQueries({ queryKey: ["runtime-status", workbookId] });
    },
  });
}

/**
 * Trigger eval on runtime.
 */
export function useRuntimeEval() {
  const platform = usePlatform();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["runtime", "eval"],
    mutationFn: (workbookId: string) => platform.runtime.eval(workbookId),
    onSuccess: (result, workbookId) => {
      queryClient.setQueryData(["runtime-eval", workbookId], result);
    },
  });
}

/**
 * Get cached eval result with periodic refresh.
 */
export function useEvalResult(workbookId: string | null) {
  const platform = usePlatform();

  return useQuery({
    queryKey: ["runtime-eval", workbookId],
    queryFn: () => platform.runtime.eval(workbookId!) as Promise<EvalResult>,
    enabled: !!workbookId,
    refetchInterval: 10000,
    staleTime: 5000,
  });
}

// ============================================================================
// Database Hooks
// ============================================================================

/**
 * Get database connection info for a workbook.
 */
export function useWorkbookDatabase(workbookId: string | null) {
  const port = useRuntimePort();

  return useQuery({
    queryKey: ["workbook-database", workbookId, port],
    queryFn: async (): Promise<WorkbookDatabaseInfo | null> => {
      if (!port) return null;

      const dbName = `hands_${workbookId?.replace(/-/g, "_")}`;

      return {
        workbook_id: workbookId!,
        database_name: dbName,
        connection_string: `postgres://hands:hands@localhost:${port}/${dbName}`,
        host: "localhost",
        port,
        user: "hands",
      };
    },
    enabled: !!workbookId && !!port,
  });
}

// ============================================================================
// Page Hooks
// ============================================================================

/**
 * Create a new page in the workbook.
 */
export function useCreatePage() {
  const utils = trpc.useUtils();

  return trpc.pages.create.useMutation({
    onSuccess: () => {
      utils.workbook.manifest.invalidate();
      utils.pages.list.invalidate();
    },
  });
}

// Re-export Workbook type from platform for backward compatibility
export type { Workbook };
