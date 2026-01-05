/**
 * Browser Agent Provider
 *
 * Implements AgentProvider interface for browser environments.
 * Uses AI SDK + OpenRouter for LLM calls, in-memory state for sessions.
 */

import type {
  AgentProvider,
  PromptOptions,
  Session,
  SessionStatus,
  MessageWithParts,
  Todo,
  AgentConfig,
  AgentEvent,
} from "../core";
import { generateId } from "../core";
import { runAgent } from "./agent";
import { agents, defaultAgent } from "../agents";
import type { ToolContext } from "./tools";

// ============================================================================
// Event Emitter
// ============================================================================

type EventCallback = (event: AgentEvent) => void;

class EventEmitter {
  private listeners = new Set<EventCallback>();

  subscribe(callback: EventCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  emit(event: AgentEvent) {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (e) {
        console.error("[EventEmitter] Listener error:", e);
      }
    });
  }
}

// ============================================================================
// Browser Provider Implementation
// ============================================================================

export interface BrowserProviderConfig {
  /** Tool context for database, file operations, etc. */
  toolContext: ToolContext;
}

export class BrowserAgentProvider implements AgentProvider {
  private sessions = new Map<string, Session>();
  private messages = new Map<string, MessageWithParts[]>();
  private todos = new Map<string, Todo[]>();
  private statuses = new Map<string, SessionStatus>();
  private abortControllers = new Map<string, AbortController>();
  private eventEmitter = new EventEmitter();
  private toolContext: ToolContext;

  constructor(config: BrowserProviderConfig) {
    this.toolContext = config.toolContext;
  }

  // ---------------------------------------------------------------------------
  // Sessions
  // ---------------------------------------------------------------------------

  async listSessions(): Promise<Session[]> {
    return Array.from(this.sessions.values()).sort(
      (a, b) => b.time.updated - a.time.updated
    );
  }

