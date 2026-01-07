/**
 * Browser-compatible API
 *
 * Drop-in replacement for @opencode-ai/sdk client.
 * Uses SQLite as single source of truth for sessions/messages.
 * Only runtime state (status, abort controllers, streaming messages) kept in memory.
 */

import { generateText } from "ai";
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
import { createSessionStorage, type SessionStorage } from "./storage";
import { createProviderFromStorage } from "./provider";

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

export type ServerEvent =
  | { type: "session.created"; session: Session }
  | { type: "session.updated"; session: Session }
  | { type: "session.deleted"; sessionId: string }
  | { type: "session.status"; sessionId: string; status: SessionStatus }
  | { type: "message.updated"; message: Message }
  | { type: "message.removed"; messageId: string }
  | { type: "message.part.updated"; part: Part; sessionId: string; messageId: string }
  | { type: "todo.updated"; sessionId: string; todos: Todo[] }
  | { type: "page.updated"; pageId: string };

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
// Runtime State (not persisted - ephemeral per session)
// ============================================================================

const runtime = {
  status: new Map<string, SessionStatus>(),
  abortControllers: new Map<string, AbortController>(),
  // Currently streaming message (not yet persisted)
  streamingMessages: new Map<string, MessageWithParts>(),
};

// ============================================================================
// Tool Context & Storage
// ============================================================================

let globalToolContext: ToolContext | null = null;
let storage: SessionStorage | null = null;

export function setToolContext(ctx: ToolContext | null) {
  globalToolContext = ctx;
  storage = ctx?.db ? createSessionStorage(ctx.db) : null;
}

export function getToolContext(): ToolContext | null {
  return globalToolContext;
}

// ============================================================================
// API Implementation
// ============================================================================

