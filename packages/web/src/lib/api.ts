/**
 * Browser API
 *
 * Drop-in replacement for @opencode-ai/sdk client.
 * Uses in-browser agent with BYOK instead of connecting to opencode server.
 */

// Re-export core types
export type {
  Session,
  SessionStatus,
  Message,
  MessageWithParts,
  Part,
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
  UserMessage,
  AssistantMessage,
  Todo,
  AgentConfig,
} from "@hands/agent/core";

// Re-export the browser API implementation
export {
  api,
  subscribeToEvents,
  setToolContext,
  getToolContext,
  type Agent,
  type ServerEvent,
  type EventType,
} from "@hands/agent/browser";

// Aliases for compatibility
export type { Session as SdkSession } from "@hands/agent/core";

export interface TokenUsage {
  input: number;
  output: number;
  reasoning: number;
  cache: { read: number; write: number };
}

export interface Permission {
  id: string;
  type: string;
  pattern?: string | string[];
  sessionId: string;
  messageId: string;
  callId?: string;
  title: string;
  metadata: Record<string, unknown>;
  time: { created: number };
}

export type PermissionResponse = "once" | "always" | "reject";

export interface PromptRequest {
  parts: Array<
    | { type: "text"; text: string }
    | { type: "file"; mediaType: string; url?: string; filename?: string }
  >;
  model?: { providerId: string; modelId: string };
  agent?: string;
  noReply?: boolean;
  system?: string;
}

export interface OpenCodeConfig {
  model?: string;
  theme?: string;
  [key: string]: unknown;
}

export interface Model {
  id: string;
  providerId: string;
  name: string;
  status: string;
  cost: { input: number; output: number; cache: { read: number; write: number } };
  limit: { context: number; output: number };
  capabilities: {
    temperature: boolean;
    reasoning: boolean;
    attachment: boolean;
    toolcall: boolean;
    input: { text: boolean; audio: boolean; image: boolean; video: boolean; pdf: boolean };
    output: { text: boolean; audio: boolean; image: boolean; video: boolean; pdf: boolean };
  };
}

export interface Provider {
  id: string;
  name: string;
  source: string;
  env: string[];
  models: Record<string, Model>;
}
