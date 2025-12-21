"use client";

/**
 * At Ghost Input - @ trigger with ghost text preview
 *
 * Type "@prompt" to trigger AI completion:
 * - Ghost text appears when prefetch result is ready
 * - Enter: Insert (content if ready, loader for lazy swap if not)
 * - Tab: Retry (re-fetch)
 * - Escape: Cancel
 *
 * Uses EditorContext for tRPC access. Gracefully degrades without backend.
 */

import type { PlateElementProps } from "platejs/react";
import { PlateElement, useEditorRef } from "platejs/react";
import { MarkdownPlugin, serializeMd } from "@platejs/markdown";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { Descendant, TElement } from "platejs";

import { useEditorApi, useHasBackend } from "../../context";
import { pendingMdxQueries, createAtLoaderElement } from "./index";
import { PreviewEditor } from "../../PreviewEditor";

// ============================================================================
// Shimmer Thinking Loader
// ============================================================================

function ThinkingShimmer() {
  return (
    <span className="inline-flex items-center gap-1 ml-1">
      {/* Shimmer bars that look like text being generated */}
      <span className="inline-flex items-center gap-0.5">
        <span
          className="inline-block h-3 w-8 rounded-sm bg-gradient-to-r from-muted via-muted-foreground/20 to-muted bg-[length:200%_100%] animate-[shimmer_1.5s_ease-in-out_infinite]"
          style={{ animationDelay: "0ms" }}
        />
        <span
          className="inline-block h-3 w-12 rounded-sm bg-gradient-to-r from-muted via-muted-foreground/20 to-muted bg-[length:200%_100%] animate-[shimmer_1.5s_ease-in-out_infinite]"
          style={{ animationDelay: "150ms" }}
        />
        <span
          className="inline-block h-3 w-6 rounded-sm bg-gradient-to-r from-muted via-muted-foreground/20 to-muted bg-[length:200%_100%] animate-[shimmer_1.5s_ease-in-out_infinite]"
          style={{ animationDelay: "300ms" }}
        />
      </span>
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </span>
  );
}

// ============================================================================
// Helper: Parse routing prompt from AI response
// ============================================================================

/**
 * Parse routing Prompt from MDX: <Prompt reasoning="low|mid|high" text="..." />
 * Returns null if not a routing prompt.
 */
