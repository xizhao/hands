/**
 * At-Kit Plugin
 *
 * Type "@" to trigger AI completion menu.
 * - Prefetches MDX while typing (debounced)
 * - Shows "Insert" option
 * - Inserts inline loader that uses prefetched result
 */

import { MentionInputPlugin, MentionPlugin } from "@platejs/mention/react";
import { createPlatePlugin } from "platejs/react";
import { type TElement } from "platejs";

import { AtInputElement } from "../ui/at-menu";
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
    render: { node: AtInputElement },
  }),
  AtLoaderPlugin,
];
