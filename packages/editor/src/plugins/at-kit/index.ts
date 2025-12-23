/**
 * At-Kit Plugin
 *
 * Type "@prompt" to trigger AI completion with ghost text preview:
 * - Prefetches MDX while typing (debounced)
 * - Shows ghost text preview when result is ready
 * - Tab: Accept ghost text (inserts content directly)
 * - Enter: Insert loader element (lazy swaps when API returns)
 * - Escape: Cancel
 *
 * Requires EditorProvider with tRPC for AI features.
 * Gracefully degrades to basic mention without backend.
 */

import { MentionInputPlugin, MentionPlugin } from "@platejs/mention/react";
import { createPlatePlugin } from "platejs/react";
import { type TElement } from "platejs";

import { AtGhostInputElement } from "./at-ghost-input";
import { AtLoaderElement } from "./at-loader";

// ============================================================================
// Shared cache for prefetched MDX queries
// ============================================================================

/** Cache of pending MDX generation promises, keyed by prompt */
export const pendingMdxQueries = new Map<string, Promise<{ mdx: string; errors?: string[] }>>();

// ============================================================================
// At Loader Element - inline loader while waiting for AI
// ============================================================================

export const AT_LOADER_KEY = "at_loader";

export interface TAtLoaderElement extends TElement {
  type: typeof AT_LOADER_KEY;
  prompt: string;
  children: [{ text: "" }];
}

export const AtLoaderPlugin = createPlatePlugin({
  key: AT_LOADER_KEY,
  node: {
    isElement: true,
    isInline: true,
    isVoid: true,
    component: AtLoaderElement,
  },
});

export function createAtLoaderElement(prompt: string): TAtLoaderElement {
  return {
    type: AT_LOADER_KEY,
    prompt,
    children: [{ text: "" }],
  };
}

// ============================================================================
// At Kit - Mention plugin configured for @ trigger
// ============================================================================

export const AtKit = [
  MentionPlugin.configure({
    options: {
      trigger: "@",
      // Trigger after: start of line, space, tab, newline, or quotes
      triggerPreviousCharPattern: /^$|^[ \t\n\r"']$/,
    },
  }).extendPlugin(MentionInputPlugin, {
    render: { node: AtGhostInputElement },
  }),
  AtLoaderPlugin,
];

export { AtGhostInputElement, AtLoaderElement };
