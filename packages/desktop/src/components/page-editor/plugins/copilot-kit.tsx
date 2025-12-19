'use client';

import { CopilotPlugin } from '@platejs/ai/react';
import { serializeMd } from '@platejs/markdown';
import type { TElement } from 'platejs';

import { PORTS } from '@/lib/ports';

import { GhostText } from '../ui/ghost-text';

import { MarkdownKit } from './markdown-kit';
import { PageContextPlugin } from './page-context-kit';

export const CopilotKit = [
  ...MarkdownKit,
  CopilotPlugin.configure(({ api }) => ({
    options: {
      autoTrigger: true, // Enable auto-suggestions as you type
      autoTriggerQuery: ({ editor }) => {
        // Only trigger if there's some text to complete
        const text = editor.api.string([]);
        return text.length > 3; // At least 3 chars before triggering
      },
      completeOptions: {
        api: `http://localhost:${PORTS.RUNTIME}/api/ai/copilot`,
        // Custom fetch with 5s timeout to allow for LLM latency
        fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);
          try {
            return await fetch(input, {
              ...init,
              signal: controller.signal,
            });
          } finally {
            clearTimeout(timeout);
          }
        }) as typeof fetch,
        onError: (err) => {
          console.error('[Copilot] API error:', err);
        },
        onFinish: (_, completion) => {
          // Skip empty/null completions
          if (!completion || completion === '0' || completion.trim() === '') {
            return;
          }

          // Clean up the completion - remove any markdown code block wrappers
          let cleaned = completion;
          if (cleaned.startsWith('```') && cleaned.includes('\n')) {
            const lines = cleaned.split('\n');
            lines.shift(); // Remove opening ```
            if (lines[lines.length - 1]?.trim() === '```') {
              lines.pop(); // Remove closing ```
            }
            cleaned = lines.join('\n');
          }

          api.copilot.setBlockSuggestion({
            text: cleaned,
          });
        },
      },
      debounceDelay: 150, // Fast - Plate auto-cancels in-flight requests
      renderGhostText: GhostText,
      getPrompt: ({ editor }) => {
        // Get page context (title, description) from PageContextPlugin
        const title = editor.getOption(PageContextPlugin, 'title');
        const description = editor.getOption(PageContextPlugin, 'description');

        // Get the full document as markdown for context
        const fullDoc = serializeMd(editor, { value: editor.children as TElement[] });

        // Get current block for more focused context
        const contextEntry = editor.api.block({ highest: true });
        if (!contextEntry) {
          return '';
        }

        const currentBlock = serializeMd(editor, {
          value: [contextEntry[0] as TElement],
        });

        // Find where current block starts in full doc to split prefix/suffix
        const blockIndex = fullDoc.indexOf(currentBlock);
        const prefix = blockIndex >= 0
          ? fullDoc.slice(0, blockIndex) + currentBlock
          : currentBlock;
        const suffix = blockIndex >= 0
          ? fullDoc.slice(blockIndex + currentBlock.length)
          : '';

        // Return as JSON that the API will parse
        // The CopilotPlugin sends this as the 'prompt' field
        return JSON.stringify({ prefix, suffix, title, description });
      },
    },
    shortcuts: {
      accept: {
        keys: 'tab',
      },
      acceptNextWord: {
        keys: 'mod+right',
      },
      reject: {
        keys: 'escape',
      },
      triggerSuggestion: {
        keys: 'ctrl+space',
      },
    },
  })),
];
