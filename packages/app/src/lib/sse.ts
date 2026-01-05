/**
 * SSE Event Handler for React Query
 *
 * Subscribes to browser agent events and updates React Query cache optimistically.
 * This gives us instant UI updates without waiting for refetches.
 */

import type { QueryClient } from "@tanstack/react-query";
import { setSessionError } from "@/hooks/useChatState";
import {
  type MessageWithParts,
  type ServerEvent,
  type Session,
  type SessionStatus,
  type Message,
  type Part,
  subscribeToEvents,
  type Todo,
} from "@/lib/api";

// Set to true for verbose SSE logging (or localStorage.setItem("DEBUG_SSE", "true"))
const DEBUG_SSE =
  typeof localStorage !== "undefined" && localStorage.getItem("DEBUG_SSE") === "true";
const log = DEBUG_SSE ? console.log.bind(console) : () => {};

// Navigation callback - set by the app to handle navigate tool
let navigateCallback: ((page: string) => void) | null = null;

export function setNavigateCallback(callback: (page: string) => void) {
  navigateCallback = callback;
}

// Track which tool parts have already triggered navigation
const navigatedParts = new Set<string>();

export function startSSESync(queryClient: QueryClient): () => void {
  log("[sse] Starting SSE sync with React Query");

  const cleanup = subscribeToEvents(
    (event: ServerEvent, directory?: string) => {
      try {
        processEvent(event, queryClient, directory);
      } catch (err) {
        console.error("[sse] Error processing event:", err);
      }
    },
    (err) => {
      console.error("[sse] SSE error:", err);
    },
  );

  return cleanup;
}

function processEvent(event: ServerEvent, queryClient: QueryClient, directory?: string) {
  switch (event.type) {
    case "session.created":
      handleSessionCreated(event.session, queryClient, directory);
      break;
    case "session.updated":
      handleSessionUpdated(event.session, queryClient, directory);
      break;
    case "session.deleted":
      handleSessionDeleted(event.sessionId, queryClient, directory);
      break;
    case "session.status":
      handleSessionStatus(event.sessionId, event.status, queryClient, directory);
      break;
    case "message.updated":
      handleMessageUpdated(event.message, queryClient, directory);
      break;
    case "message.removed":
      handleMessageRemoved(event.messageId, queryClient);
      break;
    case "message.part.updated":
      handlePartUpdated(event.part, event.sessionId, event.messageId, queryClient, directory);
      break;
    case "todo.updated":
      handleTodosUpdated(event.sessionId, event.todos, queryClient, directory);
      break;
    default:
      log("[sse] Unknown event:", (event as { type: string }).type);
  }
}

// ============ EVENT HANDLERS ============

function handleSessionCreated(session: Session, queryClient: QueryClient, directory?: string) {
  log("[sse] session.created:", session.id, "directory:", directory);

  // Add to sessions list - prefer specific directory if known
  if (directory) {
    queryClient.setQueryData<Session[]>(["sessions", directory], (old) => {
      if (!old) return [session];
      if (old.some((s) => s.id === session.id)) return old;
      return [session, ...old];
    });
  } else {
    // Fallback: update all session queries
    queryClient.setQueriesData<Session[]>({ queryKey: ["sessions"], exact: false }, (old) => {
      if (!old) return [session];
      if (old.some((s) => s.id === session.id)) return old;
      return [session, ...old];
    });
  }
}

function handleSessionUpdated(session: Session, queryClient: QueryClient, directory?: string) {
  log("[sse] session.updated:", session.id, "directory:", directory);

  // Update in sessions list
  queryClient.setQueriesData<Session[]>({ queryKey: ["sessions"], exact: false }, (old) =>
    old?.map((s) => (s.id === session.id ? session : s)),
  );

  // Update individual session cache
  queryClient.setQueriesData<Session>(
    { queryKey: ["session", session.id], exact: false },
    () => session,
  );
}

