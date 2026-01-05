/**
 * Browser-compatible API
 *
 * Drop-in replacement for @opencode-ai/sdk client.
 * Stores sessions/messages in memory and uses browser agent for prompts.
 */

import { runAgent, type AgentConfigInput } from "./agent";
import { defaultAgent, agents } from "../agents";
import {
  generateId,
  type Session,
  type SessionStatus,
  type Message,
  type MessageWithParts,
  type Part,
  type TextPart,
  type Todo,
  type AgentConfig,
} from "../core";
import type { ToolContext } from "./tools";

// ============================================================================
// Additional Types (not in core, specific to API layer)
// ============================================================================

export interface Agent {
  name: string;
  description?: string;
  mode: "primary" | "subagent" | "all";
  model?: string;
  prompt?: string;
  tools?: Record<string, boolean>;
}

// ============================================================================
// Event System
// ============================================================================

// Simplified event types using core types with sessionId (lowercase)
export type ServerEvent =
  | { type: "session.created"; session: Session }
  | { type: "session.updated"; session: Session }
  | { type: "session.deleted"; sessionId: string }
  | { type: "session.status"; sessionId: string; status: SessionStatus }
  | { type: "message.updated"; message: Message }
  | { type: "message.removed"; messageId: string }
  | { type: "message.part.updated"; part: Part; sessionId: string; messageId: string }
  | { type: "todo.updated"; sessionId: string; todos: Todo[] };

export type EventType = ServerEvent["type"];

type EventCallback = (event: ServerEvent) => void;

class EventEmitter {
  private listeners: Set<EventCallback> = new Set();

  subscribe(callback: EventCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  emit(event: ServerEvent) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (e) {
        console.error("[EventEmitter] Listener error:", e);
      }
    }
  }
}

const eventEmitter = new EventEmitter();

// ============================================================================
// In-Memory Store
// ============================================================================

const store = {
  sessions: new Map<string, Session>(),
  messages: new Map<string, MessageWithParts[]>(),
  todos: new Map<string, Todo[]>(),
  status: new Map<string, SessionStatus>(),
  abortControllers: new Map<string, AbortController>(),
};

// ============================================================================
// Tool Context (must be set by the app)
// ============================================================================

let globalToolContext: ToolContext | null = null;

export function setToolContext(ctx: ToolContext) {
  globalToolContext = ctx;
}

export function getToolContext(): ToolContext | null {
  return globalToolContext;
}

// ============================================================================
// API Implementation
// ============================================================================

export const api = {
  health: async () => {
    return { status: "ok", sessions: store.sessions.size };
  },

  sessions: {
    list: async (_directory?: string | null): Promise<Session[]> => {
      return Array.from(store.sessions.values()).sort(
        (a, b) => b.time.updated - a.time.updated
      );
    },

    get: async (id: string, _directory?: string | null): Promise<Session> => {
      const session = store.sessions.get(id);
      if (!session) throw new Error(`Session not found: ${id}`);
      return session;
    },

    create: async (
      body?: { parentId?: string; title?: string },
      _directory?: string | null
    ): Promise<Session> => {
      const now = Date.now();
      const session: Session = {
        id: generateId("session"),
        parentId: body?.parentId,
        title: body?.title,
        time: { created: now, updated: now },
      };

      store.sessions.set(session.id, session);
      store.messages.set(session.id, []);
      store.todos.set(session.id, []);
      store.status.set(session.id, { type: "idle" });

      eventEmitter.emit({ type: "session.created", session });

      return session;
    },

    delete: async (id: string, _directory?: string | null): Promise<boolean> => {
      store.sessions.delete(id);
      store.messages.delete(id);
      store.todos.delete(id);
      store.status.delete(id);

      eventEmitter.emit({ type: "session.deleted", sessionId: id });

      return true;
    },
  },

  messages: {
    list: async (
      sessionId: string,
      _directory?: string | null
    ): Promise<MessageWithParts[]> => {
      return store.messages.get(sessionId) ?? [];
    },

    get: async (
      sessionId: string,
      messageId: string,
      _directory?: string | null
    ): Promise<MessageWithParts> => {
      const messages = store.messages.get(sessionId) ?? [];
      const msg = messages.find((m) => m.info.id === messageId);
      if (!msg) throw new Error(`Message not found: ${messageId}`);
      return msg;
    },
  },

  todos: {
    list: async (sessionId: string, _directory?: string | null): Promise<Todo[]> => {
      return store.todos.get(sessionId) ?? [];
    },
  },

  status: {
    all: async (_directory?: string | null): Promise<Record<string, SessionStatus>> => {
      const result: Record<string, SessionStatus> = {};
      for (const [id, status] of store.status) {
        result[id] = status;
      }
      return result;
    },
  },

  prompt: async (
    sessionId: string,
    content: string,
    options?: {
      model?: { providerID: string; modelID: string };
      system?: string;
      agent?: string;
      directory?: string | null;
    }
  ): Promise<MessageWithParts> => {
    const messages = store.messages.get(sessionId) ?? [];
    const userMsg = createUserMessage(sessionId, content, messages);
    messages.push(userMsg);
    store.messages.set(sessionId, messages);

    eventEmitter.emit({ type: "message.updated", message: userMsg.info });

    const assistantMsg = await runPrompt(sessionId, messages, options);
    return assistantMsg;
  },

  promptAsync: async (
    sessionId: string,
    content: string,
    options?: {
      model?: { providerID: string; modelID: string };
      system?: string;
      agent?: string;
      directory?: string | null;
    }
  ) => {
    const messages = store.messages.get(sessionId) ?? [];
    const userMsg = createUserMessage(sessionId, content, messages);
    messages.push(userMsg);
    store.messages.set(sessionId, messages);

    eventEmitter.emit({ type: "message.updated", message: userMsg.info });

    runPrompt(sessionId, messages, options).catch((err) => {
      console.error("[api.promptAsync] Error:", err);
    });

    return { id: userMsg.info.id };
  },

  abort: async (sessionId: string, _directory?: string | null): Promise<boolean> => {
    const controller = store.abortControllers.get(sessionId);
    if (controller) {
      controller.abort();
      store.abortControllers.delete(sessionId);
    }

    store.status.set(sessionId, { type: "idle" });
    eventEmitter.emit({
      type: "session.status",
      sessionId,
      status: { type: "idle" },
    });

    return true;
  },

  agents: {
    list: async (): Promise<Agent[]> => {
      return Object.entries(agents).map(([name, config]) => ({
        name,
        description: config.description,
        mode: config.mode as "primary" | "subagent" | "all",
        model: config.model,
        prompt: config.prompt,
        tools: config.tools,
      }));
    },
  },

  tools: {
    ids: async (): Promise<string[]> => {
      return ["sql", "schema", "code"];
    },
  },

  config: {
    get: async () => ({ model: defaultAgent.model }),
    update: async (config: Record<string, unknown>) => config,
    setModel: async () => ({}),
  },

  providers: async () => ({}),

  respondToPermission: async () => true,
};

