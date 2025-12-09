/**
 * WorkbookEditor - Plate-based rich editor for MDX pages
 *
 * Loads MDX content from the runtime, deserializes it to Plate,
 * and serializes back to MDX on save.
 */

import { useMemo, useCallback, useState, useEffect } from "react";
import { Plate, usePlateEditor } from "platejs/react";
import { MarkdownPlugin } from "@platejs/markdown";
import type { Value } from "platejs";

import { EditorKit } from "@/registry/components/editor/editor-kit";
import { Editor, EditorContainer } from "@/registry/ui/editor";
import { usePageContent, useSavePageContent } from "@/hooks/useWorkbook";
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

interface WorkbookEditorProps {
  className?: string;
  readOnly?: boolean;
}

export function WorkbookEditor({ className, readOnly = false }: WorkbookEditorProps) {
  // Get pageId from route params
  const { pageId } = pageRoute.useParams();

  // Load MDX content from runtime
  const { data: mdxContent, isLoading, error } = usePageContent(pageId);
  const { mutate: savePage, isPending: isSaving } = useSavePageContent();

  // Track if we've initialized the editor with content
  const [initialized, setInitialized] = useState(false);
  const [lastSavedContent, setLastSavedContent] = useState<string | null>(null);

  // Create editor with full plugin kit
  const editor = usePlateEditor({
    plugins: EditorKit,
    value: EMPTY_DOCUMENT,
  });

  // Deserialize MDX to Plate Value when content loads
  useEffect(() => {
    if (!mdxContent || initialized) return;

    try {
      // Strip frontmatter before deserializing
      let content = mdxContent;
      if (content.startsWith("---")) {
        const endIndex = content.indexOf("---", 3);
        if (endIndex !== -1) {
          content = content.slice(endIndex + 3).trim();
        }
      }

      // Use Plate's markdown API to deserialize
      const value = editor.api.markdown.deserialize(content);
      if (value && value.length > 0) {
        editor.tf.setValue(value);
      }
      setInitialized(true);
      setLastSavedContent(mdxContent);
    } catch (err) {
      console.error("[editor] Failed to deserialize MDX:", err);
      setInitialized(true);
    }
  }, [mdxContent, initialized, editor]);

  // Reset initialized state when pageId changes
  useEffect(() => {
    setInitialized(false);
    setLastSavedContent(null);
  }, [pageId]);

  // Auto-save with debounce
  const handleChange = useCallback(
    (options: { editor: typeof editor; value: Value }) => {
      if (readOnly || !initialized || !pageId) return;

      // Debounce save
      const timer = setTimeout(() => {
        try {
          // Serialize Plate Value to MDX
          const markdown = options.editor.api.markdown.serialize();

          // Preserve frontmatter from original content
          let frontmatter = "";
          if (mdxContent?.startsWith("---")) {
            const endIndex = mdxContent.indexOf("---", 3);
            if (endIndex !== -1) {
              frontmatter = mdxContent.slice(0, endIndex + 3) + "\n\n";
            }
          }

          const newContent = frontmatter + markdown;

          // Only save if content changed
          if (newContent !== lastSavedContent) {
            savePage(
              { pageId, content: newContent },
              {
                onSuccess: () => {
                  setLastSavedContent(newContent);
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
    [readOnly, initialized, pageId, mdxContent, lastSavedContent, savePage]
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