  async getSession(sessionId: string): Promise<Session> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    return session;
  }

  async createSession(options?: { title?: string; parentId?: string }): Promise<Session> {
    const now = Date.now();
    const session: Session = {
      id: generateId("session"),
      title: options?.title,
      parentId: options?.parentId,
      time: { created: now, updated: now },
    };

    this.sessions.set(session.id, session);
    this.messages.set(session.id, []);
    this.todos.set(session.id, []);
    this.statuses.set(session.id, { type: "idle" });

    this.eventEmitter.emit({ type: "session.created", session });

    return session;
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
    this.messages.delete(sessionId);
    this.todos.delete(sessionId);
    this.statuses.delete(sessionId);

    this.eventEmitter.emit({ type: "session.deleted", sessionId });
  }

  async getSessionStatus(sessionId: string): Promise<SessionStatus> {
    return this.statuses.get(sessionId) ?? { type: "idle" };
  }

  async getAllSessionStatuses(): Promise<Record<string, SessionStatus>> {
    const result: Record<string, SessionStatus> = {};
    this.statuses.forEach((status, id) => {
      result[id] = status;
    });
    return result;
  }

  // ---------------------------------------------------------------------------
  // Messages
  // ---------------------------------------------------------------------------

  async listMessages(sessionId: string): Promise<MessageWithParts[]> {
    return this.messages.get(sessionId) ?? [];
  }

  async getMessage(sessionId: string, messageId: string): Promise<MessageWithParts> {
    const messages = this.messages.get(sessionId) ?? [];
    const msg = messages.find((m) => m.info.id === messageId);
    if (!msg) throw new Error(`Message not found: ${messageId}`);
    return msg;
  }

  // ---------------------------------------------------------------------------
  // Prompting
  // ---------------------------------------------------------------------------

  async *prompt(
    sessionId: string,
    content: string,
    options?: PromptOptions
  ): AsyncIterable<AgentEvent> {
    const messages = this.messages.get(sessionId) ?? [];

    // Create user message
    const userMsg = this.createUserMessage(sessionId, content, messages);
    messages.push(userMsg);
    this.messages.set(sessionId, messages);

    this.eventEmitter.emit({
      type: "message.created",
      message: userMsg.info,
    });

    // Run agent and yield events
    yield* this.runAgentLoop(sessionId, messages, options);
  }

  async promptAsync(
    sessionId: string,
    content: string,
    options?: PromptOptions
  ): Promise<{ messageId: string }> {
    const messages = this.messages.get(sessionId) ?? [];

    // Create user message
    const userMsg = this.createUserMessage(sessionId, content, messages);
    messages.push(userMsg);
    this.messages.set(sessionId, messages);

    this.eventEmitter.emit({
      type: "message.created",
      message: userMsg.info,
    });

    // Run in background, emit events via eventEmitter
    this.runAgentLoopAsync(sessionId, messages, options).catch((err) => {
      console.error("[promptAsync] Error:", err);
    });

    return { messageId: userMsg.info.id };
  }

  async abort(sessionId: string): Promise<void> {
    const controller = this.abortControllers.get(sessionId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(sessionId);
    }

    this.statuses.set(sessionId, { type: "idle" });
    this.eventEmitter.emit({
      type: "session.status",
      sessionId,
      status: { type: "idle" },
    });
  }

  // ---------------------------------------------------------------------------
  // Todos
  // ---------------------------------------------------------------------------

  async listTodos(sessionId: string): Promise<Todo[]> {
    return this.todos.get(sessionId) ?? [];
  }

  // ---------------------------------------------------------------------------
  // Agents
  // ---------------------------------------------------------------------------

  async listAgents(): Promise<AgentConfig[]> {
    return Object.entries(agents).map(([name, config]) => ({
      id: name,
      name,
      description: config.description,
      systemPrompt: config.prompt ?? "",
      model: config.model,
      tools: config.tools ? Object.keys(config.tools).filter((k) => config.tools![k]) : undefined,
    }));
  }

  async getAgent(name: string): Promise<AgentConfig | null> {
    const config = agents[name as keyof typeof agents];
    if (!config) return null;

    return {
      id: name,
      name,
      description: config.description,
      systemPrompt: config.prompt ?? "",
      model: config.model,
      tools: config.tools ? Object.keys(config.tools).filter((k) => config.tools![k]) : undefined,
    };
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  subscribe(callback: (event: AgentEvent) => void): () => void {
    return this.eventEmitter.subscribe(callback);
  }

  // ---------------------------------------------------------------------------
  // Health
  // ---------------------------------------------------------------------------

  async health(): Promise<{ status: "ok" | "error"; message?: string }> {
    return { status: "ok" };
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  private createUserMessage(
    sessionId: string,
    content: string,
    existingMessages: MessageWithParts[]
  ): MessageWithParts {
    const now = Date.now();
    const messageId = generateId("msg");
    const parentId = existingMessages[existingMessages.length - 1]?.info.id;

    return {
      info: {
        id: messageId,
        sessionId,
        role: "user" as const,
        time: { created: now },
      },
      parts: [
        {
          id: generateId("part"),
          sessionId,
          messageId,
          type: "text" as const,
          text: content,
        },
      ],
    };
  }

  private async *runAgentLoop(
    sessionId: string,
    messages: MessageWithParts[],
    options?: PromptOptions
  ): AsyncIterable<AgentEvent> {
    const agentName = options?.agent ?? "hands";
    const agentConfig = agents[agentName as keyof typeof agents] ?? defaultAgent;

    this.statuses.set(sessionId, { type: "running" });
    yield { type: "session.status", sessionId, status: { type: "running" } } as AgentEvent;

    const abortController = new AbortController();
    this.abortControllers.set(sessionId, abortController);

    const session = this.sessions.get(sessionId)!;

    try {
      const { events } = runAgent({
        session: {
          id: session.id,
          time: session.time,
        },
        messages: messages as any,
        agent: agentConfig,
        toolContext: this.toolContext,
        abortSignal: options?.abortSignal ?? abortController.signal,
      });

      let assistantMsg: MessageWithParts | null = null;

      for await (const event of events) {
        if (abortController.signal.aborted) break;

        // Transform and yield events
        switch (event.type) {
          case "message.created":
            const msgInfo = event.message as any;
            assistantMsg = {
              info: {
                id: msgInfo.id ?? generateId("msg"),
                sessionId,
                role: "assistant" as const,
                parentId: messages[messages.length - 1]?.info.id ?? "",
                time: { created: Date.now() },
              },
              parts: [],
            };
            const allMessages = this.messages.get(sessionId) ?? [];
            allMessages.push(assistantMsg);
            this.messages.set(sessionId, allMessages);
            yield { type: "message.created", message: assistantMsg.info } as AgentEvent;
            break;

          case "part.created":
          case "part.updated":
            if (assistantMsg) {
              const part = event.part as any;
              const partIdx = assistantMsg.parts.findIndex((p) => p.id === part.id);
              if (partIdx >= 0) {
                assistantMsg.parts[partIdx] = part;
              } else {
                assistantMsg.parts.push(part);
              }
            }
            yield event as AgentEvent;
            break;

          case "step.started":
          case "step.finished":
          case "error":
          case "done":
            yield event as AgentEvent;
            break;

          default:
            // Ignore unknown events
            break;
        }
      }
    } finally {
      this.abortControllers.delete(sessionId);
      this.statuses.set(sessionId, { type: "idle" });
      yield { type: "session.status", sessionId, status: { type: "idle" } } as AgentEvent;

      if (session) {
        session.time.updated = Date.now();
        yield { type: "session.updated", session } as AgentEvent;
      }
    }
  }

  private async runAgentLoopAsync(
    sessionId: string,
    messages: MessageWithParts[],
    options?: PromptOptions
  ): Promise<void> {
    for await (const event of this.runAgentLoop(sessionId, messages, options)) {
      this.eventEmitter.emit(event);
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createBrowserProvider(config: BrowserProviderConfig): AgentProvider {
  return new BrowserAgentProvider(config);
}
