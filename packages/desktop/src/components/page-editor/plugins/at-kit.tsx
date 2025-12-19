/**
 * At-Kit Plugin
 *
 * Type "@prompt" to trigger AI completion with ghost text preview:
 * - Prefetches MDX while typing (debounced)
 * - Shows ghost text preview when result is ready
 * - Tab: Accept ghost text (inserts content directly)
 * - Enter: Insert loader element (lazy swaps when API returns)
 * - Escape: Cancel
 */

import { MentionInputPlugin, MentionPlugin } from "@platejs/mention/react";
import { createPlatePlugin } from "platejs/react";
import { type TElement } from "platejs";

import { AtGhostInputElement } from "../ui/at-ghost-input";
import { AtLoaderElement } from "../ui/at-loader-node";

// ============================================================================
// Shared cache for prefetched MDX queries
// ============================================================================

/** Cache of pending MDX generation promises, keyed by prompt */
export const pendingMdxQueries = new Map<string, Promise<{ mdx: string }>>();

// ============================================================================
// At Loader Element - inline loader while waiting for AI
// ============================================================================

export const AT_LOADER_KEY = 'at_loader';

export interface TAtLoaderElement extends TElement {
  type: typeof AT_LOADER_KEY;
  prompt: string;
  children: [{ text: '' }];
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
    children: [{ text: '' }],
  };
}

// ============================================================================
// At Kit - Mention plugin configured for @ trigger
// ============================================================================

export const AtKit = [
  MentionPlugin.configure({
    options: {
      trigger: "@",
      triggerPreviousCharPattern: /^$|^[\s"']$/,
    },
  }).extendPlugin(MentionInputPlugin, {
    render: { node: AtGhostInputElement },
  }),
  AtLoaderPlugin,
];
