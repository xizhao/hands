/**
 * React Query hooks for OpenCode sessions
 *
 * These hooks treat OpenCode as the single source of truth.
 * - Always fetch fresh data (staleTime: 0)
 * - SSE events update cache optimistically via queryClient.setQueryData
 * - No manual sync management needed
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useUIStore } from "@/stores/ui";
import { useBackgroundStore, type BackgroundTask } from "@/stores/background";
import { api, type Session, type PermissionResponse } from "@/lib/api";

// ============ SESSION HOOKS ============

/**
 * Get all sessions for the current workbook directory
 */
export function useSessions() {
  const directory = useUIStore((s) => s.activeWorkbookDirectory);

  return useQuery({
    queryKey: ["sessions", directory],
    queryFn: () => api.sessions.list(directory),
    staleTime: 0, // Always treat as stale
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
}

/**
 * Get a single session by ID
 */
export function useSession(sessionId: string | null) {
  const directory = useUIStore((s) => s.activeWorkbookDirectory);

  return useQuery({
    queryKey: ["session", sessionId, directory],
    queryFn: () => api.sessions.get(sessionId!, directory),
    enabled: !!sessionId,
    staleTime: 0,
    refetchOnMount: true,
  });
}

/**
 * Create a new session
 */
export function useCreateSession() {
  const directory = useUIStore((s) => s.activeWorkbookDirectory);
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["session", "create"],
    mutationFn: (body?: { parentID?: string; title?: string }) =>
      api.sessions.create(body, directory),
    onSuccess: (newSession) => {
      // Add to sessions list
      queryClient.setQueryData<Session[]>(["sessions", directory], (old) =>
        old ? [newSession, ...old] : [newSession]
      );
    },
  });
}

/**
 * Delete a session
 */
export function useDeleteSession() {
  const directory = useUIStore((s) => s.activeWorkbookDirectory);
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["session", "delete"],
    mutationFn: (id: string) => api.sessions.delete(id, directory),
    onSuccess: (_, deletedId) => {
      // Remove from sessions list
      queryClient.setQueryData<Session[]>(["sessions", directory], (old) =>
        old?.filter((s) => s.id !== deletedId)
      );
      // Remove individual session cache
      queryClient.removeQueries({ queryKey: ["session", deletedId] });
      queryClient.removeQueries({ queryKey: ["messages", deletedId] });
      queryClient.removeQueries({ queryKey: ["todos", deletedId] });
    },
  });
}

// ============ MESSAGE HOOKS ============

/**
 * Get messages for a session
 */
export function useMessages(sessionId: string | null) {
  const directory = useUIStore((s) => s.activeWorkbookDirectory);
  const { data: statuses } = useSessionStatuses();
  const status = sessionId ? statuses?.[sessionId] : null;
  const isBusy = status?.type === "busy" || status?.type === "running";

  return useQuery({
    queryKey: ["messages", sessionId, directory],
    queryFn: () => api.messages.list(sessionId!, directory),
    enabled: !!sessionId,
    staleTime: 0, // Always fetch fresh
    refetchOnMount: true,
    // Poll while session is busy (fallback for SSE)
    refetchInterval: isBusy ? 1000 : false,
  });
}

/**
 * Send a message to a session
 * Uses the "hands" agent by default
 */
export function useSendMessage() {
  const directory = useUIStore((s) => s.activeWorkbookDirectory);
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["message", "send"],
    mutationFn: ({
      sessionId,
      content,
      system,
      agent = "hands",
    }: {
      sessionId: string;
      content: string;
      system?: string;
      agent?: string;
    }) => api.promptAsync(sessionId, content, { system, agent, directory }),
    onSuccess: (_, { sessionId }) => {
      // Immediately refetch messages to show user message
      queryClient.invalidateQueries({ queryKey: ["messages", sessionId] });
    },
  });
}

// ============ STATUS HOOKS ============

/**
 * Get all session statuses
 * SSE events update this cache optimistically, but we poll as fallback
 */
export function useSessionStatuses() {
  const directory = useUIStore((s) => s.activeWorkbookDirectory);

  return useQuery({
    queryKey: ["session-statuses", directory],
    queryFn: () => api.status.all(directory),
    staleTime: 0,
    refetchOnMount: true,
    refetchInterval: 2000, // Poll every 2s as SSE fallback
  });
}

