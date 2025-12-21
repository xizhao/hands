"use client";

/**
 * Copilot Kit - AI text completion with ghost text preview
 *
 * Uses tRPC from EditorContext for completions.
 * Ctrl+Space to trigger, Tab to accept.
 */

import { CopilotPlugin } from "@platejs/ai/react";
import { MarkdownPlugin, serializeMd } from "@platejs/markdown";
import type { TElement } from "platejs";
import type { PlateEditor } from "platejs/react";

import { GhostText } from "../ui/ghost-text";
import type { EditorTrpcClient } from "../context";

// ============================================================================
// Types
// ============================================================================

export interface CopilotConfig {
  /** tRPC client for completions */
  trpc: EditorTrpcClient;
  /** Enable auto-trigger on typing (default: false) */
  autoTrigger?: boolean;
  /** Debounce delay in ms (default: 150) */
  debounceDelay?: number;
  /** Error handler */
  onError?: (error: Error) => void;
  /** Completion handler */
  onComplete?: (completion: string) => void;
  /** Get page context */
  getPageContext?: (editor: PlateEditor) => { title?: string; description?: string };
  /** Get tables for context */
  tables?: Array<{ name: string; columns: string[] }>;
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a CopilotKit that uses tRPC for completions
 */
export function createCopilotKit(config: CopilotConfig) {
  const {
    trpc,
    autoTrigger = false,
    debounceDelay = 150,
    onError,
    onComplete,
    getPageContext,
    tables = [],
  } = config;

  return [
    CopilotPlugin.configure(({ api }) => ({
      options: {
        autoTrigger,
        autoTriggerQuery: () => false,
        debounceDelay,
        renderGhostText: GhostText,
        // Custom completion function using tRPC
        completeOptions: {
          // Use a dummy API - we override with custom fetch
          api: "",
          body: {},
          // Override fetch to use tRPC
          fetch: (async (_input: RequestInfo | URL, init?: RequestInit) => {
            try {
              // Parse the body to get the prompt
              const body = init?.body ? JSON.parse(init.body as string) : {};
              const promptData = body.prompt ? JSON.parse(body.prompt) : {};

              const result = await trpc.ai.generateMdx.mutate({
                prompt: "Continue writing the following text naturally. Output ONLY the continuation, no explanations.",
                prefix: promptData.prefix || "",
                suffix: promptData.suffix || "",
                title: promptData.title,
                description: promptData.description,
                tables,
              });

              // Return a fake Response with the completion
              return new Response(result.mdx, {
                status: 200,
                headers: { "Content-Type": "text/plain" },
              });
            } catch (err) {
              onError?.(err as Error);
              throw err;
            }
          }) as typeof fetch,
          onError: (err) => {
            console.error("[Copilot] Error:", err);
            onError?.(err as Error);
          },
          onFinish: (_, completion) => {
            if (!completion || completion === "0" || completion.trim() === "") {
              return;
            }

            // Clean up markdown code block wrappers
            let cleaned = completion;
            if (cleaned.startsWith("```") && cleaned.includes("\n")) {
              const lines = cleaned.split("\n");
              lines.shift();
              if (lines[lines.length - 1]?.trim() === "```") {
                lines.pop();
              }
              cleaned = lines.join("\n");
            }

            api.copilot.setBlockSuggestion({ text: cleaned });
            onComplete?.(cleaned);
          },
        },
        getPrompt: ({ editor }) => {
          const context = getPageContext?.(editor as PlateEditor) ?? {};
          const { title, description } = context;

          const fullDoc = serializeMd(editor, {
            value: editor.children as TElement[],
          });

          const contextEntry = editor.api.block({ highest: true });
          if (!contextEntry) return "";

          const currentBlock = serializeMd(editor, {
            value: [contextEntry[0] as TElement],
          });

          const blockIndex = fullDoc.indexOf(currentBlock);
          const prefix = blockIndex >= 0
            ? fullDoc.slice(0, blockIndex) + currentBlock
            : currentBlock;
          const suffix = blockIndex >= 0
            ? fullDoc.slice(blockIndex + currentBlock.length)
            : "";

          return JSON.stringify({ prefix, suffix, title, description });
        },
      },
      shortcuts: {
        accept: {
          keys: "tab",
          handler: ({ editor }) => {
            const suggestionText = editor.getOption(CopilotPlugin, "suggestionText");
            if (!suggestionText) return;

            api.copilot.reject();

            try {
              const markdownApi = editor.getApi(MarkdownPlugin);
              if (markdownApi?.markdown?.deserialize) {
                const nodes = markdownApi.markdown.deserialize(suggestionText);

                if (nodes && nodes.length > 0) {
                  if (nodes.length === 1 && nodes[0].type === "p") {
                    const inlineNodes = (nodes[0] as TElement).children;
                    editor.tf.insertNodes(inlineNodes);
                  } else {
                    editor.tf.insertNodes(nodes);
                  }
                  editor.tf.insertText(" ");
                  return;
                }
              }
            } catch (err) {
              console.error("[Copilot] Failed to deserialize:", err);
            }

            editor.tf.insertText(suggestionText + " ");
          },
        },
        acceptNextWord: { keys: "mod+right" },
        reject: { keys: "escape" },
        triggerSuggestion: { keys: "ctrl+space" },
      },
    })),
  ];
}
