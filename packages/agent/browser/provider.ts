/**
 * LLM Provider Setup
 *
 * Uses AI SDK with OpenRouter for browser-first BYOK.
 * Abstracted to allow swapping to server-side later.
 */

import { createOpenRouter, type OpenRouterProvider } from "@openrouter/ai-sdk-provider";

// ============================================================================
// Types
// ============================================================================

export type ProviderType = "openrouter" | "anthropic" | "openai";

export interface ProviderConfig {
  type: ProviderType;
  apiKey: string;
  baseUrl?: string;
}

export interface ModelConfig {
  providerId: string;
  modelId: string;
  temperature?: number;
  maxTokens?: number;
}

// ============================================================================
// Default API Key (free-tier only, $0 budget limit)
// ============================================================================

/**
 * Default OpenRouter API key for free models only.
 * This key has a $0 credit limit and can only access free models.
 * Users can override by setting their own key in localStorage.
 */
export const DEFAULT_OPENROUTER_KEY = "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";

// ============================================================================
// Model Presets
// ============================================================================

export type ModelPreset = "free" | "fast" | "smart";

/**
 * Model presets for different use cases.
 * All models use OpenRouter format: provider/model
 */
export const MODEL_PRESETS: Record<ModelPreset, { primary: string; coding: string; research: string }> = {
  /** Free models - no cost, lower rate limits */
  free: {
    primary: "mistralai/devstral-2512:free",
    coding: "mistralai/devstral-2512:free",
    research: "arcee-ai/trinity-mini:free",
  },
  /** Fast models - optimized for speed */
  fast: {
    primary: "anthropic/claude-sonnet-4-20250514",
    coding: "anthropic/claude-sonnet-4-20250514",
    research: "google/gemini-2.5-flash",
  },
  /** Smart models - best quality */
  smart: {
    primary: "anthropic/claude-sonnet-4-20250514",
    coding: "anthropic/claude-sonnet-4-20250514",
    research: "anthropic/claude-sonnet-4-20250514",
  },
};

/** Get the current model preset from localStorage, defaulting to "free" */
export function getModelPreset(): ModelPreset {
  if (typeof localStorage === "undefined") return "free";
  const stored = localStorage.getItem("hands_model_preset");
  if (stored && (stored === "free" || stored === "fast" || stored === "smart")) {
    return stored;
  }
  return "free";
}

/** Set the model preset in localStorage */
export function setModelPreset(preset: ModelPreset): void {
  localStorage.setItem("hands_model_preset", preset);
}

/** Get models for the current preset */
export function getPresetModels(): { primary: string; coding: string; research: string } {
  return MODEL_PRESETS[getModelPreset()];
}

// ============================================================================
// Storage Keys (exported for type-safe access across packages)
// ============================================================================

