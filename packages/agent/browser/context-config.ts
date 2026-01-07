/**
 * Context Management Configuration
 *
 * Per-model context limits and pruning thresholds.
 */

// ============================================================================
// Model Context Limits
// ============================================================================

/**
 * Known context window sizes for common models.
 * Values in tokens.
 */
export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  // Claude models (via OpenRouter)
  "anthropic/claude-opus-4": 200_000,
  "anthropic/claude-opus-4-20250514": 200_000,
  "anthropic/claude-sonnet-4": 200_000,
  "anthropic/claude-sonnet-4-20250514": 200_000,
  "anthropic/claude-3.5-sonnet": 200_000,
  "anthropic/claude-3.5-sonnet-20241022": 200_000,
  "anthropic/claude-3-opus": 200_000,
  "anthropic/claude-3-sonnet": 200_000,
  "anthropic/claude-3-haiku": 200_000,

  // OpenAI models
  "openai/gpt-4o": 128_000,
  "openai/gpt-4o-2024-11-20": 128_000,
  "openai/gpt-4-turbo": 128_000,
  "openai/gpt-4-turbo-preview": 128_000,
  "openai/gpt-4": 8_192,
  "openai/gpt-3.5-turbo": 16_385,
  "openai/o1": 200_000,
  "openai/o1-mini": 128_000,
  "openai/o1-preview": 128_000,

  // Google models
  "google/gemini-2.0-flash-exp": 1_000_000,
  "google/gemini-1.5-pro": 1_000_000,
  "google/gemini-1.5-flash": 1_000_000,
  "google/gemini-pro": 32_000,

  // Mistral models
  "mistralai/mistral-large": 128_000,
  "mistralai/mistral-medium": 32_000,
  "mistralai/mistral-small": 32_000,
  "mistralai/devstral-2512": 32_000,
  "mistralai/devstral-2512:free": 32_000,

  // Meta models
  "meta-llama/llama-3.1-405b-instruct": 128_000,
  "meta-llama/llama-3.1-70b-instruct": 128_000,
  "meta-llama/llama-3.1-8b-instruct": 128_000,
  "meta-llama/llama-3.2-3b-instruct:free": 128_000,

  // Default fallback
  default: 128_000,
};

/**
 * Get context limit for a model.
 * Handles OpenRouter prefixed model IDs.
 */
export function getContextLimit(modelId: string): number {
  // Try exact match first
  if (MODEL_CONTEXT_LIMITS[modelId]) {
    return MODEL_CONTEXT_LIMITS[modelId];
  }

  // Try without openrouter/ prefix
  const withoutPrefix = modelId.replace(/^openrouter\//, "");
  if (MODEL_CONTEXT_LIMITS[withoutPrefix]) {
    return MODEL_CONTEXT_LIMITS[withoutPrefix];
  }

  // Try base model name (remove version suffix like -20250514)
  const baseModel = withoutPrefix.replace(/-\d{8}$/, "");
  if (MODEL_CONTEXT_LIMITS[baseModel]) {
    return MODEL_CONTEXT_LIMITS[baseModel];
  }

  // Return default
  return MODEL_CONTEXT_LIMITS.default;
}

// ============================================================================
// Pruning Configuration
// ============================================================================

export interface ContextConfig {
  /**
   * Tokens reserved for model output.
   * Subtracted from context limit when calculating usable space.
   * Default: 32,000
   */
  outputBudget: number;

  /**
   * Tokens worth of recent tool outputs to protect from pruning.
   * Newer outputs within this budget won't be marked as compacted.
   * Default: 40,000
   */
  pruneProtect: number;

  /**
   * Minimum tokens that must be freeable to trigger pruning.
   * Prevents unnecessary pruning operations.
   * Default: 20,000
   */
  pruneMinimum: number;

  /**
   * Character limit for inline tool outputs.
   * Outputs larger than this are stored in IndexedDB.
   * Default: 10,000
   */
  inlineOutputLimit: number;
}

/**
 * Default context configuration.
 * Note: outputBudget is set high to account for tool definitions,
 * system prompt, and potential parallel tool outputs.
 */
export const DEFAULT_CONTEXT_CONFIG: ContextConfig = {
  outputBudget: 50_000,     // Reserve 50K for output + overhead
  pruneProtect: 30_000,     // Protect less to prune more aggressively
  pruneMinimum: 15_000,     // Lower threshold to trigger pruning sooner
  inlineOutputLimit: 5_000, // Store outputs > 5K in IndexedDB
};

/**
 * Create a context config with optional overrides.
 */
export function createContextConfig(
  overrides?: Partial<ContextConfig>
): ContextConfig {
  return {
    ...DEFAULT_CONTEXT_CONFIG,
    ...overrides,
  };
}
