/**
 * useTodos - React Query hook for session todos
 *
 * Fetches todos from SQLite storage and updates via SSE events.
 * Todos are persisted per-session and survive page reloads.
 */

import { useQuery } from "@tanstack/react-query";
import { api, type Todo } from "@hands/agent/browser";

/**
 * Get todos for a specific session.
 * Returns empty array if no todos or session is null.
 */
export function useTodos(sessionId: string | null) {
  return useQuery<Todo[]>({
    queryKey: ["todos", sessionId, null],
    queryFn: async () => {
      if (!sessionId) return [];
      return api.todos.list(sessionId);
    },
    enabled: !!sessionId,
    staleTime: 30000, // Refetch after 30s, but also updated via events
    initialData: [],
  });
}
