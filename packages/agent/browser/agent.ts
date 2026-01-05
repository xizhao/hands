/**
 * Browser Agent
 *
 * Main agent loop that handles multi-turn conversations with tool execution.
 * Inspired by OpenCode's session/prompt.ts but adapted for browser.
 */

import { streamText, type ToolSet, type ModelMessage, type LanguageModel } from "ai";
import type { AgentConfig as OpenCodeAgentConfig } from "@opencode-ai/sdk";
import { createProviderFromStorage, getOpenRouterModelId } from "./provider";
import { createToolRegistry, toAISDKTools, type ToolContext, type ToolId, ALL_TOOLS } from "./tools";
import type {
  AgentConfig as BrowserAgentConfig,
  Session,
  MessageWithParts,
  Part,
  AgentEvent,
  TextPart,
  ToolPart,
} from "./types";
import { generateId } from "./types";

/**
 * Agent configuration - supports both OpenCode format and browser format.
 * OpenCode format uses model strings like "openrouter/anthropic/claude-opus-4.5"
 * Browser format uses { providerId, modelId } objects.
 */
export type AgentConfigInput = OpenCodeAgentConfig | BrowserAgentConfig;

// ============================================================================
// Types
// ============================================================================

export interface AgentOptions {
  /** Session to run in */
  session: Session;
  /** Conversation history */
  messages: MessageWithParts[];
  /** Agent configuration - accepts both OpenCode format and browser format */
  agent: AgentConfigInput;
  /** Tool context (database, etc.) */
  toolContext: ToolContext;
  /** Which tools to enable (overrides agent.tools if provided) */
  enabledTools?: ToolId[];
  /** Maximum turns (tool call → response cycles) */
  maxTurns?: number;
  /** Abort signal */
  abortSignal?: AbortSignal;
}

export interface AgentResult {
  /** Stream of events */
  events: AsyncIterable<AgentEvent>;
  /** Abort the agent */
  abort: () => void;
}

// ============================================================================
// Agent Implementation
// ============================================================================

/**
 * Run the agent loop.
 * Handles multi-turn conversations with automatic tool execution.
 */
export function runAgent(options: AgentOptions): AgentResult {
  const abortController = new AbortController();
  const signal = options.abortSignal
    ? combineSignals(options.abortSignal, abortController.signal)
    : abortController.signal;

  const events = executeAgentLoop({ ...options, abortSignal: signal });

  return {
    events,
    abort: () => abortController.abort(),
  };
}

