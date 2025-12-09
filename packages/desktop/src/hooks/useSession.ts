/**
 * React Query hooks for OpenCode sessions
 *
 * These hooks treat OpenCode as the single source of truth.
 * - Always fetch fresh data (staleTime: 0)
 * - SSE events update cache optimistically via queryClient.setQueryData
 * - No manual sync management needed
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUIStore } from "@/stores/ui";
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

  return useQuery({
    queryKey: ["messages", sessionId, directory],
    queryFn: () => api.messages.list(sessionId!, directory),
    enabled: !!sessionId,
    staleTime: 0, // Always fetch fresh
    refetchOnMount: true,
  });
}

/**
 * Send a message to a session
 */
export function useSendMessage() {
  const directory = useUIStore((s) => s.activeWorkbookDirectory);

  return useMutation({
    mutationFn: ({
      sessionId,
      content,
      system,
    }: {
      sessionId: string;
      content: string;
      system?: string;
    }) => api.promptAsync(sessionId, content, { system, directory }),
  });
}

// ============ STATUS HOOKS ============

/**
 * Get all session statuses
 */
export function useSessionStatuses() {
  const directory = useUIStore((s) => s.activeWorkbookDirectory);

  return useQuery({
    queryKey: ["session-statuses", directory],
    queryFn: () => api.status.all(directory),
    staleTime: 0,
    refetchInterval: 1000, // Poll every second for status updates
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
