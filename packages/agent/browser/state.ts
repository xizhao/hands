/**
 * Agent State Management
 *
 * Jotai atoms for managing agent settings in browser.
 * Core session/message state is handled by useAgent hook with React useState.
 */

import { atomWithStorage } from "jotai/utils";

// ============================================================================
// Settings Atoms (persisted to localStorage)
// ============================================================================

/** API keys storage */
export const apiKeysAtom = atomWithStorage<{
  openrouter?: string;
  anthropic?: string;
  openai?: string;
}>("hands_api_keys", {});

/** Default model configuration */
export const defaultModelAtom = atomWithStorage("hands_default_model", {
  providerId: "openrouter",
  modelId: "anthropic/claude-sonnet-4-20250514",
});
