/**
 * Browser LLM Client
 *
 * BYOK (Bring Your Own Key) client for direct LLM calls from browser.
 * Supports OpenRouter, Anthropic, and OpenAI.
 */

// ============================================================================
// Types
// ============================================================================

export type Provider = "openrouter" | "anthropic" | "openai";

export interface LLMConfig {
  provider: Provider;
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

export interface Message {
  role: "user" | "assistant" | "system";
  content: string | ContentBlock[];
}

export interface ContentBlock {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

export interface Tool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolUse {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface StreamEvent {
  type:
    | "message_start"
    | "content_block_start"
    | "content_block_delta"
    | "content_block_stop"
    | "message_delta"
    | "message_stop"
    | "error";
  message?: {
    id: string;
    type: string;
    role: string;
    content: ContentBlock[];
    model: string;
    stop_reason: string | null;
  };
  index?: number;
  content_block?: ContentBlock;
  delta?: {
    type: string;
    text?: string;
    partial_json?: string;
    stop_reason?: string;
  };
  error?: {
    type: string;
    message: string;
  };
}

// ============================================================================
// Provider Configurations
// ============================================================================

const PROVIDER_CONFIGS: Record<Provider, { baseUrl: string; defaultModel: string }> = {
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "anthropic/claude-sonnet-4-20250514",
  },
  anthropic: {
    baseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-4-20250514",
  },
  openai: {
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o",
  },
};

// ============================================================================
// LLM Client
// ============================================================================

export class BrowserLLMClient {
  private config: LLMConfig;
  private abortController: AbortController | null = null;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  /**
   * Get the effective base URL for the provider
   */
  private getBaseUrl(): string {
    return this.config.baseUrl || PROVIDER_CONFIGS[this.config.provider].baseUrl;
  }

  /**
   * Get the effective model for the provider
   */
  private getModel(): string {
    return this.config.model || PROVIDER_CONFIGS[this.config.provider].defaultModel;
  }

  /**
   * Create request headers for the provider
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    switch (this.config.provider) {
      case "openrouter":
        headers["Authorization"] = `Bearer ${this.config.apiKey}`;
        headers["HTTP-Referer"] = window.location.origin;
        headers["X-Title"] = "Hands";
        break;
      case "anthropic":
        headers["x-api-key"] = this.config.apiKey;
        headers["anthropic-version"] = "2023-06-01";
        headers["anthropic-dangerous-direct-browser-access"] = "true";
        break;
      case "openai":
        headers["Authorization"] = `Bearer ${this.config.apiKey}`;
        break;
    }

    return headers;
  }

  /**
   * Convert messages to provider-specific format
   */
  private formatMessages(messages: Message[]): unknown[] {
    if (this.config.provider === "anthropic") {
      // Anthropic has system as separate parameter
      return messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));
    }

