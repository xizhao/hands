import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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

// Derived hooks for convenience
export function useActiveWorkbookId() {
  const { data } = useActiveRuntime();
  return data?.workbook_id ?? null;
}

export function useActiveWorkbookDirectory() {
  const { data } = useActiveRuntime();
  return data?.directory ?? null;
}

// Types for manifest
export interface WorkbookPage {
  id: string;
  title: string;
  route?: string;
  path?: string;
}

export interface WorkbookBlock {
  id: string;
  title: string;
  path: string;
  description?: string;
}

export interface WorkbookSource {
  name: string;
  title?: string;
  description?: string;
  enabled: boolean;
}

export interface WorkbookManifest {
  workbookId: string;
  workbookDir: string;
  pages: WorkbookPage[];
  blocks: WorkbookBlock[];
  sources?: WorkbookSource[];
  tables?: string[];
  isEmpty: boolean;
}

// Simple hook to get runtime port from Tauri
export function useRuntimePort() {
  const { data } = useActiveRuntime();
  return data?.runtime_port ?? null;
}

// Manifest hook - polls runtime for workbook manifest
export function useManifest() {
  const port = useRuntimePort();

  return useQuery({
    queryKey: ["manifest", port],
    queryFn: async (): Promise<WorkbookManifest> => {
      const res = await fetch(`http://localhost:${port}/workbook/manifest`);
      if (!res.ok) throw new Error("Failed to fetch manifest");
      return res.json();
    },
    enabled: !!port,
    refetchInterval: 1000,
    staleTime: 0,
  });
}

interface CreateWorkbookRequest {
  name: string;
  description?: string;
}

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
  const setRuntimePort = useUIStore.getState().setRuntimePort;

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

      // Start runtime FIRST - it's the priority (provides database, blocks, etc.)
      // OpenCode can be restarted after with the database URL from runtime
      let runtimePort: number | null = null;
      try {
        console.log("[useOpenWorkbook] Starting runtime for:", workbook.id);
        const status = await invoke<TauriRuntimeStatus>("start_runtime", {
          workbookId: workbook.id,
          directory: workbook.directory,
        });
        console.log("[useOpenWorkbook] Runtime started:", status.runtime_port);
        queryClient.setQueryData(["runtime-status", workbook.id], status);
        runtimePort = status.runtime_port;
        setRuntimePort(status.runtime_port);
      } catch (err) {
        console.error("[useOpenWorkbook] Failed to start runtime:", err);
      }

      // Now restart OpenCode with workbook directory (and runtime's database URL if available)
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
    }) => invoke<TauriRuntimeStatus>("start_runtime", { workbookId, directory }),
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
      invoke<TauriRuntimeStatus>("stop_runtime", { workbookId }),
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
  const port = useRuntimePort();

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

      return {
        available: evalResult.data.services.worker.up,
        url: `http://localhost:${port}`,
        routes: wrangler.routes.map((r) => ({
          method: r.method,
          path: r.path,
        })),
        charts: [],
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

// Database schema for agent context
export interface TableSchema {
  table_name: string;
  columns: { name: string; type: string; nullable: boolean }[];
}

// Get database schema for a workbook (from runtime)
export function useDbSchema(workbookId: string | null) {
  const port = useRuntimePort();

  return useQuery({
    queryKey: ["db-schema", workbookId, port],
    queryFn: async (): Promise<TableSchema[]> => {
      if (!port) return [];

      const response = await fetch(`http://localhost:${port}/postgres/schema`);
      if (!response.ok) return [];

      return response.json();
    },
    enabled: !!workbookId && !!port,
    staleTime: 30000,
    refetchInterval: 60000,
  });
}



// Create a new page
export function useCreatePage() {
  const port = useRuntimePort();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["page", "create"],
    mutationFn: async ({ title }: { title?: string }) => {
      if (!port) throw new Error("Runtime not connected");

      const response = await fetch(`http://localhost:${port}/workbook/pages/create`, {
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
  const port = useRuntimePort();

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
    enabled: !!port && !!pageId,
    staleTime: 0,
    refetchInterval: 2000,
  });
}

// Save page content (MDX)
export function useSavePageContent() {
  const port = useRuntimePort();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["page-content", "save"],
    mutationFn: async ({ pageId, content }: { pageId: string; content: string }) => {
      if (!port) throw new Error("No runtime connected");

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
  const port = useRuntimePort();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["page-title", "update"],
    mutationFn: async ({ pageId, title }: { pageId: string; title: string }) => {
      if (!port) throw new Error("No runtime connected");

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
  const port = useRuntimePort();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["source", "add"],
    mutationFn: async ({
      sourceName,
      schedule,
    }: {
      sourceName: string;
      schedule?: string;
    }) => {
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
