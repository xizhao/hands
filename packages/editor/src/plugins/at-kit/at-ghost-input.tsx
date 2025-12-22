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
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { Descendant, TElement } from "platejs";
import { MagnifyingGlass } from "@phosphor-icons/react";

import { useEditorApi, useHasBackend } from "../../context";
import { pendingMdxQueries, createAtLoaderElement } from "./index";
import { PreviewEditor } from "../../PreviewEditor";
import { groups as slashMenuGroups } from "../../ui/slash-menu-items";

// ============================================================================
// Shimmer Styles (used for text and loading indicators)
// ============================================================================

const SHIMMER_STYLES = `
  .shimmer-text {
    background: linear-gradient(
      90deg,
      #a78bfa 0%,
      #c4b5fd 25%,
      #b4a3fc 50%,
      #c4b5fd 75%,
      #a78bfa 100%
    );
    background-size: 200% 100%;
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: text-shimmer 2.3s ease-in-out infinite;
  }
  .shimmer-text::placeholder {
    -webkit-text-fill-color: #a78bfa;
    opacity: 0.6;
  }
  @keyframes text-shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
`;

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
// Block Picker - searchable list of all insertable blocks
// ============================================================================

interface BlockItem {
  id: string;
  label: string;
  description: string;
  group: string;
  icon?: React.ReactNode;
  keywords?: string[];
  /** If true, this is a special "build with AI" item */
  isAiBuild?: boolean;
  onSelect: (editor: ReturnType<typeof useEditorRef>) => void;
}

// Hands Logo icon for "Build with Hands"
function HandsIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
      <path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2" />
      <path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </svg>
  );
}

/** Get all insertable blocks from stdlib and slash menu */
function useBlockItems(): BlockItem[] {
  return useMemo(() => {
    const items: BlockItem[] = [];

    // Add slash menu items (basic blocks, media, etc.)
    for (const group of slashMenuGroups) {
      // Skip non-insertable groups
      if (["Turn into", "Actions", "Text color", "Background color"].includes(group.group)) {
        continue;
      }

      for (const item of group.items) {
        items.push({
          id: `slash:${item.value}`,
          label: item.label || item.value,
          description: item.description || "",
          group: group.group,
          icon: item.icon,
          keywords: item.keywords,
          onSelect: (editor) => item.onSelect(editor, item.value),
        });
      }
    }

    return items;
  }, []);
}

