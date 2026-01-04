/**
 * PageEditor - Desktop Page Editor
 *
 * Thin wrapper around @hands/editor's Editor component.
 * Handles page source fetching/saving via tRPC.
 * Shows ChatGPT-style prompt input for empty pages.
 */

import {
  type AdvancedCustomBlock,
  Editor,
  type EditorHandle,
  type EditorProps,
  type Frontmatter,
  PageContextPlugin,
  parseFrontmatter,
  SpecBar,
  serializeFrontmatter,
} from "@hands/editor";
import { RefreshCw } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { SpecBarPortal, SyncStatusPortal } from "@/components/workbook/HeaderActionsContext";
import { useActiveSession } from "@/hooks/useNavState";
import { useCreateSession, useSendMessage, useSessionStatus } from "@/hooks/useSession";
import { cn } from "@/lib/utils";
import { DesktopEditorProvider } from "./DesktopEditorProvider";
import { usePageSource } from "./hooks/usePageSource";
import { PromptMarkdownRules, PromptPlugin } from "./plugins/prompt-kit";

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
function EditorWithProviders({ children }: { children: ReactNode }) {
  return <DesktopEditorProvider>{children}</DesktopEditorProvider>;
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

export function PageEditor({ pageId, className, readOnly = false }: PageEditorProps) {
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

  // Session management for agent dispatch
  const createSession = useCreateSession();
  const sendMessage = useSendMessage();
  const { sessionId: activeSessionId } = useActiveSession();

  // Track sync session - derive isSyncing from session status
  const [syncSessionId, setSyncSessionId] = useState<string | null>(null);
  const { data: syncStatus } = useSessionStatus(syncSessionId);
  const isSyncing =
    syncSessionId !== null && (syncStatus?.type === "busy" || syncStatus?.type === "running");

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
    [frontmatter, setSource],
  );

  // Handle frontmatter changes
  const handleFrontmatterChange = useCallback(
    (newFrontmatter: Frontmatter) => {
      setFrontmatter(newFrontmatter);
    },
    [setFrontmatter],
  );

  // Handle description changes from SpecBar
  const handleDescriptionChange = useCallback(
    (description: string) => {
      setFrontmatter({ ...frontmatter, description: description || undefined });
    },
    [frontmatter, setFrontmatter],
  );

  // Handle Sync: Dispatch to @hands to generate/regenerate page from spec + schema
  const handleSync = useCallback(async () => {
    // Don't create duplicate sync sessions
    if (isSyncing) return;

    try {
      // Create a background session for this sync task
      // parentID makes it appear in background jobs pill instead of main thread list
      const newSession = await createSession.mutateAsync({
        title: `Sync: ${frontmatter.title || pageId}`,
        parentID: activeSessionId || "__sync__",
      });
      const sessionId = newSession.id;

      // Track this session for status updates (runs in background)
      setSyncSessionId(sessionId);

      // Get current content for context
      const currentContent = editorRef.current?.getMarkdown() ?? "";

      // Build prompt for @hands
      const spec = frontmatter.description
        ? `**Spec:** ${frontmatter.description}`
        : "No spec provided - generate sensible content based on the page title and available schema.";

      const prompt = `Generate/update the page content based on this spec:

**Page:** ${frontmatter.title || pageId}
${spec}

${
  currentContent
    ? `**Current content (preserve user sections where appropriate):**
\`\`\`mdx
${currentContent}
\`\`\``
    : "This is a new page - generate initial content."
}

Write the content directly to the page file. Use the schema tool to understand available data. Use LiveValue for data display and LiveAction for interactions where appropriate.`;

      await sendMessage.mutateAsync({
        sessionId,
        content: prompt,
        agent: "hands",
      });
    } catch (err) {
      console.error("Sync failed:", err);
      // Clear sync session on error so user can retry
      setSyncSessionId(null);
    }
  }, [isSyncing, frontmatter, pageId, activeSessionId, createSession, sendMessage]);

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
      {/* Sync status indicator in tab */}
      <SyncStatusPortal>
        {isSyncing && <RefreshCw className="h-3 w-3 ml-1 text-primary animate-spin" />}
      </SyncStatusPortal>

      {/* SpecBar portaled into header tab dropdown */}
      <SpecBarPortal>
        <SpecBar
          description={frontmatter.description ?? ""}
          onDescriptionChange={handleDescriptionChange}
          onSync={handleSync}
          isSyncing={isSyncing}
          readOnly={readOnly}
        />
      </SpecBarPortal>

      <Editor
        ref={editorRef}
        value={content}
        onChange={handleChange}
        customBlocks={[PromptBlock]}
        plugins={[PageContextPlugin] as unknown as EditorProps["plugins"]}
        frontmatter={frontmatter}
        onFrontmatterChange={handleFrontmatterChange}
        showTitle={false}
        showDescription={false}
        isSaving={isSaving}
        readOnly={readOnly}
        className={className}
      />
    </EditorWithProviders>
  );
}
