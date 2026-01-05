/**
 * Browser Agent Module
 *
 * Complete browser-based AI agent with:
 * - AI SDK + OpenRouter integration (BYOK)
 * - Multi-turn conversations with tool execution
 * - Jotai state management
 * - Implements AgentProvider interface from core
 */

// ============================================================================
// Core Types (re-exported from @hands/agent/core)
// ============================================================================

export {
  // Part types
  type PartBase,
  type TextPart,
  type ReasoningPart,
  type FilePart,
  type ToolPart,
  type ToolState,
  type ToolStatePending,
  type ToolStateRunning,
  type ToolStateCompleted,
  type ToolStateError,
  type StepStartPart,
  type StepFinishPart,
  type Part,
  // Message types
  type MessageBase,
  type UserMessage,
  type AssistantMessage,
  type Message,
  type MessageWithParts,
  // Session types
  type Session,
  type SessionStatus,
  // Todos
  type Todo,
  // Agent config
  type AgentConfig,
  // Events
  type AgentEvent,
  // Provider interface
  type AgentProvider,
  type PromptOptions,
  // Utilities
  generateId,
} from "../core";

// ============================================================================
// Browser Provider
// ============================================================================

export {
  BrowserAgentProvider,
  createBrowserProvider,
  type BrowserProviderConfig,
} from "./browser-provider";

// ============================================================================
// Low-level Agent (for direct use without provider abstraction)
// ============================================================================

export { runAgent, type AgentOptions, type AgentResult, type AgentConfigInput } from "./agent";

// ============================================================================
// Agent Configurations (from packages/agent/agents)
// ============================================================================

export {
  handsAgent,
  coderAgent,
  importAgent,
  researcherAgent,
  defaultAgent,
  agents,
  getAgent,
} from "../agents";

// ============================================================================
// Provider
// ============================================================================

export {
  createProvider,
  createProviderFromStorage,
  getStoredConfig,
  setStoredConfig,
  clearStoredConfig,
  getDefaultModel,
  resolveModelId,
  parseModelString,
  getOpenRouterModelId,
  STORAGE_KEYS,
  type ProviderConfig,
  type ProviderType,
  type ModelConfig,
  type ParsedModel,
  type StorageKey,
} from "./provider";

// ============================================================================
// Executor
// ============================================================================

export {
  createExecutor,
  type ExecutorConfig,
  type StreamOptions,
  type ExecutorResult,
} from "./executor";

// ============================================================================
// Tools
// ============================================================================

export {
  createToolRegistry,
  createSqlQueryTool,
  createSqlExecuteTool,
  createSqlSchemaTool,
  createWebFetchTool,
  createWebSearchTool,
  createCodeExecuteTool,
  createPageListTool,
  createPageReadTool,
  createPageWriteTool,
  toAISDKTools,
  DATA_TOOLS,
  RESEARCH_TOOLS,
  CONTENT_TOOLS,
  ALL_TOOLS,
  type ToolContext,
  type ToolId,
  type ToolRegistry,
  type ToolDefinition,
  type DatabaseContext,
} from "./tools";

// ============================================================================
// State (Jotai Atoms) - Optional, for apps that want global state
// ============================================================================

export {
  // Settings
  apiKeysAtom,
  defaultModelAtom,
} from "./state";

// ============================================================================
// Hooks
// ============================================================================

export { useAgent, type UseAgentOptions, type UseAgentReturn } from "./hooks/useAgent";

// ============================================================================
// Legacy Client (kept for compatibility)
// ============================================================================

export {
  BrowserLLMClient,
  createLLMClientFromSettings,
  type LLMConfig,
  type Message as LegacyMessage,
  type ContentBlock,
  type Tool as LegacyTool,
  type ToolUse,
  type StreamEvent,
  type Provider,
} from "./llm-client";

// ============================================================================
// Browser API (drop-in replacement for @opencode-ai/sdk client)
// ============================================================================

export {
  api,
  subscribeToEvents,
  setToolContext,
  getToolContext,
  // Types (api-specific only, core types re-exported above)
  type Agent as ApiAgent,
  type ServerEvent,
  type EventType,
} from "./api";
