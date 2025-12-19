"use client";

import { CopilotPlugin } from "@platejs/ai/react";
import { MarkdownPlugin, serializeMd } from "@platejs/markdown";
import type { TElement } from "platejs";

import { PORTS } from "@/lib/ports";

import { GhostText } from "../ui/ghost-text";

import { MarkdownKit } from "./markdown-kit";
import { PageContextPlugin } from "./page-context-kit";

export const CopilotKit = [
  ...MarkdownKit,
  CopilotPlugin.configure(({ api }) => ({
    options: {
      autoTrigger: false, // Enable auto-suggestions as you type
      autoTriggerQuery: () => {
        return false;
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
          console.error("[Copilot] API error:", err);
        },
        onFinish: (_, completion) => {
          // Skip empty/null completions
          if (!completion || completion === "0" || completion.trim() === "") {
            return;
          }

          // Clean up the completion - remove any markdown code block wrappers
          let cleaned = completion;
          if (cleaned.startsWith("```") && cleaned.includes("\n")) {
            const lines = cleaned.split("\n");
            lines.shift(); // Remove opening ```
            if (lines[lines.length - 1]?.trim() === "```") {
              lines.pop(); // Remove closing ```
            }
            cleaned = lines.join("\n");
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
        const title = editor.getOption(PageContextPlugin, "title");
        const description = editor.getOption(PageContextPlugin, "description");

        // Get the full document as markdown for context
        const fullDoc = serializeMd(editor, {
          value: editor.children as TElement[],
        });

        // Get current block for more focused context
        const contextEntry = editor.api.block({ highest: true });
        if (!contextEntry) {
          return "";
        }

        const currentBlock = serializeMd(editor, {
          value: [contextEntry[0] as TElement],
        });

        // Find where current block starts in full doc to split prefix/suffix
        const blockIndex = fullDoc.indexOf(currentBlock);
        const prefix =
          blockIndex >= 0
            ? fullDoc.slice(0, blockIndex) + currentBlock
            : currentBlock;
        const suffix =
          blockIndex >= 0
            ? fullDoc.slice(blockIndex + currentBlock.length)
            : "";

        // Return as JSON that the API will parse
        // The CopilotPlugin sends this as the 'prompt' field
        return JSON.stringify({ prefix, suffix, title, description });
      },
    },
    shortcuts: {
      accept: {
        keys: "tab",
        handler: ({ editor }) => {
          // Get the suggestion text
          const suggestionText = editor.getOption(
            CopilotPlugin,
            "suggestionText"
          );
          if (!suggestionText) return;

          // Clear the suggestion first
          api.copilot.reject();

          // Deserialize the suggestion as MDX/markdown into Plate nodes
          try {
            const markdownApi = editor.getApi(MarkdownPlugin);
            if (markdownApi?.markdown?.deserialize) {
              const nodes = markdownApi.markdown.deserialize(suggestionText);

              if (nodes && nodes.length > 0) {
                // For inline completions (single paragraph), extract just the inline content
                if (nodes.length === 1 && nodes[0].type === "p") {
                  // Insert the children (inline nodes) of the paragraph
                  const inlineNodes = (nodes[0] as TElement).children;
                  editor.tf.insertNodes(inlineNodes);
                } else {
                  // Multi-block: insert all nodes
                  editor.tf.insertNodes(nodes);
                }
                // Add trailing space
                editor.tf.insertText(" ");
                return;
              }
            }
          } catch (err) {
            console.error("[Copilot] Failed to deserialize suggestion:", err);
          }

          // Fallback: insert as plain text
          editor.tf.insertText(suggestionText + " ");
        },
      },
      acceptNextWord: {
        keys: "mod+right",
      },
      reject: {
        keys: "escape",
      },
      triggerSuggestion: {
        keys: "ctrl+space",
      },
    },
  })),
];