function handleSessionDeleted(sessionId: string, queryClient: QueryClient, directory?: string) {
  log("[sse] session.deleted:", sessionId, "directory:", directory);

  // Check if session was busy (indicates unexpected termination)
  const statuses = queryClient.getQueryData<Record<string, SessionStatus>>([
    "session-statuses",
    directory,
  ]);
  const wasActive = statuses?.[sessionId];
  const wasBusy = wasActive?.type === "busy" || wasActive?.type === "running";

  if (wasBusy) {
    console.error("[sse] session.deleted while busy - setting error:", sessionId);
    setSessionError({
      sessionId,
      message: "Session was terminated unexpectedly",
      timestamp: Date.now(),
    });
  }

  // Remove from sessions list
  queryClient.setQueriesData<Session[]>({ queryKey: ["sessions"], exact: false }, (old) =>
    old?.filter((s) => s.id !== sessionId),
  );

  // Remove all related caches
  queryClient.removeQueries({ queryKey: ["session", sessionId] });
  queryClient.removeQueries({ queryKey: ["messages", sessionId] });
  queryClient.removeQueries({ queryKey: ["todos", sessionId] });
}

function handleSessionStatus(
  sessionId: string,
  status: SessionStatus,
  queryClient: QueryClient,
  directory?: string,
) {
  log("[sse] session.status:", sessionId, status.type, "directory:", directory);

  // Update session statuses
  queryClient.setQueriesData<Record<string, SessionStatus>>(
    { queryKey: ["session-statuses"], exact: false },
    (old) => ({
      ...old,
      [sessionId]: status,
    }),
  );
}

function handleMessageUpdated(message: Message, queryClient: QueryClient, directory?: string) {
  const sessionId = message.sessionId;
  console.log(
    "[sse] message.updated:",
    message.id,
    "session:",
    sessionId,
    "directory:",
    directory,
  );

  // Debug: Log all queries that might match
  const allQueries = queryClient.getQueryCache().getAll();
  const matchingQueries = allQueries.filter(
    (q) => q.queryKey[0] === "messages" && q.queryKey[1] === sessionId,
  );
  console.log(
    "[sse] message.updated: Found",
    matchingQueries.length,
    "matching queries:",
    matchingQueries.map((q) => q.queryKey),
  );

  // If we have a directory, try to set the specific query directly
  // This is more reliable than setQueriesData which only updates existing queries
  if (directory) {
    const exactKey = ["messages", sessionId, directory];
    const existing = queryClient.getQueryData<MessageWithParts[]>(exactKey);
    log("[sse] message.updated: Checking exact key:", exactKey, "exists:", !!existing);

    if (existing !== undefined) {
      // Query exists, update it
      queryClient.setQueryData<MessageWithParts[]>(exactKey, (old) => {
        if (!old) return [{ info: message, parts: [] }];
        const existingMsg = old.find((m) => m.info.id === message.id);
        if (existingMsg) {
          return old.map((m) => (m.info.id === message.id ? { ...m, info: message } : m));
        }
        return [...old, { info: message, parts: [] }].sort(
          (a, b) => a.info.time.created - b.info.time.created,
        );
      });
      return;
    }
  }

  // Fallback: use setQueriesData to update all matching queries
  const updated = queryClient.setQueriesData<MessageWithParts[]>(
    { queryKey: ["messages", sessionId], exact: false },
    (old) => {
      // Initialize array if this is the first message for a new session
      if (!old) {
        return [{ info: message, parts: [] }];
      }

      const existing = old.find((m) => m.info.id === message.id);
      if (existing) {
        // Update existing message
        return old.map((m) => (m.info.id === message.id ? { ...m, info: message } : m));
      } else {
        // Add new message
        return [...old, { info: message, parts: [] }].sort(
          (a, b) => a.info.time.created - b.info.time.created,
        );
      }
    },
  );

  // If no queries were updated and we have a directory, create the cache entry directly
  if (updated.length === 0 && directory) {
    log("[sse] message.updated: Creating new cache entry for:", [
      "messages",
      sessionId,
      directory,
    ]);
    queryClient.setQueryData<MessageWithParts[]>(
      ["messages", sessionId, directory],
      [{ info: message, parts: [] }],
    );
  } else if (updated.length === 0) {
    // No directory - fallback to invalidation
    console.log(
      "[sse] message.updated: no matching queries found, invalidating for session:",
      sessionId,
    );
    queryClient.invalidateQueries({ queryKey: ["messages", sessionId], exact: false });
  }
}

function handleMessageRemoved(messageId: string, queryClient: QueryClient) {
  log("[sse] message.removed:", messageId);

  // Remove from all messages lists
  queryClient.setQueriesData<MessageWithParts[]>({ queryKey: ["messages"], exact: false }, (old) =>
    old?.filter((m) => m.info.id !== messageId),
  );
}

