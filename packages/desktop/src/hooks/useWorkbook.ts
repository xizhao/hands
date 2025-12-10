import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useState, useEffect, useCallback } from "react";
import type { Workbook } from "@/lib/workbook";
import { PORTS } from "@/lib/ports";
import { useUIStore } from "@/stores/ui";

interface CreateWorkbookRequest {
  name: string;
  description?: string;
}

// Runtime status from the runtime server
export interface RuntimeStatus {
  running: boolean;
  workbook_id: string;
  directory: string;
  runtime_port: number;
  postgres_port: number;
  worker_port: number;
  message: string;
}

// Block reference error
export interface BlockRefError {
  page: string;
  src: string;
  available: string[];
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
  blockRefs: {
    errors: BlockRefError[];
    availableBlocks: string[];
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
    select: (data) =>
      [...data].sort((a, b) => b.last_opened_at - a.last_opened_at),
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
        old ? [newWorkbook, ...old] : [newWorkbook]
      );
    },
  });
}

// Update workbook metadata
export function useUpdateWorkbook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["workbook", "update"],
    mutationFn: (workbook: Workbook) =>
      invoke<Workbook>("update_workbook", { workbook }),
    onSuccess: (updated) => {
      queryClient.setQueryData<Workbook[]>(["workbooks"], (old) =>
        old?.map((w) => (w.id === updated.id ? updated : w))
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
        old?.filter((w) => w.id !== deletedId)
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
      // Update last opened timestamp
      const updated: Workbook = {
        ...workbook,
        last_opened_at: Date.now(),
        updated_at: Date.now(),
      };
      await updateWorkbook.mutateAsync(updated);

      // CRITICAL: Always set active workbook FIRST so OpenCode restarts with correct directory
      // This must happen before runtime starts, and even if runtime fails
      console.log("[runtime] Setting active workbook (restarts OpenCode with correct CWD)...");
      try {
        await invoke("set_active_workbook", { workbookId: workbook.id });
        console.log("[runtime] Active workbook set:", workbook.id);
      } catch (err) {
        console.error("[runtime] Failed to set active workbook:", err);
        // Continue anyway - we want to at least try starting the runtime
      }

      // Start runtime for this workbook
      try {
        console.log("[runtime] Starting runtime for workbook:", workbook.id, "dir:", workbook.directory);
        const status = await invoke<RuntimeStatus>("start_runtime", {
          workbookId: workbook.id,
          directory: workbook.directory,
        });
        console.log("[runtime] Started:", JSON.stringify(status, null, 2));
        queryClient.setQueryData(["runtime-status", workbook.id], status);
      } catch (err) {
        console.error("[runtime] Failed to start runtime:", err);
        // OpenCode is already restarted with correct directory, so AI features will work
        // even if the runtime (postgres, worker) fails to start
      }

      return updated;
    },
  });
}

// Runtime health - simple ready/booting status
// Single process architecture: ready when runtime is fully operational
export interface RuntimeHealth {
  ready: boolean;
  status: "ready" | "booting"; // backward compat
}

// Get runtime health for progressive loading (instant manifest, delayed blocks)
export function useRuntimeHealth(runtimePort: number | null) {
  return useQuery({
    queryKey: ["runtime-health", runtimePort],
    queryFn: async (): Promise<RuntimeHealth> => {
      if (!runtimePort) throw new Error("No runtime port");
      const response = await fetch(`http://localhost:${runtimePort}/health`);
      if (!response.ok) throw new Error("Failed to get health");
      return response.json();
    },
    enabled: !!runtimePort && runtimePort > 0,
    refetchInterval: (query) => {
      // Poll frequently during boot, less often when ready
      const data = query.state.data;
      return data?.ready ? 10000 : 1000;
    },
    staleTime: 0,
  });
}

// Get runtime status for a workbook - no caching, always fresh from Tauri
export function useRuntimeStatus(workbookId: string | null) {
  return useQuery({
    queryKey: ["runtime-status", workbookId],
    queryFn: async () => {
      console.log("[runtime] Checking status for:", workbookId);
      const status = await invoke<RuntimeStatus>("get_runtime_status", { workbookId: workbookId! });
      console.log("[runtime] Status:", status.running ? "running" : "stopped", "ports:", status.runtime_port, status.postgres_port, status.worker_port);
      return status;
    },
    enabled: !!workbookId,
    refetchInterval: 5000,
    staleTime: 0, // Always refetch
    gcTime: 0, // Don't cache
  });
}

// Start runtime
export function useStartRuntime() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["runtime", "start"],
    mutationFn: ({
      workbookId,
      directory,
    }: {
      workbookId: string;
      directory: string;
    }) => invoke<RuntimeStatus>("start_runtime", { workbookId, directory }),
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
    mutationFn: (workbookId: string) =>
      invoke<RuntimeStatus>("stop_runtime", { workbookId }),
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
    mutationFn: (workbookId: string) =>
      invoke<EvalResult>("runtime_eval", { workbookId }),
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

