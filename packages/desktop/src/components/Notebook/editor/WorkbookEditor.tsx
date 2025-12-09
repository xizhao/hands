/**
 * WorkbookEditor - Plate-based rich editor with RSC block support
 *
 * Uses Plate UI components and idiomatic Plate patterns.
 */

import { useMemo, useCallback, useState } from "react";
import { Plate, usePlateEditor } from "platejs/react";
import type { Value } from "platejs";

import { BasicNodesKit } from "@/components/editor/plugins/basic-nodes-kit";
import { DndKit } from "@/components/editor/plugins/dnd-kit";
import { Editor, EditorContainer } from "@/components/ui/editor";
import { useNotebook, useNotebookAutoSave } from "@/lib/blocks-client";
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
  const { data: notebook, isLoading } = useNotebook();
  const [value, setValue] = useState<Value | null>(null);

  // Initialize value from notebook when loaded
  const initialValue = useMemo(() => {
    if (notebook?.content && Array.isArray(notebook.content) && notebook.content.length > 0) {
      return notebook.content as Value;
    }
    return EMPTY_DOCUMENT;
  }, [notebook]);

  // Create editor with plugins (BasicNodesKit + DnD for drag handles)
  const editor = usePlateEditor({
    plugins: [...BasicNodesKit, ...DndKit],
    value: initialValue,
  });

  // Track changes for auto-save
  const currentValue = value ?? initialValue;

  // Auto-save when content changes
  const { isSaving: _isSaving, lastSaved: _lastSaved } = useNotebookAutoSave(
    currentValue,
    !readOnly && !isLoading && value !== null
  );

  const handleChange = useCallback(({ value }: { value: Value }) => {
    setValue(value);
  }, []);

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

  return (
    <div className={cn("flex flex-col h-full", className)}>
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
