/**
 * Context Compaction
 *
 * Manages context window usage by pruning old tool outputs.
 * Inspired by OpenCode's session/compaction.ts.
 */

import type { MessageWithParts, Part, ToolPart } from "../core";
import { estimateTokens, estimateConversationTokens } from "./token";
import {
  getContextLimit,
  type ContextConfig,
  DEFAULT_CONTEXT_CONFIG,
} from "./context-config";

// ============================================================================
// Overflow Detection
// ============================================================================

export interface OverflowCheckInput {
  messages: MessageWithParts[];
  modelId: string;
  config?: Partial<ContextConfig>;
}

/**
 * Check if the conversation is approaching or exceeding context limits.
 */
export function isOverflow(input: OverflowCheckInput): boolean {
  const config = { ...DEFAULT_CONTEXT_CONFIG, ...input.config };
  const contextLimit = getContextLimit(input.modelId);

  // Output budget should be at most 20% of context limit
  const effectiveOutputBudget = Math.min(config.outputBudget, Math.floor(contextLimit * 0.2));
  const usable = contextLimit - effectiveOutputBudget;

  // Estimate current token usage
  const currentTokens = estimateConversationTokens(input.messages);

  return currentTokens > usable;
}

/**
 * Get current context usage stats.
 */
export function getContextStats(input: OverflowCheckInput): {
  currentTokens: number;
  contextLimit: number;
  usableTokens: number;
  utilizationPercent: number;
  isOverflow: boolean;
} {
  const config = { ...DEFAULT_CONTEXT_CONFIG, ...input.config };
  const contextLimit = getContextLimit(input.modelId);

  // Output budget should be at most 20% of context limit
  const effectiveOutputBudget = Math.min(config.outputBudget, Math.floor(contextLimit * 0.2));
  const usableTokens = contextLimit - effectiveOutputBudget;
  const currentTokens = estimateConversationTokens(input.messages);

  return {
    currentTokens,
    contextLimit,
    usableTokens,
    utilizationPercent: Math.round((currentTokens / usableTokens) * 100),
    isOverflow: currentTokens > usableTokens,
  };
}

// ============================================================================
// Pruning Logic
// ============================================================================

export interface PruneResult {
  /** Number of tool outputs marked as compacted */
  prunedCount: number;
  /** Estimated tokens freed */
  tokensSaved: number;
  /** Whether pruning was actually performed (met minimum threshold) */
  performed: boolean;
}

export interface PruneOptions {
  messages: MessageWithParts[];
  modelId?: string;
  config?: Partial<ContextConfig>;
}

/**
 * Mark old tool outputs as compacted.
 *
 * Algorithm (from OpenCode):
 * 1. Iterate messages backwards (newest → oldest)
 * 2. Skip the current/most recent turn
 * 3. For each completed tool call, estimate output tokens
 * 4. Protect the most recent PRUNE_PROTECT tokens worth of outputs
 * 5. Mark older outputs as compacted
 * 6. Only perform if total prunable > PRUNE_MINIMUM
 *
 * Note: This mutates the messages in place by setting time.compacted.
 * Thresholds are scaled relative to model's context limit.
 */
export function pruneOldToolOutputs(
  messagesOrOptions: MessageWithParts[] | PruneOptions,
  config?: Partial<ContextConfig>
): PruneResult {
  // Support both old signature (messages, config) and new (options object)
  const isOptionsObj = !Array.isArray(messagesOrOptions);
  const messages = isOptionsObj ? messagesOrOptions.messages : messagesOrOptions;
  const modelId = isOptionsObj ? messagesOrOptions.modelId : undefined;
  const mergedConfig = {
    ...DEFAULT_CONTEXT_CONFIG,
    ...(isOptionsObj ? messagesOrOptions.config : config),
  };

  // Scale thresholds based on model's context limit
  const contextLimit = modelId ? getContextLimit(modelId) : 200_000;
  const scaleFactor = contextLimit / 200_000; // Scale relative to Claude's 200K

  const { pruneProtect: basePruneProtect, pruneMinimum: basePruneMinimum } = mergedConfig;
  const pruneProtect = Math.floor(basePruneProtect * scaleFactor);
  const pruneMinimum = Math.floor(basePruneMinimum * scaleFactor);

  // Need at least 2 turns to prune
  if (messages.length < 2) {
    return { prunedCount: 0, tokensSaved: 0, performed: false };
  }

  // Collect all tool parts that could be pruned
  // Skip the most recent message pair (current turn)
  const toolParts: Array<{
    part: ToolPart;
    tokens: number;
    msgIndex: number;
  }> = [];

  // Skip last 2 messages (current assistant response + user message that triggered it)
  const messagesToCheck = messages.slice(0, -2);

  for (let i = messagesToCheck.length - 1; i >= 0; i--) {
    const msg = messagesToCheck[i];
    if (msg.info.role !== "assistant") continue;

    for (const part of msg.parts) {
      if (part.type !== "tool") continue;
      if (part.state.status !== "completed") continue;
      // Skip already compacted
      if (part.state.time.compacted) continue;

      const tokens = estimateTokens(part.state.output);
      toolParts.push({ part, tokens, msgIndex: i });
    }
  }

  if (toolParts.length === 0) {
    return { prunedCount: 0, tokensSaved: 0, performed: false };
  }

  // Calculate tokens to protect (newest first)
  let protectedTokens = 0;
  let firstPrunableIndex = toolParts.length;

  for (let i = 0; i < toolParts.length; i++) {
    if (protectedTokens >= pruneProtect) {
      firstPrunableIndex = i;
      break;
    }
    protectedTokens += toolParts[i].tokens;
  }

  // Calculate total prunable tokens
  const prunableParts = toolParts.slice(firstPrunableIndex);
  const totalPrunable = prunableParts.reduce((sum, p) => sum + p.tokens, 0);

  // Only prune if we can free at least PRUNE_MINIMUM tokens
  if (totalPrunable < pruneMinimum) {
    return { prunedCount: 0, tokensSaved: 0, performed: false };
  }

  // Perform pruning - mark as compacted
  const now = Date.now();
  for (const { part } of prunableParts) {
    if (part.state.status === "completed") {
      part.state.time.compacted = now;
    }
  }

  return {
    prunedCount: prunableParts.length,
    tokensSaved: totalPrunable,
    performed: true,
  };
}

// ============================================================================
// Message Conversion Helpers
// ============================================================================

/** Placeholder text for compacted tool outputs */
export const COMPACTED_OUTPUT_PLACEHOLDER =
  "[Old tool result cleared - use readOutput if outputId was provided]";

/**
 * Check if a tool output has been compacted.
 */
export function isCompacted(part: Part): boolean {
  if (part.type !== "tool") return false;
  if (part.state.status !== "completed") return false;
  return !!part.state.time.compacted;
}

/**
 * Get the effective output for a tool part (placeholder if compacted).
 */
export function getEffectiveOutput(part: ToolPart): string {
  if (part.state.status !== "completed") return "";
  if (part.state.time.compacted) return COMPACTED_OUTPUT_PLACEHOLDER;
  return part.state.output;
}
