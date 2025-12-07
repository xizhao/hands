import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk";

const DEFAULT_PORT = 4096;

// Re-export types from SDK
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
} from "@opencode-ai/sdk";

// Import types we need locally
import type {
  Session as SdkSession,
  Message as SdkMessage,
  Part as SdkPart,
  Event as SdkEventType,
  GlobalEvent as SdkGlobalEvent,
} from "@opencode-ai/sdk";

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
  noReply?: boolean;
  system?: string;
}

export interface OpenCodeConfig {
  model?: string;
  theme?: string;
  [key: string]: unknown;
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

// Fallback fetch for endpoints not in SDK
const baseUrl = `http://localhost:${DEFAULT_PORT}`;

function buildUrl(path: string, directory?: string | null): string {
  if (directory) {
    const separator = path.includes("?") ? "&" : "?";
    return `${baseUrl}${path}${separator}directory=${encodeURIComponent(directory)}`;
  }
  return `${baseUrl}${path}`;
}

async function fetchJson<T>(path: string, options?: RequestInit & { directory?: string | null }): Promise<T> {
  const { directory, ...fetchOptions } = options ?? {};
  const url = buildUrl(path, directory);

  const response = await fetch(url, {
    ...fetchOptions,
    headers: {
      "Content-Type": "application/json",
      ...fetchOptions?.headers,
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error: ${response.status} ${response.statusText} - ${text}`);
  }
  return response.json();
}

// API functions using SDK where possible, raw fetch otherwise
export const api = {
  health: async () => {
    const sessions = await fetchJson<Session[]>("/session");
    return { status: "ok", sessions: sessions.length };
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
    get: (sessionId: string, messageId: string, directory?: string | null) =>
      fetchJson<MessageWithParts>(`/session/${sessionId}/message/${messageId}`, { directory }),
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

  prompt: (
    sessionId: string,
    content: string,
    options?: { model?: { providerID: string; modelID: string }; directory?: string | null }
  ) =>
    fetchJson<MessageWithParts>(`/session/${sessionId}/message`, {
      method: "POST",
      body: JSON.stringify({
        parts: [{ type: "text", text: content }],
        model: options?.model,
      } satisfies PromptRequest),
      directory: options?.directory,
    }),

  promptAsync: (
    sessionId: string,
    content: string,
    options?: { model?: { providerID: string; modelID: string }; directory?: string | null }
  ) => {
    const url = buildUrl(`/session/${sessionId}/prompt_async`, options?.directory);
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parts: [{ type: "text", text: content }],
        model: options?.model,
      } satisfies PromptRequest),
    });
  },

  abort: async (sessionId: string, directory?: string | null): Promise<boolean> => {
    const client = getClient(directory);
    await client.session.abort({ path: { id: sessionId } });
    return true;
  },

  respondToPermission: (
    sessionId: string,
    permissionId: string,
    response: PermissionResponse,
    directory?: string | null
  ) =>
    fetchJson<boolean>(`/session/${sessionId}/permissions/${permissionId}`, {
      method: "POST",
      body: JSON.stringify({ response }),
      directory,
    }),

  providers: () =>
    fetchJson<{
      all: Array<{
        id: string;
        name: string;
        models: Record<string, { id: string; name: string }>;
      }>;
      default: Record<string, string>;
      connected: string[];
    }>("/provider"),

  config: {
    get: () => fetchJson<OpenCodeConfig>("/config"),
    update: (config: Partial<OpenCodeConfig>) =>
      fetchJson<OpenCodeConfig>("/config", {
        method: "PATCH",
        body: JSON.stringify(config),
      }),
    setModel: (provider: string, model: string) =>
      fetchJson<OpenCodeConfig>("/config", {
        method: "PATCH",
        body: JSON.stringify({ model: `${provider}/${model}` }),
      }),
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