function BlockPicker({
  searchQuery,
  selectedIndex,
  onSelect,
  onBuildWithHands,
}: {
  searchQuery: string;
  selectedIndex: number;
  onSelect: (item: BlockItem) => void;
  onBuildWithHands: (query: string) => void;
}) {
  const allItems = useBlockItems();
  const listRef = useRef<HTMLDivElement>(null);

  // Filter items based on search
  const filteredItems = useMemo(() => {
    if (!searchQuery) return allItems;

    const query = searchQuery.toLowerCase();
    return allItems.filter((item) => {
      const labelMatch = item.label.toLowerCase().includes(query);
      const descMatch = item.description.toLowerCase().includes(query);
      const keywordMatch = item.keywords?.some((k) => k.toLowerCase().includes(query));
      return labelMatch || descMatch || keywordMatch;
    });
  }, [allItems, searchQuery]);

  // Group filtered items
  const groupedItems = useMemo(() => {
    const groups: { group: string; items: BlockItem[] }[] = [];
    const groupMap = new Map<string, BlockItem[]>();

    for (const item of filteredItems) {
      if (!groupMap.has(item.group)) {
        groupMap.set(item.group, []);
      }
      groupMap.get(item.group)!.push(item);
    }

    for (const [group, items] of groupMap) {
      groups.push({ group, items });
    }

    return groups;
  }, [filteredItems]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && selectedIndex >= 0) {
      const selectedEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      selectedEl?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  // "Build with Hands" is always index 0, then filtered items follow
  let flatIndex = 0;

  // Description for "Build with Hands" based on search query
  const buildDescription = searchQuery
    ? `Generate "${searchQuery}" with AI`
    : "Use AI to create any block";

  return (
    <div
      ref={listRef}
      className="absolute left-0 top-full mt-1 z-50 w-72 max-h-64 overflow-y-auto rounded-md border bg-popover shadow-lg"
    >
      {/* Build with Hands - always visible at top */}
      <button
        type="button"
        data-index={flatIndex++}
        onMouseDown={(e) => {
          e.preventDefault();
          onBuildWithHands(searchQuery);
        }}
        className={`w-full flex items-center gap-2 px-2 py-2 text-left text-sm transition-colors border-b ${
          selectedIndex === 0
            ? "bg-accent text-accent-foreground"
            : "hover:bg-accent/50"
        }`}
      >
        <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-violet-500">
          <HandsIcon />
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-medium">Build with Hands</div>
          <div className="text-xs text-muted-foreground truncate">
            {buildDescription}
          </div>
        </div>
      </button>

      {/* Grouped block items */}
      {groupedItems.map(({ group, items }) => (
        <div key={group}>
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground sticky top-0 bg-popover/95 backdrop-blur-sm border-b">
            {group}
          </div>
          {items.map((item) => {
            const itemIndex = flatIndex++;
            return (
              <button
                key={item.id}
                type="button"
                data-index={itemIndex}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(item);
                }}
                className={`w-full flex items-center gap-2 px-2 py-1.5 text-left text-sm transition-colors ${
                  itemIndex === selectedIndex
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/50"
                }`}
              >
                {item.icon && (
                  <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-muted-foreground">
                    {item.icon}
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{item.label}</div>
                  {item.description && (
                    <div className="text-xs text-muted-foreground truncate">
                      {item.description}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      ))}

      {/* Show message when no matches (Build with Hands is still visible) */}
      {filteredItems.length === 0 && searchQuery && (
        <div className="px-2 py-2 text-xs text-muted-foreground text-center">
          No blocks match "{searchQuery}"
        </div>
      )}
    </div>
  );
}

/** Get total count of items including "Build with Hands" for keyboard nav */
function getBlockPickerItemCount(allItems: BlockItem[], searchQuery: string): number {
  // +1 for "Build with Hands" which is always at index 0
  if (!searchQuery) return allItems.length + 1;

  const query = searchQuery.toLowerCase();
  const filteredCount = allItems.filter((item) => {
    const labelMatch = item.label.toLowerCase().includes(query);
    const descMatch = item.description.toLowerCase().includes(query);
    const keywordMatch = item.keywords?.some((k) => k.toLowerCase().includes(query));
    return labelMatch || descMatch || keywordMatch;
  }).length;

  return filteredCount + 1; // +1 for "Build with Hands"
}

/** Get the block item at a given index (0 = Build with Hands, 1+ = filtered items) */
function getBlockItemAtIndex(allItems: BlockItem[], searchQuery: string, index: number): BlockItem | null {
  if (index === 0) return null; // Index 0 is "Build with Hands" - handled separately

  const adjustedIndex = index - 1; // Account for "Build with Hands" at index 0

  if (!searchQuery) {
    return allItems[adjustedIndex] || null;
  }

  const query = searchQuery.toLowerCase();
  const filtered = allItems.filter((item) => {
    const labelMatch = item.label.toLowerCase().includes(query);
    const descMatch = item.description.toLowerCase().includes(query);
    const keywordMatch = item.keywords?.some((k) => k.toLowerCase().includes(query));
    return labelMatch || descMatch || keywordMatch;
  });

  return filtered[adjustedIndex] || null;
}

// ============================================================================
// Initial Menu (shown when no input)
// ============================================================================

function InitialMenu({
  selectedIndex,
  onSelectSearch,
}: {
  selectedIndex: number;
  onSelectSearch: () => void;
}) {
  return (
    <div className="absolute left-0 top-full mt-1 z-50 rounded-md border bg-popover shadow-md">
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          onSelectSearch();
        }}
        className={`flex items-center gap-2 px-3 py-2 text-sm transition-colors rounded-md ${
          selectedIndex === 0 ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
        }`}
      >
        <MagnifyingGlass className="w-4 h-4" />
        <span>Search blocks...</span>
        <kbd className="ml-2 inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-medium rounded border border-border bg-gradient-to-b from-background to-muted shadow-[0_1px_0_1px_hsl(var(--border)),inset_0_1px_0_hsl(var(--background))]">
          ↵
        </kbd>
      </button>
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
      <style>{SHIMMER_STYLES}</style>
      <span contentEditable={false} className="inline-flex items-baseline">
        <span className="inline shimmer-text">
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
            className="inline-block bg-transparent outline-none shimmer-text placeholder:opacity-50"
            size={Math.max(1, inputValue.length || 24)}
            placeholder="describe what you want..."
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

type InputMode = "initial" | "ai" | "search";

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
  const [mode, setMode] = useState<InputMode>("initial");
  const [blockPickerIndex, setBlockPickerIndex] = useState(0);
  const retryCountRef = useRef(0);
  const errorsRef = useRef<string[]>([]);
  const isHandlingKeyRef = useRef(false);

  // For block picker keyboard nav
  const allBlockItems = useBlockItems();

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

  // Debounced prefetch while typing (AI mode only)
  useEffect(() => {
    // Don't prefetch in search mode
    if (mode === "search") {
      return;
    }

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
  }, [prompt, prefetchedPrompt, prefetchedMdx, fetchMdx, mode]);

  // Show hints after short delay (only in AI mode)
  useEffect(() => {
    if (prompt && mode === "ai") {
      const timer = setTimeout(() => setShowHints(true), 500);
      return () => clearTimeout(timer);
    } else {
      setShowHints(false);
    }
  }, [prompt, mode]);

  // Transition from initial to AI mode when user starts typing
  useEffect(() => {
    if (prompt && mode === "initial") {
      setMode("ai");
    }
  }, [prompt, mode]);

  // Reset block picker index when search query changes
  useEffect(() => {
    if (mode === "search") {
      setBlockPickerIndex(0);
    }
  }, [inputValue, mode]);

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

  // Select a block from the picker
  const selectBlock = useCallback(
    (item: BlockItem) => {
      isHandlingKeyRef.current = true;
      removeInput();
      item.onSelect(editor);
    },
    [editor, removeInput]
  );

  // Build with Hands - switch to AI mode with the search query
  const buildWithHands = useCallback(
    (query: string) => {
      isHandlingKeyRef.current = true;
      // Set the input value and switch to AI mode
      setInputValue(query);
      setMode("ai");
      // Trigger fetch immediately if there's a query
      if (query) {
        fetchMdx(query);
      }
    },
    [fetchMdx]
  );

  // Handle key events based on mode
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      // INITIAL MODE: Show search option
      if (mode === "initial") {
        if (e.key === "Enter") {
          e.preventDefault();
          setMode("search");
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          isHandlingKeyRef.current = true;
          removeInput();
          return;
        }
        if (e.key === "Backspace" && inputValue === "") {
          e.preventDefault();
          isHandlingKeyRef.current = true;
          removeInput();
          return;
        }
        // Any other key will start typing (transition to AI mode happens via effect)
        return;
      }

      // SEARCH MODE: Navigate and select blocks
      if (mode === "search") {
        const itemCount = getBlockPickerItemCount(allBlockItems, inputValue);
        const maxIndex = itemCount - 1;

        if (e.key === "ArrowDown") {
          e.preventDefault();
          setBlockPickerIndex((prev) => (prev < maxIndex ? prev + 1 : 0));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setBlockPickerIndex((prev) => (prev > 0 ? prev - 1 : maxIndex));
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          if (blockPickerIndex === 0) {
            // "Build with Hands" is selected
            buildWithHands(inputValue);
          } else {
            // A block item is selected
            const selectedItem = getBlockItemAtIndex(allBlockItems, inputValue, blockPickerIndex);
            if (selectedItem) {
              selectBlock(selectedItem);
            }
          }
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          // If there's input, clear it and go back to initial
          if (inputValue) {
            setInputValue("");
            setMode("initial");
          } else {
            isHandlingKeyRef.current = true;
            removeInput();
          }
          return;
        }
        if (e.key === "Backspace" && inputValue === "") {
          e.preventDefault();
          setMode("initial");
          return;
        }
        return;
      }

      // AI MODE: Navigate action menu and execute actions
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
    [mode, selectedAction, inputValue, allBlockItems, blockPickerIndex, executeAction, selectBlock, buildWithHands, removeInput]
  );

  // Dynamic placeholder based on mode
  const placeholder = mode === "search" ? "search blocks..." : "describe what you want...";

  return (
    <PlateElement {...props} as="span">
      <style>{SHIMMER_STYLES}</style>
      <span contentEditable={false} className="inline-flex items-baseline">
        <span className="relative inline-flex items-baseline">
          <span className={`inline ${mode === "ai" ? "shimmer-text" : "text-muted-foreground"}`}>
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
              className={`inline-block bg-transparent outline-none placeholder:opacity-50 ${mode === "ai" ? "shimmer-text" : "text-muted-foreground"}`}
              size={Math.max(1, inputValue.length || 24)}
              placeholder={placeholder}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
          </span>

          {/* Initial menu - shown when no input */}
          {mode === "initial" && !prompt && (
            <InitialMenu
              selectedIndex={0}
              onSelectSearch={() => setMode("search")}
            />
          )}

          {/* Block picker - shown in search mode */}
          {mode === "search" && (
            <BlockPicker
              searchQuery={inputValue}
              selectedIndex={blockPickerIndex}
              onSelect={selectBlock}
              onBuildWithHands={buildWithHands}
            />
          )}

          {/* Action menu dropdown - shown in AI mode with prompt */}
          {mode === "ai" && showHints && prompt && (
            <ActionMenu selectedIndex={selectedAction} onSelect={executeAction} />
          )}
        </span>

        {/* Ghost preview or loading shimmer (AI mode only) */}
        {mode === "ai" && hasResult && prefetchedMdx && (
          <span className="ml-1">
            <AtGhostPreview mdx={prefetchedMdx} />
          </span>
        )}
        {mode === "ai" && isLoading && !hasResult && <ThinkingShimmer />}
      </span>

      {children}
    </PlateElement>
  );
}
