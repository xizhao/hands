/**
 * SSE Event Handler for React Query
 *
 * Subscribes to OpenCode SSE events and updates React Query cache optimistically.
 * This gives us instant UI updates without waiting for refetches.
 */

import { QueryClient } from "@tanstack/react-query";
import { subscribeToEvents, type ServerEvent, type Session, type MessageWithParts, type SessionStatus, type Todo } from "@/lib/api";
import type { Message as SdkMessage, Part as SdkPart, Todo as SdkTodo } from "@opencode-ai/sdk/client";

export function startSSESync(queryClient: QueryClient): () => void {
  console.log("[sse] Starting SSE sync with React Query");

  const cleanup = subscribeToEvents(
    (event: ServerEvent) => {
      try {
        processEvent(event, queryClient);
      } catch (err) {
        console.error("[sse] Error processing event:", err);
      }
    },
    (err) => {
      console.error("[sse] SSE error:", err);
    }
  );

  return cleanup;
}

function processEvent(event: ServerEvent, queryClient: QueryClient) {
  switch (event.type) {
    case "session.created":
      handleSessionCreated(event.properties.info, queryClient);
      break;
    case "session.updated":
      handleSessionUpdated(event.properties.info, queryClient);
      break;
    case "session.deleted":
      handleSessionDeleted(event.properties.info.id, queryClient);
      break;
    case "session.status":
      handleSessionStatus(
        event.properties.sessionID,
        event.properties.status,
        queryClient
      );
      break;
    case "message.updated":
      handleMessageUpdated(event.properties.info, queryClient);
      break;
    case "message.removed":
      handleMessageRemoved(event.properties.messageID, queryClient);
      break;
    case "message.part.updated":
      handlePartUpdated(event.properties.part, queryClient);
      break;
    case "message.part.removed":
      handlePartRemoved(event.properties.partID, queryClient);
      break;
    case "todo.updated":
      handleTodosUpdated(
        event.properties.sessionID,
        event.properties.todos,
        queryClient
      );
      break;
    case "session.idle":
      // Session finished - invalidate to get final state
      handleSessionIdle(event.properties.sessionID, queryClient);
      break;
    default:
      console.log("[sse] Unknown event:", (event as { type: string }).type);
  }
}

// ============ EVENT HANDLERS ============

function handleSessionCreated(session: Session, queryClient: QueryClient) {
  console.log("[sse] session.created:", session.id);

  // Add to sessions list for all directories (we don't know which one)
  queryClient.setQueriesData<Session[]>(
    { queryKey: ["sessions"], exact: false },
    (old) => (old ? [session, ...old] : [session])
  );
}

function handleSessionUpdated(session: Session, queryClient: QueryClient) {
  console.log("[sse] session.updated:", session.id);

  // Update in sessions list
  queryClient.setQueriesData<Session[]>(
    { queryKey: ["sessions"], exact: false },
    (old) => old?.map((s) => (s.id === session.id ? session : s))
  );

  // Update individual session cache
  queryClient.setQueriesData<Session>(
    { queryKey: ["session", session.id], exact: false },
    () => session
  );
}

function handleSessionDeleted(sessionId: string, queryClient: QueryClient) {
  console.log("[sse] session.deleted:", sessionId);

  // Remove from sessions list
  queryClient.setQueriesData<Session[]>(
    { queryKey: ["sessions"], exact: false },
    (old) => old?.filter((s) => s.id !== sessionId)
  );

  // Remove all related caches
  queryClient.removeQueries({ queryKey: ["session", sessionId] });
  queryClient.removeQueries({ queryKey: ["messages", sessionId] });
  queryClient.removeQueries({ queryKey: ["todos", sessionId] });
}

function handleSessionStatus(
  sessionId: string,
  status: any,
  queryClient: QueryClient
) {
  console.log("[sse] session.status:", sessionId, status.type);

  // Map SDK status to our SessionStatus type
  const mappedStatus: SessionStatus =
    status.type === "retry"
      ? { type: "retry", error: status.message }
      : status.type === "busy"
        ? { type: "busy" }
        : { type: "idle" };

  // Update session statuses
  queryClient.setQueriesData<Record<string, SessionStatus>>(
    { queryKey: ["session-statuses"], exact: false },
    (old) => ({
      ...old,
      [sessionId]: mappedStatus,
    })
  );
}

function handleMessageUpdated(message: SdkMessage, queryClient: QueryClient) {
  console.log("[sse] message.updated:", message.id, "session:", message.sessionID);

  // Update in messages list
  queryClient.setQueriesData<MessageWithParts[]>(
    { queryKey: ["messages", message.sessionID], exact: false },
    (old) => {
      if (!old) return old;

      const existing = old.find((m) => m.info.id === message.id);
      if (existing) {
        // Update existing message
        return old.map((m) =>
          m.info.id === message.id ? { ...m, info: message } : m
        );
      } else {
        // Add new message
        return [...old, { info: message, parts: [] }].sort(
          (a, b) => a.info.time.created - b.info.time.created
        );
      }
    }
  );
}

function handleMessageRemoved(messageId: string, queryClient: QueryClient) {
  console.log("[sse] message.removed:", messageId);

  // Remove from all messages lists
  queryClient.setQueriesData<MessageWithParts[]>(
    { queryKey: ["messages"], exact: false },
    (old) => old?.filter((m) => m.info.id !== messageId)
  );
}

function handlePartUpdated(part: SdkPart, queryClient: QueryClient) {
  console.log("[sse] part.updated:", part.id, "message:", part.messageID);

  // Update part in messages list
  queryClient.setQueriesData<MessageWithParts[]>(
    { queryKey: ["messages", part.sessionID], exact: false },
    (old) => {
      if (!old) return old;

      return old.map((m) => {
        if (m.info.id !== part.messageID) return m;

        const existingPartIndex = m.parts.findIndex((p) => p.id === part.id);
        if (existingPartIndex >= 0) {
          // Update existing part
          const newParts = [...m.parts];
          newParts[existingPartIndex] = part;
          return { ...m, parts: newParts };
        } else {
          // Add new part
          return { ...m, parts: [...m.parts, part] };
        }
      });
    }
  );
}

function handlePartRemoved(partId: string, queryClient: QueryClient) {
  console.log("[sse] part.removed:", partId);

  // Remove from all messages
  queryClient.setQueriesData<MessageWithParts[]>(
    { queryKey: ["messages"], exact: false },
    (old) =>
      old?.map((m) => ({
        ...m,
        parts: m.parts.filter((p) => p.id !== partId),
      }))
  );
}

function handleTodosUpdated(
  sessionId: string,
  todos: SdkTodo[],
  queryClient: QueryClient
) {
  console.log("[sse] todos.updated:", sessionId, todos.length, "todos");

  // Replace entire todos list for this session
  queryClient.setQueriesData<Todo[]>(
    { queryKey: ["todos", sessionId], exact: false },
    () => todos as Todo[]
  );
}

function handleSessionIdle(sessionId: string, queryClient: QueryClient) {
  console.log("[sse] session.idle:", sessionId, "- invalidating to get final state");

  // Session finished processing - invalidate to refetch final state
  queryClient.invalidateQueries({ queryKey: ["messages", sessionId] });
  queryClient.invalidateQueries({ queryKey: ["todos", sessionId] });
  queryClient.invalidateQueries({ queryKey: ["session", sessionId] });
}
