/**
 * AgentProvider Interface
 *
 * Abstract interface for agent backends.
 * Implemented by:
 * - BrowserAgentProvider (AI SDK + OpenRouter, in-memory state)
 * - DesktopAgentProvider (OpenCode SDK, server-side state)
 */

import type {
  Session,
  SessionStatus,
  MessageWithParts,
  Todo,
  AgentConfig,
  AgentEvent,
} from "./types";

// ============================================================================
// Provider Interface
// ============================================================================

export interface AgentProvider {
  // ---------------------------------------------------------------------------
  // Sessions
  // ---------------------------------------------------------------------------

  /** List all sessions */
  listSessions(): Promise<Session[]>;

  /** Get a session by ID */
  getSession(sessionId: string): Promise<Session>;

  /** Create a new session */
  createSession(options?: { title?: string; parentId?: string }): Promise<Session>;

  /** Delete a session */
  deleteSession(sessionId: string): Promise<void>;

  /** Get session status */
  getSessionStatus(sessionId: string): Promise<SessionStatus>;

  /** Get all session statuses */
  getAllSessionStatuses(): Promise<Record<string, SessionStatus>>;

  // ---------------------------------------------------------------------------
  // Messages
  // ---------------------------------------------------------------------------

  /** List messages in a session */
  listMessages(sessionId: string): Promise<MessageWithParts[]>;

  /** Get a specific message */
  getMessage(sessionId: string, messageId: string): Promise<MessageWithParts>;

  // ---------------------------------------------------------------------------
  // Prompting
  // ---------------------------------------------------------------------------

  /**
   * Send a prompt and get streaming response.
   * Returns an async iterable of events for real-time UI updates.
   */
  prompt(
    sessionId: string,
    content: string,
    options?: PromptOptions
  ): AsyncIterable<AgentEvent>;

  /**
   * Send a prompt without waiting (fire-and-forget).
   * Events are emitted through the event subscription.
   */
  promptAsync(
    sessionId: string,
    content: string,
    options?: PromptOptions
  ): Promise<{ messageId: string }>;

  /** Abort an in-progress prompt */
  abort(sessionId: string): Promise<void>;

  // ---------------------------------------------------------------------------
  // Todos
  // ---------------------------------------------------------------------------

  /** List todos for a session */
  listTodos(sessionId: string): Promise<Todo[]>;

  // ---------------------------------------------------------------------------
  // Agents
  // ---------------------------------------------------------------------------

  /** List available agent configurations */
  listAgents(): Promise<AgentConfig[]>;

  /** Get an agent by name */
  getAgent(name: string): Promise<AgentConfig | null>;

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  /**
   * Subscribe to real-time events.
   * Returns an unsubscribe function.
   */
  subscribe(callback: (event: AgentEvent) => void): () => void;

  // ---------------------------------------------------------------------------
  // Health
  // ---------------------------------------------------------------------------

  /** Check if provider is healthy/connected */
  health(): Promise<{ status: "ok" | "error"; message?: string }>;
}

// ============================================================================
// Prompt Options
// ============================================================================

export interface PromptOptions {
  /** Agent configuration to use */
  agent?: string;
  /** Override system prompt */
  systemPrompt?: string;
  /** Model override */
  model?: string;
  /** Abort signal */
  abortSignal?: AbortSignal;
}

// ============================================================================
// Provider Factory
// ============================================================================

/**
 * Configuration for creating a provider.
 */
export interface ProviderConfig {
  /** Provider type */
  type: "browser" | "desktop";
  /** API key (for browser provider) */
  apiKey?: string;
  /** Server URL (for desktop provider) */
  serverUrl?: string;
  /** Working directory (for desktop provider) */
  directory?: string;
}
