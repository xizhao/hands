/**
 * React Query hooks for OpenCode sessions
 *
 * These hooks treat OpenCode as the single source of truth.
 * - Always fetch fresh data (staleTime: 0)
 * - SSE events update cache optimistically via queryClient.setQueryData
 * - No manual sync management needed
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useActiveWorkbookDirectory } from "@/hooks/useRuntimeState";
import { api, type MessageWithParts, type PermissionResponse, type Session } from "@/lib/api";

const DEBUG = typeof localStorage !== "undefined" && localStorage.getItem("DEBUG_HOOKS") === "true";
const log = DEBUG ? console.log.bind(console) : () => {};

// ============ SESSION HOOKS ============

/**
 * Get all sessions for the current workbook directory
 */
export function useSessions() {
  const directory = useActiveWorkbookDirectory();

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
  const directory = useActiveWorkbookDirectory();

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
  const directory = useActiveWorkbookDirectory();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["session", "create"],
    mutationFn: (body?: { parentID?: string; title?: string }) =>
      api.sessions.create(body, directory),
    onSuccess: (newSession) => {
      // Add to sessions list (check for duplicates since SSE may have already added it)
      queryClient.setQueryData<Session[]>(["sessions", directory], (old) => {
        if (!old) return [newSession];
        if (old.some((s) => s.id === newSession.id)) return old;
        return [newSession, ...old];
      });
    },
  });
}

/**
 * Delete a session
 */
export function useDeleteSession() {
  const directory = useActiveWorkbookDirectory();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["session", "delete"],
    mutationFn: (id: string) => api.sessions.delete(id, directory),
    onSuccess: (_, deletedId) => {
      // Remove from sessions list
      queryClient.setQueryData<Session[]>(["sessions", directory], (old) =>
        old?.filter((s) => s.id !== deletedId),
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
  const directory = useActiveWorkbookDirectory();
  const { data: statuses } = useSessionStatuses();
  const status = sessionId ? statuses?.[sessionId] : null;
  const isBusy = status?.type === "busy" || status?.type === "running";

  log("[useMessages] sessionId:", sessionId, "directory:", directory, "isBusy:", isBusy);

  return useQuery({
    queryKey: ["messages", sessionId, directory],
    queryFn: async () => {
      log("[useMessages] Fetching messages for session:", sessionId);
      try {
        // biome-ignore lint/style/noNonNullAssertion: sessionId is checked via enabled option
        const result = await api.messages.list(sessionId!, directory);
        log("[useMessages] Fetched", result.length, "messages");
        return result;
      } catch (err) {
        // Handle "required following item" error during streaming/HMR
        // This happens when fetching mid-stream messages after restart
        const errorMsg = err instanceof Error ? err.message : String(err);
        if (errorMsg.includes("required following item")) {
          console.warn(
            "[useMessages] Session has incomplete streaming data, returning empty until ready",
          );
          return [];
        }
        throw err;
      }
    },
    enabled: !!sessionId,
    // Keep data fresh for 5s to avoid unnecessary refetches on re-mount
    staleTime: 5000,
    refetchOnMount: true,
    // Poll while session is busy (fallback for SSE), but less frequently
    refetchInterval: isBusy ? 2000 : false,
    // Retry on transient errors (like mid-stream fetches)
    retry: (failureCount, error) => {
      const errorMsg = error instanceof Error ? error.message : String(error);
      // Retry "required following item" errors a few times as stream may complete
      if (errorMsg.includes("required following item")) {
        return failureCount < 3;
      }
      return failureCount < 1;
    },
    retryDelay: 1000,
  });
}

/**
 * Send a message to a session
 * Uses the "hands" agent by default
 */
export function useSendMessage() {
  const directory = useActiveWorkbookDirectory();
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
    onMutate: async ({ sessionId, content }) => {
      // Cancel outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: ["messages", sessionId, directory] });

      // Snapshot previous value
      const previousMessages = queryClient.getQueryData<MessageWithParts[]>([
        "messages",
        sessionId,
        directory,
      ]);

      // Optimistically add user message (use unknown cast for SDK types)
      const now = Date.now();
      const optimisticId = `optimistic-${now}`;
      const optimisticMessage = {
        info: {
          id: optimisticId,
          sessionID: sessionId,
          role: "user",
          time: { created: now, updated: now },
        },
        parts: [
          {
            id: `optimistic-part-${now}`,
            type: "text",
            text: content,
            messageID: optimisticId,
            sessionID: sessionId,
            time: { created: now, updated: now },
          },
        ],
      } as unknown as MessageWithParts;

      queryClient.setQueryData<MessageWithParts[]>(["messages", sessionId, directory], (old) => [
        ...(old ?? []),
        optimisticMessage,
      ]);

      // Optimistically set status to busy
      queryClient.setQueryData<Record<string, { type: string }>>(
        ["session-statuses", directory],
        (old) => ({ ...old, [sessionId]: { type: "busy" } }),
      );

      return { previousMessages };
    },
    onError: (err, { sessionId }, context) => {
      console.error("[useSendMessage] Error sending message:", err);
      // Rollback on error
      if (context?.previousMessages) {
        queryClient.setQueryData(["messages", sessionId, directory], context.previousMessages);
      }
      // Reset status to idle on error
      queryClient.setQueryData<Record<string, { type: string }>>(
        ["session-statuses", directory],
        (old) => ({ ...old, [sessionId]: { type: "idle" } }),
      );
    },
    onSettled: (_, __, { sessionId }) => {
      // Always refetch after mutation settles to get real message IDs
      queryClient.invalidateQueries({ queryKey: ["messages", sessionId, directory] });
    },
  });
}

// ============ STATUS HOOKS ============

/**
 * Get all session statuses
 * SSE events update this cache - no polling needed
 */
export function useSessionStatuses() {
  const directory = useActiveWorkbookDirectory();

  return useQuery({
    queryKey: ["session-statuses", directory],
    queryFn: () => api.status.all(directory),
    // SSE updates the cache, so we can cache longer
    staleTime: 10000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
}

/**
 * Get status for a specific session
 * Uses select to only re-render when this specific session's status changes
 */
export function useSessionStatus(sessionId: string | null) {
  const directory = useActiveWorkbookDirectory();

  return useQuery({
    queryKey: ["session-statuses", directory],
    queryFn: () => api.status.all(directory),
    staleTime: 10000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    select: (data) => (sessionId ? data?.[sessionId] : undefined),
    enabled: !!sessionId,
  });
}

/**
 * Abort a running session
 */
export function useAbortSession(sessionId: string | null) {
  const directory = useActiveWorkbookDirectory();

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
  const directory = useActiveWorkbookDirectory();

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
  const directory = useActiveWorkbookDirectory();

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
