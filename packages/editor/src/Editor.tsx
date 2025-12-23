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

import { MarkdownPlugin } from "@platejs/markdown";
import { cn } from "@udecode/cn";
import type { TElement } from "platejs";
import {
  Plate,
  PlateContent,
  usePlateEditor,
  type PlateEditor,
  type PlatePlugin,
} from "platejs/react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { createPlugin, type PluginOptions } from "@hands/core/primitives";
import { useEditorTables, useEditorTrpc } from "./context";
import { FrontmatterHeader, type Frontmatter } from "./frontmatter";
import { createCopilotKit, type CopilotConfig } from "./plugins/copilot-kit";
import { createMarkdownKit, type MarkdownRule } from "./plugins/markdown-kit";
import { EditorCorePlugins } from "./plugins/presets";
import { EditorStatusBar, FixedToolbar, FixedToolbarButtons, TooltipProvider } from "./ui";
import { MarkdownCodeEditor, type Diagnostic } from "./ui/markdown-code-editor";
import { ModeToggle, type EditorMode } from "./ui/mode-toggle";
import { serializeFrontmatter, parseFrontmatter, stripFrontmatter } from "./frontmatter";

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

function isAdvancedPlugin(
  plugin: EditorPlugin
): plugin is AdvancedEditorPlugin {
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
  "[&_hr]:my-4 [&_hr]:border-border"
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
    // Settings
    readOnly = false,
    placeholder = "Start typing...",
    className,
    contentClassName,
    onKeyDown: externalOnKeyDown,
    autoFocus = false,
    wrapper: Wrapper,
  },
  ref
) {
  // Track sync state
  const isExternalUpdateRef = useRef(false);
  const lastValueRef = useRef<string | null>(null);

  // Ref for keyboard navigation from editor to frontmatter
  const subtitleRef = useRef<HTMLDivElement>(null);

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
    [onModeChange]
  );

  // Track markdown content for code editor mode
  const [markdownContent, setMarkdownContent] = useState<string>("");

  // Merge deprecated + new props
  const allEditorPlugins = useMemo(
    () => [...editorPlugins, ...customBlocks],
    [editorPlugins, customBlocks]
  );
  const allExtraPlugins = useMemo(
    () => [...platePlugins, ...legacyPlugins],
    [platePlugins, legacyPlugins]
  );

  // Process editor plugins into Plate plugins and markdown rules
  const { generatedPlugins, generatedRules } = useMemo(() => {
    const plugins: PlatePlugin[] = [];
    const rules: Record<string, MarkdownRule> = {};

    for (const editorPlugin of allEditorPlugins) {
      if (isAdvancedPlugin(editorPlugin)) {
        // Advanced plugin - use provided plugin and rules
        plugins.push(editorPlugin.plugin);
        Object.assign(rules, editorPlugin.rules);
      } else {
        // Simple plugin - generate plugin and rules
        const { plugin, rule } = createPlugin(
          editorPlugin.name,
          editorPlugin.component,
          editorPlugin.options
        );
        plugins.push(plugin);
        // Add both deserialize (by tag name) and serialize (by key) rules
        rules[rule.tagName] = { deserialize: rule.deserialize };
        rules[rule.key] = { serialize: rule.serialize };
      }
    }

    return { generatedPlugins: plugins, generatedRules: rules };
  }, [allEditorPlugins]);

  // Get copilot config from prop or derive from context
  const trpc = useEditorTrpc();
  const tables = useEditorTables();
  const effectiveCopilot = useMemo<CopilotConfig | null>(() => {
    // Explicit prop takes priority
    if (copilot) return copilot;
    // Use tRPC from context if available
    if (trpc) {
      return {
        trpc,
        tables,
        autoTrigger: false,
        debounceDelay: 150,
      };
    }
    return null;
  }, [copilot, trpc, tables]);

  // Build copilot plugins if configured
  const copilotPlugins = useMemo(
    () => (effectiveCopilot ? createCopilotKit(effectiveCopilot) : []),
    [effectiveCopilot]
  );

  // Build complete plugin list
  const allPlugins = useMemo(
    () => [
      ...EditorCorePlugins,
      ...generatedPlugins,
      ...allExtraPlugins,
      ...createMarkdownKit(generatedRules),
      ...copilotPlugins,
    ],
    [generatedPlugins, allExtraPlugins, generatedRules, copilotPlugins]
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
        try {
          const api = editor.getApi(MarkdownPlugin);
          return api.markdown.serialize();
        } catch {
          return "";
        }
      },
      setMarkdown: (markdown: string) => {
        try {
          const api = editor.getApi(MarkdownPlugin);
          const nodes = api.markdown.deserialize(markdown);
          if (nodes && nodes.length > 0) {
            editor.tf.setValue(nodes);
          }
        } catch (err) {
          console.error("[Editor] Failed to set markdown:", err);
        }
      },
    }),
    [editor]
  );

  // Auto-focus
  useEffect(() => {
    if (autoFocus) {
      editor.tf.focus();
    }
  }, [editor, autoFocus]);

  // Sync external value to editor
  useEffect(() => {
    if (value == null) return; // Allow empty string to reset editor
    if (value === lastValueRef.current) return;

    try {
      isExternalUpdateRef.current = true;
      const api = editor.getApi(MarkdownPlugin);
      const nodes = api.markdown.deserialize(value);
      // Reset to empty paragraph if content is empty, otherwise use deserialized nodes
      const newValue = nodes && nodes.length > 0
        ? nodes
        : [{ type: "p", children: [{ text: "" }] }];
      editor.tf.setValue(newValue);
      lastValueRef.current = value;
    } catch (err) {
      console.error("[Editor] Failed to deserialize:", err);
    } finally {
      setTimeout(() => {
        isExternalUpdateRef.current = false;
      }, 0);
    }
  }, [value, editor]);

  // Handle editor changes
  const handleChange = useCallback(
    ({ value: plateValue }: { value: TElement[] }) => {
      if (readOnly || isExternalUpdateRef.current) return;
      if (!onChange) return;

      try {
        const api = editor.getApi(MarkdownPlugin);
        const markdown = api.markdown.serialize();
        if (markdown !== lastValueRef.current) {
          lastValueRef.current = markdown;
          onChange(markdown);
        }
      } catch (err) {
        console.error("[Editor] Failed to serialize:", err);
      }
    },
    [editor, onChange, readOnly]
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
    [editor, frontmatter, externalOnKeyDown]
  );

  // Sync markdown content when switching to markdown mode
  // Includes frontmatter if present to show the full raw file
  useEffect(() => {
    if (mode === "markdown") {
      try {
        const api = editor.getApi(MarkdownPlugin);
        const bodyMarkdown = api.markdown.serialize();
        // Prepend frontmatter if present
        const rawContent = frontmatter
          ? serializeFrontmatter(frontmatter) + "\n" + bodyMarkdown
          : bodyMarkdown;
        setMarkdownContent(rawContent);
      } catch (err) {
        console.error("[Editor] Failed to serialize for markdown mode:", err);
      }
    }
  }, [mode, editor, frontmatter]);

  // Handle markdown content changes in code editor mode
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

      // Sync body to visual editor
      try {
        isExternalUpdateRef.current = true;
        const api = editor.getApi(MarkdownPlugin);
        const nodes = api.markdown.deserialize(body);
        if (nodes && nodes.length > 0) {
          editor.tf.setValue(nodes);
          lastValueRef.current = body;
        }
      } catch (err) {
        // Ignore parse errors during typing
      } finally {
        setTimeout(() => {
          isExternalUpdateRef.current = false;
        }, 0);
      }

      // Also call onChange with body content
      if (onChange && body !== lastValueRef.current) {
        lastValueRef.current = body;
        onChange(body);
      }
    },
    [editor, onChange, onFrontmatterChange]
  );

  // Determine which toolbar to render
  const toolbarElement =
    toolbar ??
    (showToolbar && !readOnly ? (
      <FixedToolbar>
        <div className="flex items-center justify-between w-full">
          {/* Left side - only show formatting buttons in visual mode */}
          {mode === "visual" ? (
            <FixedToolbarButtons />
          ) : (
            <div className="text-xs text-muted-foreground px-2">
              Markdown Mode
            </div>
          )}
          {/* Right side - mode toggle */}
          {showModeToggle && (
            <ModeToggle mode={mode} onModeChange={handleModeChange} />
          )}
        </div>
      </FixedToolbar>
    ) : null);

  const content = (
    <TooltipProvider>
      <div className={cn("h-full flex flex-col", className)}>
        <Plate editor={editor} onChange={handleChange}>
          {/* Toolbar */}
          {toolbarElement}

          {/* Scroll container - padding here (not PlateContent) so drag handle gutter isn't clipped */}
          <div className={cn(
            "relative flex-1 min-h-0 cursor-text overflow-y-auto",
            mode === "visual" ? "pl-8 pr-6" : "pl-0 pr-0"
          )}>
            {/* Frontmatter header (only in visual mode - code mode shows raw frontmatter) */}
            {mode === "visual" && frontmatter && onFrontmatterChange && (
              <FrontmatterHeader
                frontmatter={frontmatter}
                onFrontmatterChange={onFrontmatterChange}
                onFocusEditor={handleFocusEditor}
                subtitleRef={subtitleRef}
              />
            )}

            {/* Custom header slot (only in visual mode) */}
            {mode === "visual" && header}

            {/* Editor content */}
            {mode === "visual" ? (
              <PlateContent
                className={cn(
                  "pt-4 pb-32 min-h-[200px] outline-none",
                  DEFAULT_PROSE_CLASSES,
                  contentClassName
                )}
                placeholder={placeholder}
                readOnly={readOnly}
                onKeyDown={handleEditorKeyDown}
              />
            ) : (
              <MarkdownCodeEditor
                value={markdownContent}
                onChange={handleMarkdownChange}
                diagnostics={diagnostics}
                className="h-full"
                placeholder={placeholder}
                readOnly={readOnly}
              />
            )}

            {/* Footer slot */}
            {footer}
          </div>

          {/* Status bar - shows selection info and save status */}
          {!readOnly && <EditorStatusBar isSaving={isSaving} />}
        </Plate>
      </div>
    </TooltipProvider>
  );

  return Wrapper ? <Wrapper>{content}</Wrapper> : content;
});
