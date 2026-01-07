/**
 * Core Agent Types
 *
 * Shared types for session, message, and part data structures.
 * Used by both browser and desktop implementations.
 */

// ============================================================================
// Part Types (building blocks of messages)
// ============================================================================

export interface PartBase {
  id: string;
  sessionId: string;
  messageId: string;
}

export interface TextPart extends PartBase {
  type: "text";
  text: string;
  time?: { start: number; end?: number };
}

export interface ReasoningPart extends PartBase {
  type: "reasoning";
  text: string;
  time: { start: number; end?: number };
}

export interface FilePart extends PartBase {
  type: "file";
  mime: string;
  filename?: string;
  url: string;
}

// Tool state machine: pending → running → completed | error
export interface ToolStatePending {
  status: "pending";
  input: Record<string, unknown>;
  raw: string;
}

export interface ToolStateRunning {
  status: "running";
  input: Record<string, unknown>;
  title?: string;
  metadata?: Record<string, unknown>;
  time: { start: number };
}

export interface ToolStateCompleted {
  status: "completed";
  input: Record<string, unknown>;
  output: string;
  title: string;
  metadata: Record<string, unknown>;
  time: {
    start: number;
    end: number;
    /** Timestamp when this output was marked as compacted (pruned from context) */
    compacted?: number;
  };
}

export interface ToolStateError {
  status: "error";
  input: Record<string, unknown>;
  error: string;
  time: { start: number; end: number };
}

export type ToolState =
  | ToolStatePending
  | ToolStateRunning
  | ToolStateCompleted
  | ToolStateError;

export interface ToolPart extends PartBase {
  type: "tool";
  callId: string;
  tool: string;
  state: ToolState;
}

export interface StepStartPart extends PartBase {
  type: "step-start";
}

export interface StepFinishPart extends PartBase {
  type: "step-finish";
  reason: string;
  cost?: number;
  tokens?: {
    input: number;
    output: number;
    reasoning?: number;
  };
}

/** Part for delegating work to a subagent */
export interface SubtaskPart extends PartBase {
  type: "subtask";
  /** The full prompt to execute */
  prompt: string;
  /** Short description (for UI display) */
  description: string;
  /** Agent name to use */
  agent: string;
  /** Result from the subagent (when completed) */
  result?: {
    sessionId: string;
    summary?: string;
    error?: string;
  };
}

export type Part =
  | TextPart
  | ReasoningPart
  | FilePart
  | ToolPart
  | StepStartPart
  | StepFinishPart
  | SubtaskPart;

// ============================================================================
// Message Types
// ============================================================================

export interface MessageBase {
  id: string;
  sessionId: string;
}

export interface UserMessage extends MessageBase {
  role: "user";
  time: { created: number };
}

export interface AssistantMessage extends MessageBase {
  role: "assistant";
  time: { created: number; completed?: number };
  parentId: string;
  modelId?: string;
  providerId?: string;
  error?: { type: string; message: string };
  cost?: number;
  tokens?: {
    input: number;
    output: number;
    reasoning?: number;
  };
  finish?: string;
}

export type Message = UserMessage | AssistantMessage;

export interface MessageWithParts {
  info: Message;
  parts: Part[];
}

// ============================================================================
// Session Types
// ============================================================================

export interface Session {
  id: string;
  title?: string;
  parentId?: string;
  time: { created: number; updated: number };
}

export type SessionStatus =
  | { type: "idle" }
  | { type: "busy"; activeForm?: string }
  | { type: "running"; messageId?: string };

// ============================================================================
// Todo Types
// ============================================================================

export interface Todo {
  id?: string;
  content: string;
  status: "pending" | "in_progress" | "completed";
  /** Present continuous form shown during execution (e.g., "Running tests") */
  activeForm?: string;
}

// ============================================================================
// Agent Configuration
// ============================================================================

export type AgentMode = "primary" | "subagent" | "all";

export interface AgentConfig {
  id: string;
  name: string;
  description?: string;
  /** Agent mode: primary (main conversation), subagent (spawned tasks), all (both) */
  mode?: AgentMode;
  systemPrompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Maximum steps/turns before stopping */
  maxSteps?: number;
  tools?: string[];
}

// ============================================================================
// Events (for streaming updates)
// ============================================================================

export type AgentEvent =
  | { type: "session.created"; session: Session }
  | { type: "session.updated"; session: Session }
  | { type: "session.deleted"; sessionId: string }
  | { type: "session.status"; sessionId: string; status: SessionStatus }
  | { type: "message.created"; message: Message }
  | { type: "message.updated"; message: Message }
  | { type: "message.removed"; messageId: string }
  | { type: "part.created"; part: Part }
  | { type: "part.updated"; part: Part; delta?: string }
  | { type: "part.removed"; partId: string }
  | { type: "todo.updated"; sessionId: string; todos: Todo[] }
  | { type: "step.started" }
  | { type: "step.finished"; reason: string; tokens?: { input: number; output: number } }
  | { type: "error"; error: { type: string; message: string } }
  | { type: "done" };

// ============================================================================
// Utilities
// ============================================================================

let counter = 0;
export function generateId(prefix = "id"): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}_${random}_${(counter++).toString(36)}`;
}