async function* executeAgentLoop(options: AgentOptions): AsyncGenerator<AgentEvent> {
  const provider = createProviderFromStorage();
  if (!provider) {
    yield {
      type: "error",
      error: { type: "no_api_key", message: "No API key configured. Add your OpenRouter key in settings." },
    };
    return;
  }

  const { session, agent, toolContext, maxTurns = 10 } = options;

  // Get enabled tools - from options, agent config, or default to all
  const enabledTools = options.enabledTools || getEnabledToolsFromAgent(agent) || ALL_TOOLS;

  // Create tool registry and convert to AI SDK format
  const registry = createToolRegistry(toolContext);
  const toolDefs = registry.getTools(enabledTools);
  const tools = toAISDKTools(toolDefs);

  // Get model ID - handle both OpenCode format (string) and browser format (object)
  const modelId = getOpenRouterModelId(agent.model);

  // Get system prompt - OpenCode uses 'prompt', browser uses 'systemPrompt'
  const systemPrompt = getSystemPrompt(agent);

  // Build conversation in AI SDK format
  let messages = [...options.messages];
  let turn = 0;

  while (turn < maxTurns) {
    turn++;

    // Convert messages to AI SDK format
    const coreMessages = convertToCoreMessages(messages);

    // Debug: log message format
    console.log("[agent] Turn", turn, "messages:", JSON.stringify(coreMessages, null, 2));

    // Create new assistant message
    const messageId = generateId("msg");
    const parentId = messages[messages.length - 1]?.info.id || "";

    yield {
      type: "message.created",
      message: {
        id: messageId,
        sessionId: session.id,
        role: "assistant",
        parentId,
        time: { created: Date.now() },
        modelId,
        providerId: "openrouter",
      },
    };

    yield { type: "step.started" };

    // Stream response
    // Cast to LanguageModel to handle version differences between AI SDK and OpenRouter provider
    const result = streamText({
      model: provider.chat(modelId) as unknown as LanguageModel,
      system: systemPrompt,
      messages: coreMessages,
      tools: tools as ToolSet,
      maxOutputTokens: getMaxTokens(agent) || 4096,
      temperature: agent.temperature,
      abortSignal: options.abortSignal,
    });

    // Collect parts from this turn
    const parts: Part[] = [];
    let fullText = "";
    let currentTextPart: TextPart | null = null;
    const toolCalls: Map<string, ToolPart> = new Map();
    let hasToolCalls = false;
    let finishReason = "stop";

    try {
      for await (const chunk of result.fullStream) {
        if (options.abortSignal?.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }

        switch (chunk.type) {
          case "text-delta": {
            const textDelta = (chunk as { text?: string }).text || "";
            fullText += textDelta;

            if (!currentTextPart) {
              currentTextPart = {
                id: generateId("part"),
                sessionId: session.id,
                messageId,
                type: "text",
                text: textDelta,
                time: { start: Date.now() },
              };
              yield { type: "part.created", part: currentTextPart };
            } else {
              const updated: TextPart = {
                ...currentTextPart,
                text: fullText,
              };
              currentTextPart = updated;
              yield { type: "part.updated", part: updated, delta: textDelta };
            }
            break;
          }

          case "tool-call": {
            hasToolCalls = true;
            // AI SDK v6 uses 'input' instead of 'args'
            const toolInput = (chunk as { input?: unknown }).input ?? (chunk as { args?: unknown }).args;
            const toolPart: ToolPart = {
              id: generateId("part"),
              sessionId: session.id,
              messageId,
              type: "tool",
              callId: chunk.toolCallId,
              tool: chunk.toolName,
              state: {
                status: "running",
                input: toolInput as Record<string, unknown>,
                time: { start: Date.now() },
              },
            };
            toolCalls.set(chunk.toolCallId, toolPart);
            yield { type: "part.created", part: toolPart };
            break;
          }

          case "tool-result": {
            const existingPart = toolCalls.get(chunk.toolCallId);
            if (existingPart) {
              // AI SDK v6 uses 'output' instead of 'result'
              const toolOutput = (chunk as { output?: unknown }).output ?? (chunk as { result?: unknown }).result;
              const updatedPart: ToolPart = {
                ...existingPart,
                state: {
                  status: "completed",
                  input: existingPart.state.input,
                  output: typeof toolOutput === "string" ? toolOutput : JSON.stringify(toolOutput),
                  title: chunk.toolName,
                  metadata: {},
                  time: {
                    start: (existingPart.state as { time: { start: number } }).time.start,
                    end: Date.now(),
                  },
                },
              };
              toolCalls.set(chunk.toolCallId, updatedPart);
              yield { type: "part.updated", part: updatedPart };
            }
            break;
          }

          case "finish": {
            finishReason = chunk.finishReason;
            // AI SDK v6 uses 'totalUsage'
            const usage = chunk.totalUsage as { promptTokens?: number; completionTokens?: number } | undefined;
            yield {
              type: "step.finished",
              reason: chunk.finishReason,
              tokens: usage?.promptTokens != null ? {
                input: usage.promptTokens,
                output: usage.completionTokens ?? 0,
              } : undefined,
            };
            break;
          }

          case "error": {
            yield {
              type: "error",
              error: {
                type: "stream_error",
                message: chunk.error instanceof Error ? chunk.error.message : String(chunk.error),
              },
            };
            return;
          }
        }
      }

      // Finalize text part
      if (currentTextPart) {
        const finalTextPart: TextPart = {
          ...currentTextPart,
          time: {
            start: currentTextPart.time?.start ?? Date.now(),
            end: Date.now(),
          },
        };
        parts.push(finalTextPart);
      }

      // Collect tool parts
      toolCalls.forEach((toolPart) => {
        parts.push(toolPart);
      });

      // Update message as completed
      yield {
        type: "message.updated",
        message: {
          id: messageId,
          sessionId: session.id,
          role: "assistant",
          parentId,
          time: { created: Date.now(), completed: Date.now() },
          modelId,
          providerId: "openrouter",
          finish: finishReason,
        },
      };

      // Add this turn's message to history for next iteration
      messages = [
        ...messages,
        {
          info: {
            id: messageId,
            sessionId: session.id,
            role: "assistant" as const,
            parentId,
            time: { created: Date.now(), completed: Date.now() },
            modelId,
            providerId: "openrouter",
          },
          parts,
        },
      ];

      // If no tool calls, we're done
      if (!hasToolCalls || finishReason !== "tool-calls") {
        break;
      }

      // Continue loop for next turn with tool results
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        yield { type: "error", error: { type: "aborted", message: "Request aborted" } };
      } else {
        yield {
          type: "error",
          error: { type: "execution_error", message: error instanceof Error ? error.message : String(error) },
        };
      }
      return;
    }
  }

  if (turn >= maxTurns) {
    yield { type: "error", error: { type: "max_turns", message: `Reached maximum turns (${maxTurns})` } };
  }

  yield { type: "done" };
}