function handlePartUpdated(
  part: Part,
  sessionId: string,
  messageId: string,
  queryClient: QueryClient,
  directory?: string,
) {
  console.log(
    "[sse] part.updated:",
    part.id,
    "message:",
    messageId,
    "type:",
    part.type,
    "directory:",
    directory,
  );

  // Check for navigate tool completion
  if (part.type === "tool" && navigateCallback && !navigatedParts.has(part.id)) {
    const toolPart = part as {
      id: string;
      tool?: string;
      state?: { status?: string; output?: string };
    };
    if (
      toolPart.tool?.toLowerCase().includes("navigate") &&
      toolPart.state?.status === "completed" &&
      toolPart.state?.output
    ) {
      try {
        const parsed = JSON.parse(toolPart.state.output);
        // Check for new format: routeType + id
        if (parsed?.type === "navigate" && parsed.routeType && parsed.id && parsed.autoNavigate) {
          navigatedParts.add(toolPart.id);

          // Build path from routeType + id
          const routePath = `/${parsed.routeType}s/${parsed.id}`;
          log("[sse] Navigate tool completed, navigating to:", routePath);

          // If refresh is requested, invalidate relevant queries before navigation
          if (parsed.refresh) {
            console.log(
              "[sse] Refresh requested, invalidating queries for routeType:",
              parsed.routeType,
            );
            if (parsed.routeType === "table") {
              queryClient.invalidateQueries({ queryKey: ["postgres", "tables"] });
              queryClient.invalidateQueries({ queryKey: ["postgres", "query"] });
            } else if (parsed.routeType === "action") {
              queryClient.invalidateQueries({ queryKey: ["actions"] });
            }
          }

          navigateCallback(routePath);
        }
      } catch {
        // Not valid JSON, ignore
      }
    }
  }

  // Debug: Log all queries that might match
  const allQueries = queryClient.getQueryCache().getAll();
  const matchingQueries = allQueries.filter(
    (q) => q.queryKey[0] === "messages" && q.queryKey[1] === sessionId,
  );
  console.log(
    "[sse] part.updated: Found",
    matchingQueries.length,
    "matching queries:",
    matchingQueries.map((q) => q.queryKey),
  );

  // Helper to update parts in a message array
  const updateParts = (old: MessageWithParts[] | undefined): MessageWithParts[] | undefined => {
    // If no messages exist yet, create placeholder message to hold the part
    if (!old) {
      console.log("[sse] part.updated: no messages cache, creating placeholder for:", messageId);
      return [
        {
          info: {
            id: messageId,
            sessionId,
            role: "assistant",
            time: { created: Date.now() },
          } as Message,
          parts: [part],
        },
      ];
    }

    // Check if message exists - if not, create placeholder
    const messageExists = old.some((m) => m.info.id === messageId);
    if (!messageExists) {
      log("[sse] part.updated: message not found, creating placeholder:", messageId);
      return [
        ...old,
        {
          info: {
            id: messageId,
            sessionId,
            role: "assistant",
            time: { created: Date.now() },
          } as Message,
          parts: [part],
        },
      ];
    }

    return old.map((m) => {
      if (m.info.id !== messageId) return m;

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
  };

  // If we have a directory, try to update the specific query first
  if (directory) {
    const exactKey = ["messages", sessionId, directory];
    const existing = queryClient.getQueryData<MessageWithParts[]>(exactKey);
    if (existing !== undefined) {
      queryClient.setQueryData<MessageWithParts[]>(exactKey, updateParts);
      return;
    }
  }

  // Fallback: update all matching queries
  queryClient.setQueriesData<MessageWithParts[]>(
    { queryKey: ["messages", sessionId], exact: false },
    updateParts,
  );
}

function handleTodosUpdated(
  sessionId: string,
  todos: Todo[],
  queryClient: QueryClient,
  directory?: string,
) {
  log("[sse] todos.updated:", sessionId, todos.length, "todos", "directory:", directory);

  // If we have a directory, set specific query
  if (directory) {
    queryClient.setQueryData<Todo[]>(["todos", sessionId, directory], todos);
  } else {
    // Fallback: update all matching queries
    queryClient.setQueriesData<Todo[]>(
      { queryKey: ["todos", sessionId], exact: false },
      () => todos,
    );
  }
}
