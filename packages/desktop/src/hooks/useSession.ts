import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  api,
  subscribeToEvents,
  type ServerEvent,
  type Session,
  type MessageWithParts,
  type SessionStatus,
  type PermissionResponse,
} from "@/lib/api";
import { useUIStore } from "@/stores/ui";

// Hook to get the active workbook directory for API calls
function useWorkbookDirectory() {
  return useUIStore((state) => state.activeWorkbookDirectory);
}

export function useSessions() {
  const directory = useWorkbookDirectory();

  return useQuery({
    queryKey: ["sessions", directory],
    queryFn: () => api.sessions.list(directory),
    select: (data) =>
      [...data].sort((a, b) => b.time.created - a.time.created),
  });
}

export function useCreateSession() {
  const queryClient = useQueryClient();
  const directory = useWorkbookDirectory();

  return useMutation({
    mutationFn: (body?: { parentID?: string; title?: string }) =>
      api.sessions.create(body, directory),
    onSuccess: (newSession) => {
      queryClient.setQueryData<Session[]>(["sessions", directory], (old) =>
        old ? [newSession, ...old] : [newSession]
      );
    },
  });
}

export function useDeleteSession() {
  const queryClient = useQueryClient();
  const directory = useWorkbookDirectory();

  return useMutation({
    mutationFn: (id: string) => api.sessions.delete(id, directory),
    onSuccess: (_, deletedId) => {
      queryClient.setQueryData<Session[]>(["sessions", directory], (old) =>
        old?.filter((s) => s.id !== deletedId)
      );
    },
  });
}

export function useMessages(sessionId: string | null) {
  const directory = useWorkbookDirectory();

  return useQuery({
    queryKey: ["messages", sessionId, directory],
    queryFn: () => api.messages.list(sessionId!, directory),
    enabled: !!sessionId,
    select: (data) =>
      [...data].sort((a, b) => a.info.time.created - b.info.time.created),
  });
}

export function useTodos(sessionId: string | null) {
  const directory = useWorkbookDirectory();

  return useQuery({
    queryKey: ["todos", sessionId, directory],
    queryFn: () => api.todos.list(sessionId!, directory),
    enabled: !!sessionId,
  });
}

export function useSessionStatuses() {
  const directory = useWorkbookDirectory();

  return useQuery({
    queryKey: ["sessionStatuses", directory],
    queryFn: () => api.status.all(directory),
    refetchInterval: 2000,
  });
}

export function useSendMessage(sessionId: string | null) {
  const queryClient = useQueryClient();
  const directory = useWorkbookDirectory();

  return useMutation({
    mutationFn: async (content: string) => {
      // Use prompt_async - it returns immediately (204) and streams via SSE
      const response = await api.promptAsync(sessionId!, content, { directory });
      if (!response.ok && response.status !== 204) {
        const text = await response.text();
        throw new Error(`Failed to send message: ${text}`);
      }
    },
    onMutate: async (content) => {
      // Optimistically add user message
      const tempId = `temp-${Date.now()}`;
      const tempPartId = `temp-part-${Date.now()}`;
      const tempUserMsg: MessageWithParts = {
        info: {
          id: tempId,
          sessionID: sessionId!,
          role: "user",
          time: { created: Date.now() },
          agent: "user",
          model: { providerID: "", modelID: "" },
        },
        parts: [{
          id: tempPartId,
          sessionID: sessionId!,
          messageID: tempId,
          type: "text",
          text: content,
        }],
      };

      queryClient.setQueryData<MessageWithParts[]>(
        ["messages", sessionId, directory],
        (old) => (old ? [...old, tempUserMsg] : [tempUserMsg])
      );
    },
    // SSE events will update the messages - no need for onSuccess invalidation
    onError: () => {
      // Remove optimistic update on error
      queryClient.invalidateQueries({ queryKey: ["messages", sessionId, directory] });
    },
  });
}

export function useAbortSession(sessionId: string | null) {
  const directory = useWorkbookDirectory();

  return useMutation({
    mutationFn: () => api.abort(sessionId!, directory),
  });
}

export function useRespondToPermission(sessionId: string | null) {
  const queryClient = useQueryClient();
  const directory = useWorkbookDirectory();

  return useMutation({
    mutationFn: ({
      permissionId,
      response,
    }: {
      permissionId: string;
      response: PermissionResponse;
    }) => api.respondToPermission(sessionId!, permissionId, response, directory),
    onSuccess: () => {
      // Invalidate session statuses to get the updated status
      queryClient.invalidateQueries({ queryKey: ["sessionStatuses"] });
    },
  });
}

