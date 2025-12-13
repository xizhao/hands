/**
 * Background Task Hook
 *
 * Wraps the existing session/message system to provide a simple interface
 * for running background agent tasks with pass/fail callbacks.
 *
 * Uses SSE-based updates via React Query cache (same as chat system).
 * The useSessionStatuses hook tracks status changes pushed by SSE.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useActiveWorkbookDirectory } from "@/hooks/useRuntimeState";
import { api, type MessageWithParts, type Session, type SessionStatus } from "@/lib/api";

export type BackgroundTaskStatus = "idle" | "running" | "success" | "failure";

export interface BackgroundTaskResult {
  success: boolean;
  output?: string;
  error?: string;
}

export interface BackgroundTaskOptions {
  /** Agent to use (default: "hands") */
  agent?: string;
  /** Title for the session */
  title?: string;
  /** Called when task starts */
  onStart?: (sessionId: string) => void;
  /** Called when task succeeds */
  onSuccess?: (result: BackgroundTaskResult) => void;
  /** Called when task fails */
  onFailure?: (result: BackgroundTaskResult) => void;
  /** Called when task completes (success or failure) */
  onComplete?: (result: BackgroundTaskResult) => void;
}

export interface BackgroundTaskState {
  sessionId: string | null;
  status: BackgroundTaskStatus;
  messages: MessageWithParts[];
  result: BackgroundTaskResult | null;
}

/**
 * Hook for running background agent tasks
 *
 * Uses the same SSE infrastructure as the chat system - no polling needed.
 * Status updates come through the global SSE stream and update React Query cache.
 *
 * @example
 * ```tsx
 * const task = useBackgroundTask();
 *
 * const handleValidate = async () => {
 *   await task.run("Validate this source code against the spec", {
 *     agent: "coder",
 *     onSuccess: (result) => toast.success("Validation passed!"),
 *     onFailure: (result) => toast.error(`Validation failed: ${result.error}`),
 *   });
 * };
 *
 * // task.state gives you { sessionId, status, messages, result }
 * ```
 */
