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
import { useActiveWorkbookDirectory, useActiveWorkbookId } from "@/hooks/useWorkbook";
import { api, type Session, type PermissionResponse, type MessageWithParts } from "@/lib/api";

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
  const directory = useActiveWorkbookDirectory();
  const { data: statuses } = useSessionStatuses();
  const status = sessionId ? statuses?.[sessionId] : null;
  const isBusy = status?.type === "busy" || status?.type === "running";

  console.log("[useMessages] sessionId:", sessionId, "directory:", directory, "isBusy:", isBusy);

  return useQuery({
    queryKey: ["messages", sessionId, directory],
    queryFn: async () => {
      console.log("[useMessages] Fetching messages for session:", sessionId);
      const result = await api.messages.list(sessionId!, directory);
      console.log("[useMessages] Fetched", result.length, "messages");
      return result;
    },
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
      const previousMessages = queryClient.getQueryData<MessageWithParts[]>(["messages", sessionId, directory]);

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
        parts: [{
          id: `optimistic-part-${now}`,
          type: "text",
          text: content,
          messageID: optimisticId,
          sessionID: sessionId,
          time: { created: now, updated: now },
        }],
      } as unknown as MessageWithParts;

      queryClient.setQueryData<MessageWithParts[]>(
        ["messages", sessionId, directory],
        (old) => [...(old ?? []), optimisticMessage]
      );

      // Optimistically set status to busy
      queryClient.setQueryData<Record<string, { type: string }>>(
        ["session-statuses", directory],
        (old) => ({ ...old, [sessionId]: { type: "busy" } })
      );

      return { previousMessages };
    },
    onError: (_err, { sessionId }, context) => {
      // Rollback on error
      if (context?.previousMessages) {
        queryClient.setQueryData(["messages", sessionId, directory], context.previousMessages);
      }
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
    staleTime: 0,
    refetchOnMount: true,
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
  const directory = useActiveWorkbookDirectory();
  const activeWorkbookId = useActiveWorkbookId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["import", "agent"],
    mutationFn: async ({
      file,
      onSessionCreated,
    }: {
      file: File;
      onSessionCreated?: (sessionId: string) => void;
    }) => {
      console.log("[import] Starting import for file:", file.name);
      console.log("[import] activeWorkbookId:", activeWorkbookId);
      console.log("[import] directory:", directory);

      if (!activeWorkbookId) {
        throw new Error("No active workbook");
      }

      // 1. Write file to workbook's data directory via Tauri
      console.log("[import] Step 1: Writing file to workbook...");
      const buffer = await file.arrayBuffer();
      const bytes = Array.from(new Uint8Array(buffer));

      const result = await invoke<CopyFilesResult>("write_file_to_workbook", {
        workbookId: activeWorkbookId,
        fileData: { filename: file.name, bytes },
      });
      console.log("[import] File written, result:", result);

      const filePath = result.copied_files[0];
      if (!filePath) {
        throw new Error("Failed to copy file to workbook");
      }

      // 2. Create a new session for the import
      console.log("[import] Step 2: Creating session...");
      const session = await api.sessions.create(
        { title: `Import: ${file.name}` },
        directory
      );
      console.log("[import] Session created:", session.id);

      // Notify caller of session ID for UI tracking
      console.log("[import] Calling onSessionCreated callback...");
      onSessionCreated?.(session.id);

      // 3. Update sessions cache (check for duplicates since SSE may have already added it)
      console.log("[import] Step 3: Updating sessions cache...");
      queryClient.setQueryData<Session[]>(["sessions", directory], (old) => {
        if (!old) return [session];
        if (old.some((s) => s.id === session.id)) return old;
        return [session, ...old];
      });

      // 4. Optimistically set status to busy (for polling fallback)
      console.log("[import] Step 4: Setting status to busy...");
      queryClient.setQueryData<Record<string, { type: string }>>(
        ["session-statuses", directory],
        (old) => ({ ...old, [session.id]: { type: "busy" } })
      );

      // 5. CRITICAL: Initialize messages cache so SSE updates can find it
      // This must happen BEFORE onSessionCreated triggers UI to fetch
      console.log("[import] Step 5: Initializing messages cache for session:", session.id);
      const now = Date.now();
      const optimisticId = `optimistic-${now}`;
      const optimisticMessage = {
        info: {
          id: optimisticId,
          sessionID: session.id,
          role: "user",
          time: { created: now, updated: now },
        },
        parts: [{
          id: `optimistic-part-${now}`,
          type: "text",
          text: `Import and integrate this data file: ${filePath}`,
          messageID: optimisticId,
          sessionID: session.id,
          time: { created: now, updated: now },
        }],
      } as unknown as MessageWithParts;
      queryClient.setQueryData<MessageWithParts[]>(
        ["messages", session.id, directory],
        [optimisticMessage]
      );
      console.log("[import] Messages cache initialized with optimistic message");

      // 6. Send prompt to the agent with file path
      // Use the main "hands" agent which will orchestrate @import + view integration
      console.log("[import] Step 6: Sending prompt to hands agent...");
      const prompt = `Import and integrate this data file: ${filePath}

Use @import to load the data into the database first. Once the data is in the database, integrate it into the app by either:
- Creating a new dashboard/block to visualize the data
- Adding it to an existing relevant block
- Building an appropriate view based on the data type (charts for time series, tables for records, etc.)

The import is only complete when the data is both in the database AND visible in the UI.`;
      console.log("[import] Prompt:", prompt);

      // Use main "hands" agent to orchestrate import + view integration
      const promptResult = await api.promptAsync(session.id, prompt, { agent: "hands", directory });
      console.log("[import] promptAsync returned:", promptResult);

      // Immediately invalidate messages to trigger a fetch
      console.log("[import] Step 7: Invalidating messages query...");
      queryClient.invalidateQueries({ queryKey: ["messages", session.id, directory] });

      console.log("[import] Complete! Returning sessionId:", session.id);
      return { sessionId: session.id, filePath };
    },
  });
}
