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
import { PlateStatic } from "platejs/static";
import { MarkdownPlugin, serializeMd } from "@platejs/markdown";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
  type KeyboardEvent,
} from "react";
import type { Descendant, TElement } from "platejs";

import { useEditorApi, useHasBackend } from "../../context";
import { FullKit, StaticComponents } from "../presets";
import { pendingMdxQueries, createAtLoaderElement } from "./index";

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

function AtGhostPreview({
  mdx,
  editor: mainEditor,
}: {
  mdx: string;
  editor: ReturnType<typeof useEditorRef>;
}) {
  const nodes = useMemo(() => {
    if (!mdx) return null;

    try {
      const api = mainEditor.getApi(MarkdownPlugin);
      const deserialized = api.markdown.deserialize(mdx);

      if (!deserialized || deserialized.length === 0) return null;

      // Unwrap single paragraph for inline display
      if (
        deserialized.length === 1 &&
        deserialized[0].type === "p" &&
        deserialized[0].children
      ) {
        return deserialized[0].children;
      }
      return deserialized;
    } catch (err) {
      console.error("[ghost-preview] Parse error:", err);
      return null;
    }
  }, [mdx, mainEditor]);

  if (!nodes) {
    return <span className="opacity-40">{mdx}</span>;
  }

  // Render nodes using PlateStatic with main editor's plugins
  return (
    <span className="inline opacity-50">
      <PlateStatic
        editor={mainEditor}
        value={[{ type: "p", children: nodes }] as TElement[]}
        className="inline [&>div]:inline [&_p]:inline [&_p]:m-0"
      />
    </span>
  );
}

// ============================================================================
// Hints Dropdown
// ============================================================================

function HintsDropdown({
  hasResult,
  isLoading,
}: {
  hasResult: boolean;
  isLoading: boolean;
}) {
  return (
    <div className="absolute left-0 top-full mt-1 z-50 min-w-[140px] rounded-md border bg-popover p-1 shadow-md">
      <div className="flex flex-col gap-0.5 text-xs">
        <div className="flex items-center justify-between px-2 py-1 rounded hover:bg-accent">
          <span
            className={hasResult ? "text-foreground" : "text-muted-foreground"}
          >
            {hasResult ? "Insert" : isLoading ? "Loading..." : "Insert"}
          </span>
          <kbd className="ml-2 px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px]">
            Enter
          </kbd>
        </div>
        <div className="flex items-center justify-between px-2 py-1 rounded hover:bg-accent">
          <span className="text-muted-foreground">Retry</span>
          <kbd className="ml-2 px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px]">
            Tab
          </kbd>
        </div>
        <div className="flex items-center justify-between px-2 py-1 rounded hover:bg-accent">
          <span className="text-muted-foreground">Cancel</span>
          <kbd className="ml-2 px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px]">
            Esc
          </kbd>
        </div>
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

  // Fetch MDX for prompt
  const fetchMdx = useCallback(
    (promptText: string, force = false, errors?: string[]) => {
      if (!promptText || !api) return;

      if (force || errors?.length) {
        pendingMdxQueries.delete(promptText);
      }

      let queryPromise = pendingMdxQueries.get(promptText);

      if (!queryPromise) {
        const { prefix, suffix } = getDocumentContext(editor);

        queryPromise = api.generateMdx({
          prompt: promptText,
          errors: errors?.length ? errors : undefined,
          prefix,
          suffix,
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
      try {
        const mdApi = editor.getApi(MarkdownPlugin);
        const deserialized = mdApi.markdown.deserialize(mdx);

        if (!deserialized || deserialized.length === 0) {
          throw new Error("Deserialization produced empty result");
        }

        let nodes: Descendant[];
        if (
          deserialized.length === 1 &&
          deserialized[0].type === "p" &&
          deserialized[0].children
        ) {
          nodes = deserialized[0].children;
        } else {
          nodes = deserialized;
        }

        retryCountRef.current = 0;
        errorsRef.current = [];
        removeInput();
        editor.tf.insertNodes(nodes);
        editor.tf.insertText(" ");
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

  // Handle key events
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        isHandlingKeyRef.current = true;
        if (hasResult && prefetchedMdx) {
          insertContent(prefetchedMdx, prompt);
        } else if (prompt) {
          insertLoader();
        }
      } else if (e.key === "Tab") {
        e.preventDefault();
        isHandlingKeyRef.current = true;
        if (prompt) {
          retryCountRef.current = 0;
          errorsRef.current = [];
          fetchMdx(prompt, true);
        }
        isHandlingKeyRef.current = false;
      } else if (e.key === "Escape") {
        e.preventDefault();
        isHandlingKeyRef.current = true;
        removeInput();
        if (inputValue) {
          editor.tf.insertText("@" + inputValue);
        }
      } else if (e.key === "Backspace" && inputValue === "") {
        e.preventDefault();
        isHandlingKeyRef.current = true;
        removeInput();
      }
    },
    [
      hasResult,
      prefetchedMdx,
      prompt,
      inputValue,
      insertContent,
      insertLoader,
      fetchMdx,
      removeInput,
      editor,
    ]
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

          {showHints && prompt && (
            <HintsDropdown hasResult={hasResult} isLoading={isLoading} />
          )}
        </span>

        {hasResult && prefetchedMdx && (
          <span className="ml-1">
            <AtGhostPreview mdx={prefetchedMdx} editor={editor} />
          </span>
        )}

        {isLoading && !hasResult && (
          <span className="ml-1 opacity-40 italic">...</span>
        )}
      </span>

      {children}
    </PlateElement>
  );
}