export function useBackgroundTask() {
  const directory = useActiveWorkbookDirectory();
  const queryClient = useQueryClient();

  const [state, setState] = useState<BackgroundTaskState>({
    sessionId: null,
    status: "idle",
    messages: [],
    result: null,
  });

  // Keep track of callbacks in refs so they don't cause re-renders
  const callbacksRef = useRef<BackgroundTaskOptions>({});
  const completedRef = useRef(false);

  // Subscribe to session statuses via React Query (updated by SSE)
  const { data: statuses } = useQuery({
    queryKey: ["session-statuses", directory],
    queryFn: () => api.status.all(directory),
    staleTime: 0,
    refetchOnMount: true,
  });

  // Subscribe to messages for the active session (updated by SSE)
  const { data: messages } = useQuery({
    queryKey: ["messages", state.sessionId, directory],
    queryFn: () => api.messages.list(state.sessionId!, directory),
    enabled: !!state.sessionId,
    staleTime: 0,
  });

  // Update messages in state when they change
  useEffect(() => {
    if (messages && state.sessionId) {
      setState((prev) => ({ ...prev, messages }));
    }
  }, [messages, state.sessionId]);

  // Watch for session completion via SSE status updates
  useEffect(() => {
    if (!state.sessionId || state.status !== "running" || completedRef.current) return;

    const sessionStatus = statuses?.[state.sessionId] as SessionStatus | undefined;

    // Check if session went idle (completed)
    if (sessionStatus?.type === "idle") {
      completedRef.current = true;

      // Fetch final messages
      api.messages.list(state.sessionId, directory).then((finalMessages) => {
        const result = determineResult(finalMessages);

        setState((prev) => ({
          ...prev,
          status: result.success ? "success" : "failure",
          messages: finalMessages,
          result,
        }));

        // Fire callbacks
        if (result.success) {
          callbacksRef.current.onSuccess?.(result);
        } else {
          callbacksRef.current.onFailure?.(result);
        }
        callbacksRef.current.onComplete?.(result);
      });
    }
  }, [statuses, state.sessionId, state.status, directory]);

  /**
   * Run a background task with the given prompt
   */
  const run = useCallback(
    async (prompt: string, options?: BackgroundTaskOptions) => {
      // Store callbacks
      callbacksRef.current = options || {};
      completedRef.current = false;

      // Reset state
      setState({
        sessionId: null,
        status: "running",
        messages: [],
        result: null,
      });

      try {
        // Create session
        const session = await api.sessions.create(
          { title: options?.title || "Background Task" },
          directory,
        );

        setState((prev) => ({ ...prev, sessionId: session.id }));
        options?.onStart?.(session.id);

        // Update React Query cache for sessions list
        queryClient.setQueryData<Session[]>(["sessions", directory], (old) => {
          if (!old) return [session];
          if (old.some((s) => s.id === session.id)) return old;
          return [session, ...old];
        });

        // Optimistically set status to busy
        queryClient.setQueryData<Record<string, SessionStatus>>(
          ["session-statuses", directory],
          (old) => ({ ...old, [session.id]: { type: "busy" } }),
        );

        // Initialize empty messages cache so SSE updates can populate it
        queryClient.setQueryData<MessageWithParts[]>(["messages", session.id, directory], []);

        // Send prompt
        await api.promptAsync(session.id, prompt, {
          agent: options?.agent || "hands",
          directory,
        });

        // SSE will update the cache and trigger our effects
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        const result: BackgroundTaskResult = { success: false, error };

        setState((prev) => ({
          ...prev,
          status: "failure",
          result,
        }));

        options?.onFailure?.(result);
        options?.onComplete?.(result);
      }
    },
    [directory, queryClient],
  );

  /**
   * Cancel the current task (if running)
   */
  const cancel = useCallback(async () => {
    if (state.sessionId && state.status === "running") {
      completedRef.current = true;
      try {
        await api.abort(state.sessionId, directory);
      } catch (err) {
        console.error("[useBackgroundTask] Abort error:", err);
      }
      setState((prev) => ({
        ...prev,
        status: "idle",
        result: { success: false, error: "Cancelled" },
      }));
    }
  }, [state.sessionId, state.status, directory]);

  /**
   * Reset state to idle
   */
  const reset = useCallback(() => {
    completedRef.current = false;
    setState({
      sessionId: null,
      status: "idle",
      messages: [],
      result: null,
    });
  }, []);

  return {
    state,
    run,
    cancel,
    reset,
  };
}

/**
 * Determine task result from messages
 *
 * Looks for explicit pass/fail markers in the assistant's response,
 * or falls back to checking for error indicators.
 */
function determineResult(messages: MessageWithParts[]): BackgroundTaskResult {
  // Get the last assistant message
  const lastAssistantMessage = [...messages].reverse().find((m) => m.info.role === "assistant");

  if (!lastAssistantMessage) {
    return { success: false, error: "No response from assistant" };
  }

  // Extract text content
  const textParts = lastAssistantMessage.parts.filter((p) => p.type === "text");
  const fullText = textParts.map((p) => (p as { text?: string }).text || "").join("\n");

  // Check for explicit markers (case-insensitive)
  const lowerText = fullText.toLowerCase();

  // Success indicators
  if (
    lowerText.includes("✅") ||
    lowerText.includes("validation passed") ||
    lowerText.includes("all tests pass") ||
    lowerText.includes("tests passed") ||
    lowerText.includes("validation successful") ||
    lowerText.includes("successfully validated")
  ) {
    return { success: true, output: fullText };
  }

  // Failure indicators
  if (
    lowerText.includes("❌") ||
    lowerText.includes("validation failed") ||
    lowerText.includes("tests failed") ||
    lowerText.includes("error:") ||
    lowerText.includes("failed to")
  ) {
    return { success: false, output: fullText, error: "Validation failed" };
  }

  // Check for tool errors
  const hasToolError = lastAssistantMessage.parts.some((p) => {
    if (p.type === "tool") {
      const toolPart = p as { state?: { status?: string } };
      return toolPart.state?.status === "error";
    }
    return false;
  });

  if (hasToolError) {
    return { success: false, output: fullText, error: "Tool execution failed" };
  }

  // Default to success if no explicit indicators
  return { success: true, output: fullText };
}
