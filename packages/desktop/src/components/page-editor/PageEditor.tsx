/**
 * PageEditor - Native Plate Editor with Frontmatter
 *
 * Fetches page source via tRPC and renders with Plate.
 * Uses native @platejs imports (no shadcn vendoring).
 */

import { cn } from "@/lib/utils";
import { AutoformatPlugin } from "@platejs/autoformat";
import {
  BlockquotePlugin,
  BoldPlugin,
  CodePlugin,
  H1Plugin,
  H2Plugin,
  H3Plugin,
  H4Plugin,
  H5Plugin,
  H6Plugin,
  HorizontalRulePlugin,
  ItalicPlugin,
  StrikethroughPlugin,
  UnderlinePlugin,
} from "@platejs/basic-nodes/react";
import { FontFamilyPlugin, FontSizePlugin } from "@platejs/basic-styles/react";
import { CodeBlockPlugin } from "@platejs/code-block/react";
import { IndentPlugin } from "@platejs/indent/react";
import { LinkPlugin } from "@platejs/link/react";
import { indentList, indentTodo } from "@platejs/list";
import { ListPlugin } from "@platejs/list/react";
import { MarkdownPlugin, deserializeMd } from "@platejs/markdown";
import { ImagePlugin } from "@platejs/media/react";
import { BlockSelectionPlugin } from "@platejs/selection/react";
import { TrailingBlockPlugin } from "platejs";
import {
  ParagraphPlugin,
  Plate,
  PlateContent,
  usePlateEditor,
} from "platejs/react";
import { useCallback, useEffect, useRef } from "react";
import { type Frontmatter, FrontmatterHeader } from "./Frontmatter";
import { DndKit } from "./plugins/dnd-kit";
import { FloatingToolbar } from "./Toolbar";
import { usePageSource } from "./usePageSource";

// ============================================================================
// Types
// ============================================================================

export interface PageEditorProps {
  /** Page ID to load content for (required) */
  pageId: string;
  /** Additional CSS classes */
  className?: string;
  /** Whether the editor is read-only */
  readOnly?: boolean;
}

// ============================================================================
// Autoformat Rules (Markdown shortcuts)
// ============================================================================

const autoformatRules = [
  // Headings
  { mode: "block" as const, match: "# ", type: "h1" },
  { mode: "block" as const, match: "## ", type: "h2" },
  { mode: "block" as const, match: "### ", type: "h3" },
  { mode: "block" as const, match: "#### ", type: "h4" },
  { mode: "block" as const, match: "##### ", type: "h5" },
  { mode: "block" as const, match: "###### ", type: "h6" },
  // Blockquote
  { mode: "block" as const, match: "> ", type: "blockquote" },
  // Horizontal rule
  { mode: "block" as const, match: ["---", "—-", "***"], type: "hr" },
  // Code block
  { mode: "block" as const, match: "```", type: "code_block" },
  // Lists - unordered
  {
    mode: "block" as const,
    match: ["- ", "* ", "+ "],
    format: (editor: Parameters<typeof indentList>[0]) => {
      indentList(editor, { listStyleType: "disc" });
    },
  },
  // Lists - ordered
  {
    mode: "block" as const,
    match: ["1. ", "1) "],
    format: (editor: Parameters<typeof indentList>[0]) => {
      indentList(editor, { listStyleType: "decimal" });
    },
  },
  // Lists - todo/checkbox
  {
    mode: "block" as const,
    match: ["[] ", "[ ] "],
    format: (editor: Parameters<typeof indentTodo>[0]) => {
      indentTodo(editor, { listStyleType: "disc" });
    },
  },
  // Marks
  { mode: "mark" as const, match: "**", type: "bold" },
  { mode: "mark" as const, match: "__", type: "bold" },
  { mode: "mark" as const, match: "*", type: "italic" },
  { mode: "mark" as const, match: "_", type: "italic" },
  { mode: "mark" as const, match: "~~", type: "strikethrough" },
  { mode: "mark" as const, match: "`", type: "code" },
];

// ============================================================================
// Editor Plugins
// ============================================================================

const plugins = [
  // Paragraph (default block)
  ParagraphPlugin,

  // Headings
  H1Plugin,
  H2Plugin,
  H3Plugin,
  H4Plugin,
  H5Plugin,
  H6Plugin,

  // Block elements
  BlockquotePlugin,
  HorizontalRulePlugin,
  CodeBlockPlugin,

  // Marks (inline formatting)
  BoldPlugin,
  ItalicPlugin,
  UnderlinePlugin,
  StrikethroughPlugin,
  CodePlugin,

  // Links
  LinkPlugin,

  // Lists
  ListPlugin,

  // Media
  ImagePlugin,

  // Font styles
  FontSizePlugin,
  FontFamilyPlugin,

  // Indentation
  IndentPlugin,

  // Markdown shortcuts
  AutoformatPlugin.configure({
    options: { rules: autoformatRules },
  }),

  // Markdown serialization
  MarkdownPlugin,

  // Trailing block (ensures empty paragraph at end)
  TrailingBlockPlugin,

  // Block selection (required for drag and drop)
  BlockSelectionPlugin,

  ...DndKit,
];

