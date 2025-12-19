'use client';

/**
 * Prompt Plugin
 *
 * Block element that dispatches to a background agent for complex requests.
 * Used when AI can't satisfy a request inline and needs more processing.
 *
 * MDX: <Prompt text="create a form for..." />
 */

import { createPlatePlugin } from 'platejs/react';
import { type TElement } from 'platejs';

import { PromptElement } from '../ui/prompt-node';

export const PROMPT_KEY = 'prompt';

export interface TPromptElement extends TElement {
  type: typeof PROMPT_KEY;
  /** The prompt text for the background agent */
  text: string;
  /** Status of the agent processing */
  status?: 'pending' | 'processing' | 'complete' | 'error';
  /** Error message if failed */
  error?: string;
  children: [{ text: '' }];
}

export const PromptPlugin = createPlatePlugin({
  key: PROMPT_KEY,
  node: {
    isElement: true,
    isVoid: true,
    component: PromptElement,
  },
});

export const PromptKit = [PromptPlugin];

export function createPromptElement(text: string): TPromptElement {
  return {
    type: PROMPT_KEY,
    text,
    status: 'pending',
    children: [{ text: '' }],
  };
}
