import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { Workbook } from "@/lib/workbook";

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
    mutationFn: async (workbook: Workbook) => {
      // Update last opened timestamp
      const updated: Workbook = {
        ...workbook,
        last_opened_at: Date.now(),
        updated_at: Date.now(),
      };
      await updateWorkbook.mutateAsync(updated);

      // Start runtime for this workbook
      try {
        const status = await invoke<RuntimeStatus>("start_runtime", {
          workbookId: workbook.id,
          directory: workbook.directory,
        });
        console.log("Runtime:", status.message);
        queryClient.setQueryData(["runtime-status", workbook.id], status);

        // Set this as the active workbook and restart OpenCode server with database URL
        await invoke("set_active_workbook", { workbookId: workbook.id });
        console.log("Set active workbook:", workbook.id);
      } catch (err) {
        console.error("Failed to start runtime:", err);
      }

      return updated;
    },
  });
}

// Get runtime status for a workbook
export function useRuntimeStatus(workbookId: string | null) {
  return useQuery({
    queryKey: ["runtime-status", workbookId],
    queryFn: () =>
      invoke<RuntimeStatus>("get_runtime_status", { workbookId: workbookId! }),
    enabled: !!workbookId,
    refetchInterval: 5000,
  });
}

// Start runtime
export function useStartRuntime() {
  const queryClient = useQueryClient();

  return useMutation({
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
      const workerPort = runtimeStatus.data?.worker_port ?? 8787;

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

// Legacy aliases
export const useSstStatus = useRuntimeStatus;
export const useSstOutputs = (directory: string | null) => {
  return useQuery({
    queryKey: ["sst-outputs", directory],
    queryFn: () => Promise.resolve({ available: false, outputs: {}, routes: [] }),
    enabled: false,
  });
};
