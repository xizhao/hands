'use client';

/**
 * Ghost Prompt Plugin
 *
 * Inline void element that captures a user prompt between backticks,
 * sends it to the AI text-to-sql, and replaces itself with a LiveValue.
 *
 * Flow:
 * 1. User types `some prompt` -> keyDown handler creates ghost_prompt element
 * 2. Component mounts, calls AI text-to-sql
 * 3. On success: replaces itself with LiveValue element
 * 4. On error: converts to inline code
 */

import { createPlatePlugin } from 'platejs/react';
import { type TElement, KEYS } from 'platejs';

import { GhostPromptElement } from '../ui/ghost-prompt-node';

export const GHOST_PROMPT_KEY = 'ghost_prompt';

export interface TGhostPromptElement extends TElement {
  type: typeof GHOST_PROMPT_KEY;
  /** The user's prompt text */
  prompt: string;
  /** Required void element children */
  children: [{ text: '' }];
}

export const GhostPromptPlugin = createPlatePlugin({
  key: GHOST_PROMPT_KEY,
  node: {
    isElement: true,
    isInline: true,
    isVoid: true,
    component: GhostPromptElement,
  },
  handlers: {
    onKeyDown: ({ editor, event }) => {
      // Handle closing backtick
      if (event.key !== '`') return;

      const { selection } = editor;
      if (!selection) return;

      // Don't trigger in code blocks
      const codeBlockEntry = editor.api.some({
        match: { type: editor.getType(KEYS.codeBlock) },
      });
      if (codeBlockEntry) return;

      // Get text before cursor in current block
      const blockEntry = editor.api.block({ highest: true });
      if (!blockEntry) return;

      const [, blockPath] = blockEntry;
      const blockStart = { path: [...blockPath, 0], offset: 0 };
      const cursorPoint = selection.anchor;

      // Get text from block start to cursor
      const textBefore = editor.api.string({
        anchor: blockStart,
        focus: cursorPoint,
      });

      // Find the last opening backtick
      const lastBacktickIndex = textBefore.lastIndexOf('`');
      if (lastBacktickIndex === -1) return;

      // Get the prompt text between backticks
      const promptText = textBefore.slice(lastBacktickIndex + 1).trim();

      // Don't convert empty backticks to ghost prompt - let it become inline code
      if (!promptText) return;

      // Prevent the default backtick insertion
      event.preventDefault();

      // Calculate the range to delete (from backtick to cursor)
      const deleteStart = {
        path: cursorPoint.path,
        offset: cursorPoint.offset - (textBefore.length - lastBacktickIndex),
      };

      // Delete the backtick and prompt text, then insert ghost prompt
      editor.tf.withoutNormalizing(() => {
        editor.tf.delete({
          at: { anchor: deleteStart, focus: cursorPoint },
        });

        const ghostElement = createGhostPromptElement(promptText);
        console.log('[ghost-prompt-kit] Creating element for:', promptText);
        editor.tf.insertNodes(ghostElement);
        editor.tf.move({ unit: 'offset' });
      });
    },
  },
});

export const GhostPromptKit = [GhostPromptPlugin];

/**
 * Helper to create a ghost prompt element
 */
export function createGhostPromptElement(prompt: string): TGhostPromptElement {
  return {
    type: GHOST_PROMPT_KEY,
    prompt,
    children: [{ text: '' }],
  };
}