// ============================================================================
// Helpers
// ============================================================================

function createUserMessage(
  sessionId: string,
  content: string,
  existingMessages: MessageWithParts[]
): MessageWithParts {
  const now = Date.now();
  const messageId = generateId("msg");

  const textPart: TextPart = {
    id: generateId("part"),
    sessionId,
    messageId,
    type: "text",
    text: content,
  };

  return {
    info: {
      id: messageId,
      sessionId,
      role: "user",
      time: { created: now },
    },
    parts: [textPart],
  };
}

async function runPrompt(
  sessionId: string,
  messages: MessageWithParts[],
  options?: {
    agent?: string;
    system?: string;
  }
): Promise<MessageWithParts> {
  const toolContext = globalToolContext;
  if (!toolContext) {
    throw new Error("Tool context not set. Call setToolContext() first.");
  }

  const agentName = options?.agent ?? "hands";
  const agentConfig: AgentConfigInput =
    agents[agentName as keyof typeof agents] ?? defaultAgent;

  store.status.set(sessionId, { type: "running" });
  eventEmitter.emit({
    type: "session.status",
    sessionId,
    status: { type: "running" },
  });

  const abortController = new AbortController();
  store.abortControllers.set(sessionId, abortController);

  const session = store.sessions.get(sessionId)!;
  let assistantMsg: MessageWithParts | null = null;
  let agentError: unknown = null;

  try {
    const { events } = runAgent({
      session: {
        id: session.id,
        time: session.time,
      },
      messages: messages as any,
      agent: agentConfig,
      toolContext,
      abortSignal: abortController.signal,
    });

    for await (const event of events) {
      if (abortController.signal.aborted) break;

      switch (event.type) {
        case "message.created":
          const msgInfo = event.message;
          assistantMsg = {
            info: {
              id: msgInfo.id,
              sessionId,
              role: "assistant",
              parentId: messages[messages.length - 1]?.info.id ?? "",
              time: { created: Date.now() },
            },
            parts: [],
          };
          const allMessages = store.messages.get(sessionId) ?? [];
          allMessages.push(assistantMsg);
          store.messages.set(sessionId, allMessages);

          eventEmitter.emit({ type: "message.updated", message: assistantMsg.info });
          break;

        case "part.created":
        case "part.updated":
          if (assistantMsg) {
            const part = event.part;
            const partIdx = assistantMsg.parts.findIndex((p) => p.id === part.id);
            if (partIdx >= 0) {
              assistantMsg.parts[partIdx] = part;
            } else {
              assistantMsg.parts.push(part);
            }

            eventEmitter.emit({
              type: "message.part.updated",
              part,
              sessionId,
              messageId: assistantMsg.info.id,
            });
          }
          break;

        case "error":
          console.error("[runPrompt] Agent error:", event.error);
          agentError = event.error;
          break;

        case "done":
          break;
      }
    }
  } finally {
    store.abortControllers.delete(sessionId);
    store.status.set(sessionId, { type: "idle" });

    eventEmitter.emit({
      type: "session.status",
      sessionId,
      status: { type: "idle" },
    });

    if (session) {
      session.time.updated = Date.now();
      eventEmitter.emit({ type: "session.updated", session });
    }
  }

  if (!assistantMsg) {
    if (agentError) {
      const errorMsg = typeof agentError === "object" && agentError !== null && "message" in agentError
        ? (agentError as { message: string }).message
        : String(agentError);
      throw new Error(errorMsg);
    }
    throw new Error("No assistant message generated");
  }

  return assistantMsg;
}

// ============================================================================
// Event Subscription
// ============================================================================

export function subscribeToEvents(
  onEvent: (event: ServerEvent, directory?: string) => void,
  _onError?: (error: unknown) => void
): () => void {
  return eventEmitter.subscribe((event) => {
    onEvent(event, undefined);
  });
}

// ============================================================================
// Re-export core types for convenience
// ============================================================================

export type {
  Session,
  SessionStatus,
  Message,
  MessageWithParts,
  Part,
  TextPart,
  Todo,
  AgentConfig,
} from "../core";

export type { Message as MessageInfo } from "../core";
