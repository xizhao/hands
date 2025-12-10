/**
 * WorkbookEditor - Plate-based rich editor for MDX pages
 *
 * Loads MDX content from the runtime, deserializes it to Plate,
 * and serializes back to MDX on save.
 *
 * Frontmatter handling:
 * - Parses frontmatter to extract page title
 * - Ensures h1 in editor matches frontmatter title
 * - Syncs h1 changes back to frontmatter on save
 */

import { useMemo, useCallback, useState, useEffect, useRef } from "react";
import { Plate, usePlateEditor } from "platejs/react";
import { MarkdownPlugin } from "@platejs/markdown";
import type { Value } from "platejs";

import { EditorKit } from "@/registry/components/editor/editor-kit";
import { Editor, EditorContainer } from "@/registry/ui/editor";
import { usePageContent, useSavePageContent, useUpdatePageTitle } from "@/hooks/useWorkbook";
import { pageRoute } from "@/routes/_notebook/page.$pageId";
import { cn } from "@/lib/utils";

// Default empty document
const EMPTY_DOCUMENT: Value = [
  {
    id: "1",
    type: "h1",
    children: [{ text: "Untitled" }],
  },
  {
    id: "2",
    type: "p",
    children: [{ text: "" }],
  },
];

/**
 * Parse frontmatter from MDX content
 */
function parseFrontmatter(source: string): { title: string; content: string; rawFrontmatter: string } {
  if (!source.startsWith("---")) {
    return { title: "Untitled", content: source, rawFrontmatter: "" };
  }

  const endIndex = source.indexOf("---", 3);
  if (endIndex === -1) {
    return { title: "Untitled", content: source, rawFrontmatter: "" };
  }

  const frontmatterStr = source.slice(3, endIndex).trim();
  const content = source.slice(endIndex + 3).trim();
  const rawFrontmatter = source.slice(0, endIndex + 3);

  // Parse title from frontmatter
  let title = "Untitled";
  for (const line of frontmatterStr.split("\n")) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    if (key === "title") {
      let value = line.slice(colonIndex + 1).trim();
      // Remove quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      title = value;
      break;
    }
  }

  return { title, content, rawFrontmatter };
}

/**
 * Update title in frontmatter string
 */
function updateFrontmatterTitle(rawFrontmatter: string, newTitle: string): string {
  if (!rawFrontmatter) {
    return `---\ntitle: "${newTitle}"\n---`;
  }

  const lines = rawFrontmatter.slice(3, -3).trim().split("\n");
  let titleFound = false;
  const updatedLines = lines.map(line => {
    if (line.startsWith("title:")) {
      titleFound = true;
      return `title: "${newTitle}"`;
    }
    return line;
  });

  if (!titleFound) {
    updatedLines.unshift(`title: "${newTitle}"`);
  }

  return `---\n${updatedLines.join("\n")}\n---`;
}

/**
 * Extract text from first h1 in editor value
 */
function extractH1Title(value: Value): string | null {
  for (const node of value) {
    if (node.type === "h1" && Array.isArray(node.children)) {
      const text = node.children
        .map((child: any) => child.text || "")
        .join("");
      return text || null;
    }
  }
  return null;
}

interface WorkbookEditorProps {
  className?: string;
  readOnly?: boolean;
}