// SSE hook for real-time updates
// Note: SSE events update all matching cache entries regardless of directory
// since we can't determine which workbook a session belongs to from the event
//
// IMPORTANT: ServerEvent is now the SDK's typed Event discriminated union.
// When we switch on event.type, TypeScript narrows the type automatically,
// so we get compile-time type checking on event.properties.
export function useEventSubscription() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const unsubscribe = subscribeToEvents((event: ServerEvent) => {
      console.log("SSE event:", event.type);

      switch (event.type) {
        case "session.created":
        case "session.updated": {
          // Type: EventSessionCreated | EventSessionUpdated
          // Properties: { info: Session }
          queryClient.invalidateQueries({ queryKey: ["sessions"] });
          break;
        }

        case "session.deleted": {
          // Type: EventSessionDeleted
          // Properties: { info: Session }
          queryClient.invalidateQueries({ queryKey: ["sessions"] });
          break;
        }

        case "session.status": {
          // Type: EventSessionStatus
          // Properties are now typed: { sessionID: string, status: SdkSessionStatus }
          const { sessionID, status: sdkStatus } = event.properties;

          // Map SDK status to our extended SessionStatus type
          // SDK has: idle | busy | retry
          // Our UI adds: running, waiting (these come from different mechanisms)
          const status: SessionStatus = sdkStatus.type === "retry"
            ? { type: "retry", error: sdkStatus.message }
            : sdkStatus.type === "busy"
              ? { type: "busy" }
              : { type: "idle" };

          // Update all sessionStatuses caches
          queryClient.setQueriesData<Record<string, SessionStatus>>(
            { queryKey: ["sessionStatuses"] },
            (old) => (old ? { ...old, [sessionID]: status } : { [sessionID]: status })
          );
          break;
        }

        case "message.updated": {
          // Type: EventMessageUpdated
          // Properties: { info: Message }
          const { info } = event.properties;
          const sessionID = info.sessionID;

          console.log("Processing message.updated:", { sessionID, msgId: info.id, role: info.role });

          // Find all matching query caches and update them
          const queries = queryClient.getQueriesData<MessageWithParts[]>({
            queryKey: ["messages"],
          });

          // Update each matching query that has this sessionID
          queries.forEach(([queryKey, oldData]) => {
            if (queryKey[1] === sessionID && oldData) {
              const existingIdx = oldData.findIndex((m) => m.info.id === info.id);

              let newData: MessageWithParts[];
              if (existingIdx >= 0) {
                // Update existing message - preserve existing parts
                newData = oldData.map((m, idx) =>
                  idx === existingIdx ? { ...m, info } : m
                );
              } else if (info.role === "user") {
                // For user messages, find and replace any temp optimistic message
                // Remove ALL temp user messages and add the real one
                const withoutTemp = oldData.filter(
                  (m) => !(m.info.id.startsWith("temp-") && m.info.role === "user")
                );
                // Check if already added (shouldn't happen but be safe)
                if (!withoutTemp.some((m) => m.info.id === info.id)) {
                  newData = [...withoutTemp, { info, parts: [] }];
                } else {
                  newData = withoutTemp;
                }
                console.log("Processed user message, removed temp messages");
              } else {
                // Assistant message - add new with empty parts (parts come via message.part.updated)
                newData = [...oldData, { info, parts: [] }];
              }

              console.log("Updating query:", queryKey, "messages count:", newData.length);
              queryClient.setQueryData(queryKey, newData);
            }
          });
          break;
        }

        case "message.removed": {
          // Type: EventMessageRemoved
          // Properties: { sessionID: string, messageID: string }
          const { sessionID, messageID } = event.properties;
          const queries = queryClient.getQueriesData<MessageWithParts[]>({
            queryKey: ["messages"],
          });
          queries.forEach(([queryKey, oldData]) => {
            if (queryKey[1] === sessionID && oldData) {
              queryClient.setQueryData(
                queryKey,
                oldData.filter((m) => m.info.id !== messageID)
              );
            }
          });
          break;
        }

        case "message.part.updated": {
          // Type: EventMessagePartUpdated
          // Properties: { part: Part, delta?: string }
          // Part already includes sessionID and messageID as defined in SDK types
          const { part } = event.properties;
          const sessionID = part.sessionID;
          const messageID = part.messageID;

          console.log("Part updated:", { sessionID, messageID, partId: part.id, partType: part.type });

          const queries = queryClient.getQueriesData<MessageWithParts[]>({
            queryKey: ["messages"],
          });
          queries.forEach(([queryKey, oldData]) => {
            if (queryKey[1] === sessionID && oldData) {
              const newData = oldData.map((m) => {
                if (m.info.id !== messageID) return m;
                const partExists = m.parts.some((p) => p.id === part.id);
                return {
                  ...m,
                  parts: partExists
                    ? m.parts.map((p) => (p.id === part.id ? part : p))
                    : [...m.parts, part],
                };
              });
              console.log("Updated parts for message:", messageID, "total parts:", newData.find(m => m.info.id === messageID)?.parts.length);
              queryClient.setQueryData(queryKey, newData);
            }
          });
          break;
        }

        case "todo.updated": {
          // Type: EventTodoUpdated
          // Properties: { sessionID: string, todos: Todo[] }
          const { sessionID, todos } = event.properties;
          queryClient.setQueriesData({ queryKey: ["todos", sessionID] }, () => todos);
          break;
        }
      }
    });

    return unsubscribe;
  }, [queryClient]);
}
