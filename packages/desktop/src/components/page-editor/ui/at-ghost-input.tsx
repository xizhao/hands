/**
 * At Ghost Input - @ trigger with ghost text preview
 *
 * Type "@prompt" to trigger AI completion:
 * - Ghost text appears when prefetch result is ready
 * - Enter: Insert (content if ready, loader for lazy swap if not)
 * - Tab: Retry (re-fetch)
 * - Escape: Cancel
 */

import type { PlateElementProps } from "platejs/react";
import {
  createPlateEditor,
  Plate,
  PlateContent,
  PlateElement,
  useEditorRef,
} from "platejs/react";
import { MarkdownPlugin } from "@platejs/markdown";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
  type KeyboardEvent,
} from "react";
import type { TElement } from "platejs";

import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { useManifest } from "@/hooks/useRuntimeState";
import { createAtLoaderElement, pendingMdxQueries } from "../plugins/at-kit";
import { EditorKit } from "../editor-kit";

// ============================================================================
// Ghost Text Preview Component
// ============================================================================

function AtGhostPreview({ mdx, editor: mainEditor }: { mdx: string; editor: ReturnType<typeof useEditorRef> }) {
  // Deserialize and render inline using the main editor's plugins
  const ghostEditor = useMemo(() => {
    if (!mdx) return null;

    try {
      const api = mainEditor.getApi(MarkdownPlugin);
      let parsed = api.markdown.deserialize(mdx);

      if (!parsed || parsed.length === 0) return null;

      // Unwrap single paragraph for inline display
      if (parsed.length === 1 && parsed[0].type === "p" && parsed[0].children) {
        parsed = parsed[0].children;
      }

      // Wrap in a paragraph for the ghost editor
      return createPlateEditor({
        plugins: EditorKit,
        value: [{ type: "p", children: parsed }] as TElement[],
      });
    } catch {
      return null;
    }
  }, [mdx, mainEditor]);

  if (!ghostEditor) {
    return <span className="opacity-40">{mdx}</span>;
  }

  return (
    <span className="inline opacity-50 [&_p]:inline [&_p]:m-0">
      <Plate editor={ghostEditor} readOnly>
        <PlateContent className="inline [&>div]:inline" readOnly />
      </Plate>
    </span>
  );
}

// ============================================================================
// Hints Dropdown
// ============================================================================

function HintsDropdown({ hasResult, isLoading }: { hasResult: boolean; isLoading: boolean }) {
  return (
    <div className="absolute left-0 top-full mt-1 z-50 min-w-[140px] rounded-md border bg-popover p-1 shadow-md">
      <div className="flex flex-col gap-0.5 text-xs">
        <div className="flex items-center justify-between px-2 py-1 rounded hover:bg-accent">
          <span className={cn(hasResult ? "text-foreground" : "text-muted-foreground")}>
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
// Main Input Component
// ============================================================================

export function AtGhostInputElement(props: PlateElementProps) {
  const { children, element } = props;
  const editor = useEditorRef();
  const { data: manifest } = useManifest();

  const generateMdx = trpc.ai.generateMdx.useMutation();
  const generateMdxRef = useRef(generateMdx);
  generateMdxRef.current = generateMdx;

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchIdRef = useRef(0); // Track fetch generation for retry

  const [inputValue, setInputValue] = useState("");
  const [prefetchedMdx, setPrefetchedMdx] = useState<string | null>(null);
  const [prefetchedPrompt, setPrefetchedPrompt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showHints, setShowHints] = useState(false);

  const prompt = inputValue.trim();
  const hasResult = !!(prefetchedMdx && prefetchedPrompt === prompt);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Fetch MDX for prompt
  const fetchMdx = useCallback((promptText: string, force = false) => {
    if (!promptText) return;

    // Clear cache if forcing retry
    if (force) {
      pendingMdxQueries.delete(promptText);
    }

    let queryPromise = pendingMdxQueries.get(promptText);

    if (!queryPromise) {
      const tables = (manifest?.tables ?? []).map((t) => ({
        name: t.name,
        columns: t.columns,
      }));

      queryPromise = generateMdxRef.current.mutateAsync({ prompt: promptText, tables });
      pendingMdxQueries.set(promptText, queryPromise);

      queryPromise.finally(() => {
        setTimeout(() => pendingMdxQueries.delete(promptText), 5000);
      });
    }

    const currentFetchId = ++fetchIdRef.current;
    setIsLoading(true);
    setPrefetchedMdx(null);
    setPrefetchedPrompt(null);

    queryPromise
      .then((result) => {
        // Only update if this is still the current fetch
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
  }, [manifest?.tables]);

  // Debounced prefetch while typing
  useEffect(() => {
    if (!prompt) {
      setPrefetchedMdx(null);
      setPrefetchedPrompt(null);
      setIsLoading(false);
      return;
    }

    // Already have result for this prompt
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

  // Insert deserialized content directly, with trailing space
  const insertContent = useCallback(
    (mdx: string) => {
      try {
        const api = editor.getApi(MarkdownPlugin);
        let nodes = api.markdown.deserialize(mdx);

        // Unwrap single paragraph for inline insertion
        if (nodes?.length === 1 && nodes[0].type === "p" && nodes[0].children) {
          nodes = nodes[0].children;
        }

        if (nodes?.length > 0) {
          removeInput();
          editor.tf.insertNodes(nodes as any);
          // Add trailing space and position cursor after
          editor.tf.insertText(" ");
        }
      } catch {
        removeInput();
        editor.tf.insertText(mdx + " ");
      }
    },
    [editor, removeInput]
  );

  // Insert loader element for lazy swap
  const insertLoader = useCallback(() => {
    if (!prompt) return;
    const loaderNode = createAtLoaderElement(prompt);
    removeInput();
    editor.tf.insertNodes(loaderNode);
    // Add trailing space - cursor will be after it
    editor.tf.insertText(" ");
  }, [editor, prompt, removeInput]);

  // Handle key events
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        // Insert: content if ready, loader if not
        e.preventDefault();
        if (hasResult && prefetchedMdx) {
          insertContent(prefetchedMdx);
        } else if (prompt) {
          insertLoader();
        }
      } else if (e.key === "Tab") {
        // Retry: force re-fetch
        e.preventDefault();
        if (prompt) {
          fetchMdx(prompt, true);
        }
      } else if (e.key === "Escape") {
        // Cancel
        e.preventDefault();
        removeInput();
        if (inputValue) {
          editor.tf.insertText("@" + inputValue);
        }
      } else if (e.key === "Backspace" && inputValue === "") {
        e.preventDefault();
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
      <span contentEditable={false} className="relative inline-flex items-baseline">
        {/* @ trigger */}
        <span className="text-violet-500">@</span>

        {/* Inline input */}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (inputValue) {
              removeInput();
              editor.tf.insertText("@" + inputValue + " ");
            } else {
              removeInput();
            }
          }}
          className="inline bg-transparent outline-none text-inherit min-w-[1ch]"
          style={{ width: `${Math.max(1, inputValue.length)}ch` }}
          placeholder="..."
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />

        {/* Ghost preview */}
        {hasResult && prefetchedMdx && (
          <span className="ml-1">
            <AtGhostPreview mdx={prefetchedMdx} editor={editor} />
          </span>
        )}

        {/* Loading indicator */}
        {isLoading && !hasResult && (
          <span className="ml-1 opacity-40">...</span>
        )}

        {/* Hints dropdown */}
        {showHints && prompt && <HintsDropdown hasResult={hasResult} isLoading={isLoading} />}
      </span>

      {children}
    </PlateElement>
  );
}