    // OpenRouter/OpenAI format
    return messages.map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : m.content,
    }));
  }

  /**
   * Convert tools to provider-specific format
   */
  private formatTools(tools: Tool[]): unknown[] {
    if (this.config.provider === "anthropic") {
      return tools;
    }

    // OpenRouter/OpenAI format
    return tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
      },
    }));
  }

  /**
   * Get system message from messages array
   */
  private getSystemMessage(messages: Message[]): string | undefined {
    const systemMsg = messages.find((m) => m.role === "system");
    return systemMsg ? (typeof systemMsg.content === "string" ? systemMsg.content : undefined) : undefined;
  }

  /**
   * Stream a chat completion
   */
  async *chat(
    messages: Message[],
    tools?: Tool[],
    options?: { maxTokens?: number }
  ): AsyncGenerator<StreamEvent> {
    this.abortController = new AbortController();

    const baseUrl = this.getBaseUrl();
    const model = this.getModel();

    // Build request body
    const body: Record<string, unknown> = {
      model,
      messages: this.formatMessages(messages),
      stream: true,
      max_tokens: options?.maxTokens || 4096,
    };

    // Add system message for Anthropic
    if (this.config.provider === "anthropic") {
      const system = this.getSystemMessage(messages);
      if (system) {
        body.system = system;
      }
    }

    // Add tools if provided
    if (tools && tools.length > 0) {
      if (this.config.provider === "anthropic") {
        body.tools = tools;
      } else {
        body.tools = this.formatTools(tools);
      }
    }

    const endpoint = this.config.provider === "anthropic" ? "/messages" : "/chat/completions";

    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(body),
      signal: this.abortController.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      yield {
        type: "error",
        error: {
          type: "api_error",
          message: `API request failed: ${response.status} ${errorText}`,
        },
      };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield {
        type: "error",
        error: { type: "stream_error", message: "No response body" },
      };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") {
            yield { type: "message_stop" };
            return;
          }

          try {
            const parsed = JSON.parse(data);

            // Handle Anthropic format
            if (this.config.provider === "anthropic") {
              yield parsed as StreamEvent;
            } else {
              // Convert OpenAI/OpenRouter format to Anthropic-like events
              yield* this.convertOpenAIEvent(parsed);
            }
          } catch {
            // Ignore JSON parse errors for incomplete chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Convert OpenAI/OpenRouter streaming events to Anthropic-like format
   */
  private *convertOpenAIEvent(event: any): Generator<StreamEvent> {
    const choice = event.choices?.[0];
    if (!choice) return;

    const delta = choice.delta;

    // Content delta
    if (delta?.content) {
      yield {
        type: "content_block_delta",
        index: 0,
        delta: {
          type: "text_delta",
          text: delta.content,
        },
      };
    }

    // Tool calls
    if (delta?.tool_calls) {
      for (const toolCall of delta.tool_calls) {
        if (toolCall.function?.name) {
          yield {
            type: "content_block_start",
            index: toolCall.index,
            content_block: {
              type: "tool_use",
              id: toolCall.id,
              name: toolCall.function.name,
              input: {},
            },
          };
        }
        if (toolCall.function?.arguments) {
          yield {
            type: "content_block_delta",
            index: toolCall.index,
            delta: {
              type: "input_json_delta",
              partial_json: toolCall.function.arguments,
            },
          };
        }
      }
    }

    // Finish reason
    if (choice.finish_reason) {
      yield {
        type: "message_delta",
        delta: {
          type: "message_delta",
          stop_reason: choice.finish_reason === "tool_calls" ? "tool_use" : "end_turn",
        },
      };
    }
  }

  /**
   * Abort the current request
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Non-streaming chat completion
   */
  async complete(
    messages: Message[],
    tools?: Tool[],
    options?: { maxTokens?: number }
  ): Promise<{
    content: ContentBlock[];
    stopReason: string;
    toolUse?: ToolUse[];
  }> {
    const content: ContentBlock[] = [];
    let stopReason = "end_turn";
    const toolUseBlocks: ToolUse[] = [];
    const partialToolInputs: Record<number, { id: string; name: string; json: string }> = {};

    for await (const event of this.chat(messages, tools, options)) {
      switch (event.type) {
        case "content_block_start":
          if (event.content_block?.type === "tool_use") {
            partialToolInputs[event.index!] = {
              id: event.content_block.id!,
              name: event.content_block.name!,
              json: "",
            };
          }
          break;

        case "content_block_delta":
          if (event.delta?.text) {
            const lastBlock = content[content.length - 1];
            if (lastBlock?.type === "text") {
              lastBlock.text = (lastBlock.text || "") + event.delta.text;
            } else {
              content.push({ type: "text", text: event.delta.text });
            }
          }
          if (event.delta?.partial_json && event.index !== undefined) {
            const partial = partialToolInputs[event.index];
            if (partial) {
              partial.json += event.delta.partial_json;
            }
          }
          break;

        case "content_block_stop":
          if (event.index !== undefined && partialToolInputs[event.index]) {
            const partial = partialToolInputs[event.index];
            try {
              const input = JSON.parse(partial.json);
              toolUseBlocks.push({
                id: partial.id,
                name: partial.name,
                input,
              });
              content.push({
                type: "tool_use",
                id: partial.id,
                name: partial.name,
                input,
              });
            } catch {
              console.error("[LLM] Failed to parse tool input:", partial.json);
            }
          }
          break;

        case "message_delta":
          if (event.delta?.stop_reason) {
            stopReason = event.delta.stop_reason;
          }
          break;

        case "error":
          throw new Error(event.error?.message || "Unknown error");
      }
    }

    return {
      content,
      stopReason,
      toolUse: toolUseBlocks.length > 0 ? toolUseBlocks : undefined,
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a LLM client from stored settings
 */
export function createLLMClientFromSettings(): BrowserLLMClient | null {
  // Try OpenRouter first (most compatible with browser CORS)
  const openrouterKey = localStorage.getItem("hands_openrouter_key");
  if (openrouterKey) {
    return new BrowserLLMClient({
      provider: "openrouter",
      apiKey: openrouterKey,
    });
  }

  // Try Anthropic (requires browser access flag)
  const anthropicKey = localStorage.getItem("hands_anthropic_key");
  if (anthropicKey) {
    return new BrowserLLMClient({
      provider: "anthropic",
      apiKey: anthropicKey,
    });
  }

  return null;
}
