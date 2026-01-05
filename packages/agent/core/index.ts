/**
 * Core Agent Module
 *
 * Shared types and interfaces for agent implementations.
 */

// Types
export type {
  // Parts
  PartBase,
  TextPart,
  ReasoningPart,
  FilePart,
  ToolPart,
  ToolState,
  ToolStatePending,
  ToolStateRunning,
  ToolStateCompleted,
  ToolStateError,
  StepStartPart,
  StepFinishPart,
  Part,
  // Messages
  MessageBase,
  UserMessage,
  AssistantMessage,
  Message,
  MessageWithParts,
  // Sessions
  Session,
  SessionStatus,
  // Todos
  Todo,
  // Agent config
  AgentConfig,
  // Agent events (streaming)
  AgentEvent,
} from "./types";

export { generateId } from "./types";

// Provider interface
export type { AgentProvider, PromptOptions, ProviderConfig } from "./provider";