/**
 * Get status for a specific session
 */
export function useSessionStatus(sessionId: string | null) {
  const { data: statuses } = useSessionStatuses();
  return sessionId ? statuses?.[sessionId] : undefined;
}

/**
 * Abort a running session
 */
export function useAbortSession(sessionId: string | null) {
  const directory = useUIStore((s) => s.activeWorkbookDirectory);

  return useMutation({
    mutationKey: ["session", "abort"],
    mutationFn: () => {
      if (!sessionId) throw new Error("No session ID");
      return api.abort(sessionId, directory);
    },
  });
}

// ============ TODO HOOKS ============

/**
 * Get todos for a session
 */
export function useTodos(sessionId: string | null) {
  const directory = useUIStore((s) => s.activeWorkbookDirectory);

  return useQuery({
    queryKey: ["todos", sessionId, directory],
    queryFn: () => api.todos.list(sessionId!, directory),
    enabled: !!sessionId,
    staleTime: 0,
    refetchOnMount: true,
  });
}

// ============ PERMISSION HOOKS ============

/**
 * Respond to a permission request
 */
export function useRespondToPermission(sessionId: string | null) {
  const directory = useUIStore((s) => s.activeWorkbookDirectory);

  return useMutation({
    mutationKey: ["permission", "respond"],
    mutationFn: ({
      permissionId,
      response,
    }: {
      permissionId: string;
      response: PermissionResponse;
    }) => {
      if (!sessionId) throw new Error("No session ID");
      return api.respondToPermission(sessionId, permissionId, response, directory);
    },
  });
}

// ============ IMPORT WITH AGENT ============

interface CopyFilesResult {
  copied_files: string[];
  data_dir: string;
}

/**
 * Import a file using the import agent
 *
 * This copies the file to the workbook's data directory,
 * creates a session, and sends a prompt to the agent.
 */
export function useImportWithAgent() {
  const directory = useUIStore((s) => s.activeWorkbookDirectory);
  const activeWorkbookId = useUIStore((s) => s.activeWorkbookId);
  const queryClient = useQueryClient();
  const { addTask, updateTask } = useBackgroundStore();

  return useMutation({
    mutationKey: ["import", "agent"],
    mutationFn: async ({
      file,
      onSessionCreated,
    }: {
      file: File;
      onSessionCreated?: (sessionId: string) => void;
    }) => {
      if (!activeWorkbookId) {
        throw new Error("No active workbook");
      }

      // 1. Write file to workbook's data directory via Tauri
      const buffer = await file.arrayBuffer();
      const bytes = Array.from(new Uint8Array(buffer));

      const result = await invoke<CopyFilesResult>("write_file_to_workbook", {
        workbookId: activeWorkbookId,
        fileData: { filename: file.name, bytes },
      });

      const filePath = result.copied_files[0];
      if (!filePath) {
        throw new Error("Failed to copy file to workbook");
      }

      // 2. Create a new session for the import
      const session = await api.sessions.create(
        { title: `Import: ${file.name}` },
        directory
      );

      // Notify caller of session ID for UI tracking
      onSessionCreated?.(session.id);

      // 3. Add background task
      const task: BackgroundTask = {
        id: session.id,
        type: "import",
        title: `Importing ${file.name}`,
        status: "running",
        progress: "Starting import...",
        startedAt: Date.now(),
      };
      addTask(task);

      // 4. Update sessions cache
      queryClient.setQueryData<Session[]>(["sessions", directory], (old) =>
        old ? [session, ...old] : [session]
      );

      // 5. Send prompt to the agent with file path
      // System prompt already contains instructions for how to handle data imports
      const prompt = `Import this data file and make it useful: ${filePath}`;

      await api.promptAsync(session.id, prompt, { directory });

      return { sessionId: session.id, filePath };
    },
    onSuccess: ({ sessionId }) => {
      updateTask(sessionId, { progress: "Agent working..." });
    },
    onError: (error) => {
      console.error("Import failed:", error);
    },
  });
}