// Legacy aliases for backwards compatibility
export const useDevServerStatus = useRuntimeStatus;
export const useStartDevServer = useStartRuntime;
export const useStopDevServer = useStopRuntime;

// Dev server routes from eval result
export interface DevRoute {
  path: string;
  method: string;
}

export interface ChartInfo {
  id: string;
  title: string;
  chart_type: string;
  description?: string;
}

export interface CronTrigger {
  cron: string;
  description?: string;
}

export interface DevServerOutputs {
  available: boolean;
  url: string;
  routes: DevRoute[];
  charts: ChartInfo[];
  crons: CronTrigger[];
}

// Get dev server routes from runtime eval
export function useDevServerRoutes(workbookId: string | null) {
  const evalResult = useEvalResult(workbookId);
  const runtimeStatus = useRuntimeStatus(workbookId);

  return useQuery({
    queryKey: ["dev-server-routes", workbookId],
    queryFn: async (): Promise<DevServerOutputs> => {
      if (!evalResult.data?.wrangler) {
        return {
          available: false,
          url: "",
          routes: [],
          charts: [],
          crons: [],
        };
      }

      const wrangler = evalResult.data.wrangler;
      const workerPort = runtimeStatus.data?.worker_port ?? PORTS.WORKER;

      return {
        available: evalResult.data.services.worker.up,
        url: `http://localhost:${workerPort}`,
        routes: wrangler.routes.map((r) => ({
          method: r.method,
          path: r.path,
        })),
        charts: [], // Charts would come from source parsing
        crons: wrangler.crons.map((c) => ({
          cron: c.schedule,
          description: c.handler,
        })),
      };
    },
    enabled: !!workbookId && !!evalResult.data,
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
  const runtimeStatus = useRuntimeStatus(workbookId);

  return useQuery({
    queryKey: ["workbook-database", workbookId],
    queryFn: async (): Promise<WorkbookDatabaseInfo | null> => {
      // Return info if we have a valid postgres port, even if not fully "running" yet
      const port = runtimeStatus.data?.postgres_port;
      if (!port || port === 0) {
        return null;
      }

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
    enabled: !!workbookId && !!runtimeStatus.data?.postgres_port,
  });
}

// Database schema for agent context
export interface TableSchema {
  table_name: string;
  columns: { name: string; type: string; nullable: boolean }[];
}

// Get database schema for a workbook (from runtime)
export function useDbSchema(workbookId: string | null) {
  const runtimeStatus = useRuntimeStatus(workbookId);

  return useQuery({
    queryKey: ["db-schema", workbookId],
    queryFn: async (): Promise<TableSchema[]> => {
      const port = runtimeStatus.data?.runtime_port;
      if (!port) return [];

      const response = await fetch(`http://localhost:${port}/postgres/schema`);
      if (!response.ok) return [];

      return response.json();
    },
    enabled: !!workbookId && !!runtimeStatus.data?.runtime_port && runtimeStatus.data?.running,
    staleTime: 30000, // Cache for 30 seconds
    refetchInterval: 60000, // Refresh every minute
  });
}

// Legacy aliases
export const useSstStatus = useRuntimeStatus;
export const useSstOutputs = (directory: string | null) => {
  return useQuery({
    queryKey: ["sst-outputs", directory],
    queryFn: () => Promise.resolve({ available: false, outputs: {}, routes: [] }),
    enabled: false,
  });
};

// ============================================================================
// Workbook Manifest - Filesystem state as source of truth
// ============================================================================

export interface WorkbookPage {
  id: string;
  route: string;
  title: string;
  path: string;
}

export interface WorkbookBlock {
  id: string;
  title: string;
  description?: string;
  path: string;
}

export interface WorkbookSource {
  name: string;
  enabled: boolean;
  schedule?: string;
}

export interface WorkbookManifest {
  workbookId: string;
  workbookDir: string;
  pages: WorkbookPage[];
  blocks: WorkbookBlock[];
  sources: WorkbookSource[];
  tables: string[];
  isEmpty: boolean;
}

// Get workbook manifest (filesystem state) - SSE-based for real-time updates
export function useWorkbookManifest(workbookId: string | null) {
  const runtimeStatus = useRuntimeStatus(workbookId);
  const queryClient = useQueryClient();
  // Use runtime port from status - only connect when we have a valid port from Tauri
  // Don't fall back to default port since runtime may be on a different port
  const port = runtimeStatus.data?.runtime_port;
  // Only connect when we have a valid port (non-zero) from the runtime status
  const shouldConnect = !!workbookId && !!port && port > 0;

  const [manifest, setManifest] = useState<WorkbookManifest | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!shouldConnect) {
      setManifest(null);
      setIsConnected(false);
      return;
    }

    const url = `http://localhost:${port}/workbook/manifest/watch`;
    const eventSource = new EventSource(url);

    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WorkbookManifest;
        setManifest(data);
        // Update React Query cache for components using queryKey
        queryClient.setQueryData(["workbook-manifest", workbookId], data);
        // Invalidate page content queries - triggers refetch for any open pages
        queryClient.invalidateQueries({ queryKey: ["page-content"] });
        // Invalidate block queries if blocks changed
        queryClient.invalidateQueries({ queryKey: ["block"] });
      } catch (err) {
        console.error("[manifest] Failed to parse SSE data:", err);
      }
    };

    eventSource.onerror = () => {
      setIsConnected(false);
      // EventSource will auto-reconnect
    };

    return () => {
      eventSource.close();
      setIsConnected(false);
    };
  }, [shouldConnect, port, queryClient]);

  // Provide a refresh function for manual refresh (e.g., after mutations)
  const refresh = useCallback(async () => {
    if (!port) return null;
    try {
      const response = await fetch(`http://localhost:${port}/workbook/manifest`);
      if (!response.ok) return null;
      const data = await response.json();
      setManifest(data);
      queryClient.setQueryData(["workbook-manifest", workbookId], data);
      return data;
    } catch {
      return null;
    }
  }, [port, workbookId, queryClient]);

  return {
    data: manifest,
    isLoading: !manifest && shouldConnect,
    isConnected,
    error,
    refetch: refresh,
  };
}

