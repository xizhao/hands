"use client";

/**
 * Editor Component
 *
 * High-level editor component that wraps Plate with sensible defaults.
 * Includes optional frontmatter header, toolbar, and saving indicator.
 *
 * Custom plugins can be added via the `editorPlugins` prop - each plugin
 * extends the editor with new MDX element types. Plugins can be simple
 * (just a component) or advanced (custom Plate plugin + serialization).
 */

import { createPlugin, type PluginOptions } from "@hands/core/plugin";
// Note: MarkdownPlugin import removed - all serialization now goes through worker
import { cn } from "@udecode/cn";
import type { TElement } from "platejs";
import {
  Plate,
  PlateContent,
  type PlateEditor,
  type PlatePlugin,
  usePlateEditor,
} from "platejs/react";
import {
  type ComponentType,
  forwardRef,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useEditorTables, useEditorTrpc } from "./context";
import {
  type Frontmatter,
  FrontmatterHeader,
  parseFrontmatter,
  serializeFrontmatter,
  stripFrontmatter,
} from "./frontmatter";
import {
  getDeserializeCache,
  setDeserializeCache,
  useMarkdownWorker,
  useMarkdownWorkerDebounced,
} from "./hooks/use-markdown-worker";
import { type CopilotConfig, createCopilotKit } from "./plugins/copilot-kit";
import { EditorCorePlugins } from "./plugins/presets";
import { EditorStatusBar, SlidesView, TocSidebar, TooltipProvider } from "./ui";
import type { EditorMode } from "./ui/editor-status-bar";
import { type Diagnostic, MarkdownCodeEditor } from "./ui/markdown-code-editor";

// ============================================================================
// Editor Handle (exposed via ref)
// ============================================================================

export interface EditorHandle {
  /** The underlying Plate editor instance */
  editor: PlateEditor;
  /** Focus the editor */
  focus: () => void;
  /** Get serialized markdown content */
  getMarkdown: () => string;
  /** Set content from markdown */
  setMarkdown: (markdown: string) => void;
}

// ============================================================================
// Editor Plugin Types (custom MDX extensions)
// ============================================================================

/**
 * Simple plugin - just provide a component, we generate the Plate plugin/rules.
 */
export interface SimpleEditorPlugin {
  /** MDX tag name (e.g., "CustomChart") */
  name: string;
  /** React component to render */
  component: ComponentType<{ element: TElement; children: ReactNode }>;
  /** Plugin options */
  options?: PluginOptions;
}

/**
 * Advanced plugin - provide your own Plate plugin and rules.
 * Use this for complex plugins with custom behavior.
 */
export interface AdvancedEditorPlugin {
  /** MDX tag name (e.g., "CustomChart") */
  name: string;
  /** Pre-built Plate plugin */
  plugin: PlatePlugin;
  /** Serialization rules (keyed by tag name and element type) */
  rules: Record<string, unknown>;
}

export type EditorPlugin = SimpleEditorPlugin | AdvancedEditorPlugin;

function isAdvancedPlugin(plugin: EditorPlugin): plugin is AdvancedEditorPlugin {
  return "plugin" in plugin && "rules" in plugin;
}

// Backward compatibility aliases
/** @deprecated Use SimpleEditorPlugin instead */
export type SimpleCustomBlock = SimpleEditorPlugin;
/** @deprecated Use AdvancedEditorPlugin instead */
export type AdvancedCustomBlock = AdvancedEditorPlugin;
/** @deprecated Use EditorPlugin instead */
export type CustomBlock = EditorPlugin;

// ============================================================================
// Types
// ============================================================================

export interface EditorProps {
  /** Initial markdown/MDX content */
  value?: string;
  /** Callback when content changes - receives serialized markdown */
  onChange?: (markdown: string) => void;
  /** Custom MDX plugins (simple or advanced) - extends editor with new element types */
  editorPlugins?: EditorPlugin[];
  /** @deprecated Use editorPlugins instead */
  customBlocks?: EditorPlugin[];
  /** Additional Plate plugins (for app-specific functionality) */
  platePlugins?: PlatePlugin[];
  /** @deprecated Use platePlugins instead */
  plugins?: PlatePlugin[];
  /** AI copilot configuration (enables ghost text completions) */
  copilot?: CopilotConfig;

