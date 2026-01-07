/**
 * Token Estimation Utilities
 *
 * Simple heuristics for estimating token usage.
 * Used for context window management and pruning decisions.
 */

import type { MessageWithParts, Part } from "../core";

// ============================================================================
// Constants
// ============================================================================

/**
 * Approximate characters per token.
 * Using 3 instead of 4 to be conservative - structured content
 * (JSON, tool calls) tends to have more tokens per character.
 */
const CHARS_PER_TOKEN = 3;

// ============================================================================
// Token Estimation
// ============================================================================

/**
 * Estimate tokens from a string.
 * Uses simple char/4 heuristic (works reasonably for most models).
 */
export function estimateTokens(text: string | undefined | null): number {
  if (!text) return 0;
  return Math.max(0, Math.round(text.length / CHARS_PER_TOKEN));
}

/**
 * Estimate tokens for a single message part.
 */
export function estimatePartTokens(part: Part): number {
  switch (part.type) {
    case "text":
      return estimateTokens(part.text);

    case "tool":
      // Include input and output
      const inputTokens = estimateTokens(JSON.stringify(part.state.input));
      const outputTokens =
        part.state.status === "completed"
          ? estimateTokens(part.state.output)
          : 0;
      // Add some overhead for tool call structure
      return inputTokens + outputTokens + 20;

    default:
      return 0;
  }
}

/**
 * Estimate tokens for a complete message.
 */
export function estimateMessageTokens(msg: MessageWithParts): number {
  let total = 0;

  // Message metadata overhead
  total += 10;

  // Parts
  for (const part of msg.parts) {
    total += estimatePartTokens(part);
  }

  return total;
}

/**
 * Estimate total tokens for a conversation.
 */
export function estimateConversationTokens(messages: MessageWithParts[]): number {
  return messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);
}

/**
 * Get token count for tool outputs only (used for pruning decisions).
 */
export function estimateToolOutputTokens(msg: MessageWithParts): number {
  let total = 0;

  for (const part of msg.parts) {
    if (part.type === "tool" && part.state.status === "completed") {
      total += estimateTokens(part.state.output);
    }
  }

  return total;
}