export const api = {
  health: async () => {
    const sessions = storage ? await storage.listSessions() : [];
    return { status: "ok", sessions: sessions.length };
  },

  sessions: {
    list: async (_directory?: string | null): Promise<Session[]> => {
      if (!storage) return [];
      return storage.listSessions();
    },

    get: async (id: string, _directory?: string | null): Promise<Session> => {
      if (!storage) throw new Error("Storage not initialized");
      const session = await storage.getSession(id);
      if (!session) throw new Error(`Session not found: ${id}`);
      return session;
    },

    create: async (
      body?: { parentId?: string; title?: string },
      _directory?: string | null
    ): Promise<Session> => {
      if (!storage) throw new Error("Storage not initialized");

      const session = await storage.createSession({
        title: body?.title,
        parentId: body?.parentId,
      });

      runtime.status.set(session.id, { type: "idle" });
      eventEmitter.emit({ type: "session.created", session });

      return session;
    },

    delete: async (id: string, _directory?: string | null): Promise<boolean> => {
      if (!storage) throw new Error("Storage not initialized");

      await storage.deleteSession(id);

      runtime.status.delete(id);
      runtime.abortControllers.delete(id);
      runtime.streamingMessages.delete(id);

      eventEmitter.emit({ type: "session.deleted", sessionId: id });

      return true;
    },
  },

  messages: {
    list: async (
      sessionId: string,
      _directory?: string | null
    ): Promise<MessageWithParts[]> => {
      if (!storage) return [];

      const persisted = await storage.listMessages(sessionId);

      // Include any currently streaming message
      const streaming = runtime.streamingMessages.get(sessionId);
      if (streaming) {
        return [...persisted, streaming];
      }

      return persisted;
    },

    get: async (
      sessionId: string,
      messageId: string,
      _directory?: string | null
    ): Promise<MessageWithParts> => {
      if (!storage) throw new Error("Storage not initialized");

      // Check streaming message first
      const streaming = runtime.streamingMessages.get(sessionId);
      if (streaming?.info.id === messageId) {
        return streaming;
      }

      const msg = await storage.getMessage(sessionId, messageId);
      if (!msg) throw new Error(`Message not found: ${messageId}`);
      return msg;
    },
  },

  todos: {
    list: async (sessionId: string, _directory?: string | null): Promise<Todo[]> => {
      if (!storage) return [];
      return storage.listTodos(sessionId);
    },
  },

  status: {
    all: async (_directory?: string | null): Promise<Record<string, SessionStatus>> => {
      const result: Record<string, SessionStatus> = {};
      for (const [id, status] of runtime.status) {
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
    if (!storage) throw new Error("Storage not initialized");

    // Get existing messages from storage
    const messages = await storage.listMessages(sessionId);

    // Create and persist user message
    const userMsg = createUserMessage(sessionId, content, messages);
    await storage.createMessage(sessionId, userMsg);

    // Emit message info and parts
    eventEmitter.emit({ type: "message.updated", message: userMsg.info });
    for (const part of userMsg.parts) {
      eventEmitter.emit({
        type: "message.part.updated",
        sessionId,
        messageId: userMsg.info.id,
        part,
      });
    }

    // Run agent and get response
    const assistantMsg = await runPrompt(sessionId, [...messages, userMsg], options);
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
    if (!storage) throw new Error("Storage not initialized");

    // Get existing messages from storage
    const messages = await storage.listMessages(sessionId);

    // Create and persist user message
    const userMsg = createUserMessage(sessionId, content, messages);
    storage.createMessage(sessionId, userMsg).catch((err) => {
      console.error("[api.promptAsync] Failed to persist user message:", err);
    });

    // Emit message info
    eventEmitter.emit({ type: "message.updated", message: userMsg.info });

    // Emit parts (required for UI to render user message content)
    for (const part of userMsg.parts) {
      eventEmitter.emit({
        type: "message.part.updated",
        sessionId,
        messageId: userMsg.info.id,
        part,
      });
    }

    // Run agent async
    runPrompt(sessionId, [...messages, userMsg], options).catch((err) => {
      console.error("[api.promptAsync] Error:", err);
    });

    return { id: userMsg.info.id };
  },

  abort: async (sessionId: string, _directory?: string | null): Promise<boolean> => {
    const controller = runtime.abortControllers.get(sessionId);
    if (controller) {
      controller.abort();
      runtime.abortControllers.delete(sessionId);
    }

    runtime.status.set(sessionId, { type: "idle" });
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

  // Get session from storage
  const session = await storage!.getSession(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  runtime.status.set(sessionId, { type: "running" });
  eventEmitter.emit({
    type: "session.status",
    sessionId,
    status: { type: "running" },
  });

  const abortController = new AbortController();
  runtime.abortControllers.set(sessionId, abortController);

  let assistantMsg: MessageWithParts | null = null;
  let agentError: { type: string; message: string } | null = null;

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
          // Track streaming message for real-time queries
          runtime.streamingMessages.set(sessionId, assistantMsg);

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
          agentError = event.error as { type: string; message: string };
          break;

        case "done":
          break;
      }
    }
  } finally {
    runtime.abortControllers.delete(sessionId);

    // IMPORTANT: Persist message BEFORE deleting from streaming map
    // This prevents a race condition where a refetch could find neither
    // the streaming message nor the persisted message
    if (assistantMsg && storage) {
      try {
        await storage.createMessage(sessionId, assistantMsg);
        await storage.updateSession(sessionId, { updated: Date.now() });
      } catch (err) {
        console.error("[runPrompt] Failed to persist assistant message:", err);
      }
    }

    // Now safe to remove streaming message - it's in SQLite
    runtime.streamingMessages.delete(sessionId);
    runtime.status.set(sessionId, { type: "idle" });

    eventEmitter.emit({
      type: "session.status",
      sessionId,
      status: { type: "idle" },
    });

    // Emit session update
    const updatedSession = await storage?.getSession(sessionId);
    if (updatedSession) {
      eventEmitter.emit({ type: "session.updated", session: updatedSession });
    }

    // Auto-generate title in background (don't await)
    maybeAutoTitle(sessionId);
  }

  // Handle error case - create error message
  if (!assistantMsg && agentError) {
    const messageId = generateId("msg");
    const now = Date.now();

    assistantMsg = {
      info: {
        id: messageId,
        sessionId,
        role: "assistant",
        parentId: messages[messages.length - 1]?.info.id ?? "",
        time: { created: now },
        error: {
          name: agentError.type,
          data: { message: agentError.message, type: agentError.type },
        },
      } as Message & { error: { name: string; data: { message: string; type: string } } },
      parts: [],
    };

    // Persist error message
    if (storage) {
      try {
        await storage.createMessage(sessionId, assistantMsg);
      } catch (err) {
        console.error("[runPrompt] Failed to persist error message:", err);
      }
    }

    eventEmitter.emit({ type: "message.updated", message: assistantMsg.info });
  }

  if (!assistantMsg) {
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

/**
 * Emit an event to all subscribers.
 * Used by tool context implementations to notify UI of state changes.
 */
export function emitEvent(event: ServerEvent) {
  eventEmitter.emit(event);
}

// ============================================================================
// Title Generation
// ============================================================================

/** Free model for title generation */
const TITLE_MODEL = "meta-llama/llama-3.2-3b-instruct:free";

/**
 * Generate a short title for a session based on messages.
 * Uses a free model to minimize cost.
 */
async function generateSessionTitle(messages: MessageWithParts[]): Promise<string | null> {
  try {
    // Extract text from messages (first user message + first assistant response)
    const textContent = messages
      .slice(0, 4)
      .map((m) => {
        const textParts = m.parts.filter((p) => p.type === "text") as TextPart[];
        return textParts.map((p) => p.text).join(" ");
      })
      .filter(Boolean)
      .join("\n");

    if (!textContent.trim()) return null;

    const provider = createProviderFromStorage();

    const { text } = await generateText({
      model: provider(TITLE_MODEL),
      maxOutputTokens: 20,
      temperature: 0.3,
      prompt: `Generate a very short title (3-6 words max) for this conversation. Reply with ONLY the title, no quotes or punctuation:

${textContent.slice(0, 500)}`,
    });

    // Clean up the title
    const title = text
      .trim()
      .replace(/^["']|["']$/g, "") // Remove quotes
      .replace(/[.!?]$/, "") // Remove trailing punctuation
      .slice(0, 50); // Max length

    return title || null;
  } catch (err) {
    console.error("[generateSessionTitle] Failed:", err);
    return null;
  }
}

/**
 * Auto-title a session if it doesn't have one.
 * Called after first assistant response.
 */
async function maybeAutoTitle(sessionId: string): Promise<void> {
  if (!storage) return;

  try {
    const session = await storage.getSession(sessionId);
    if (!session || session.title) return; // Already has title

    const messages = await storage.listMessages(sessionId);
    if (messages.length < 2) return; // Need at least user + assistant

    const title = await generateSessionTitle(messages);
    if (!title) return;

    await storage.updateSession(sessionId, { title });

    // Emit update event for UI
    const updated = await storage.getSession(sessionId);
    if (updated) {
      eventEmitter.emit({ type: "session.updated", session: updated });
    }

    console.log(`[api] Auto-titled session: "${title}"`);
  } catch (err) {
    console.error("[maybeAutoTitle] Failed:", err);
  }
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