// ============================================================================
// Main Component
// ============================================================================

export function PageEditor({
  pageId,
  className,
  readOnly = false,
}: PageEditorProps) {
  // Refs for navigation
  const editorRef = useRef<ReturnType<typeof usePlateEditor> | null>(null);
  const subtitleRef = useRef<HTMLDivElement>(null);

  // Track if we've initialized content
  const initializedRef = useRef(false);
  const lastContentRef = useRef<string | null>(null);

  // Fetch page source
  const { content, frontmatter, isLoading, isSaving, error, setFrontmatter } =
    usePageSource({ pageId, readOnly });

  // Create editor
  const editor = usePlateEditor({
    plugins,
    // Start with empty - will be populated from content
    value: [{ type: "p", children: [{ text: "" }] }],
  });

  // Store editor ref for keyboard navigation
  editorRef.current = editor;

  // Sync content to editor when it changes
  useEffect(() => {
    if (!content || content === lastContentRef.current) return;

    // Deserialize markdown content to Plate value
    try {
      const value = deserializeMd(editor, content);
      if (value && value.length > 0) {
        editor.tf.setValue(value);
        lastContentRef.current = content;
        initializedRef.current = true;
      }
    } catch (err) {
      console.error("[PageEditor] Failed to deserialize content:", err);
    }
  }, [content, editor]);

  // Handle frontmatter changes
  const handleFrontmatterChange = useCallback(
    (newFrontmatter: Frontmatter) => {
      setFrontmatter(newFrontmatter);
    },
    [setFrontmatter]
  );

  // Focus editor (called from frontmatter on Enter/ArrowDown)
  const handleFocusEditor = useCallback(() => {
    const ed = editorRef.current;
    if (ed) {
      ed.tf.focus();
      ed.tf.select({ path: [0, 0], offset: 0 });
    }
  }, []);

  // Handle ArrowUp from editor to navigate to subtitle
  const handleEditorKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp") {
      const ed = editorRef.current;
      if (!ed) return;

      const { selection } = ed;
      if (selection) {
        const [start] = ed.api.edges(selection);
        if (start.path[0] === 0 && start.offset === 0) {
          e.preventDefault();
          subtitleRef.current?.focus();
          if (subtitleRef.current) {
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(subtitleRef.current);
            range.collapse(false);
            sel?.removeAllRanges();
            sel?.addRange(range);
          }
        }
      }
    }
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <div className={cn("h-full flex items-center justify-center", className)}>
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={cn("h-full flex items-center justify-center", className)}>
        <div className="text-destructive text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div className={cn("h-full flex flex-col", className)}>
      <Plate editor={editor}>
        <div className="relative h-full cursor-text overflow-y-auto">
          {/* Frontmatter header */}
          <FrontmatterHeader
            frontmatter={frontmatter}
            onFrontmatterChange={handleFrontmatterChange}
            onFocusEditor={handleFocusEditor}
            subtitleRef={subtitleRef}
          />

          {/* Saving indicator */}
          {isSaving && (
            <div className="absolute top-2 right-2 text-xs text-muted-foreground">
              Saving...
            </div>
          )}

          {/* Floating toolbar */}
          <FloatingToolbar />

          {/* Editor content */}
          <PlateContent
            className={cn(
              "py-4 pl-16 pr-6 min-h-[200px] outline-none",
              "prose prose-sm dark:prose-invert max-w-none",
              "[&_p]:my-2",
              "[&_h1]:mt-6 [&_h1]:mb-4 [&_h1]:text-3xl [&_h1]:font-bold",
              "[&_h2]:mt-5 [&_h2]:mb-3 [&_h2]:text-2xl [&_h2]:font-semibold",
              "[&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-xl [&_h3]:font-semibold",
              "[&_h4]:mt-3 [&_h4]:mb-2 [&_h4]:text-lg [&_h4]:font-medium",
              "[&_h5]:mt-2 [&_h5]:mb-1 [&_h5]:text-base [&_h5]:font-medium",
              "[&_h6]:mt-2 [&_h6]:mb-1 [&_h6]:text-sm [&_h6]:font-medium",
              "[&_ul]:my-2 [&_ol]:my-2 [&_li]:my-1",
              "[&_blockquote]:border-l-2 [&_blockquote]:border-muted-foreground/30 [&_blockquote]:pl-4 [&_blockquote]:italic",
              "[&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded-md [&_pre]:overflow-x-auto",
              "[&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm",
              "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
              "[&_img]:max-w-full [&_img]:rounded-md",
              "[&_hr]:my-4 [&_hr]:border-border"
            )}
            placeholder="Start typing..."
            readOnly={readOnly}
            onKeyDown={handleEditorKeyDown}
          />
        </div>
      </Plate>
    </div>
  );
}
