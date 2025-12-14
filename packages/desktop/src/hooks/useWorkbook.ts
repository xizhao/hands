import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { Workbook } from "@/lib/workbook";
import { trpc } from "@/lib/trpc";

// Tauri command response type (matches Rust backend)
interface TauriRuntimeStatus {
  running: boolean;
  workbook_id: string;
  directory: string;
  runtime_port: number;
  postgres_port: number;
  worker_port: number;
  message: string;
}

/**
 * useActiveRuntime - Source of truth for runtime state from Tauri
 * Returns the active workbook ID, directory, and runtime port
 */
export function useActiveRuntime() {
  return useQuery({
    queryKey: ["active-runtime"],
    queryFn: () => invoke<TauriRuntimeStatus | null>("get_active_runtime"),
    staleTime: Infinity, // Only updates via mutations
    refetchOnWindowFocus: false,
  });
}

// Types for manifest (deprecated - use types from useRuntimeState)
export interface WorkbookBlock {
  id: string;
  title: string;
  path: string;
  parentDir: string; // Directory path (e.g., "ui" or "" for root)
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
  /** Markdown spec describing the source's intent and behavior */
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
    triggers: string[];
    path: string;
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

// Internal helper - useRuntimePort wrapper for hooks in this file
// (Consumers should use useRuntimeState().port instead)
function useRuntimePort() {
  const { data } = useActiveRuntime();
  return data?.runtime_port ?? null;
}

interface CreateWorkbookRequest {
  name: string;
  description?: string;
}

// Eval result from the runtime server
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

// Fetch all workbooks
export function useWorkbooks() {
  return useQuery({
    queryKey: ["workbooks"],
    queryFn: () => invoke<Workbook[]>("list_workbooks"),
    select: (data) => [...data].sort((a, b) => b.last_opened_at - a.last_opened_at),
  });
}

// Fetch a single workbook
export function useWorkbook(id: string | null) {
  return useQuery({
    queryKey: ["workbook", id],
    queryFn: () => invoke<Workbook>("get_workbook", { id: id! }),
    enabled: !!id,
  });
}

// Create a new workbook
export function useCreateWorkbook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["workbook", "create"],
    mutationFn: (request: CreateWorkbookRequest) =>
      invoke<Workbook>("create_workbook", { request }),
    onSuccess: (newWorkbook) => {
      queryClient.setQueryData<Workbook[]>(["workbooks"], (old) =>
        old ? [newWorkbook, ...old] : [newWorkbook],
      );
    },
  });
}

// Update workbook metadata
export function useUpdateWorkbook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["workbook", "update"],
    mutationFn: (workbook: Workbook) => invoke<Workbook>("update_workbook", { workbook }),
    onSuccess: (updated) => {
      queryClient.setQueryData<Workbook[]>(["workbooks"], (old) =>
        old?.map((w) => (w.id === updated.id ? updated : w)),
      );
      queryClient.setQueryData(["workbook", updated.id], updated);
    },
  });
}

// Delete a workbook
export function useDeleteWorkbook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["workbook", "delete"],
    mutationFn: (id: string) => invoke<boolean>("delete_workbook", { id }),
    onSuccess: (_, deletedId) => {
      queryClient.setQueryData<Workbook[]>(["workbooks"], (old) =>
        old?.filter((w) => w.id !== deletedId),
      );
      queryClient.removeQueries({ queryKey: ["workbook", deletedId] });
      queryClient.removeQueries({ queryKey: ["runtime-status", deletedId] });
    },
  });
}

// Tauri-sourced query keys that should NOT be cleared on workbook switch
const TAURI_QUERY_KEYS = ["workbooks", "workbook", "active-runtime"];

// Mark workbook as opened (updates last_opened_at) and start runtime
export function useOpenWorkbook() {
  const updateWorkbook = useUpdateWorkbook();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["workbook", "open"],
    mutationFn: async (workbook: Workbook) => {
      // 1. Optimistically set workbook_id (so UI shows correct name immediately)
      //    but clear port to trigger loading state (TRPCProvider won't mount)
      queryClient.setQueryData<TauriRuntimeStatus | null>(["active-runtime"], {
        running: false,
        workbook_id: workbook.id,
        directory: workbook.directory,
        runtime_port: 0,
        postgres_port: 0,
        worker_port: 0,
        message: "Starting...",
      });

      // 2. Cancel ALL in-flight queries to prevent race conditions
      await queryClient.cancelQueries();

      // 3. Clear all runtime-related caches (everything except Tauri-sourced data)
      // This includes all tRPC queries which have structured keys like [['workbook', 'manifest'], ...]
      queryClient.removeQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          // Keep Tauri-sourced queries (workbooks list, individual workbook metadata)
          if (typeof key === "string" && TAURI_QUERY_KEYS.includes(key)) {
            return false;
          }
          return true; // Remove everything else (tRPC, runtime data, etc.)
        },
      });

      // 4. Update last opened timestamp
      const updated: Workbook = {
        ...workbook,
        last_opened_at: Date.now(),
        updated_at: Date.now(),
      };
      await updateWorkbook.mutateAsync(updated);

      // 5. Start runtime (provides database, blocks, etc.)
      try {
        console.log("[useOpenWorkbook] Starting runtime for:", workbook.id);
        const status = await invoke<TauriRuntimeStatus>("start_runtime", {
          workbookId: workbook.id,
          directory: workbook.directory,
        });
        console.log("[useOpenWorkbook] Runtime started:", status.runtime_port);
        queryClient.setQueryData(["active-runtime"], status);
      } catch (err) {
        console.error("[useOpenWorkbook] Failed to start runtime:", err);
      }

      // 6. Restart OpenCode with workbook directory
      try {
        console.log("[useOpenWorkbook] Setting active workbook (restarts OpenCode):", workbook.id);
        await invoke("set_active_workbook", { workbookId: workbook.id });
        console.log("[useOpenWorkbook] OpenCode restarted for:", workbook.id);
      } catch (err) {
        console.error("[useOpenWorkbook] Failed to set active workbook:", err);
      }

      return updated;
    },
  });
}