  // ---- Frontmatter ----
  /** Optional frontmatter (enables header when provided) */
  frontmatter?: Frontmatter;
  /** Callback when frontmatter changes */
  onFrontmatterChange?: (frontmatter: Frontmatter) => void;
  /** Show title in frontmatter header (default: true, set false when title is shown elsewhere like tabs) */
  showTitle?: boolean;
  /** Show description in frontmatter header (default: true, set false when using SpecBar) */
  showDescription?: boolean;

  // ---- Toolbar ----
  /** Whether to show default toolbar (default: true) */
  showToolbar?: boolean;
  /** Custom toolbar content (replaces default) */
  toolbar?: ReactNode;

  // ---- Editor Mode ----
  /** Current editor mode (visual or markdown) - controlled */
  mode?: EditorMode;
  /** Callback when mode changes */
  onModeChange?: (mode: EditorMode) => void;
  /** Whether to show the mode toggle button (default: true) */
  showModeToggle?: boolean;
  /** External diagnostics to display in markdown mode (from tsc, eslint, etc.) */
  diagnostics?: Diagnostic[];

  // ---- Status ----
  /** Whether the editor is currently saving */
  isSaving?: boolean;

  // ---- Layout slots ----
  /** Custom header content (after frontmatter, before editor) */
  header?: ReactNode;
  /** Custom footer content (below editor content) */
  footer?: ReactNode;

  // ---- Table of Contents ----
  /** Show table of contents sidebar (default: true, can be overridden by frontmatter.toc) */
  toc?: boolean;

  // ---- Editor settings ----
  /** Whether the editor is read-only */
  readOnly?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** CSS class for root container */
  className?: string;
  /** CSS class for editor content area */
  contentClassName?: string;
  /** Callback for keyboard events */
  onKeyDown?: (e: KeyboardEvent) => void;
  /** Auto-focus editor on mount */
  autoFocus?: boolean;
  /** Wrapper component (e.g., for providers) */
  wrapper?: (props: { children: ReactNode }) => ReactNode;
}

// ============================================================================
// Default Prose Styles
// ============================================================================

const DEFAULT_PROSE_CLASSES = cn(
  "prose prose-sm dark:prose-invert max-w-none",
  // Headings
  "[&_h1]:mt-6 [&_h1]:mb-4 [&_h1]:text-3xl [&_h1]:font-bold",
  "[&_h2]:mt-5 [&_h2]:mb-3 [&_h2]:text-2xl [&_h2]:font-semibold",
  "[&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-xl [&_h3]:font-semibold",
  "[&_h4]:mt-3 [&_h4]:mb-2 [&_h4]:text-lg [&_h4]:font-medium",
  "[&_h5]:mt-2 [&_h5]:mb-1 [&_h5]:text-base [&_h5]:font-medium",
  "[&_h6]:mt-2 [&_h6]:mb-1 [&_h6]:text-sm [&_h6]:font-medium",
  // Blockquote
  "[&_blockquote]:border-l-2 [&_blockquote]:border-muted-foreground/30 [&_blockquote]:pl-4 [&_blockquote]:italic",
  // Code
  "[&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded-md [&_pre]:overflow-x-auto",
  "[&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm",
  // Links
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
  // Media
  "[&_img]:max-w-full [&_img]:rounded-md",
  "[&_hr]:my-4 [&_hr]:border-border",
);

// ============================================================================
// Editor Component
// ============================================================================

