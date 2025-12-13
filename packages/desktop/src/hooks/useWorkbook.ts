import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { Workbook } from "@/lib/workbook";

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
    worker: ServiceStatus;
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

// Mark workbook as opened (updates last_opened_at) and start runtime
export function useOpenWorkbook() {
  const updateWorkbook = useUpdateWorkbook();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["workbook", "open"],
    mutationFn: async (workbook: Workbook) => {
      // IMMEDIATELY clear active runtime to trigger loading states in UI
      // This ensures consumers show loaders during workbook switch
      queryClient.setQueryData(["active-runtime"], null);

      // CANCEL in-flight queries FIRST to prevent race conditions
      // (in-flight queries can restore stale data after removeQueries)
      await queryClient.cancelQueries({ queryKey: ["manifest"] });
      await queryClient.cancelQueries({ queryKey: ["runtime-status"] });
      await queryClient.cancelQueries({ queryKey: ["runtime-status-services"] });
      await queryClient.cancelQueries({ queryKey: ["db-schema"] });
      await queryClient.cancelQueries({ queryKey: ["runtime-health"] });
      await queryClient.cancelQueries({ queryKey: ["runtime-eval"] });

      // THEN remove stale caches
      queryClient.removeQueries({ queryKey: ["manifest"] });
      queryClient.removeQueries({ queryKey: ["block"] });
      queryClient.removeQueries({ queryKey: ["blockSource"] });
      queryClient.removeQueries({ queryKey: ["runtime-eval"] });
      queryClient.removeQueries({ queryKey: ["runtime-health"] });
      queryClient.removeQueries({ queryKey: ["runtime-status"] });
      queryClient.removeQueries({ queryKey: ["runtime-status-services"] });
      queryClient.removeQueries({ queryKey: ["db-schema"] });

      // Update last opened timestamp
      const updated: Workbook = {
        ...workbook,
        last_opened_at: Date.now(),
        updated_at: Date.now(),
      };
      await updateWorkbook.mutateAsync(updated);

      // Start runtime FIRST - it's the priority (provides database, blocks, etc.)
      try {
        console.log("[useOpenWorkbook] Starting runtime for:", workbook.id);
        const status = await invoke<TauriRuntimeStatus>("start_runtime", {
          workbookId: workbook.id,
          directory: workbook.directory,
        });
        console.log("[useOpenWorkbook] Runtime started:", status.runtime_port);
        queryClient.setQueryData(["runtime-status", workbook.id], status);
        // Update active-runtime query so useRuntimePort() etc. get the new value
        queryClient.setQueryData(["active-runtime"], status);
      } catch (err) {
        console.error("[useOpenWorkbook] Failed to start runtime:", err);
      }

      // Now restart OpenCode with workbook directory
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

// Execute SQL query through runtime
export function useRuntimeQuery() {
  return useMutation({
    mutationKey: ["runtime", "query"],
    mutationFn: ({ workbookId, query }: { workbookId: string; query: string }) =>
      invoke<{ rows: unknown[]; rowCount: number; command: string }>("runtime_query", {
        workbookId,
        query,
      }),
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

// Save database snapshot (dumps to db.tar.gz)
export function useSaveDatabase() {
  const port = useRuntimePort();

  return useMutation({
    mutationKey: ["db", "save"],
    mutationFn: async () => {
      if (!port) throw new Error("Runtime not connected");

      const response = await fetch(`http://localhost:${port}/db/save`, {
        method: "POST",
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Failed to save database" }));
        throw new Error(error.error || "Failed to save database");
      }

      return response.json() as Promise<{ success: boolean }>;
    },
  });
}

// ============================================================================
// Block Content Hooks
// ============================================================================

// Get block source (TSX) by blockId
export function useBlockContent(blockId: string | null) {
  const port = useRuntimePort();

  return useQuery({
    queryKey: ["block-content", blockId, port],
    queryFn: async (): Promise<string> => {
      if (!port || !blockId) throw new Error("Not ready");

      const response = await fetch(`http://localhost:${port}/workbook/blocks/${blockId}/source`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to load block");
      }

      const data = await response.json();
      return data.source;
    },
    enabled: !!port && !!blockId,
    staleTime: 0,
    refetchInterval: 2000,
  });
}

// Save block source (TSX)
export function useSaveBlockContent() {
  const port = useRuntimePort();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["block-content", "save"],
    mutationFn: async ({ blockId, source }: { blockId: string; source: string }) => {
      if (!port) throw new Error("No runtime connected");

      const response = await fetch(`http://localhost:${port}/workbook/blocks/${blockId}/source`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save block");
      }

      return response.json();
    },
    onSuccess: (_, { blockId }) => {
      queryClient.invalidateQueries({ queryKey: ["block-content", blockId] });
      queryClient.invalidateQueries({ queryKey: ["manifest"] });
    },
  });
}

// Create a new block
export interface CreateBlockResult {
  success: boolean;
  blockId: string;
  filePath: string;
}

export function useCreateBlock() {
  const port = useRuntimePort();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["block", "create"],
    mutationFn: async ({ blockId, source }: { blockId: string; source?: string }) => {
      if (!port) throw new Error("Runtime not connected");

      const response = await fetch(`http://localhost:${port}/workbook/blocks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockId, source }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create block");
      }

      return response.json() as Promise<CreateBlockResult>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workbook-manifest"] });
      queryClient.invalidateQueries({ queryKey: ["manifest"] });
    },
  });
}

// ============================================================================
// Source Hooks
// ============================================================================

// Add source from registry
export interface AddSourceResult {
  success: boolean;
  filesCreated: string[];
  errors: string[];
  nextSteps: string[];
}

export function useAddSource() {
  const port = useRuntimePort();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["source", "add"],
    mutationFn: async ({ sourceName, schedule }: { sourceName: string; schedule?: string }) => {
      if (!port) throw new Error("Runtime not connected");

      const response = await fetch(`http://localhost:${port}/workbook/sources/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceName, schedule }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to add source");
      }

      return response.json() as Promise<AddSourceResult>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workbook-manifest"] });
      queryClient.invalidateQueries({ queryKey: ["db-schema"] });
    },
  });
}

// Get available sources from registry
export interface AvailableSource {
  name: string;
  title: string;
  description: string;
  secrets: string[];
  streams: string[];
}

export function useAvailableSources() {
  const port = useRuntimePort();

  return useQuery({
    queryKey: ["available-sources", port],
    queryFn: async (): Promise<AvailableSource[]> => {
      if (!port) return [];

      const response = await fetch(`http://localhost:${port}/workbook/sources/available`);
      if (!response.ok) return [];

      const data = await response.json();
      return data.sources ?? [];
    },
    enabled: !!port,
    staleTime: 60000,
  });
}

// Import a file (CSV, JSON, Parquet)
export interface ImportFileResult {
  success: boolean;
  tableName?: string;
  rowCount?: number;
  error?: string;
}

export function useImportFile() {
  const port = useRuntimePort();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["file", "import"],
    mutationFn: async ({ file }: { file: File }) => {
      if (!port) throw new Error("Runtime not connected");

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`http://localhost:${port}/workbook/files/import`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to import file");
      }

      return response.json() as Promise<ImportFileResult>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workbook-manifest"] });
      queryClient.invalidateQueries({ queryKey: ["db-schema"] });
    },
  });
}
