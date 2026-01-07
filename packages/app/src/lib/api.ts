import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk/client";
import { PORTS } from "./ports";

// Re-export SDK types that are only used for SDK-specific operations
export type {
  ApiError,
  // Event types - SDK event types kept for reference but we use browser agent's ServerEvent
  Event as SdkEvent,
  EventMessagePartRemoved,
  EventMessagePartUpdated,
  EventMessageRemoved,
  EventMessageUpdated,
  EventSessionCreated,
  EventSessionDeleted,
  EventSessionStatus,
  EventSessionUpdated,
  EventTodoUpdated,
  GlobalEvent,
  RetryPart,
  Session as SdkSession,
  SessionStatus as SdkSessionStatus,
} from "@opencode-ai/sdk/client";

// Import types we need locally
import type { GlobalEvent as SdkGlobalEvent } from "@opencode-ai/sdk/client";

// Custom types for our app
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
  sessionID: string;
  messageID: string;
  callID?: string;
  title: string;
  metadata: Record<string, unknown>;
  time: { created: number };
}

export type PermissionResponse = "once" | "always" | "reject";

export type SessionStatus =
  | { type: "idle" }
  | { type: "busy"; activeForm?: string }
  | { type: "running"; messageID?: string }
  | { type: "waiting"; permission?: Permission }
  | { type: "retry"; error: string };

// Import types from browser agent - has correct property names (sessionId, messageId)
// The SDK types use sessionID/messageID which doesn't match what browser agent emits
import type {
  // Part types
  TextPart as BrowserTextPart,
  ReasoningPart as BrowserReasoningPart,
  FilePart as BrowserFilePart,
  ToolPart as BrowserToolPart,
  ToolState as BrowserToolState,
  ToolStatePending as BrowserToolStatePending,
  ToolStateRunning as BrowserToolStateRunning,
  ToolStateCompleted as BrowserToolStateCompleted,
  ToolStateError as BrowserToolStateError,
  StepStartPart as BrowserStepStartPart,
  StepFinishPart as BrowserStepFinishPart,
  Part as BrowserPart,
  // Message types
  UserMessage as BrowserUserMessage,
  AssistantMessage as BrowserAssistantMessage,
  Message as BrowserMessage,
  MessageWithParts as BrowserMessageWithParts,
  // Session types
  Session as BrowserSession,
  SessionStatus as BrowserSessionStatus,
  // Other types
  Todo as BrowserTodo,
  ServerEvent as BrowserServerEvent,
} from "@hands/agent/browser";
import type { SubtaskPart as BrowserSubtaskPart } from "@hands/agent/core";

// Re-export browser agent types with shorter names
export type TextPart = BrowserTextPart;
export type ReasoningPart = BrowserReasoningPart;
export type FilePart = BrowserFilePart;
export type ToolPart = BrowserToolPart;
export type ToolState = BrowserToolState;
export type ToolStatePending = BrowserToolStatePending;
export type ToolStateRunning = BrowserToolStateRunning;
export type ToolStateCompleted = BrowserToolStateCompleted;
export type ToolStateError = BrowserToolStateError;
export type StepStartPart = BrowserStepStartPart;
export type StepFinishPart = BrowserStepFinishPart;
export type SubtaskPart = BrowserSubtaskPart;
export type Part = BrowserPart;
// AgentPart is an alias for SubtaskPart (SDK naming convention)
export type AgentPart = BrowserSubtaskPart;
export type UserMessage = BrowserUserMessage;
export type AssistantMessage = BrowserAssistantMessage;
export type Message = BrowserMessage;
export type MessageWithParts = BrowserMessageWithParts;
export type Session = BrowserSession;
export type AgentSessionStatus = BrowserSessionStatus;
export type Todo = BrowserTodo;
export type ServerEvent = BrowserServerEvent;

export interface PromptRequest {
  parts: Array<
    | { type: "text"; text: string }
    | { type: "file"; mediaType: string; url?: string; filename?: string }
  >;
  model?: { providerID: string; modelID: string };
  agent?: string;
  noReply?: boolean;
  system?: string;
}