// ============================================================================
// Message Conversion
// ============================================================================

function convertToCoreMessages(messages: MessageWithParts[]): ModelMessage[] {
  const result: ModelMessage[] = [];

  for (const msg of messages) {
    if (msg.info.role === "user") {
      const textParts = msg.parts
        .filter((p): p is TextPart => p.type === "text")
        .map((p) => p.text)
        .join("\n");

      if (textParts) {
        result.push({ role: "user", content: textParts });
      }
    }

    if (msg.info.role === "assistant") {
      const textParts = msg.parts
        .filter((p): p is TextPart => p.type === "text")
        .map((p) => p.text)
        .join("");

      const toolParts = msg.parts.filter((p): p is ToolPart => p.type === "tool");

      if (textParts || toolParts.length > 0) {
        // Build content array with proper AI SDK types
        const content: Array<
          | { type: "text"; text: string }
          | { type: "tool-call"; toolCallId: string; toolName: string; args: string }
        > = [];

        if (textParts) {
          content.push({ type: "text", text: textParts });
        }

        for (const tool of toolParts) {
          content.push({
            type: "tool-call",
            toolCallId: tool.callId,
            toolName: tool.tool,
            // AI SDK expects input as JSON string
            args: typeof tool.state.input === "string"
              ? tool.state.input
              : JSON.stringify(tool.state.input),
          });
        }

        // Use 'as any' to bypass strict typing - the runtime format is correct
        result.push({ role: "assistant", content } as ModelMessage);
      }

      // Add tool results
      for (const tool of toolParts) {
        if (tool.state.status === "completed") {
          result.push({
            role: "tool",
            content: [
              {
                type: "tool-result",
                toolCallId: tool.callId,
                toolName: tool.tool,
                result: tool.state.output,  // AI SDK uses 'result' not 'output'
              },
            ],
          } as unknown as ModelMessage);
        }
      }
    }
  }

  return result;
}

// ============================================================================
// Utilities
// ============================================================================

function combineSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }

  return controller.signal;
}

/**
 * Get enabled tools from an agent config.
 * OpenCode format: { tools: { sql: true, schema: true, ... } }
 * Browser format: { tools: ['sql', 'schema', ...] }
 */
function getEnabledToolsFromAgent(agent: AgentConfigInput): ToolId[] | null {
  if (!agent.tools) return null;

  // Browser format - array of tool IDs
  if (Array.isArray(agent.tools)) {
    return agent.tools as ToolId[];
  }

  // OpenCode format - object with tool: boolean pairs
  const toolsObj = agent.tools as Record<string, boolean>;
  return Object.entries(toolsObj)
    .filter(([_, enabled]) => enabled)
    .map(([toolId]) => toolId as ToolId);
}

/**
 * Get system prompt from an agent config.
 * OpenCode format uses 'prompt', browser format uses 'systemPrompt'.
 */
function getSystemPrompt(agent: AgentConfigInput): string {
  // OpenCode format
  if ("prompt" in agent && typeof agent.prompt === "string") {
    return agent.prompt;
  }
  // Browser format
  if ("systemPrompt" in agent && typeof agent.systemPrompt === "string") {
    return agent.systemPrompt;
  }
  return "You are a helpful assistant.";
}

/**
 * Get max tokens from an agent config.
 */
function getMaxTokens(agent: AgentConfigInput): number | undefined {
  if ("maxTokens" in agent && typeof agent.maxTokens === "number") {
    return agent.maxTokens;
  }
  return undefined;
}
