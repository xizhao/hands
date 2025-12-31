"use client";

/**
 * MarkdownKit - DEPRECATED
 *
 * Sync serialization has been replaced by the web worker.
 * This file exists only for backwards compatibility with tests.
 *
 * Production code should use useMarkdownWorker() hook instead.
 */

/** Markdown serialization rule type - kept for backwards compat */
export interface MarkdownRule {
  mark?: boolean;
  serialize?: (node: any) => any;
  deserialize?: unknown;
}

/**
 * Create MarkdownKit - returns empty array.
 * The web worker now handles all serialization.
 *
 * @deprecated Use useMarkdownWorker() hook instead
 */
export function createMarkdownKit(_additionalRules: Record<string, MarkdownRule> = {}) {
  // MarkdownPlugin removed - worker handles serialization
  return [];
}

/** @deprecated Use useMarkdownWorker() hook instead */
export const MarkdownKit = createMarkdownKit();
