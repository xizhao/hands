/**
 * PageEditor - Desktop Page Editor
 *
 * Thin wrapper around @hands/editor's Editor component.
 * Handles page source fetching/saving via tRPC.
 */

import { cn } from "@/lib/utils";
import {
  Editor,
  type EditorHandle,
  type EditorProps,
  type AdvancedCustomBlock,
  parseFrontmatter,
  serializeFrontmatter,
  type Frontmatter,
  PageContextPlugin,
} from "@hands/editor";
import { useCallback, useEffect, useRef, type ReactNode } from "react";

import { usePageSource } from "./hooks/usePageSource";
import { DesktopEditorProvider } from "./DesktopEditorProvider";
import { PromptPlugin, PromptMarkdownRules } from "./plugins/prompt-kit";

// ============================================================================
// Custom Blocks for Desktop
// ============================================================================

/** Prompt Block - AI prompt element */
const PromptBlock: AdvancedCustomBlock = {
  name: "Prompt",
  plugin: PromptPlugin as AdvancedCustomBlock["plugin"],
  rules: PromptMarkdownRules,
};

// ============================================================================
// Editor with Provider Wrapper
// ============================================================================

/**
 * Wrapper component that provides all required contexts.
 * Must wrap Editor to ensure LiveQueryProvider is mounted BEFORE
 * any LiveValue components render and call useLiveQuery hooks.
 */
function EditorWithProviders({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <DesktopEditorProvider>
      {children}
    </DesktopEditorProvider>
  );
}


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
  const editorRef = useRef<EditorHandle>(null);
  const lastSourceRef = useRef<string | null>(null);

  // Fetch page source with debounced saves
  const {
    source,
    frontmatter,
    isLoading,
    isSaving,
    error,
    setSource,
    setFrontmatter,
    saveSourceNow,
  } = usePageSource({ pageId, readOnly });

  // Extract content (body without frontmatter)
  const content = source ? source.slice(parseFrontmatter(source).contentStart) : "";

  // Sync page context to PageContextPlugin
  useEffect(() => {
    const editor = editorRef.current?.editor;
    if (!editor) return;

    editor.setOption(PageContextPlugin, "title", frontmatter.title);
    editor.setOption(PageContextPlugin, "description", frontmatter.description);
    editor.setOption(PageContextPlugin, "pageId", pageId);
  }, [frontmatter.title, frontmatter.description, pageId]);

  // Handle content changes from editor
  const handleChange = useCallback(
    (markdown: string) => {
      const newSource = serializeFrontmatter(frontmatter) + markdown;
      if (newSource !== lastSourceRef.current) {
        lastSourceRef.current = newSource;
        setSource(newSource);
      }
    },
    [frontmatter, setSource]
  );

  // Handle frontmatter changes
  const handleFrontmatterChange = useCallback(
    (newFrontmatter: Frontmatter) => {
      setFrontmatter(newFrontmatter);
    },
    [setFrontmatter]
  );

  // Cmd+S to force immediate save
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        e.stopPropagation();
        if (readOnly) return;

        const markdown = editorRef.current?.getMarkdown() ?? "";
        const newSource = serializeFrontmatter(frontmatter) + markdown;
        lastSourceRef.current = newSource;
        saveSourceNow(newSource);
      }
    };
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [readOnly, frontmatter, saveSourceNow]);

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
    <EditorWithProviders>
      <Editor
        ref={editorRef}
        value={content}
        onChange={handleChange}
        customBlocks={[PromptBlock]}
        plugins={[PageContextPlugin] as unknown as EditorProps["plugins"]}
        frontmatter={frontmatter}
        onFrontmatterChange={handleFrontmatterChange}
        isSaving={isSaving}
        readOnly={readOnly}
        className={className}
      />
    </EditorWithProviders>
  );
}
