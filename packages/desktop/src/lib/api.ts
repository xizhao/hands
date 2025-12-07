import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk/client";

const DEFAULT_PORT = 4096;

// Re-export types from SDK client (avoids importing server-only code)
export type {
  UserMessage,
  AssistantMessage,
  Message,
  TextPart,
  ReasoningPart,
  FilePart,
  StepStartPart,
  StepFinishPart,
  AgentPart,
  RetryPart,
  ToolPart,
  Part,
  ToolState,
  ToolStatePending,
  ToolStateRunning,
  ToolStateCompleted,
  ToolStateError,
  ApiError,
  // Event types - use SDK's typed discriminated union for type-safe event handling
  Event as SdkEvent,
  GlobalEvent,
  EventMessageUpdated,
  EventMessageRemoved,
  EventMessagePartUpdated,
  EventMessagePartRemoved,
  EventSessionStatus,
  EventSessionCreated,
  EventSessionUpdated,
  EventSessionDeleted,
  EventTodoUpdated,
  SessionStatus as SdkSessionStatus,
  Session as SdkSession,
  Todo as SdkTodo,
} from "@opencode-ai/sdk/client";

// Import types we need locally
import type {
  Session as SdkSession,
  Message as SdkMessage,
  Part as SdkPart,
  Event as SdkEventType,
  GlobalEvent as SdkGlobalEvent,
} from "@opencode-ai/sdk/client";

// Alias SDK types
export type Session = SdkSession;

// Custom types for our app
export interface MessageWithParts {
  info: SdkMessage;
  parts: SdkPart[];
}

export interface TokenUsage {
  input: number;
  output: number;
  reasoning: number;
  cache: { read: number; write: number };
}

export interface Todo {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed";
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

// ServerEvent is now the SDK's typed Event union for proper type safety
// This enables TypeScript to catch type errors in event handlers
export type ServerEvent = SdkEventType;

export interface PromptRequest {
  parts: Array<{ type: "text"; text: string } | { type: "file"; mediaType: string; url?: string; filename?: string }>;
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
      baseUrl: `http://localhost:${DEFAULT_PORT}`,
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
    create: async (body?: { parentID?: string; title?: string }, directory?: string | null): Promise<Session> => {
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
      return result.data as MessageWithParts[];
    },
    get: async (sessionId: string, messageId: string, directory?: string | null): Promise<MessageWithParts> => {
      const client = getClient(directory);
      const result = await client.session.message({ path: { id: sessionId, messageID: messageId } });
      return result.data as MessageWithParts;
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
    options?: { model?: { providerID: string; modelID: string }; directory?: string | null }
  ): Promise<MessageWithParts> => {
    const client = getClient(options?.directory);
    const result = await client.session.prompt({
      path: { id: sessionId },
      body: {
        parts: [{ type: "text", text: content }],
        model: options?.model,
      },
    });
    return result.data as MessageWithParts;
  },

  promptAsync: async (
    sessionId: string,
    content: string,
    options?: { model?: { providerID: string; modelID: string }; directory?: string | null }
  ) => {
    const client = getClient(options?.directory);
    return client.session.promptAsync({
      path: { id: sessionId },
      body: {
        parts: [{ type: "text", text: content }],
        model: options?.model,
      },
    });
  },

  // Send a message with file attachments
  promptWithFiles: async (
    sessionId: string,
    text: string,
    filePaths: string[],
    options?: { directory?: string | null }
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

  // Prompt with a specific agent - used for background tasks
  promptWithAgent: async (
    sessionId: string,
    content: string,
    agent: string,
    options?: { directory?: string | null }
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
    directory?: string | null
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
      return result.data as Agent[];
    },
  },

  tools: {
    ids: async (): Promise<string[]> => {
      const client = getClient();
      const result = await client.tool.ids();
      return result.data as string[];
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
  onEvent: (event: ServerEvent) => void,
  onError?: (error: unknown) => void
): () => void {
  const client = getClient();
  const abortController = new AbortController();

  // Start the SSE stream using SDK (same as opencode's global-sdk.tsx)
  client.global.event({ signal: abortController.signal }).then(async (events) => {
    try {
      for await (const event of events.stream) {
        if (abortController.signal.aborted) break;

        // SDK's GlobalEvent has { directory, payload } structure
        // The payload is the typed Event union
        const globalEvent = event as SdkGlobalEvent;
        const typedEvent = globalEvent.payload;

        console.log("SSE event:", typedEvent.type, "properties" in typedEvent ? typedEvent.properties : typedEvent);
        onEvent(typedEvent);
      }
    } catch (err) {
      if (!abortController.signal.aborted) {
        console.error("SSE stream error:", err);
        onError?.(err);
      }
    }
  }).catch((err) => {
    if (!abortController.signal.aborted) {
      console.error("SSE connection error:", err);
      onError?.(err);
    }
  });

  return () => {
    abortController.abort();
  };
}