export const Editor = forwardRef<EditorHandle, EditorProps>(function Editor(
  {
    value,
    onChange,
    editorPlugins = [],
    customBlocks = [], // deprecated
    platePlugins = [],
    plugins: legacyPlugins = [], // deprecated
    copilot,
    // Frontmatter
    frontmatter,
    onFrontmatterChange,
    showTitle = true,
    showDescription = true,
    // Toolbar
    showToolbar = true,
    toolbar,
    // Mode
    mode: controlledMode,
    onModeChange,
    showModeToggle = true,
    diagnostics,
    // Status
    isSaving = false,
    // Layout
    header,
    footer,
    // Table of Contents
    toc: tocProp = true,
    // Settings
    readOnly = false,
    placeholder = "Start typing...",
    className,
    contentClassName,
    onKeyDown: externalOnKeyDown,
    autoFocus = false,
    wrapper: Wrapper,
  },
  ref,
) {
  // Track sync state
  const isExternalUpdateRef = useRef(false);
  const lastValueRef = useRef<string | null>(null);
  // Track whether initial value has been loaded - don't emit onChange until then
  const hasInitializedRef = useRef(false);

  // Ref for keyboard navigation from editor to frontmatter
  const subtitleRef = useRef<HTMLDivElement>(null);

  // Loading state for initial deserialization
  const [isLoading, setIsLoading] = useState(false);

  // Markdown worker for ALL serialization/deserialization (no sync code)
  const { serialize: workerSerialize, deserialize: workerDeserialize } = useMarkdownWorker();

  // Debounced serialization for onChange (high-frequency path)
  const { queueSerialize } = useMarkdownWorkerDebounced({
    delay: 100,
    onSerialize: useCallback(
      (markdown: string) => {
        if (markdown !== lastValueRef.current) {
          lastValueRef.current = markdown;
          onChange?.(markdown);
        }
      },
      [onChange],
    ),
    onError: useCallback((error: Error) => {
      console.error("[Editor] Worker serialization failed:", error);
    }, []),
  });

  // Editor mode state (visual vs markdown)
  const [internalMode, setInternalMode] = useState<EditorMode>("visual");
  const mode = controlledMode ?? internalMode;
  const handleModeChange = useCallback(
    (newMode: EditorMode) => {
      if (onModeChange) {
        onModeChange(newMode);
      } else {
        setInternalMode(newMode);
      }
    },
    [onModeChange],
  );

  // Track markdown content for code editor mode
  const [markdownContent, setMarkdownContent] = useState<string>("");

  // Merge deprecated + new props
  const allEditorPlugins = useMemo(
    () => [...editorPlugins, ...customBlocks],
    [editorPlugins, customBlocks],
  );
  const allExtraPlugins = useMemo(
    () => [...platePlugins, ...legacyPlugins],
    [platePlugins, legacyPlugins],
  );

  // Process editor plugins into Plate plugins
  // Note: Serialization rules are handled by the worker (stdlib rules only)
  // Custom plugin serialization requires adding rules to @hands/core/primitives/serialization
  const generatedPlugins = useMemo(() => {
    const plugins: PlatePlugin[] = [];

    for (const editorPlugin of allEditorPlugins) {
      if (isAdvancedPlugin(editorPlugin)) {
        // Advanced plugin - use provided plugin
        plugins.push(editorPlugin.plugin);
      } else {
        // Simple plugin - generate plugin
        const { plugin } = createPlugin(
          editorPlugin.name,
          editorPlugin.component,
          editorPlugin.options,
        );
        plugins.push(plugin);
      }
    }

    return plugins;
  }, [allEditorPlugins]);

  // Get copilot config from prop or derive from context
  const trpc = useEditorTrpc();
  const tables = useEditorTables();
  const effectiveCopilot = useMemo<CopilotConfig | null>(() => {
    // Explicit prop takes priority - augment with worker functions
    if (copilot) {
      return {
        ...copilot,
        serialize: workerSerialize,
        deserialize: workerDeserialize,
      };
    }
    // Use tRPC from context if available
    if (trpc) {
      return {
        trpc,
        serialize: workerSerialize,
        deserialize: workerDeserialize,
        tables,
        autoTrigger: false,
        debounceDelay: 150,
      };
    }
    return null;
  }, [copilot, trpc, tables, workerSerialize, workerDeserialize]);

  // Build copilot plugins if configured
  const copilotPlugins = useMemo(
    () => (effectiveCopilot ? createCopilotKit(effectiveCopilot) : []),
    [effectiveCopilot],
  );

  // Build complete plugin list
  const allPlugins = useMemo(
    () => [...EditorCorePlugins, ...generatedPlugins, ...allExtraPlugins, ...copilotPlugins],
    [generatedPlugins, allExtraPlugins, copilotPlugins],
  );

  // Create editor
  const editor = usePlateEditor({
    plugins: allPlugins,
    value: [{ type: "p", children: [{ text: "" }] }],
  });

  // Expose handle via ref
  useImperativeHandle(
    ref,
    () => ({
      editor: editor as PlateEditor,
      focus: () => editor.tf.focus(),
      getMarkdown: () => {
        // Return cached value (updated by worker on every change)
        return lastValueRef.current ?? "";
      },
      setMarkdown: (markdown: string) => {
        // Check cache first for instant update
        const cached = getDeserializeCache(markdown);
        if (cached && cached.length > 0) {
          isExternalUpdateRef.current = true;
          editor.tf.setValue(cached);
          lastValueRef.current = markdown;
          setTimeout(() => {
            isExternalUpdateRef.current = false;
          }, 0);
          return;
        }

        // Cache miss - use worker
        workerDeserialize(markdown)
          .then((nodes) => {
            if (nodes && nodes.length > 0) {
              setDeserializeCache(markdown, nodes);
              isExternalUpdateRef.current = true;
              editor.tf.setValue(nodes);
              lastValueRef.current = markdown;
              setTimeout(() => {
                isExternalUpdateRef.current = false;
              }, 0);
            }
          })
          .catch((err) => {
            console.error("[Editor] Failed to set markdown:", err);
          });
      },
    }),
    [editor, workerDeserialize],
  );

  // Auto-focus
  useEffect(() => {
    if (autoFocus) {
      editor.tf.focus();
    }
  }, [editor, autoFocus]);

  // Sync external value to editor (uses cache first, then worker for deserialization)
  useEffect(() => {
    if (value == null) return; // Allow empty string to reset editor
    if (value === lastValueRef.current) return;

    isExternalUpdateRef.current = true;

    // Check cache first - instant render, skip worker entirely
    const cached = getDeserializeCache(value);
    if (cached) {
      const newValue = cached.length > 0 ? cached : [{ type: "p", children: [{ text: "" }] }];
      editor.tf.setValue(newValue);
      lastValueRef.current = value;
      hasInitializedRef.current = true; // Mark as initialized
      setTimeout(() => {
        isExternalUpdateRef.current = false;
      }, 0);
      return;
    }

    // Cache miss - use worker
    setIsLoading(true);
    workerDeserialize(value)
      .then((nodes) => {
        // Cache the result for next time
        if (nodes && nodes.length > 0) {
          setDeserializeCache(value, nodes);
        }
        // Reset to empty paragraph if content is empty, otherwise use deserialized nodes
        const newValue =
          nodes && nodes.length > 0 ? nodes : [{ type: "p", children: [{ text: "" }] }];
        editor.tf.setValue(newValue);
        lastValueRef.current = value;
        hasInitializedRef.current = true; // Mark as initialized
      })
      .catch((err) => {
        console.error("[Editor] Failed to deserialize:", err);
      })
      .finally(() => {
        setIsLoading(false);
        setTimeout(() => {
          isExternalUpdateRef.current = false;
        }, 0);
      });
  }, [value, editor, workerDeserialize]);

  // Handle editor changes - uses web worker for async serialization
  const handleChange = useCallback(
    ({ value: plateValue }: { value: TElement[] }) => {
      if (readOnly || isExternalUpdateRef.current) return;
      if (!onChange) return;

      // Don't emit changes until we've loaded initial content
      // This prevents HMR from serializing empty editor state before real content loads
      if (!hasInitializedRef.current) return;

      // Queue async serialization in web worker (debounced)
      queueSerialize(plateValue);
    },
    [onChange, readOnly, queueSerialize],
  );

  // Focus editor (from frontmatter on Enter/ArrowDown)
  const handleFocusEditor = useCallback(() => {
    editor.tf.focus();
  }, [editor]);

  // Handle keyboard navigation from editor → frontmatter
  const handleEditorKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Call external handler first
      externalOnKeyDown?.(e);

      // Arrow up at start of document → focus subtitle (if frontmatter enabled)
      if (e.key === "ArrowUp" && frontmatter && subtitleRef.current) {
        const { selection } = editor;
        if (selection) {
          const edges = editor.api.edges(selection);
          if (!edges) return;
          const [start] = edges;
          if (start.path[0] === 0 && start.offset === 0) {
            e.preventDefault();
            subtitleRef.current.focus();
            // Move cursor to end of subtitle
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(subtitleRef.current);
            range.collapse(false);
            sel?.removeAllRanges();
            sel?.addRange(range);
          }
        }
      }
    },
    [editor, frontmatter, externalOnKeyDown],
  );

  // Sync markdown content when switching to markdown mode (uses worker)
  // Includes frontmatter if present to show the full raw file
  useEffect(() => {
    if (mode === "markdown") {
      workerSerialize(editor.children as TElement[])
        .then((bodyMarkdown) => {
          // Prepend frontmatter if present
          const rawContent = frontmatter
            ? `${serializeFrontmatter(frontmatter)}\n${bodyMarkdown}`
            : bodyMarkdown;
          setMarkdownContent(rawContent);
        })
        .catch((err) => {
          console.error("[Editor] Failed to serialize for markdown mode:", err);
        });
    }
  }, [mode, editor.children, frontmatter, workerSerialize]);

  // Debounce timer for markdown code editor changes
  const markdownChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Handle markdown content changes in code editor mode (uses worker)
  // Parses frontmatter from the raw content and updates both frontmatter and body
  const handleMarkdownChange = useCallback(
    (rawContent: string) => {
      setMarkdownContent(rawContent);

      // Parse frontmatter and extract body from raw content
      const { frontmatter: parsedFrontmatter } = parseFrontmatter(rawContent);
      const body = stripFrontmatter(rawContent);

      // Update frontmatter if callback provided and frontmatter exists
      if (onFrontmatterChange && Object.keys(parsedFrontmatter).length > 0) {
        onFrontmatterChange(parsedFrontmatter);
      }

      // Debounce the worker deserialization to avoid flooding on fast typing
      if (markdownChangeTimerRef.current) {
        clearTimeout(markdownChangeTimerRef.current);
      }

      markdownChangeTimerRef.current = setTimeout(() => {
        // Sync body to visual editor via worker
        isExternalUpdateRef.current = true;
        workerDeserialize(body)
          .then((nodes) => {
            if (nodes && nodes.length > 0) {
              editor.tf.setValue(nodes);
              lastValueRef.current = body;
            }
          })
          .catch(() => {
            // Ignore parse errors during typing
          })
          .finally(() => {
            setTimeout(() => {
              isExternalUpdateRef.current = false;
            }, 0);
          });

        // Also call onChange with body content
        if (onChange && body !== lastValueRef.current) {
          lastValueRef.current = body;
          onChange(body);
        }
      }, 150);
    },
    [editor, onChange, onFrontmatterChange, workerDeserialize],
  );

  // Toolbar is now removed - mode toggle moved to status bar
  // Custom toolbar can still be passed via props
  const toolbarElement = toolbar ?? null;

  const content = (
    <TooltipProvider>
      <div className={cn("h-full flex flex-col", className)}>
        <Plate editor={editor} onChange={handleChange}>
          {/* Toolbar */}
          {toolbarElement}

          {/* View content - each mode has its own container */}
          {mode === "visual" && (
            <div className="relative flex-1 min-h-0 overflow-y-auto cursor-text flex flex-col px-6">
              {/* Loading overlay */}
              {isLoading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Loading...
                  </div>
                </div>
              )}

              {/* Table of contents - fixed to viewport, vertically centered */}
              {(frontmatter?.toc ?? tocProp) && (
                <TocSidebar
                  className="fixed right-4 top-1/2 -translate-y-1/2 w-8 z-40"
                  position="right"
                />
              )}

              {/* Frontmatter header */}
              {frontmatter && onFrontmatterChange && (
                <FrontmatterHeader
                  frontmatter={frontmatter}
                  onFrontmatterChange={onFrontmatterChange}
                  onFocusEditor={handleFocusEditor}
                  subtitleRef={subtitleRef}
                  showTitle={showTitle}
                  showDescription={showDescription}
                  compact
                />
              )}

              {/* Custom header slot */}
              {header}

              {/* Editor content */}
              <PlateContent
                className={cn(
                  "pt-4 pb-32 min-h-[200px] outline-none",
                  DEFAULT_PROSE_CLASSES,
                  contentClassName,
                  isLoading && "opacity-50 pointer-events-none",
                )}
                placeholder={placeholder}
                readOnly={readOnly}
                onKeyDown={handleEditorKeyDown}
              />

              {footer}
            </div>
          )}

          {mode === "markdown" && (
            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
              <MarkdownCodeEditor
                value={markdownContent}
                onChange={handleMarkdownChange}
                diagnostics={diagnostics}
                className="h-full"
                placeholder={placeholder}
                readOnly={readOnly}
              />
              {footer}
            </div>
          )}

          {mode === "slides" && <SlidesView className="flex-1 min-h-0" frontmatter={frontmatter} />}

          {/* Status bar - all modes, includes mode toggle */}
          {!readOnly && (
            <EditorStatusBar
              isSaving={isSaving}
              mode={mode}
              onModeChange={handleModeChange}
              showModeToggle={showModeToggle}
            />
          )}
        </Plate>
      </div>
    </TooltipProvider>
  );

  return Wrapper ? <Wrapper>{content}</Wrapper> : content;
});
