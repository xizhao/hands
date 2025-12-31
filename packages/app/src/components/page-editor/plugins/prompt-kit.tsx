"use client";

/**
 * Prompt Plugin
 *
 * Block element that dispatches to a background agent for complex requests.
 * Used when AI can't satisfy a request inline and needs more processing.
 *
 * MDX: <Prompt text="create a form for..." />
 */

import type { MdxJsxAttribute } from "mdast-util-mdx-jsx";
import type { TElement } from "platejs";
import { createPlatePlugin } from "platejs/react";

import { PromptElement } from "../ui/prompt-node";

export const PROMPT_KEY = "prompt";

export interface TPromptElement extends TElement {
  type: typeof PROMPT_KEY;
  /** The prompt text (present when pending, removed when processing) */
  promptText?: string;
  /** OpenCode session/thread ID (present when processing) */
  threadId?: string;
  children: [{ text: "" }];
}

export const PromptPlugin = createPlatePlugin({
  key: PROMPT_KEY,
  node: {
    isElement: true,
    isInline: true,
    isVoid: true,
    component: PromptElement,
  },
});

export const PromptKit = [PromptPlugin];

/**
 * Markdown serialization rules for Prompt element.
 * Used by Editor's customBlocks to handle MDX ↔ Plate conversion.
 */
export const PromptMarkdownRules = {
  // Deserialize <Prompt text="..." /> or <Prompt threadId="..." />
  Prompt: {
    deserialize: (node: any) => {
      const attrs = node.attributes || [];
      let promptText: string | undefined;
      let threadId: string | undefined;
      for (const attr of attrs) {
        if (attr.type === "mdxJsxAttribute") {
          if (attr.name === "text") promptText = attr.value || undefined;
          else if (attr.name === "threadId") threadId = attr.value || undefined;
        }
      }
      return {
        type: PROMPT_KEY,
        promptText,
        threadId,
        children: [{ text: "" }],
      };
    },
  },
  // Serialize prompt element to <Prompt ... />
  [PROMPT_KEY]: {
    serialize: (node: any) => {
      const attrs: MdxJsxAttribute[] = [];
      if (node.threadId) {
        attrs.push({ type: "mdxJsxAttribute", name: "threadId", value: node.threadId });
      } else if (node.promptText) {
        attrs.push({ type: "mdxJsxAttribute", name: "text", value: node.promptText });
      }
      return {
        type: "mdxJsxFlowElement",
        name: "Prompt",
        attributes: attrs,
        children: [],
      };
    },
  },
};

export function createPromptElement(promptText: string): TPromptElement {
  return {
    type: PROMPT_KEY,
    promptText,
    children: [{ text: "" }],
  };
}