export interface OpenCodeConfig {
  model?: string;
  theme?: string;
  [key: string]: unknown;
}

export interface Agent {
  name: string;
  description?: string;
  mode: "primary" | "subagent" | "all";
  model?: string;
  prompt?: string;
  tools?: Record<string, boolean>;
  permission?: Record<string, unknown>;
  builtIn?: boolean;
}

export interface Model {
  id: string;
  providerID: string;
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

// Create client instances per directory (workbook)
const clients = new Map<string, OpencodeClient>();

function getClient(directory?: string | null): OpencodeClient {
  const key = directory || "__default__";

  if (!clients.has(key)) {
    const client = createOpencodeClient({
      baseUrl: `http://localhost:${PORTS.OPENCODE}`,
      directory: directory || undefined,
    });
    clients.set(key, client);
  }

  return clients.get(key)!;
}

// API functions - always use SDK client
export const api = {
  health: async () => {
    const client = getClient();
    const result = await client.session.list();
    return { status: "ok", sessions: (result.data as Session[]).length };
  },

  sessions: {
    list: async (directory?: string | null): Promise<Session[]> => {
      const client = getClient(directory);
      const result = await client.session.list();
      return result.data as Session[];
    },
    get: async (id: string, directory?: string | null): Promise<Session> => {
      const client = getClient(directory);
      const result = await client.session.get({ path: { id } });
      return result.data as Session;
    },
    create: async (
      body?: { parentID?: string; title?: string },
      directory?: string | null,
    ): Promise<Session> => {
      const client = getClient(directory);
      const result = await client.session.create({ body: body || {} });
      return result.data as Session;
    },
    delete: async (id: string, directory?: string | null): Promise<boolean> => {
      const client = getClient(directory);
      await client.session.delete({ path: { id } });
      return true;
    },
  },

  messages: {
    list: async (sessionId: string, directory?: string | null): Promise<MessageWithParts[]> => {
      const client = getClient(directory);
      const result = await client.session.messages({ path: { id: sessionId } });
      return result.data as unknown as MessageWithParts[];
    },
    get: async (
      sessionId: string,
      messageId: string,
      directory?: string | null,
    ): Promise<MessageWithParts> => {
      const client = getClient(directory);
      const result = await client.session.message({
        path: { id: sessionId, messageID: messageId },
      });
      return result.data as unknown as MessageWithParts;
    },
  },

  todos: {
    list: async (sessionId: string, directory?: string | null): Promise<Todo[]> => {
      const client = getClient(directory);
      const result = await client.session.todo({ path: { id: sessionId } });
      return result.data as Todo[];
    },
  },

  status: {
    all: async (directory?: string | null): Promise<Record<string, SessionStatus>> => {
      const client = getClient(directory);
      const result = await client.session.status();
      return result.data as Record<string, SessionStatus>;
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
    },
  ): Promise<MessageWithParts> => {
    const client = getClient(options?.directory);
    const result = await client.session.prompt({
      path: { id: sessionId },
      body: {
        parts: [{ type: "text", text: content }],
        model: options?.model,
        system: options?.system,
        agent: options?.agent,
      },
    });
    return result.data as unknown as MessageWithParts;
  },

  promptAsync: async (
    sessionId: string,
    content: string,
    options?: {
      model?: { providerID: string; modelID: string };
      system?: string;
      agent?: string;
      directory?: string | null;
    },
  ) => {
    const client = getClient(options?.directory);
    return client.session.promptAsync({
      path: { id: sessionId },
      body: {
        parts: [{ type: "text", text: content }],
        model: options?.model,
        system: options?.system,
        agent: options?.agent,
      },
    });
  },

  // Send a message with file attachments
  promptWithFiles: async (
    sessionId: string,
    text: string,
    filePaths: string[],
    options?: { directory?: string | null },
  ) => {
    const client = getClient(options?.directory);
    type FilePart = { type: "file"; mime: string; url: string; filename?: string };
    type TextPart = { type: "text"; text: string };
    const parts: (FilePart | TextPart)[] = [];

    // Add file parts for each path
    for (const filePath of filePaths) {
      const filename = filePath.split("/").pop() || filePath;
      // Use file:// URL for local files
      parts.push({
        type: "file",
        url: `file://${filePath}`,
        filename,
        mime: "application/octet-stream", // Let server detect actual type
      });
    }

    // Add text part
    if (text) {
      parts.push({ type: "text", text });
    }

    return client.session.promptAsync({
      path: { id: sessionId },
      body: { parts },
    });
  },

  // Prompt with a specific agent
  promptWithAgent: async (
    sessionId: string,
    content: string,
    agent: string,
    options?: { directory?: string | null },
  ) => {
    const client = getClient(options?.directory);
    return client.session.promptAsync({
      path: { id: sessionId },
      body: {
        parts: [{ type: "text", text: content }],
        agent,
      },
    });
  },

  abort: async (sessionId: string, directory?: string | null): Promise<boolean> => {
    const client = getClient(directory);
    await client.session.abort({ path: { id: sessionId } });
    return true;
  },

  respondToPermission: async (
    sessionId: string,
    permissionId: string,
    response: PermissionResponse,
    directory?: string | null,
  ): Promise<boolean> => {
    const client = getClient(directory);
    await client.postSessionIdPermissionsPermissionId({
      path: { id: sessionId, permissionID: permissionId },
      body: { response },
    });
    return true;
  },

  providers: async () => {
    const client = getClient();
    const result = await client.provider.list();
    return result.data;
  },

  config: {
    get: async (): Promise<OpenCodeConfig> => {
      const client = getClient();
      const result = await client.config.get();
      return result.data as OpenCodeConfig;
    },
    update: async (config: Partial<OpenCodeConfig>): Promise<OpenCodeConfig> => {
      const client = getClient();
      const result = await client.config.update({ body: config });
      return result.data as OpenCodeConfig;
    },
    setModel: async (provider: string, model: string): Promise<OpenCodeConfig> => {
      const client = getClient();
      const result = await client.config.update({ body: { model: `${provider}/${model}` } });
      return result.data as OpenCodeConfig;
    },
  },

  agents: {
    list: async (): Promise<Agent[]> => {
      const client = getClient();
      const result = await client.app.agents();
      return (result.data as unknown as Agent[]) ?? [];
    },
  },

  tools: {
    ids: async (): Promise<string[]> => {
      const client = getClient();
      const result = await client.tool.ids();
      return (result.data as string[]) ?? [];
    },
  },

  mcp: {
    status: async () => {
      const client = getClient();
      const result = await client.mcp.status();
      return result.data;
    },
  },
};

// SSE subscription using SDK - matches opencode desktop implementation
// Uses SDK's typed GlobalEvent which contains { directory, payload: Event }
export function subscribeToEvents(
  onEvent: (event: ServerEvent, directory?: string) => void,
  onError?: (error: unknown) => void,
): () => void {
  const client = getClient();
  const abortController = new AbortController();

  // Start the SSE stream using SDK (same as opencode's global-sdk.tsx)
  client.global
    .event({ signal: abortController.signal })
    .then(async (events) => {
      try {
        for await (const event of events.stream) {
          if (abortController.signal.aborted) break;

          // SDK's GlobalEvent has { directory, payload } structure
          // The payload is the typed Event union
          const globalEvent = event as SdkGlobalEvent;
          const typedEvent = globalEvent.payload;
          const directory = globalEvent.directory;

          console.log(
            "SSE event:",
            typedEvent.type,
            "directory:",
            directory,
            "properties" in typedEvent ? typedEvent.properties : typedEvent,
          );
          // Cast SDK Event to our ServerEvent type (property names differ slightly)
          onEvent(typedEvent as unknown as ServerEvent, directory);
        }
      } catch (err) {
        if (!abortController.signal.aborted) {
          console.error("SSE stream error:", err);
          onError?.(err);
        }
      }
    })
    .catch((err) => {
      if (!abortController.signal.aborted) {
        console.error("SSE connection error:", err);
        onError?.(err);
      }
    });

  return () => {
    abortController.abort();
  };
}
