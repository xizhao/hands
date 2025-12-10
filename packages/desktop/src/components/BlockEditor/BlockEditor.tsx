/**
 * BlockEditor - Visual Block Editor
 *
 * WYSIWYG editor for JSX block files with drag-drop support.
 * Uses react-dnd and Plate-style components.
 */

import { useState, useCallback } from "react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { useBlockSource } from "@/lib/blocks-client";
import { cn } from "@/lib/utils";

import { ComponentPalette } from "./palette/ComponentPalette";
import { PropsPanel } from "./props/PropsPanel";
import { EditorToolbar } from "./EditorToolbar";
import { VisualCanvas } from "./preview/VisualCanvas";

import type { JsxNode } from "./types";
import { createDefaultRoot, findNode, updateNode, deleteNode, moveNode, insertNode } from "./lib/node-utils";
import { createNode } from "./lib/node-factory";
import { generateBlockSource } from "./lib/codegen";

export interface BlockEditorProps {
  blockId: string;
  className?: string;
  onSave?: () => void;
}

export function BlockEditor({ blockId, className, onSave }: BlockEditorProps) {
  const { data, isLoading, save } = useBlockSource(blockId);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editor state
  const [root, setRoot] = useState<JsxNode>(() => createDefaultRoot());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Find selected node
  const selectedNode = selectedNodeId ? findNode(root, selectedNodeId) : null;

  // Handlers
  const handleSelectNode = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
  }, []);

  const handleUpdateNode = useCallback((nodeId: string, updates: Partial<JsxNode>) => {
    setRoot((prev) => updateNode(prev, nodeId, updates));
  }, []);

  const handleMoveNode = useCallback((nodeId: string, targetId: string, position: "before" | "after" | "inside") => {
    setRoot((prev) => moveNode(prev, nodeId, targetId, position));
  }, []);

  const handleDeleteNode = useCallback((nodeId: string) => {
    if (selectedNodeId === nodeId) {
      setSelectedNodeId(null);
    }
    setRoot((prev) => deleteNode(prev, nodeId));
  }, [selectedNodeId]);

  const handleAddNode = useCallback((nodeType: string, targetId?: string) => {
    const newNode = createNode(nodeType);
    setRoot((prev) => {
      if (targetId) {
        return insertNode(prev, newNode, targetId, "inside");
      }
      return {
        ...prev,
        children: [...(prev.children || []), newNode],
      };
    });
    setSelectedNodeId(newNode.id);
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    try {
      const source = generateBlockSource(blockId, root);
      const result = await save(source);
      if (!result.success) {
        setError(result.error || "Save failed");
      } else {
        onSave?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  }, [blockId, root, save, onSave]);

  // Loading/error states
  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center h-full", className)}>
        <div className="text-muted-foreground">Loading block...</div>
      </div>
    );
  }

  if (data?.error) {
    return (
      <div className={cn("flex items-center justify-center h-full", className)}>
        <div className="text-destructive">{data.error}</div>
      </div>
    );
  }

  return (
    <DndProvider backend={HTML5Backend}>
      <div className={cn("flex flex-col h-full bg-background", className)}>
        <EditorToolbar blockId={blockId} onSave={handleSave} isSaving={isSaving} />

        <div className="flex flex-1 overflow-hidden">
          {/* Component Palette */}
          <div className="w-56 border-r bg-muted/30 overflow-y-auto">
            <ComponentPalette onAddNode={handleAddNode} />
          </div>

          {/* Visual Canvas */}
          <div className="flex-1 overflow-auto p-4 bg-muted/10">
            <VisualCanvas
              root={root}
              selectedNodeId={selectedNodeId}
              onSelectNode={handleSelectNode}
              onAddNode={handleAddNode}
              onMoveNode={handleMoveNode}
              onDeleteNode={handleDeleteNode}
            />
          </div>

          {/* Props Panel */}
          <div className="w-72 border-l bg-muted/30 overflow-y-auto">
            <PropsPanel
              node={selectedNode}
              onUpdate={(updates) => selectedNodeId && handleUpdateNode(selectedNodeId, updates)}
              onDelete={() => selectedNodeId && handleDeleteNode(selectedNodeId)}
            />
          </div>
        </div>

        {error && (
          <div className="px-4 py-2 bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}
      </div>
    </DndProvider>
  );
}