// Create a new page
export function useCreatePage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["page", "create"],
    mutationFn: async ({ runtimePort, title }: { runtimePort: number; title?: string }) => {
      const response = await fetch(`http://localhost:${runtimePort}/workbook/pages/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create page");
      }

      return response.json() as Promise<{ success: boolean; page: WorkbookPage }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workbook-manifest"] });
    },
  });
}

// Get page content (MDX) by pageId
export function usePageContent(pageId: string | null) {
  const workbookId = useUIStore((s) => s.activeWorkbookId);
  const runtimeStatus = useRuntimeStatus(workbookId);
  const port = runtimeStatus.data?.runtime_port;

  return useQuery({
    queryKey: ["page-content", pageId, port],
    queryFn: async (): Promise<string> => {
      if (!port || !pageId) throw new Error("Not ready");

      const response = await fetch(`http://localhost:${port}/workbook/pages/${pageId}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to load page");
      }

      const data = await response.json();
      return data.content;
    },
    enabled: !!port && port > 0 && !!pageId,
    staleTime: 0, // Always refetch when pageId changes
    refetchInterval: 2000, // Poll every 2 seconds for external changes (hot reload)
  });
}

// Save page content (MDX)
export function useSavePageContent() {
  const workbookId = useUIStore((s) => s.activeWorkbookId);
  const runtimeStatus = useRuntimeStatus(workbookId);
  const port = runtimeStatus.data?.runtime_port;
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["page-content", "save"],
    mutationFn: async ({ pageId, content }: { pageId: string; content: string }) => {
      if (!port || port <= 0) throw new Error("No runtime connected");

      const response = await fetch(`http://localhost:${port}/workbook/pages/${pageId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save page");
      }

      return response.json();
    },
    onSuccess: (_, { pageId }) => {
      queryClient.invalidateQueries({ queryKey: ["page-content", pageId] });
      queryClient.invalidateQueries({ queryKey: ["workbook-manifest"] });
    },
  });
}

// Update page title (frontmatter only)
export function useUpdatePageTitle() {
  const workbookId = useUIStore((s) => s.activeWorkbookId);
  const runtimeStatus = useRuntimeStatus(workbookId);
  const port = runtimeStatus.data?.runtime_port;
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["page-title", "update"],
    mutationFn: async ({ pageId, title }: { pageId: string; title: string }) => {
      if (!port || port <= 0) throw new Error("No runtime connected");

      const response = await fetch(`http://localhost:${port}/workbook/pages/${pageId}/title`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update page title");
      }

      return response.json();
    },
    onSuccess: (_, { pageId }) => {
      queryClient.invalidateQueries({ queryKey: ["page-content", pageId] });
      queryClient.invalidateQueries({ queryKey: ["workbook-manifest"] });
    },
  });
}

// Add source from registry
export interface AddSourceResult {
  success: boolean;
  filesCreated: string[];
  errors: string[];
  nextSteps: string[];
}

export function useAddSource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["source", "add"],
    mutationFn: async ({
      runtimePort,
      sourceName,
      schedule,
    }: {
      runtimePort: number;
      sourceName: string;
      schedule?: string;
    }) => {
      const response = await fetch(`http://localhost:${runtimePort}/workbook/sources/add`, {
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

export function useAvailableSources(runtimePort: number | null) {
  return useQuery({
    queryKey: ["available-sources", runtimePort],
    queryFn: async (): Promise<AvailableSource[]> => {
      if (!runtimePort) return [];

      const response = await fetch(`http://localhost:${runtimePort}/workbook/sources/available`);
      if (!response.ok) return [];

      const data = await response.json();
      return data.sources ?? [];
    },
    enabled: !!runtimePort,
    staleTime: 60000, // Cache for 1 minute
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
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["file", "import"],
    mutationFn: async ({ runtimePort, file }: { runtimePort: number; file: File }) => {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`http://localhost:${runtimePort}/workbook/files/import`, {
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
