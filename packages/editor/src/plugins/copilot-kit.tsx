"use client";

/**
 * Copilot Kit - AI text completion with ghost text preview
 *
 * Uses tRPC from EditorContext for completions.
 * Ctrl+Space to trigger, Tab to accept.
 *
 * Uses async markdown worker for serialization/deserialization
 * to avoid blocking the main thread.
 */

import { CopilotPlugin } from "@platejs/ai/react";
import type { TElement } from "platejs";
import type { PlateEditor } from "platejs/react";
import type { EditorTrpcClient } from "../context";
import { GhostText } from "../ui/ghost-text";

// ============================================================================
// Types
// ============================================================================

export interface CopilotConfig {
  /** tRPC client for completions */
  trpc: EditorTrpcClient;
  /** Async serialize function from markdown worker */
  serialize: (value: TElement[]) => Promise<string>;
  /** Async deserialize function from markdown worker */
  deserialize: (markdown: string) => Promise<TElement[]>;
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
    serialize,
    deserialize,
    autoTrigger = false,
    debounceDelay = 150,
    onError,
    onComplete,
    getPageContext,
    tables = [],
  } = config;

  // Cache for serialized context (updated async, read sync in getPrompt)
  let cachedPrefix = "";
  let cachedSuffix = "";
  let cacheVersion = 0;

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
                prompt:
                  "Continue writing the following text naturally. Output ONLY the continuation, no explanations.",
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

          const contextEntry = editor.api.block({ highest: true });
          if (!contextEntry) return "";

          const [, currentPath] = contextEntry;
          const currentIndex = currentPath[0] ?? 0;
          const children = editor.children as TElement[];

          // Only serialize a window of context (10 blocks before, 5 after) instead of entire doc
          const CONTEXT_BEFORE = 10;
          const CONTEXT_AFTER = 5;
          const startIdx = Math.max(0, currentIndex - CONTEXT_BEFORE);
          const endIdx = Math.min(children.length, currentIndex + CONTEXT_AFTER + 1);

          const prefixBlocks = children.slice(startIdx, currentIndex + 1);
          const suffixBlocks = children.slice(currentIndex + 1, endIdx);

          // Increment version to track this serialization request
          const thisVersion = ++cacheVersion;

          // Start async serialization (fire and forget - will update cache)
          Promise.all([serialize(prefixBlocks), serialize(suffixBlocks)])
            .then(([prefix, suffix]) => {
              // Only update cache if this is still the latest version
              if (thisVersion === cacheVersion) {
                cachedPrefix = prefix;
                cachedSuffix = suffix;
              }
            })
            .catch((err) => {
              console.error("[Copilot] Failed to serialize context:", err);
            });

          // Return cached values (may be stale on first call, but will be fresh on subsequent)
          return JSON.stringify({
            prefix: cachedPrefix,
            suffix: cachedSuffix,
            title,
            description,
          });
        },
      },
      shortcuts: {
        accept: {
          keys: "tab",
          handler: ({ editor }) => {
            const suggestionText = editor.getOption(CopilotPlugin, "suggestionText");
            if (!suggestionText) return;

            api.copilot.reject();

            // Use async worker deserialization
            deserialize(suggestionText)
              .then((nodes) => {
                if (nodes && nodes.length > 0) {
                  if (nodes.length === 1 && nodes[0].type === "p") {
                    // Inline content - insert children and trailing space
                    const inlineNodes = (nodes[0] as TElement).children;
                    editor.tf.insertNodes(inlineNodes);
                    editor.tf.insertText(" ");
                  } else {
                    // Block content - no trailing space (would corrupt selection)
                    editor.tf.insertNodes(nodes);
                  }
                } else {
                  // Fallback to plain text if deserialization returns empty
                  editor.tf.insertText(`${suggestionText} `);
                }
              })
              .catch((err) => {
                console.error("[Copilot] Failed to deserialize:", err);
                // Fallback to plain text on error
                editor.tf.insertText(`${suggestionText} `);
              });
          },
        },
        acceptNextWord: { keys: "mod+right" },
        reject: { keys: "escape" },
        triggerSuggestion: { keys: "ctrl+space" },
      },
    })),
  ];
}