export const STORAGE_KEYS = {
  openrouter: "hands_openrouter_key",
  anthropic: "hands_anthropic_key",
  openai: "hands_openai_key",
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

const DEFAULT_MODELS: Record<ProviderType, string> = {
  openrouter: "anthropic/claude-sonnet-4-20250514",
  anthropic: "claude-sonnet-4-20250514",
  openai: "gpt-4o",
};

// ============================================================================
// Provider Factory
// ============================================================================

/**
 * Create an OpenRouter provider instance.
 * OpenRouter is preferred for browser use due to CORS support.
 */
export function createProvider(config: ProviderConfig): OpenRouterProvider {
  if (config.type !== "openrouter") {
    // For now, route everything through OpenRouter
    // Direct Anthropic/OpenAI requires special headers or server proxy
    console.warn(`Provider ${config.type} not directly supported in browser, using OpenRouter`);
  }

  return createOpenRouter({
    apiKey: config.apiKey,
    // OpenRouter handles routing to the actual provider
  });
}

/**
 * Get provider config from localStorage (BYOK pattern)
 * Falls back to default free-tier key if no user key is set.
 */
export function getStoredConfig(): ProviderConfig {
  // Prefer OpenRouter (best browser CORS support)
  const openrouterKey = localStorage.getItem(STORAGE_KEYS.openrouter);
  if (openrouterKey) {
    return { type: "openrouter", apiKey: openrouterKey };
  }

  // Fallback to direct providers (may have CORS issues)
  const anthropicKey = localStorage.getItem(STORAGE_KEYS.anthropic);
  if (anthropicKey) {
    return { type: "anthropic", apiKey: anthropicKey };
  }

  const openaiKey = localStorage.getItem(STORAGE_KEYS.openai);
  if (openaiKey) {
    return { type: "openai", apiKey: openaiKey };
  }

  // Default to free-tier OpenRouter key
  return { type: "openrouter", apiKey: DEFAULT_OPENROUTER_KEY };
}

/**
 * Check if user has set their own API key (vs using default)
 */
export function hasCustomApiKey(): boolean {
  return !!(
    localStorage.getItem(STORAGE_KEYS.openrouter) ||
    localStorage.getItem(STORAGE_KEYS.anthropic) ||
    localStorage.getItem(STORAGE_KEYS.openai)
  );
}

/**
 * Store provider config in localStorage
 */
export function setStoredConfig(config: ProviderConfig): void {
  localStorage.setItem(STORAGE_KEYS[config.type], config.apiKey);
}

/**
 * Clear stored provider config
 */
export function clearStoredConfig(type?: ProviderType): void {
  if (type) {
    localStorage.removeItem(STORAGE_KEYS[type]);
  } else {
    Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
  }
}

/**
 * Get the default model for a provider type
 */
export function getDefaultModel(type: ProviderType): string {
  return DEFAULT_MODELS[type];
}

// ============================================================================
// Model Resolution
// ============================================================================

/**
 * Parsed model information from an agent config model string.
 * Agent configs use format: "openrouter/provider/model" (e.g., "openrouter/anthropic/claude-opus-4.5")
 */
export interface ParsedModel {
  /** The gateway used (e.g., "openrouter") */
  gateway: string;
  /** The LLM provider (e.g., "anthropic", "google") */
  provider: string;
  /** The model ID (e.g., "claude-opus-4.5", "gemini-2.5-flash") */
  model: string;
  /** The OpenRouter model ID (provider/model) */
  openRouterModelId: string;
}

/**
 * Parse an OpenCode-style model string.
 * Format: "gateway/provider/model" (e.g., "openrouter/anthropic/claude-opus-4.5")
 *
 * Also handles legacy format "provider/model" for backwards compatibility.
 */
export function parseModelString(modelString: string): ParsedModel {
  const parts = modelString.split("/");

  if (parts.length === 3) {
    // Full format: gateway/provider/model
    const [gateway, provider, model] = parts;
    return {
      gateway,
      provider,
      model,
      openRouterModelId: `${provider}/${model}`,
    };
  } else if (parts.length === 2) {
    // Legacy format: provider/model (assume openrouter gateway)
    const [provider, model] = parts;
    return {
      gateway: "openrouter",
      provider,
      model,
      openRouterModelId: modelString,
    };
  } else {
    // Single value - assume it's just a model name for anthropic
    return {
      gateway: "openrouter",
      provider: "anthropic",
      model: modelString,
      openRouterModelId: `anthropic/${modelString}`,
    };
  }
}

/**
 * Resolve a model ID for use with OpenRouter.
 * OpenRouter uses provider/model format (e.g., "anthropic/claude-sonnet-4-20250514")
 */
export function resolveModelId(providerId: string, modelId: string): string {
  // If already in OpenRouter format, use as-is
  if (modelId.includes("/")) {
    return modelId;
  }

  // Map provider IDs to OpenRouter prefixes
  const prefixes: Record<string, string> = {
    anthropic: "anthropic",
    openai: "openai",
    google: "google",
    meta: "meta-llama",
  };

  const prefix = prefixes[providerId] || providerId;
  return `${prefix}/${modelId}`;
}

/**
 * Get the OpenRouter model ID from an agent's model config.
 * Handles both the new AgentConfig format (string) and browser AgentConfig format (object).
 */
export function getOpenRouterModelId(model: string | { providerId: string; modelId: string } | undefined): string {
  if (!model) {
    return DEFAULT_MODELS.openrouter;
  }

  if (typeof model === "string") {
    // OpenCode-style format: "openrouter/anthropic/claude-opus-4.5"
    return parseModelString(model).openRouterModelId;
  }

  // Browser format: { providerId, modelId }
  return resolveModelId(model.providerId, model.modelId);
}

// ============================================================================
// Convenience
// ============================================================================

/**
 * Create a provider from stored settings.
 * Always succeeds - uses default free-tier key if no user key is set.
 */
export function createProviderFromStorage(): OpenRouterProvider {
  const config = getStoredConfig();
  return createProvider(config);
}
