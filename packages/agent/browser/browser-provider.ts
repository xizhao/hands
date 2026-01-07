/**
 * Browser Agent Provider
 *
 * Implements AgentProvider interface for browser environments.
 * Uses AI SDK + OpenRouter for LLM calls.
 * Persists sessions to SQLite when DatabaseContext is available.
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
  Part,
  ToolPart,
} from "../core";
import { generateId } from "../core";
import { runAgent } from "./agent";
import { agents, defaultAgent } from "../agents";
import type { ToolContext, SubagentContext, SubagentResult, DatabaseContext } from "./tools";
import { SUBAGENT_DISABLED_TOOLS } from "./tools";
import { createSessionStorage, type SessionStorage } from "./storage";

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
  // In-memory caches (always present)
  private sessionCache = new Map<string, Session>();
  private messageCache = new Map<string, MessageWithParts[]>();
  private statuses = new Map<string, SessionStatus>();
  private abortControllers = new Map<string, AbortController>();
  private eventEmitter = new EventEmitter();
  private toolContext: ToolContext;

  // SQLite storage (when db is available)
  private storage: SessionStorage | null = null;
  private initialized = false;

  constructor(config: BrowserProviderConfig) {
    this.toolContext = config.toolContext;

    // Create storage layer if database is available
    if (config.toolContext.db) {
      this.storage = createSessionStorage(config.toolContext.db);
    }
  }

  /**
   * Initialize the provider by loading sessions from storage.
   * Called automatically on first access, but can be called explicitly.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    if (this.storage) {
      try {
        const sessions = await this.storage.listSessions();
        for (const session of sessions) {
          this.sessionCache.set(session.id, session);
          this.statuses.set(session.id, { type: "idle" });
        }
        console.log(`[BrowserProvider] Loaded ${sessions.length} sessions from storage`);
      } catch (err) {
        console.error("[BrowserProvider] Failed to load sessions:", err);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Sessions
  // ---------------------------------------------------------------------------

  async listSessions(): Promise<Session[]> {
    await this.initialize();

    if (this.storage) {
      return this.storage.listSessions();
    }

    return Array.from(this.sessionCache.values()).sort(
      (a, b) => b.time.updated - a.time.updated
    );
  }

  async getSession(sessionId: string): Promise<Session> {
    await this.initialize();

    // Check cache first
    const cached = this.sessionCache.get(sessionId);
    if (cached) return cached;

    // Try storage
    if (this.storage) {
      const session = await this.storage.getSession(sessionId);
      if (session) {
        this.sessionCache.set(session.id, session);
        return session;
      }
    }

    throw new Error(`Session not found: ${sessionId}`);
  }

  async createSession(options?: { title?: string; parentId?: string }): Promise<Session> {
    await this.initialize();

    let session: Session;

    if (this.storage) {
      session = await this.storage.createSession(options);
    } else {
      const now = Date.now();
      session = {
        id: generateId("ses"),
        title: options?.title,
        parentId: options?.parentId,
        time: { created: now, updated: now },
      };
    }

    this.sessionCache.set(session.id, session);
    this.messageCache.set(session.id, []);
    this.statuses.set(session.id, { type: "idle" });

    this.eventEmitter.emit({ type: "session.created", session });

    return session;
  }

  async deleteSession(sessionId: string): Promise<void> {
    if (this.storage) {
      await this.storage.deleteSession(sessionId);
    }

    this.sessionCache.delete(sessionId);
    this.messageCache.delete(sessionId);
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
    // Check cache first
    const cached = this.messageCache.get(sessionId);
    if (cached && cached.length > 0) return cached;

    // Try storage
    if (this.storage) {
      const messages = await this.storage.listMessages(sessionId);
      this.messageCache.set(sessionId, messages);
      return messages;
    }

    return [];
  }

  async getMessage(sessionId: string, messageId: string): Promise<MessageWithParts> {
    const messages = await this.listMessages(sessionId);
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
    const messages = await this.listMessages(sessionId);

    // Create user message
    const userMsg = this.createUserMessage(sessionId, content, messages);
    messages.push(userMsg);
    this.messageCache.set(sessionId, messages);

    // Persist user message
    if (this.storage) {
      await this.storage.createMessage(sessionId, userMsg);
    }

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
    const messages = await this.listMessages(sessionId);

    // Create user message
    const userMsg = this.createUserMessage(sessionId, content, messages);
    messages.push(userMsg);
    this.messageCache.set(sessionId, messages);

    // Persist user message
    if (this.storage) {
      await this.storage.createMessage(sessionId, userMsg);
    }

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
    if (this.storage) {
      return this.storage.listTodos(sessionId);
    }
    return [];
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
  // Subagent Spawning
  // ---------------------------------------------------------------------------

  /**
   * Create a SubagentContext for the given session.
   * This allows the Task tool to spawn child agents.
   */
  createSubagentContext(sessionId: string): SubagentContext {
    return {
      listAgents: () => {
        return Object.entries(agents).map(([id, config]) => ({
          id,
          name: (config.name as string | undefined) ?? id,
          description: config.description,
          mode: config.mode,
        }));
      },
      spawn: async (opts) => this.spawnSubagent(sessionId, opts),
    };
  }

  /**
   * Spawn a subagent in a child session.
   */
  private async spawnSubagent(
    parentSessionId: string,
    opts: {
      agentId: string;
      prompt: string;
      description: string;
    }
  ): Promise<SubagentResult> {
    const agentConfig = agents[opts.agentId as keyof typeof agents];
    if (!agentConfig) {
      return {
        sessionId: "",
        text: "",
        toolCalls: [],
        error: `Unknown agent: ${opts.agentId}`,
      };
    }

    // Create child session
    const childSession = await this.createSession({
      title: `${opts.description} (@${opts.agentId} subagent)`,
      parentId: parentSessionId,
    });

    // Create user message with the prompt
    const userMsg = this.createUserMessage(childSession.id, opts.prompt, []);
    const messages = [userMsg];
    this.messageCache.set(childSession.id, messages);

    // Persist user message
    if (this.storage) {
      await this.storage.createMessage(childSession.id, userMsg);
    }

    // Get base tool context
    const baseToolContext = this.toolContext;

    // Build tool context for subagent (disable task tool to prevent recursion)
    const subagentToolContext: ToolContext = {
      ...baseToolContext,
      sessionId: childSession.id,
      // Don't pass subagent context to prevent infinite nesting
      subagent: undefined,
    };

    // Get enabled tools, filtering out disabled ones
    const enabledTools = agentConfig.tools
      ? Object.entries(agentConfig.tools)
          .filter(([_, enabled]) => enabled)
          .map(([toolId]) => toolId)
          .filter((toolId) => !SUBAGENT_DISABLED_TOOLS.includes(toolId as any))
      : undefined;

    // Collect results
    const toolCalls: SubagentResult["toolCalls"] = [];
    let finalText = "";
    const collectedParts: Part[] = [];

    try {
      const { events } = runAgent({
        session: childSession,
        messages,
        agent: agentConfig,
        toolContext: subagentToolContext,
        enabledTools: enabledTools as any,
      });

      for await (const event of events) {
        switch (event.type) {
          case "part.created":
          case "part.updated":
            const part = event.part as Part;
            const existingIdx = collectedParts.findIndex((p) => p.id === part.id);
            if (existingIdx >= 0) {
              collectedParts[existingIdx] = part;
            } else {
              collectedParts.push(part);
            }

            // Track tool calls
            if (part.type === "tool") {
              const toolPart = part as ToolPart;
              const existingTool = toolCalls.find((t) => t.tool === toolPart.tool && t.status !== "completed");
              if (existingTool) {
                existingTool.status = toolPart.state.status;
                if (toolPart.state.status === "completed") {
                  existingTool.title = toolPart.state.title;
                }
              } else {
                toolCalls.push({
                  tool: toolPart.tool,
                  status: toolPart.state.status,
                  title: toolPart.state.status === "completed" ? toolPart.state.title : undefined,
                });
              }
            }
            break;

          case "error":
            return {
              sessionId: childSession.id,
              text: finalText,
              toolCalls,
              error: event.error.message,
            };
        }
      }

      // Extract final text from parts
      finalText = collectedParts
        .filter((p): p is Part & { type: "text" } => p.type === "text")
        .map((p) => p.text)
        .join("\n");

      return {
        sessionId: childSession.id,
        text: finalText,
        toolCalls,
      };
    } catch (error) {
      return {
        sessionId: childSession.id,
        text: finalText,
        toolCalls,
        error: error instanceof Error ? error.message : String(error),
      };
    }
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

    const session = this.sessionCache.get(sessionId)!;

    // Build tool context with subagent support
    const toolContextWithSubagent: ToolContext = {
      ...this.toolContext,
      sessionId,
      subagent: this.createSubagentContext(sessionId),
    };

    try {
      const { events } = runAgent({
        session: {
          id: session.id,
          time: session.time,
        },
        messages: messages as any,
        agent: agentConfig,
        toolContext: toolContextWithSubagent,
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
            const allMessages = this.messageCache.get(sessionId) ?? [];
            allMessages.push(assistantMsg);
            this.messageCache.set(sessionId, allMessages);

            // Persist assistant message (initially empty)
            if (this.storage) {
              this.storage.createMessage(sessionId, assistantMsg).catch((err) => {
                console.error("[BrowserProvider] Failed to persist message:", err);
              });
            }

            yield { type: "message.created", message: assistantMsg.info } as AgentEvent;
            break;

          case "part.created":
          case "part.updated":
            if (assistantMsg) {
              const part = event.part as any;
              const partIdx = assistantMsg.parts.findIndex((p) => p.id === part.id);
              if (partIdx >= 0) {
                assistantMsg.parts[partIdx] = part;
                // Update part in storage
                if (this.storage) {
                  this.storage.updatePart(part).catch(() => {});
                }
              } else {
                assistantMsg.parts.push(part);
                // Create part in storage
                if (this.storage) {
                  this.storage.createPart(assistantMsg.info.id, sessionId, part).catch(() => {});
                }
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

        // Update session timestamp in storage
        if (this.storage) {
          this.storage.updateSession(sessionId, { updated: session.time.updated }).catch(() => {});
        }

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
