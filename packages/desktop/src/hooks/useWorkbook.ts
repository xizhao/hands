import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { Workbook } from "@/lib/workbook";

interface CreateWorkbookRequest {
  name: string;
  description?: string;
}

interface DevServerStatus {
  running: boolean;
  workbook_id: string;
  directory: string;
  port: number;
  message: string;
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
      // Update in list
      queryClient.setQueryData<Workbook[]>(["workbooks"], (old) =>
        old?.map((w) => (w.id === updated.id ? updated : w))
      );
      // Update individual
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
    },
  });
}

// Mark workbook as opened (updates last_opened_at) and start dev server
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

      // Start dev server for this workbook
      try {
        const status = await invoke<DevServerStatus>("start_dev_server", {
          workbookId: workbook.id,
          directory: workbook.directory,
        });
        console.log("Dev server:", status.message);
        // Update status cache
        queryClient.setQueryData(["dev-server-status", workbook.id], status);
      } catch (err) {
        console.error("Failed to start dev server:", err);
      }

      return updated;
    },
  });
}

// Get dev server status for a workbook
export function useDevServerStatus(workbookId: string | null) {
  return useQuery({
    queryKey: ["dev-server-status", workbookId],
    queryFn: () =>
      invoke<DevServerStatus>("get_dev_server_status", { workbookId: workbookId! }),
    enabled: !!workbookId,
    refetchInterval: 5000, // Poll every 5 seconds
  });
}

// Start dev server
export function useStartDevServer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      workbookId,
      directory,
    }: {
      workbookId: string;
      directory: string;
    }) => invoke<DevServerStatus>("start_dev_server", { workbookId, directory }),
    onSuccess: (status) => {
      queryClient.setQueryData(["dev-server-status", status.workbook_id], status);
    },
  });
}

// Stop dev server
export function useStopDevServer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (workbookId: string) =>
      invoke<DevServerStatus>("stop_dev_server", { workbookId }),
    onSuccess: (status) => {
      queryClient.setQueryData(["dev-server-status", status.workbook_id], status);
    },
  });
}

// Dev server routes and introspection
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

// Get dev server routes for a workbook
export function useDevServerRoutes(workbookId: string | null) {
  return useQuery({
    queryKey: ["dev-server-routes", workbookId],
    queryFn: () => invoke<DevServerOutputs>("get_dev_server_routes", { workbookId: workbookId! }),
    enabled: !!workbookId,
    refetchInterval: 3000, // Poll every 3 seconds
  });
}

// Workbook database info
export interface WorkbookDatabaseInfo {
  workbook_id: string;
  database_name: string;
  connection_string: string;
  host: string;
  port: number;
  user: string;
}

// Get database connection info for a workbook
export function useWorkbookDatabase(workbookId: string | null) {
  return useQuery({
    queryKey: ["workbook-database", workbookId],
    queryFn: () => invoke<WorkbookDatabaseInfo>("get_workbook_database", { workbookId: workbookId! }),
    enabled: !!workbookId,
    staleTime: Infinity, // Database info doesn't change
  });
}

// Legacy aliases for backwards compatibility
export const useSstStatus = useDevServerStatus;
export const useSstOutputs = (directory: string | null) => {
  // This is a shim - the new API uses workbookId instead of directory
  // For now, return empty data
  return useQuery({
    queryKey: ["sst-outputs", directory],
    queryFn: () => Promise.resolve({ available: false, outputs: {}, routes: [] }),
    enabled: false,
  });
};
