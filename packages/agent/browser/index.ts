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
  hasCustomApiKey,
  getModelPreset,
  setModelPreset,
  getPresetModels,
  DEFAULT_OPENROUTER_KEY,
  MODEL_PRESETS,
  STORAGE_KEYS,
  type ProviderConfig,
  type ProviderType,
  type ModelConfig,
  type ModelPreset,
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
  createSqlTool,
  createSqlSchemaTool,
  createWebFetchTool,
  createWebSearchTool,
  createCodeExecuteTool,
  createPythonTool,
  createTodoWriteTool,
  createListPagesTool,
  createReadPageTool,
  createWritePageTool,
  createDeletePageTool,
  createSearchPagesTool,
  createTaskTool,
  createNavigateTool,
  toAISDKTools,
  normalizeToolId,
  DATA_TOOLS,
  RESEARCH_TOOLS,
  PAGE_TOOLS,
  ALL_TOOLS,
  SUBAGENT_DISABLED_TOOLS,
  LEGACY_TOOL_MAP,
  type ToolContext,
  type ToolId,
  type ToolRegistry,
  type ToolDefinition,
  type DatabaseContext,
  type PagesContext,
  type PageValidationError,
  type PageValidationResult,
  type SubagentContext,
  type SubagentResult,
  type TodoContext,
  type TodoItem,
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
// Storage (SQLite persistence layer)
// ============================================================================

export {
  createSessionStorage,
  type SessionStorage,
} from "./storage";

export { createPagesStorage } from "./pages-storage";

// ============================================================================
// Hooks
// ============================================================================

export { useAgent, type UseAgentOptions, type UseAgentReturn } from "./hooks/useAgent";

// ============================================================================
// Context Management
// ============================================================================

export {
  isOverflow,
  getContextStats,
  pruneOldToolOutputs,
  getEffectiveOutput,
  isCompacted,
  COMPACTED_OUTPUT_PLACEHOLDER,
  type OverflowCheckInput,
  type PruneResult,
  type PruneOptions,
} from "./compaction";

export {
  getContextLimit,
  createContextConfig,
  MODEL_CONTEXT_LIMITS,
  DEFAULT_CONTEXT_CONFIG,
  type ContextConfig,
} from "./context-config";

export {
  estimateTokens,
  estimatePartTokens,
  estimateMessageTokens,
  estimateConversationTokens,
  estimateToolOutputTokens,
} from "./token";

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
  emitEvent,
  setToolContext,
  getToolContext,
  resetWorkbookNameSuggestion,
  // Types (api-specific only, core types re-exported above)
  type Agent as ApiAgent,
  type ServerEvent,
  type EventType,
} from "./api";