function parseRoutingPrompt(
  mdx: string
): { reasoning: "low" | "mid" | "high"; text: string } | null {
  const reasoningMatch = mdx.match(/reasoning=["']?(low|mid|high)["']?/);
  if (!reasoningMatch) return null;

  const textMatch = mdx.match(/text="(.+?)"\s*\/?>/);
  if (!textMatch) return null;

  return {
    reasoning: reasoningMatch[1] as "low" | "mid" | "high",
    text: textMatch[1],
  };
}

// ============================================================================
// Helper: Get document context
// ============================================================================

function getDocumentContext(editor: ReturnType<typeof useEditorRef>) {
  try {
    const fullDoc = serializeMd(editor, {
      value: editor.children as TElement[],
    });

    const contextEntry = editor.api.block({ highest: true });
    if (!contextEntry) {
      return { prefix: fullDoc, suffix: "" };
    }

    const currentBlock = serializeMd(editor, {
      value: [contextEntry[0] as TElement],
    });

    const blockIndex = fullDoc.indexOf(currentBlock);
    const prefix =
      blockIndex >= 0
        ? fullDoc.slice(0, blockIndex + currentBlock.length)
        : currentBlock;
    const suffix =
      blockIndex >= 0 ? fullDoc.slice(blockIndex + currentBlock.length) : "";

    return { prefix, suffix };
  } catch {
    return { prefix: "", suffix: "" };
  }
}

// ============================================================================
// Ghost Text Preview Component
// ============================================================================

function AtGhostPreview({ mdx }: { mdx: string }) {
  return (
    <span
      className="block mt-2"
      contentEditable={false}
      style={{ opacity: 0.6, pointerEvents: "none" }}
    >
      <PreviewEditor value={mdx} />
    </span>
  );
}

// ============================================================================
// Action Menu
// ============================================================================

type ActionType = "accept" | "retry" | "reject";

const ACTIONS: { key: ActionType; label: string; shortcut: string }[] = [
  { key: "accept", label: "Accept", shortcut: "↵" },
  { key: "retry", label: "Retry", shortcut: "⇥" },
  { key: "reject", label: "Reject", shortcut: "esc" },
];

function ActionMenu({
  selectedIndex,
  onSelect,
}: {
  selectedIndex: number;
  onSelect: (action: ActionType) => void;
}) {
  return (
    <div className="absolute left-0 top-full mt-1 z-50 rounded-md border bg-popover px-1 py-0.5 shadow-md">
      <div className="flex items-center gap-0.5 text-[11px]">
        {ACTIONS.map((action, idx) => (
          <button
            key={action.key}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault(); // Prevent blur
              onSelect(action.key);
            }}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
              idx === selectedIndex
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50"
            }`}
          >
            <kbd className="inline-flex items-center justify-center min-w-[18px] px-1 py-0.5 text-[10px] font-medium rounded border border-border bg-gradient-to-b from-background to-muted shadow-[0_1px_0_1px_hsl(var(--border)),inset_0_1px_0_hsl(var(--background))]">
              {action.shortcut}
            </kbd>
            <span>{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Basic Mention (fallback when no backend)
// ============================================================================

function BasicMentionInput({
  element,
  children,
  ...props
}: PlateElementProps) {
  const editor = useEditorRef();
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const removeInput = useCallback(() => {
    const path = editor.api.findPath(element);
    if (path) {
      editor.tf.removeNodes({ at: path });
    }
  }, [editor, element]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.key === "Escape") {
        e.preventDefault();
        removeInput();
        if (inputValue) {
          editor.tf.insertText("@" + inputValue + " ");
        }
      } else if (e.key === "Backspace" && inputValue === "") {
        e.preventDefault();
        removeInput();
      }
    },
    [inputValue, removeInput, editor]
  );

  return (
    <PlateElement {...props} element={element} as="span">
      <span contentEditable={false} className="inline-flex items-baseline">
        <span className="inline rounded bg-violet-500/15 px-1 py-0.5 text-violet-600 dark:text-violet-400">
          <span>@</span>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              removeInput();
              if (inputValue) {
                editor.tf.insertText("@" + inputValue + " ");
              }
            }}
            className="inline-block bg-transparent outline-none text-violet-600 dark:text-violet-400 placeholder:text-violet-400/50"
            size={Math.max(1, inputValue.length)}
            placeholder="mention"
            autoComplete="off"
          />
        </span>
      </span>
      {children}
    </PlateElement>
  );
}

// ============================================================================
// Main Input Component (with AI features)
// ============================================================================

export function AtGhostInputElement(props: PlateElementProps) {
  const { children, element } = props;
  const editor = useEditorRef();
  const api = useEditorApi();
  const hasBackend = useHasBackend();

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchIdRef = useRef(0);

  const [inputValue, setInputValue] = useState("");
  const [prefetchedMdx, setPrefetchedMdx] = useState<string | null>(null);
  const [prefetchedPrompt, setPrefetchedPrompt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const [selectedAction, setSelectedAction] = useState(0); // 0=accept, 1=retry, 2=reject
  const retryCountRef = useRef(0);
  const errorsRef = useRef<string[]>([]);
  const isHandlingKeyRef = useRef(false);

  const prompt = inputValue.trim();
  const hasResult = !!(prefetchedMdx && prefetchedPrompt === prompt);

  // Graceful degradation: if no backend, use basic mention
  if (!hasBackend || !api) {
    return <BasicMentionInput {...props} />;
  }

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Fetch MDX for prompt (with routing for low/mid/high complexity)
  const fetchMdx = useCallback(
    (promptText: string, force = false, errors?: string[]) => {
      if (!promptText || !api) return;

      if (force || errors?.length) {
        pendingMdxQueries.delete(promptText);
      }

      let queryPromise = pendingMdxQueries.get(promptText);

      if (!queryPromise) {
        const { prefix, suffix } = getDocumentContext(editor);

        // First call generateMdx (fast router)
        queryPromise = api
          .generateMdx({
            prompt: promptText,
            errors: errors?.length ? errors : undefined,
            prefix,
            suffix,
          })
          .then(async (result) => {
            // Check if this is a routing prompt
            const routing = parseRoutingPrompt(result.mdx);

            if (routing) {
              if (routing.reasoning === "high") {
                // Return as-is for high complexity - Prompt plugin handles it
                return { mdx: `<Prompt text="${routing.text}" />` };
              }

              // Route to block builder for low/mid complexity
              const blockResult = await api.generateMdxBlock({
                prompt: routing.text,
                reasoning: routing.reasoning,
                prefix,
                suffix,
              });
              return blockResult;
            }

            // No routing, return direct result
            return result;
          });

        if (!errors?.length) {
          pendingMdxQueries.set(promptText, queryPromise);
          queryPromise.finally(() => {
            setTimeout(() => pendingMdxQueries.delete(promptText), 5000);
          });
        }
      }

      const currentFetchId = ++fetchIdRef.current;
      setIsLoading(true);
      setPrefetchedMdx(null);
      setPrefetchedPrompt(null);

      queryPromise
        .then((result) => {
          console.log('[at-ghost] received mdx:', result.mdx);
          if (fetchIdRef.current === currentFetchId) {
            setPrefetchedMdx(result.mdx);
            setPrefetchedPrompt(promptText);
          }
        })
        .catch(() => {})
        .finally(() => {
          if (fetchIdRef.current === currentFetchId) {
            setIsLoading(false);
          }
        });
    },
    [api, editor]
  );

  // Debounced prefetch while typing
  useEffect(() => {
    if (!prompt) {
      setPrefetchedMdx(null);
      setPrefetchedPrompt(null);
      setIsLoading(false);
      return;
    }

    if (prefetchedPrompt === prompt && prefetchedMdx) {
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      fetchMdx(prompt);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [prompt, prefetchedPrompt, prefetchedMdx, fetchMdx]);

  // Show hints after short delay
  useEffect(() => {
    if (prompt) {
      const timer = setTimeout(() => setShowHints(true), 500);
      return () => clearTimeout(timer);
    } else {
      setShowHints(false);
    }
  }, [prompt]);

  // Remove the mention input element
  const removeInput = useCallback(() => {
    const path = editor.api.findPath(element);
    if (path) {
      editor.tf.removeNodes({ at: path });
    }
  }, [editor, element]);

  // Insert deserialized content
  const insertContent = useCallback(
    async (mdx: string, promptText: string) => {
      console.log('[at-ghost] insertContent mdx:', mdx);
      try {
        const mdApi = editor.getApi(MarkdownPlugin);
        const deserialized = mdApi.markdown.deserialize(mdx);
        console.log('[at-ghost] insertContent deserialized:', JSON.stringify(deserialized, null, 2));

        if (!deserialized || deserialized.length === 0) {
          throw new Error("Deserialization produced empty result");
        }

        // Determine if content is block-level or inline
        const isBlockContent =
          deserialized.length > 1 ||
          (deserialized.length === 1 && deserialized[0].type !== "p");

        let nodes: Descendant[];
        if (
          deserialized.length === 1 &&
          deserialized[0].type === "p" &&
          deserialized[0].children
        ) {
          // Single paragraph - extract inline children for inline insertion
          nodes = deserialized[0].children;
        } else {
          nodes = deserialized;
        }

        retryCountRef.current = 0;
        errorsRef.current = [];

        // Get the path before removing
        const path = editor.api.findPath(element);
        if (!path) {
          removeInput();
          return;
        }

        if (isBlockContent && path.length > 1) {
          // Block content: insert at block level, not inline
          // path is something like [2, 3] (paragraph index, inline position)
          // We want to insert at [2] (or after it)
          const parentPath = path.slice(0, -1);

          editor.tf.withoutNormalizing(() => {
            // Remove the mention_input
            editor.tf.removeNodes({ at: path });

            // Check if the parent paragraph is now empty (just empty text nodes)
            const parentNode = editor.api.node(parentPath);
            const parentChildren = parentNode?.[0]?.children as Descendant[] | undefined;
            const isParentEmpty = parentChildren?.every((child) =>
              !('type' in child) && (!('text' in child) || child.text === '')
            );

            if (isParentEmpty) {
              // Replace empty paragraph with block content
              editor.tf.removeNodes({ at: parentPath });
              editor.tf.insertNodes(nodes, { at: parentPath });
            } else {
              // Insert block content after the parent paragraph
              const insertPath = [parentPath[0] + 1];
              editor.tf.insertNodes(nodes, { at: insertPath });
            }
          });
        } else {
          // Inline content: insert at the original position
          editor.tf.withoutNormalizing(() => {
            editor.tf.removeNodes({ at: path });
            editor.tf.insertNodes(nodes, { at: path });
          });

          // Only insert trailing space for inline content
          const isInline = nodes.length === 1 && !("type" in nodes[0]);
          if (isInline) {
            editor.tf.insertText(" ");
          }
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);

        if (retryCountRef.current < 3) {
          retryCountRef.current++;
          errorsRef.current = [...errorsRef.current, errorMsg];
          fetchMdx(promptText, true, errorsRef.current);
        } else {
          retryCountRef.current = 0;
          errorsRef.current = [];
          removeInput();
          editor.tf.insertText(mdx + " ");
        }
      }
    },
    [editor, removeInput, fetchMdx]
  );

  // Insert loader element for lazy swap
  const insertLoader = useCallback(() => {
    if (!prompt) return;
    const loaderNode = createAtLoaderElement(prompt);
    removeInput();
    editor.tf.insertNodes(loaderNode);
    editor.tf.insertText(" ");
  }, [editor, prompt, removeInput]);

  // Execute menu action
  const executeAction = useCallback(
    (action: ActionType) => {
      isHandlingKeyRef.current = true;
      switch (action) {
        case "accept":
          if (hasResult && prefetchedMdx) {
            insertContent(prefetchedMdx, prompt);
          } else if (prompt) {
            insertLoader();
          }
          break;
        case "retry":
          if (prompt) {
            retryCountRef.current = 0;
            errorsRef.current = [];
            fetchMdx(prompt, true);
          }
          isHandlingKeyRef.current = false;
          break;
        case "reject":
          removeInput();
          if (inputValue) {
            editor.tf.insertText("@" + inputValue);
          }
          break;
      }
    },
    [hasResult, prefetchedMdx, prompt, inputValue, insertContent, insertLoader, fetchMdx, removeInput, editor]
  );

  // Handle key events
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      // Arrow navigation for action menu
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        setSelectedAction((prev) => {
          if (e.key === "ArrowLeft") return prev > 0 ? prev - 1 : ACTIONS.length - 1;
          return prev < ACTIONS.length - 1 ? prev + 1 : 0;
        });
        return;
      }

      // Execute selected action on Enter
      if (e.key === "Enter") {
        e.preventDefault();
        executeAction(ACTIONS[selectedAction].key);
      } else if (e.key === "Tab") {
        e.preventDefault();
        executeAction("retry");
      } else if (e.key === "Escape") {
        e.preventDefault();
        executeAction("reject");
      } else if (e.key === "Backspace" && inputValue === "") {
        e.preventDefault();
        isHandlingKeyRef.current = true;
        removeInput();
      }
    },
    [selectedAction, inputValue, executeAction, removeInput]
  );

  return (
    <PlateElement {...props} as="span">
      <span contentEditable={false} className="inline-flex items-baseline">
        <span className="relative inline-flex items-baseline">
          <span className="inline rounded bg-violet-500/15 px-1 py-0.5 text-violet-600 dark:text-violet-400">
            <span>@</span>
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => {
                if (isHandlingKeyRef.current) return;
                if (inputValue) {
                  removeInput();
                  editor.tf.insertText("@" + inputValue + " ");
                } else {
                  removeInput();
                }
              }}
              className="inline-block bg-transparent outline-none text-violet-600 dark:text-violet-400 placeholder:text-violet-400/50"
              size={Math.max(1, inputValue.length)}
              placeholder="..."
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
          </span>

          {/* Action menu dropdown */}
          {showHints && prompt && (
            <ActionMenu selectedIndex={selectedAction} onSelect={executeAction} />
          )}
        </span>

        {/* Ghost preview or loading shimmer */}
        {hasResult && prefetchedMdx && (
          <span className="ml-1">
            <AtGhostPreview mdx={prefetchedMdx} />
          </span>
        )}
        {isLoading && !hasResult && <ThinkingShimmer />}
      </span>

      {children}
    </PlateElement>
  );
}