export function WorkbookEditor({ className, readOnly = false }: WorkbookEditorProps) {
  // Get pageId from route params
  const { pageId } = pageRoute.useParams();

  // Load MDX content from runtime - refetch every 2 seconds to detect external changes
  const { data: mdxContent, isLoading, error, dataUpdatedAt } = usePageContent(pageId);
  const { mutate: savePage, isPending: isSaving } = useSavePageContent();
  const { mutate: updateTitle } = useUpdatePageTitle();

  // Track content state for detecting external changes
  const [lastLoadedContent, setLastLoadedContent] = useState<string | null>(null);
  const [lastSavedContent, setLastSavedContent] = useState<string | null>(null);
  const lastSaveTime = useRef<number>(0);

  // Track frontmatter state
  const [frontmatter, setFrontmatter] = useState({ title: "Untitled", rawFrontmatter: "" });
  const lastSyncedTitle = useRef<string>("Untitled");

  // Create editor with full plugin kit
  const editor = usePlateEditor({
    plugins: EditorKit,
    value: EMPTY_DOCUMENT,
  });

  // Deserialize MDX to Plate Value when content loads or changes externally
  useEffect(() => {
    if (!mdxContent) return;

    // Skip if this is content we just saved (within last 3 seconds)
    const timeSinceLastSave = Date.now() - lastSaveTime.current;
    if (timeSinceLastSave < 3000 && mdxContent === lastSavedContent) {
      return;
    }

    // Skip if content hasn't changed
    if (mdxContent === lastLoadedContent) {
      return;
    }

    try {
      // Parse frontmatter to extract title
      const { title, content, rawFrontmatter } = parseFrontmatter(mdxContent);
      setFrontmatter({ title, rawFrontmatter });
      lastSyncedTitle.current = title;

      // Use Plate's markdown API to deserialize content (without frontmatter)
      const value = editor.api.markdown.deserialize(content);
      if (value && value.length > 0) {
        // If content doesn't start with h1, prepend one with frontmatter title
        const hasH1 = value.length > 0 && value[0].type === "h1";
        if (!hasH1) {
          value.unshift({
            id: "title-h1",
            type: "h1",
            children: [{ text: title }],
          });
        }
        editor.tf.setValue(value);
      }
      setLastLoadedContent(mdxContent);
      setLastSavedContent(mdxContent);
    } catch (err) {
      console.error("[editor] Failed to deserialize MDX:", err);
      setLastLoadedContent(mdxContent);
    }
  }, [mdxContent, lastLoadedContent, lastSavedContent, editor]);

  // Reset state when pageId changes
  useEffect(() => {
    setLastLoadedContent(null);
    setLastSavedContent(null);
    setFrontmatter({ title: "Untitled", rawFrontmatter: "" });
    lastSyncedTitle.current = "Untitled";
    lastSaveTime.current = 0;
  }, [pageId]);

  // Auto-save with debounce
  const handleChange = useCallback(
    (options: { editor: typeof editor; value: Value }) => {
      if (readOnly || !lastLoadedContent || !pageId) return;

      // Debounce save
      const timer = setTimeout(() => {
        try {
          // Extract h1 title from current editor value
          const currentH1Title = extractH1Title(options.value);

          // Serialize Plate Value to MDX
          const markdown = options.editor.api.markdown.serialize();

          // Check if h1 title changed - if so, update frontmatter
          let updatedFrontmatter = frontmatter.rawFrontmatter;
          if (currentH1Title && currentH1Title !== lastSyncedTitle.current) {
            updatedFrontmatter = updateFrontmatterTitle(frontmatter.rawFrontmatter, currentH1Title);
            lastSyncedTitle.current = currentH1Title;
            setFrontmatter(prev => ({ ...prev, title: currentH1Title, rawFrontmatter: updatedFrontmatter }));

            // Also update title via API (updates manifest/sidebar)
            updateTitle({ pageId, title: currentH1Title });
          }

          // Build final content with frontmatter
          const newContent = updatedFrontmatter
            ? updatedFrontmatter + "\n\n" + markdown
            : markdown;

          // Only save if content changed
          if (newContent !== lastSavedContent) {
            savePage(
              { pageId, content: newContent },
              {
                onSuccess: () => {
                  lastSaveTime.current = Date.now();
                  setLastSavedContent(newContent);
                  setLastLoadedContent(newContent);
                },
              }
            );
          }
        } catch (err) {
          console.error("[editor] Failed to serialize MDX:", err);
        }
      }, 1500);

      return () => clearTimeout(timer);
    },
    [readOnly, lastLoadedContent, pageId, frontmatter, lastSavedContent, savePage, updateTitle]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
          <span className="text-sm font-medium">Loading...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <div className="text-center text-muted-foreground">
          <p className="text-sm font-medium">Failed to load page</p>
          <p className="text-xs mt-1">{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Save indicator */}
      {isSaving && (
        <div className="absolute top-2 right-2 text-xs text-muted-foreground">
          Saving...
        </div>
      )}

      {/* Plate editor */}
      <Plate
        editor={editor}
        onChange={handleChange}
        readOnly={readOnly}
      >
        <EditorContainer variant="default" className="bg-background">
          <Editor
            variant="default"
            className="pt-0"
            placeholder="Start writing..."
          />
        </EditorContainer>
      </Plate>
    </div>
  );
}
