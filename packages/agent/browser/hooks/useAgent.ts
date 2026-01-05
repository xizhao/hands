/**
 * useAgent Hook
 *
 * Main hook for interacting with the browser agent.
 * Provides send, abort, and state management.
 */

import { useCallback, useRef, useState } from "react";
import { runAgent } from "../agent";
import { generateId, type MessageWithParts, type Session, type Part, type TextPart, type AgentConfig } from "../../core";
import type { ToolContext, ToolId } from "../tools";

// ============================================================================
// Default Agent Config
// ============================================================================

const DEFAULT_AGENT: AgentConfig = {
  id: "default",
  name: "Default Agent",
  description: "General-purpose assistant with data analysis capabilities",
  systemPrompt: `You are a helpful data analysis assistant working in a browser-based workbook application.

You have access to tools for:
- Querying and modifying a SQLite database
- Reading and writing MDX documents
- Executing JavaScript code
- Fetching data from the web

When analyzing data:
1. First use schema to understand the available tables
2. Use sql to explore the data
3. Provide clear explanations of your findings

Be concise and helpful. Format responses in markdown when appropriate.`,
  model: "openrouter/anthropic/claude-sonnet-4-20250514",
  tools: ["sql", "schema", "sql_execute", "code", "glob", "read", "write"],
};

// ============================================================================
// Types
// ============================================================================

export interface UseAgentOptions {
  /** Tool context (database access, etc.) */
  toolContext: ToolContext;
  /** Which tools to enable */
  enabledTools?: ToolId[];
  /** Maximum turns before stopping */
  maxTurns?: number;
  /** Agent configuration */
  agent?: AgentConfig;
}

export interface UseAgentReturn {
  /** Send a message to the agent */
  send: (message: string) => Promise<void>;
  /** Abort the current request */
  abort: () => void;
  /** Whether the agent is currently streaming */
  isStreaming: boolean;
  /** Current streaming parts (for live updates) */
  streamingParts: Part[];
  /** Messages in the active session */
  messages: MessageWithParts[];
  /** Active session */
  session: Session | null;
  /** Any error from the last run */
  error: { type: string; message: string } | null;
  /** Clear the error */
  clearError: () => void;
  /** Create a new session */
  newSession: () => void;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useAgent(options: UseAgentOptions): UseAgentReturn {
  const { toolContext, enabledTools, maxTurns } = options;
  const agent = options.agent || DEFAULT_AGENT;

  // Local state
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<MessageWithParts[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingParts, setStreamingParts] = useState<Part[]>([]);
  const [error, setError] = useState<{ type: string; message: string } | null>(null);

  // Ref for abort controller
  const abortRef = useRef<(() => void) | null>(null);

  /**
   * Create a new session
   */
  const newSession = useCallback(() => {
    const newSessionData: Session = {
      id: generateId("session"),
      time: { created: Date.now(), updated: Date.now() },
    };
    setSession(newSessionData);
    setMessages([]);
    setError(null);
  }, []);

  /**
   * Send a message to the agent
   */
  const send = useCallback(
    async (messageText: string) => {
      if (isStreaming) return;
      if (!messageText.trim()) return;

      // Create session if needed
      let currentSession = session;
      if (!currentSession) {
        currentSession = {
          id: generateId("session"),
          time: { created: Date.now(), updated: Date.now() },
        };
        setSession(currentSession);
      }

      const sessionId = currentSession.id;

      // Create user message
      const userMessageId = generateId("msg");
      const userMessage: MessageWithParts = {
        info: {
          id: userMessageId,
          sessionId,
          role: "user",
          time: { created: Date.now() },
        },
        parts: [
          {
            id: generateId("part"),
            sessionId,
            messageId: userMessageId,
            type: "text",
            text: messageText,
          } as TextPart,
        ],
      };

      // Update messages with user message
      const currentMessages = [...messages, userMessage];
      setMessages(currentMessages);

      // Start streaming
      setIsStreaming(true);
      setError(null);
      setStreamingParts([]);

      try {
        const { events, abort } = runAgent({
          session: currentSession,
          messages: currentMessages,
          agent,
          toolContext,
          enabledTools: enabledTools || (agent.tools as ToolId[]),
          maxTurns,
        });

        abortRef.current = abort;

        let currentAssistantMessage: MessageWithParts | null = null;
        const collectedParts: Part[] = [];

        for await (const event of events) {
          switch (event.type) {
            case "message.created": {
              if (event.message.role === "assistant") {
                currentAssistantMessage = {
                  info: event.message,
                  parts: [],
                };
              }
              break;
            }

            case "message.updated": {
              if (currentAssistantMessage && event.message.id === currentAssistantMessage.info.id) {
                const updated: MessageWithParts = {
                  info: event.message,
                  parts: currentAssistantMessage.parts,
                };
                currentAssistantMessage = updated;
              }
              break;
            }

            case "part.created": {
              collectedParts.push(event.part);
              setStreamingParts([...collectedParts]);
              break;
            }

            case "part.updated": {
              const index = collectedParts.findIndex((p) => p.id === event.part.id);
              if (index !== -1) {
                collectedParts[index] = event.part;
                setStreamingParts([...collectedParts]);
              }
              break;
            }

            case "error": {
              setError(event.error);
              break;
            }

            case "done": {
              // Finalize assistant message
              if (currentAssistantMessage) {
                const finalMessage: MessageWithParts = {
                  ...currentAssistantMessage,
                  parts: collectedParts,
                };
                setMessages((prev) => [...prev, finalMessage]);
              }
              break;
            }
          }
        }
      } catch (err) {
        setError({
          type: "unexpected_error",
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setIsStreaming(false);
        setStreamingParts([]);
        abortRef.current = null;
      }
    },
    [session, agent, messages, isStreaming, toolContext, enabledTools, maxTurns]
  );

  /**
   * Abort the current request
   */
  const abort = useCallback(() => {
    if (abortRef.current) {
      abortRef.current();
      abortRef.current = null;
    }
  }, []);

  /**
   * Clear the error
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    send,
    abort,
    isStreaming,
    streamingParts,
    messages,
    session,
    error,
    clearError,
    newSession,
  };
}
