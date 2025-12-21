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
  usePluginOption,
} from "platejs/react";
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

import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { useManifest } from "@/hooks/useRuntimeState";
import { useCreateSession, useSendMessage } from "@/hooks/useSession";
import { createAtLoaderElement, pendingMdxQueries } from "../plugins/at-kit";
import { PROMPT_KEY, type TPromptElement } from "../plugins/prompt-kit";
import { PageContextPlugin } from "../plugins/page-context-kit";
import { EditorKit } from "../editor-kit";

// Type guard for Prompt elements that need session creation
function isPendingPrompt(node: Descendant): node is TPromptElement & { promptText: string } {
  return (
    'type' in node &&
    node.type === PROMPT_KEY &&
    'promptText' in node &&
    typeof node.promptText === 'string' &&
    !('threadId' in node && node.threadId)
  );
}

// Parse routing Prompt from MDX: <Prompt reasoning="low|mid|high" text="..." />
function parseRoutingPrompt(mdx: string): { reasoning: "low" | "mid" | "high"; text: string } | null {
  // Match reasoning attribute
  const reasoningMatch = mdx.match(/reasoning=["']?(low|mid|high)["']?/);
  if (!reasoningMatch) return null;

  // Match text attribute - text is in double quotes, may contain single quotes
  // Look for text="..." where ... ends at " followed by space or />
  const textMatch = mdx.match(/text="(.+?)"\s*\/?>/);
  if (!textMatch) return null;

  return { reasoning: reasoningMatch[1] as "low" | "mid" | "high", text: textMatch[1] };
}

// Build system prompt for Hands agent
function buildPromptSystemMessage(pageId?: string, tables?: Array<{ name: string; columns: string[] }>) {
  const schemaContext = tables?.length
    ? `Available tables:\n${tables.map(t => `- ${t.name}(${t.columns.join(', ')})`).join('\n')}`
    : '';

  return `You are editing an MDX page file. Your task is to replace the <Prompt> element with appropriate MDX content.

**File to edit:** source://${pageId}

${schemaContext}

## Available MDX Components

- \`<LiveValue query="SQL" />\` - Display live data (auto-selects inline/list/table based on result shape)
- \`<LiveValue query="SQL" display="inline" />\` - Inline value in text
- \`<LiveAction sql="SQL"><Button>Label</Button></LiveAction>\` - Interactive button that runs SQL

## Instructions

1. Read the page file at source://${pageId}
2. Find the <Prompt text="..."> element
3. Use the edit tool to REPLACE the <Prompt> line with your generated MDX content
4. Generate ONLY valid MDX - no code fences, no explanations`;
}

// ============================================================================
// Ghost Text Preview Component
// ============================================================================

function AtGhostPreview({ mdx, editor: mainEditor }: { mdx: string; editor: ReturnType<typeof useEditorRef> }) {
  // Deserialize and render using the main editor's plugins
  const ghostEditor = useMemo(() => {
    if (!mdx) return null;

    try {
      const api = mainEditor.getApi(MarkdownPlugin);
      const deserialized = api.markdown.deserialize(mdx);
      console.log('[ghost-preview] Parsed MDX:', JSON.stringify(deserialized, null, 2));

      if (!deserialized || deserialized.length === 0) return null;

      // Unwrap single paragraph for inline display
      let nodes: Descendant[];
      if (deserialized.length === 1 && deserialized[0].type === "p" && deserialized[0].children) {
        nodes = deserialized[0].children;
      } else {
        nodes = deserialized;
      }

      // Wrap in a paragraph for the ghost editor
      return createPlateEditor({
        plugins: EditorKit,
        value: [{ type: "p", children: nodes }] as TElement[],
      });
    } catch (err) {
      console.error('[ghost-preview] Parse error:', err);
      return null;
    }
  }, [mdx, mainEditor]);

  if (!ghostEditor) {
    return <span className="opacity-40">{mdx}</span>;
  }

  return (
    <span className="inline opacity-50 [&_p]:inline [&_p]:m-0 [&_.my-1]:my-0">
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

// Helper to get document context (prefix/suffix around cursor)
function getDocumentContext(editor: ReturnType<typeof useEditorRef>) {
  try {
    // Get the full document as markdown
    const fullDoc = serializeMd(editor, {
      value: editor.children as TElement[],
    });

    // Get current block for cursor position
    const contextEntry = editor.api.block({ highest: true });
    if (!contextEntry) {
      return { prefix: fullDoc, suffix: "" };
    }

    const currentBlock = serializeMd(editor, {
      value: [contextEntry[0] as TElement],
    });

    // Find where current block starts in full doc to split prefix/suffix
    const blockIndex = fullDoc.indexOf(currentBlock);
    const prefix = blockIndex >= 0
      ? fullDoc.slice(0, blockIndex + currentBlock.length)
      : currentBlock;
    const suffix = blockIndex >= 0
      ? fullDoc.slice(blockIndex + currentBlock.length)
      : "";

    return { prefix, suffix };
  } catch {
    return { prefix: "", suffix: "" };
  }
}

export function AtGhostInputElement(props: PlateElementProps) {
  const { children, element } = props;
  const editor = useEditorRef();
  const { data: manifest } = useManifest();
  const pageId = usePluginOption(PageContextPlugin, 'pageId');
  const title = usePluginOption(PageContextPlugin, 'title');
  const description = usePluginOption(PageContextPlugin, 'description');

  // Session hooks for Prompt elements (hooks handle directory internally)
  const createSession = useCreateSession();
  const sendMessage = useSendMessage();

  const generateMdx = trpc.ai.generateMdx.useMutation({
    onError: () => {}, // Suppress global error handler - we handle locally
  });
  const generateMdxBlock = trpc.ai.generateMdxBlock.useMutation({
    onError: () => {},
  });
  const generateMdxRef = useRef(generateMdx);
  const generateMdxBlockRef = useRef(generateMdxBlock);
  generateMdxRef.current = generateMdx;
  generateMdxBlockRef.current = generateMdxBlock;

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchIdRef = useRef(0); // Track fetch generation for retry

  const [inputValue, setInputValue] = useState("");
  const [prefetchedMdx, setPrefetchedMdx] = useState<string | null>(null);
  const [prefetchedPrompt, setPrefetchedPrompt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isThinking, setIsThinking] = useState(false); // Block builder route active
  const [showHints, setShowHints] = useState(false);
  const retryCountRef = useRef(0);
  const errorsRef = useRef<string[]>([]);
  const isHandlingKeyRef = useRef(false); // Prevent blur during key handling

  const prompt = inputValue.trim();
  const hasResult = !!(prefetchedMdx && prefetchedPrompt === prompt);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Fetch MDX for prompt (with optional error context for retries)
  // Handles routing: if autocomplete returns <Prompt reasoning="low|mid">, calls generateMdxBlock
  const fetchMdx = useCallback((promptText: string, force = false, errors?: string[]) => {
    if (!promptText) return;

    // Clear cache if forcing retry or if we have errors
    if (force || errors?.length) {
      pendingMdxQueries.delete(promptText);
    }

    let queryPromise = pendingMdxQueries.get(promptText);

    if (!queryPromise) {
      const tables = (manifest?.tables ?? []).map((t) => ({
        name: t.name,
        columns: t.columns,
      }));

      // Get document context (prefix/suffix around cursor)
      const { prefix, suffix } = getDocumentContext(editor);

      // First call autocomplete (fast router)
      queryPromise = generateMdxRef.current.mutateAsync({
        prompt: promptText,
        tables,
        errors: errors?.length ? errors : undefined,
        prefix,
        suffix,
        title: title ?? undefined,
        description: description ?? undefined,
      }).then(async (result) => {
        // Check if this is a routing prompt
        const routing = parseRoutingPrompt(result.mdx);

        if (routing) {
          console.log('[at-ghost] Routing detected:', routing);

          if (routing.reasoning === "high") {
            // Return as-is for high complexity - insertContent will create agent session
            return { mdx: `<Prompt text="${routing.text}" />` };
          }

          // Show "thinking..." for block builder route
          setIsThinking(true);

          // Route to block builder for low/mid complexity
          const blockResult = await generateMdxBlockRef.current.mutateAsync({
            prompt: routing.text,
            tables,
            reasoning: routing.reasoning,
            prefix,
            suffix,
            title: title ?? undefined,
            description: description ?? undefined,
          });

          setIsThinking(false);
          return blockResult;
        }

        // No routing, return direct result
        return result;
      });

      // Only cache if no errors (don't cache retry requests)
      if (!errors?.length) {
        pendingMdxQueries.set(promptText, queryPromise);
        queryPromise.finally(() => {
          setTimeout(() => pendingMdxQueries.delete(promptText), 5000);
        });
      }
    }

    const currentFetchId = ++fetchIdRef.current;
    setIsLoading(true);
    setIsThinking(false);
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
          setIsThinking(false);
        }
      });
  }, [manifest?.tables, editor, title, description]);

  // Debounced prefetch while typing
  useEffect(() => {
    if (!prompt) {
      setPrefetchedMdx(null);
      setPrefetchedPrompt(null);
      setIsLoading(false);
      setIsThinking(false);
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
  // If content contains a Prompt element, create session first and insert with threadId
  // Auto-retries on error up to 3 times
  const insertContent = useCallback(
    async (mdx: string, promptText: string) => {
      console.log('[at-ghost] Received MDX to insert:', JSON.stringify(mdx));
      try {
        const mdApi = editor.getApi(MarkdownPlugin);
        const deserialized = mdApi.markdown.deserialize(mdx);
        console.log('[at-ghost] Deserialized nodes:', JSON.stringify(deserialized, null, 2));

        if (!deserialized || deserialized.length === 0) {
          throw new Error("Deserialization produced empty result");
        }

        // Unwrap single paragraph for inline insertion
        let nodes: Descendant[];
        if (deserialized.length === 1 && deserialized[0].type === "p" && deserialized[0].children) {
          nodes = deserialized[0].children;
          console.log('[at-ghost] Unwrapped to:', JSON.stringify(nodes, null, 2));
        } else {
          nodes = deserialized;
        }

        // For any pending Prompt nodes, create session and replace with threadId
        const preparedNodes = await Promise.all(
          nodes.map(async (node) => {
            if (!isPendingPrompt(node)) return node;

            const session = await createSession.mutateAsync({
              title: node.promptText.slice(0, 50),
            });

            sendMessage.mutate({
              sessionId: session.id,
              content: node.promptText,
              system: buildPromptSystemMessage(pageId, manifest?.tables),
            });

            return { ...node, promptText: undefined, threadId: session.id };
          })
        );
        nodes = preparedNodes;

        retryCountRef.current = 0;
        errorsRef.current = [];
        removeInput();
        editor.tf.insertNodes(nodes);
        // Add trailing space and position cursor after
        editor.tf.insertText(" ");
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);

        // Auto-retry up to 3 times
        if (retryCountRef.current < 3) {
          retryCountRef.current++;
          errorsRef.current = [...errorsRef.current, errorMsg];
          console.log(`[at-ghost] Retry ${retryCountRef.current}/3 due to error:`, errorMsg);
          fetchMdx(promptText, true, errorsRef.current);
        } else {
          // Max retries reached, insert as plain text
          console.warn("[at-ghost] Max retries reached, inserting as plain text");
          retryCountRef.current = 0;
          errorsRef.current = [];
          removeInput();
          editor.tf.insertText(mdx + " ");
        }
      }
    },
    [editor, removeInput, fetchMdx, createSession, sendMessage, manifest?.tables]
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
        isHandlingKeyRef.current = true;
        console.log('[at-ghost] Enter pressed:', { hasResult, prefetchedMdx: prefetchedMdx?.slice(0, 50), prompt });
        if (hasResult && prefetchedMdx) {
          insertContent(prefetchedMdx, prompt);
        } else if (prompt) {
          console.log('[at-ghost] No result ready, inserting loader');
          insertLoader();
        }
      } else if (e.key === "Tab") {
        // Retry: force re-fetch (reset error state)
        e.preventDefault();
        isHandlingKeyRef.current = true;
        if (prompt) {
          retryCountRef.current = 0;
          errorsRef.current = [];
          fetchMdx(prompt, true);
        }
        isHandlingKeyRef.current = false;
      } else if (e.key === "Escape") {
        // Cancel
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
        {/* @ trigger + input wrapper - dropdown anchors here */}
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
                // Skip if we're handling a key action (Enter/Tab/Escape)
                if (isHandlingKeyRef.current) {
                  console.log('[at-ghost] Blur skipped - handling key');
                  return;
                }
                console.log('[at-ghost] Blur triggered');
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

          {/* Hints dropdown - anchored under @prompt */}
          {showHints && prompt && <HintsDropdown hasResult={hasResult} isLoading={isLoading} />}
        </span>

        {/* Ghost preview - after the input area */}
        {hasResult && prefetchedMdx && (
          <span className="ml-1">
            <AtGhostPreview mdx={prefetchedMdx} editor={editor} />
          </span>
        )}

        {/* Loading indicator */}
        {isLoading && !hasResult && (
          <span className="ml-1 opacity-40 italic">
            {isThinking ? "thinking..." : "..."}
          </span>
        )}
      </span>

      {children}
    </PlateElement>
  );
}
