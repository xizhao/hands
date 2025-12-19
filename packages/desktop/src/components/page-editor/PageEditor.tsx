/**
 * PageEditor - Native Plate Editor with Frontmatter
 *
 * Fetches page source via tRPC and renders with Plate.
 * Handles bidirectional sync: markdown <-> Plate value
 */

import { cn } from "@/lib/utils";
import { deserializeMd, MarkdownPlugin } from "@platejs/markdown";
import { Plate, PlateContent, usePlateEditor } from "platejs/react";
import { useCallback, useEffect, useRef } from "react";
import { EditorKit } from "./editor-kit";
import { type Frontmatter, FrontmatterHeader, serializeFrontmatter, parseFrontmatter as parseFrontmatterFromSource } from "./frontmatter";
import { usePageSource } from "./hooks/usePageSource";
import { useBlockCreation } from "./hooks/useBlockCreation";
import { FloatingToolbar } from "./ui/floating-toolbar";
import { PageContextPlugin } from "./plugins/page-context-kit";

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

  // Track sync state to prevent feedback loops
  const isExternalUpdateRef = useRef(false);
  const lastSourceRef = useRef<string | null>(null);

  // Fetch page source with debounced saves and polling
  const { source, frontmatter, isLoading, isSaving, error, setSource, setFrontmatter, saveSourceNow } =
    usePageSource({ pageId, readOnly });

  // Create editor
  const editor = usePlateEditor({
    plugins: EditorKit,
    value: [{ type: "p", children: [{ text: "" }] }],
  });

  // Store editor ref for keyboard navigation
  editorRef.current = editor;

  // Hook to handle AI block creation
  useBlockCreation({
    editor,
    pageId,
    onBlockCreated: (elementId, blockId) => {
      console.log("[PageEditor] Block created via AI:", blockId);
    },
    onBlockError: (elementId, error) => {
      console.error("[PageEditor] Block creation error:", error);
    },
  });

  // Sync page context (title, description) to PageContextPlugin for CopilotPlugin access
  useEffect(() => {
    editor.setOption(PageContextPlugin, 'title', frontmatter.title);
    editor.setOption(PageContextPlugin, 'description', frontmatter.description);
    editor.setOption(PageContextPlugin, 'pageId', pageId);
  }, [editor, frontmatter.title, frontmatter.description, pageId]);

  // Serialize editor content to markdown source
  const serializeEditor = useCallback(() => {
    try {
      const api = editor.getApi(MarkdownPlugin);
      const markdown = api.markdown.serialize();
      return serializeFrontmatter(frontmatter) + markdown;
    } catch (err) {
      console.error("[PageEditor] Failed to serialize:", err);
      return null;
    }
  }, [editor, frontmatter]);

  // Handle editor changes - serialize and save (debounced)
  const handleChange = useCallback(({ value }: { value: any }) => {
    if (readOnly || isExternalUpdateRef.current) return;

    const newSource = serializeEditor();
    if (!newSource) return;

    // Only save if actually changed
    if (newSource !== lastSourceRef.current) {
      lastSourceRef.current = newSource;
      setSource(newSource); // usePageSource handles debouncing
    }
  }, [readOnly, serializeEditor, setSource]);

  // Cmd+S to force immediate save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        e.stopPropagation();

        if (readOnly) return;

        // Force serialize and save immediately
        const newSource = serializeEditor();
        if (newSource) {
          lastSourceRef.current = newSource;
          saveSourceNow(newSource);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [readOnly, serializeEditor, saveSourceNow]);

  // Sync source to editor when it changes externally
  useEffect(() => {
    if (!source) return;

    // Skip if this is from our own save
    if (source === lastSourceRef.current) return;

    // Parse frontmatter to get content
    const { contentStart } = parseFrontmatterFromSource(source);
    const content = source.slice(contentStart);

    // Deserialize markdown content to Plate value
    try {
      isExternalUpdateRef.current = true;
      const value = deserializeMd(editor, content);
      if (value && value.length > 0) {
        editor.tf.setValue(value);
        lastSourceRef.current = source;
      }
    } catch (err) {
      console.error("[PageEditor] Failed to deserialize:", err);
    } finally {
      setTimeout(() => {
        isExternalUpdateRef.current = false;
      }, 0);
    }
  }, [source, editor]);

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
      <Plate editor={editor} onChange={handleChange}>
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
              "pt-4 pb-32 pl-16 pr-6 min-h-[200px] outline-none",
              "prose prose-sm dark:prose-invert max-w-none",
              "[&_h1]:mt-6 [&_h1]:mb-4 [&_h1]:text-3xl [&_h1]:font-bold",
              "[&_h2]:mt-5 [&_h2]:mb-3 [&_h2]:text-2xl [&_h2]:font-semibold",
              "[&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-xl [&_h3]:font-semibold",
              "[&_h4]:mt-3 [&_h4]:mb-2 [&_h4]:text-lg [&_h4]:font-medium",
              "[&_h5]:mt-2 [&_h5]:mb-1 [&_h5]:text-base [&_h5]:font-medium",
              "[&_h6]:mt-2 [&_h6]:mb-1 [&_h6]:text-sm [&_h6]:font-medium",
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
