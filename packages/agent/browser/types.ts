/**
 * Agent Types - Browser-compatible message and session types
 * Ported from OpenCode's message-v2.ts with simplifications for browser use
 */

import { z } from "zod";

// ============================================================================
// Part Types (building blocks of messages)
// ============================================================================

const PartBase = z.object({
  id: z.string(),
  sessionId: z.string(),
  messageId: z.string(),
});

export const TextPart = PartBase.extend({
  type: z.literal("text"),
  text: z.string(),
  time: z
    .object({
      start: z.number(),
      end: z.number().optional(),
    })
    .optional(),
});
export type TextPart = z.infer<typeof TextPart>;

export const ReasoningPart = PartBase.extend({
  type: z.literal("reasoning"),
  text: z.string(),
  time: z.object({
    start: z.number(),
    end: z.number().optional(),
  }),
});
export type ReasoningPart = z.infer<typeof ReasoningPart>;

export const FilePart = PartBase.extend({
  type: z.literal("file"),
  mime: z.string(),
  filename: z.string().optional(),
  url: z.string(),
});
export type FilePart = z.infer<typeof FilePart>;

// Tool state machine: pending → running → completed | error
export const ToolStatePending = z.object({
  status: z.literal("pending"),
  input: z.record(z.string(), z.unknown()),
  raw: z.string(), // Partial JSON being streamed
});
export type ToolStatePending = z.infer<typeof ToolStatePending>;

export const ToolStateRunning = z.object({
  status: z.literal("running"),
  input: z.record(z.string(), z.unknown()),
  title: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  time: z.object({
    start: z.number(),
  }),
});
export type ToolStateRunning = z.infer<typeof ToolStateRunning>;

export const ToolStateCompleted = z.object({
  status: z.literal("completed"),
  input: z.record(z.string(), z.unknown()),
  output: z.string(),
  title: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  time: z.object({
    start: z.number(),
    end: z.number(),
  }),
});
export type ToolStateCompleted = z.infer<typeof ToolStateCompleted>;

export const ToolStateError = z.object({
  status: z.literal("error"),
  input: z.record(z.string(), z.unknown()),
  error: z.string(),
  time: z.object({
    start: z.number(),
    end: z.number(),
  }),
});
export type ToolStateError = z.infer<typeof ToolStateError>;

export const ToolState = z.discriminatedUnion("status", [
  ToolStatePending,
  ToolStateRunning,
  ToolStateCompleted,
  ToolStateError,
]);
export type ToolState = z.infer<typeof ToolState>;

export const ToolPart = PartBase.extend({
  type: z.literal("tool"),
  callId: z.string(),
  tool: z.string(),
  state: ToolState,
});
export type ToolPart = z.infer<typeof ToolPart>;

export const StepStartPart = PartBase.extend({
  type: z.literal("step-start"),
});
export type StepStartPart = z.infer<typeof StepStartPart>;

export const StepFinishPart = PartBase.extend({
  type: z.literal("step-finish"),
  reason: z.string(),
  cost: z.number().optional(),
  tokens: z
    .object({
      input: z.number(),
      output: z.number(),
      reasoning: z.number().optional(),
    })
    .optional(),
});
export type StepFinishPart = z.infer<typeof StepFinishPart>;

export const Part = z.discriminatedUnion("type", [
  TextPart,
  ReasoningPart,
  FilePart,
  ToolPart,
  StepStartPart,
  StepFinishPart,
]);
export type Part = z.infer<typeof Part>;

// ============================================================================
// Message Types
// ============================================================================

const MessageBase = z.object({
  id: z.string(),
  sessionId: z.string(),
});

export const UserMessage = MessageBase.extend({
  role: z.literal("user"),
  time: z.object({
    created: z.number(),
  }),
  agent: z.string(), // Which agent configuration to use
  model: z.object({
    providerId: z.string(),
    modelId: z.string(),
  }),
});
export type UserMessage = z.infer<typeof UserMessage>;

export const AssistantMessage = MessageBase.extend({
  role: z.literal("assistant"),
  time: z.object({
    created: z.number(),
    completed: z.number().optional(),
  }),
  parentId: z.string(), // Links to user message
  modelId: z.string(),
  providerId: z.string(),
  error: z
    .object({
      type: z.string(),
      message: z.string(),
    })
    .optional(),
  cost: z.number().optional(),
  tokens: z
    .object({
      input: z.number(),
      output: z.number(),
      reasoning: z.number().optional(),
    })
    .optional(),
  finish: z.string().optional(), // stop reason
});
export type AssistantMessage = z.infer<typeof AssistantMessage>;

export const Message = z.discriminatedUnion("role", [UserMessage, AssistantMessage]);
export type Message = z.infer<typeof Message>;

export const MessageWithParts = z.object({
  info: Message,
  parts: z.array(Part),
});
export type MessageWithParts = z.infer<typeof MessageWithParts>;

// ============================================================================
// Session Types
// ============================================================================

export const Session = z.object({
  id: z.string(),
  title: z.string().optional(),
  parentId: z.string().optional(), // For forked sessions
  time: z.object({
    created: z.number(),
    updated: z.number(),
  }),
  agent: z.string().default("default"),
  model: z.object({
    providerId: z.string(),
    modelId: z.string(),
  }),
});
export type Session = z.infer<typeof Session>;

// ============================================================================
// Agent Configuration
// ============================================================================

export const AgentConfig = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  systemPrompt: z.string(),
  model: z
    .object({
      providerId: z.string(),
      modelId: z.string(),
    })
    .optional(),
  temperature: z.number().optional(),
  maxTokens: z.number().optional(),
  tools: z.array(z.string()).optional(), // Tool IDs this agent can use
});
export type AgentConfig = z.infer<typeof AgentConfig>;

// ============================================================================
// Events (for UI updates)
// ============================================================================

export type AgentEvent =
  | { type: "session.created"; session: Session }
  | { type: "session.updated"; session: Session }
  | { type: "message.created"; message: Message }
  | { type: "message.updated"; message: Message }
  | { type: "part.created"; part: Part }
  | { type: "part.updated"; part: Part; delta?: string }
  | { type: "step.started" }
  | { type: "step.finished"; reason: string; tokens?: { input: number; output: number } }
  | { type: "error"; error: { type: string; message: string } }
  | { type: "done" };

// ============================================================================
// Utilities
// ============================================================================

let counter = 0;
export function generateId(prefix: string = "id"): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}_${random}_${(counter++).toString(36)}`;
}