// Note: useRuntimeHealth moved to useRuntimeState.ts

// Start runtime
export function useStartRuntime() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["runtime", "start"],
    mutationFn: ({ workbookId, directory }: { workbookId: string; directory: string }) =>
      invoke<TauriRuntimeStatus>("start_runtime", { workbookId, directory }),
    onSuccess: (status) => {
      queryClient.setQueryData(["runtime-status", status.workbook_id], status);
    },
  });
}

// Stop runtime
export function useStopRuntime() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["runtime", "stop"],
    mutationFn: (workbookId: string) => invoke<TauriRuntimeStatus>("stop_runtime", { workbookId }),
    onSuccess: (status) => {
      queryClient.setQueryData(["runtime-status", status.workbook_id], status);
    },
  });
}

// Trigger eval on runtime
export function useRuntimeEval() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["runtime", "eval"],
    mutationFn: (workbookId: string) => invoke<EvalResult>("runtime_eval", { workbookId }),
    onSuccess: (result, workbookId) => {
      queryClient.setQueryData(["runtime-eval", workbookId], result);
    },
  });
}

// Get cached eval result
export function useEvalResult(workbookId: string | null) {
  return useQuery({
    queryKey: ["runtime-eval", workbookId],
    queryFn: () => invoke<EvalResult>("runtime_eval", { workbookId: workbookId! }),
    enabled: !!workbookId,
    refetchInterval: 10000, // Poll every 10 seconds
    staleTime: 5000,
  });
}

// Workbook database info - now derived from runtime status
export interface WorkbookDatabaseInfo {
  workbook_id: string;
  database_name: string;
  connection_string: string;
  host: string;
  port: number;
  user: string;
}

// Get database connection info for a workbook (from runtime)
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

// Note: useDbSchema, useRuntimeStatus, useDbReady, usePrefetchRuntimeData
// moved to useRuntimeState.ts

/**
 * Save database snapshot (dumps to db.tar.gz)
 * @deprecated Use useDatabase().save instead - it handles DB readiness checks
 */
export function useSaveDatabase() {
  return trpc.db.save.useMutation();
}

// ============================================================================
// Block Content Hooks
// ============================================================================

// Get block source (TSX) by blockId
export function useBlockContent(blockId: string | null) {
  const query = trpc.workbook.blocks.getSource.useQuery(
    { blockId: blockId! },
    {
      enabled: !!blockId,
      staleTime: 0,
      refetchInterval: 2000,
    },
  );

  // Return source string for backward compatibility
  return {
    ...query,
    data: query.data?.source,
  };
}

// Save block source (TSX)
export function useSaveBlockContent() {
  const utils = trpc.useUtils();

  return trpc.workbook.blocks.saveSource.useMutation({
    onSuccess: (_, { blockId }) => {
      utils.workbook.blocks.getSource.invalidate({ blockId });
      utils.workbook.manifest.invalidate();
    },
  });
}

// Create a new block
export interface CreateBlockResult {
  blockId: string;
  filePath: string;
}

export function useCreateBlock() {
  const utils = trpc.useUtils();

  return trpc.workbook.blocks.create.useMutation({
    onSuccess: () => {
      utils.workbook.manifest.invalidate();
    },
  });
}

// Create a new page
export interface CreatePageResult {
  pageId: string;
  filePath: string;
}

export function useCreatePage() {
  const utils = trpc.useUtils();

  return trpc.pages.create.useMutation({
    onSuccess: () => {
      utils.workbook.manifest.invalidate();
      utils.pages.list.invalidate();
    },
  });
}

// ============================================================================
// Source Hooks - See useSources.ts for source management hooks
// ============================================================================

// NOTE: useAddSource, useAvailableSources moved to useSources.ts
// NOTE: useImportFile removed - file import not yet implemented
