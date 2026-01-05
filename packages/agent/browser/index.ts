/**
 * Browser Agent Module
 *
 * Complete browser-based AI agent with:
 * - AI SDK + OpenRouter integration (BYOK)
 * - Multi-turn conversations with tool execution
 * - Jotai state management
 * - Swappable executor (browser now, server later)
 */

// ============================================================================
// Core Agent
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
// Types
// ============================================================================

export {
  // Part types
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
  type UserMessage,
  type AssistantMessage,
  type Message,
  type MessageWithParts,
  // Session types
  type Session,
  // Agent config
  type AgentConfig,
  // Events
  type AgentEvent,
  // Utilities
  generateId,
} from "./types";

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
  type ProviderConfig,
  type ProviderType,
  type ModelConfig,
  type ParsedModel,
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
  createCodeExecuteTool,
  createPageListTool,
  createPageReadTool,
  createPageWriteTool,
  DATA_TOOLS,
  CONTENT_TOOLS,
  ALL_TOOLS,
  type ToolContext,
  type ToolId,
  type ToolRegistry,
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
