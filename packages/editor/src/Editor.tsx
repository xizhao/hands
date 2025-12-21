"use client";

/**
 * Editor Component
 *
 * High-level editor component that wraps Plate with sensible defaults.
 * Includes optional frontmatter header, toolbar, and saving indicator.
 *
 * Custom blocks can be added via the `customBlocks` prop - each block
 * needs a component and optional serialization rules.
 */

import { MarkdownPlugin } from "@platejs/markdown";
import { cn } from "@udecode/cn";
import type { TElement } from "platejs";
import { Plate, PlateContent, usePlateEditor, type PlateEditor, type PlatePlugin } from "platejs/react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type ComponentType,
  type ReactNode,
  type KeyboardEvent,
} from "react";

import { createCustomBlock, type CustomBlockOptions } from "@hands/core/stdlib";
import { EditorCorePlugins } from "./plugins/presets";
import { createMarkdownKit, type MarkdownRule } from "./plugins/markdown-kit";
import { createCopilotKit, type CopilotConfig } from "./plugins/copilot-kit";
import { useEditorTrpc, useEditorTables } from "./context";
import { FrontmatterHeader, type Frontmatter } from "./frontmatter";
import { FixedToolbar, FixedToolbarButtons, TooltipProvider } from "./ui";

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
// Custom Block Types
// ============================================================================

/**
 * Simple custom block - just provide a component, we generate the plugin/rules.
 */
export interface SimpleCustomBlock {
  /** MDX tag name (e.g., "MyBlock") */
  name: string;
  /** React component to render */
  component: ComponentType<{ element: TElement; children: ReactNode }>;
  /** Block options */
  options?: CustomBlockOptions;
}

/**
 * Advanced custom block - provide your own plugin and rules.
 * Use this for complex blocks with custom behavior.
 */
export interface AdvancedCustomBlock {
  /** MDX tag name (e.g., "Block") */
  name: string;
  /** Pre-built Plate plugin */
  plugin: PlatePlugin;
  /** Serialization rules (keyed by tag name and element type) */
  rules: Record<string, unknown>;
}

export type CustomBlock = SimpleCustomBlock | AdvancedCustomBlock;

function isAdvancedBlock(block: CustomBlock): block is AdvancedCustomBlock {
  return "plugin" in block && "rules" in block;
}

// ============================================================================
// Types
// ============================================================================

export interface EditorProps {
  /** Initial markdown/MDX content */
  value?: string;
  /** Callback when content changes - receives serialized markdown */
  onChange?: (markdown: string) => void;
  /** Custom MDX blocks (simple or advanced) */
  customBlocks?: CustomBlock[];
  /** Additional plugins (for app-specific functionality) */
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
    customBlocks = [],
    plugins: extraPlugins = [],
    copilot,
    // Frontmatter
    frontmatter,
    onFrontmatterChange,
    // Toolbar
    showToolbar = true,
    toolbar,
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

  // Process custom blocks into plugins and markdown rules
  const { blockPlugins, blockRules } = useMemo(() => {
    const plugins: PlatePlugin[] = [];
    const rules: Record<string, MarkdownRule> = {};

    for (const block of customBlocks) {
      if (isAdvancedBlock(block)) {
        // Advanced block - use provided plugin and rules
        plugins.push(block.plugin);
        Object.assign(rules, block.rules);
      } else {
        // Simple block - generate plugin and rules
        const { plugin, rule } = createCustomBlock(
          block.name,
          block.component,
          block.options
        );
        plugins.push(plugin);
        // Add both deserialize (by tag name) and serialize (by key) rules
        rules[rule.tagName] = { deserialize: rule.deserialize };
        rules[rule.key] = { serialize: rule.serialize };
      }
    }

    return { blockPlugins: plugins, blockRules: rules };
  }, [customBlocks]);

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
  const allPlugins = useMemo(() => [
    ...EditorCorePlugins,
    ...blockPlugins,
    ...extraPlugins,
    ...createMarkdownKit(blockRules),
    ...copilotPlugins,
  ], [blockPlugins, extraPlugins, blockRules, copilotPlugins]);

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
    if (!value) return;
    if (value === lastValueRef.current) return;

    try {
      isExternalUpdateRef.current = true;
      const api = editor.getApi(MarkdownPlugin);
      const nodes = api.markdown.deserialize(value);
      if (nodes && nodes.length > 0) {
        editor.tf.setValue(nodes);
        lastValueRef.current = value;
      }
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

  // Determine which toolbar to render
  const toolbarElement = toolbar ?? (showToolbar && !readOnly ? (
    <FixedToolbar>
      <FixedToolbarButtons />
    </FixedToolbar>
  ) : null);

  const content = (
    <TooltipProvider>
    <div className={cn("h-full flex flex-col", className)}>
      <Plate editor={editor} onChange={handleChange}>
        {/* Toolbar */}
        {toolbarElement}

        {/* Scroll container - padding here (not PlateContent) so drag handle gutter isn't clipped */}
        <div className="relative flex-1 min-h-0 cursor-text overflow-y-auto pl-16 pr-6">
          {/* Frontmatter header (when enabled) */}
          {frontmatter && onFrontmatterChange && (
            <FrontmatterHeader
              frontmatter={frontmatter}
              onFrontmatterChange={onFrontmatterChange}
              onFocusEditor={handleFocusEditor}
              subtitleRef={subtitleRef}
            />
          )}

          {/* Saving indicator */}
          {isSaving && (
            <div className="absolute top-2 right-2 text-xs text-muted-foreground">
              Saving...
            </div>
          )}

          {/* Custom header slot */}
          {header}

          {/* Editor content */}
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

          {/* Footer slot */}
          {footer}
        </div>
      </Plate>
    </div>
    </TooltipProvider>
  );

  return Wrapper ? <Wrapper>{content}</Wrapper> : content;
});
