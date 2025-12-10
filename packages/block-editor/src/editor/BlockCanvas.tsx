/**
 * Block Canvas - Main visual editor component
 *
 * Provides a drag-and-drop canvas for editing block JSX structure.
 * Uses @dnd-kit for accessible drag-and-drop.
 */

import { useState, useCallback, useMemo } from "react"
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import type { BlockModel, JsxNode, PropSchema } from "../model/block-model"
import { findNode, moveNode, insertNode, updateNode, removeNode } from "../model/block-model"
import { NodeRenderer } from "./NodeRenderer"
import { ComponentPalette, type ComponentDefinition } from "./ComponentPalette"
import { PropEditor } from "./PropEditor"
import { SqlQueryEditor } from "./SqlQueryEditor"

export interface BlockCanvasProps {
  /** The block model to edit */
  model: BlockModel

  /** Callback when the model changes */
  onModelChange: (model: BlockModel) => void

  /** Available components for the palette */
  componentRegistry?: ComponentDefinition[]

  /** Database schema for SQL autocomplete */
  databaseSchema?: Record<string, string[]>

  /** Class name for the container */
  className?: string
}

/**
 * Main visual editor canvas for block editing
 */
export function BlockCanvas({
  model,
  onModelChange,
  componentRegistry = defaultComponents,
  databaseSchema,
  className,
}: BlockCanvasProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  // Configure drag sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Get the selected node
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null
    return findNode(model.root, selectedNodeId)
  }, [model.root, selectedNodeId])

  // Get prop schema for selected node
  const selectedNodeSchema = useMemo(() => {
    if (!selectedNode || selectedNode.type !== "element") return null

    // Find component definition
    const comp = componentRegistry.find((c) => c.tagName === selectedNode.tagName)
    return comp?.propSchema ?? null
  }, [selectedNode, componentRegistry])

  // Collect all node IDs for sortable context
  const allNodeIds = useMemo(() => {
    const ids: string[] = []
    const collect = (node: JsxNode) => {
      ids.push(node.id)
      node.children?.forEach(collect)
    }
    collect(model.root)
    return ids
  }, [model.root])

  // Handle drag start
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id))
  }, [])

  // Handle drag over
  const handleDragOver = useCallback((event: DragOverEvent) => {
    setOverId(event.over ? String(event.over.id) : null)
  }, [])

  // Handle drag end
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      setActiveId(null)
      setOverId(null)

      if (!over) return

      const activeIdStr = String(active.id)
      const overIdStr = String(over.id)

      // Check if this is a new component from palette
      if (activeIdStr.startsWith("palette:")) {
        const tagName = activeIdStr.replace("palette:", "")
        const comp = componentRegistry.find((c) => c.tagName === tagName)
        if (!comp) return

        // Create new node
        const newNode: JsxNode = {
          id: `node_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
          type: "element",
          tagName: comp.tagName,
          props: {},
          children: comp.acceptsChildren ? [] : undefined,
        }

        // Insert into target
        const newRoot = insertNode(model.root, overIdStr, newNode)
        onModelChange({ ...model, root: newRoot })
        setSelectedNodeId(newNode.id)
        return
      }

      // Move existing node
      if (activeIdStr !== overIdStr) {
        const newRoot = moveNode(model.root, activeIdStr, overIdStr)
        onModelChange({ ...model, root: newRoot })
      }
    },
    [model, onModelChange, componentRegistry]
  )

  // Handle node selection
  const handleSelectNode = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId)
  }, [])

  // Handle node prop change
  const handleNodeChange = useCallback(
    (nodeId: string, updates: Partial<JsxNode>) => {
      const newRoot = updateNode(model.root, nodeId, updates)
      onModelChange({ ...model, root: newRoot })
    },
    [model, onModelChange]
  )

  // Handle node deletion
  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      const newRoot = removeNode(model.root, nodeId)
      if (newRoot) {
        onModelChange({ ...model, root: newRoot })
        if (selectedNodeId === nodeId) {
          setSelectedNodeId(null)
        }
      }
    },
    [model, onModelChange, selectedNodeId]
  )

  // Handle SQL query changes
  const handleQueriesChange = useCallback(
    (queries: typeof model.queries) => {
      onModelChange({ ...model, queries })
    },
    [model, onModelChange]
  )

  // Get the active node for drag overlay
  const activeNode = activeId ? findNode(model.root, activeId) : null

  return (
    <div className={`flex h-full ${className ?? ""}`}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        {/* Component Palette - Left sidebar */}
        <ComponentPalette components={componentRegistry} />

        {/* Main Canvas - Center */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* SQL Queries Panel */}
          {model.queries.length > 0 && (
            <div className="border-b p-4 bg-muted/20">
              <SqlQueryEditor
                queries={model.queries}
                onQueriesChange={handleQueriesChange}
                databaseSchema={databaseSchema}
              />
            </div>
          )}

          {/* JSX Canvas */}
          <div className="flex-1 p-4 overflow-auto bg-background">
            <div className="min-h-full p-4 border border-dashed border-border rounded-lg">
              <SortableContext items={allNodeIds} strategy={verticalListSortingStrategy}>
                <NodeRenderer
                  node={model.root}
                  selectedId={selectedNodeId}
                  hoveredId={overId}
                  onSelect={handleSelectNode}
                  onDelete={handleDeleteNode}
                  depth={0}
                />
              </SortableContext>
            </div>
          </div>
        </div>

        {/* Properties Panel - Right sidebar */}
        <PropEditor
          node={selectedNode}
          schema={selectedNodeSchema}
          onChange={(updates) => {
            if (selectedNodeId) {
              handleNodeChange(selectedNodeId, updates)
            }
          }}
        />

        {/* Drag overlay */}
        <DragOverlay>
          {activeNode && (
            <div className="bg-background border border-primary rounded p-2 shadow-lg opacity-80">
              <span className="text-sm font-mono">
                {activeNode.type === "element" ? `<${activeNode.tagName}>` : activeNode.type}
              </span>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

/**
 * Default component definitions for the palette
 */
const defaultComponents: ComponentDefinition[] = [
  {
    tagName: "div",
    displayName: "Container",
    category: "Layout",
    acceptsChildren: true,
    propSchema: {
      properties: {
        className: { type: "string", editor: "text" },
      },
      required: [],
    },
  },
  {
    tagName: "span",
    displayName: "Inline",
    category: "Layout",
    acceptsChildren: true,
    propSchema: {
      properties: {
        className: { type: "string", editor: "text" },
      },
      required: [],
    },
  },
  {
    tagName: "p",
    displayName: "Paragraph",
    category: "Typography",
    acceptsChildren: true,
    propSchema: {
      properties: {
        className: { type: "string", editor: "text" },
      },
      required: [],
    },
  },
  {
    tagName: "h1",
    displayName: "Heading 1",
    category: "Typography",
    acceptsChildren: true,
    propSchema: {
      properties: {
        className: { type: "string", editor: "text" },
      },
      required: [],
    },
  },
  {
    tagName: "h2",
    displayName: "Heading 2",
    category: "Typography",
    acceptsChildren: true,
    propSchema: {
      properties: {
        className: { type: "string", editor: "text" },
      },
      required: [],
    },
  },
  {
    tagName: "ul",
    displayName: "List",
    category: "Layout",
    acceptsChildren: true,
    propSchema: {
      properties: {
        className: { type: "string", editor: "text" },
      },
      required: [],
    },
  },
  {
    tagName: "li",
    displayName: "List Item",
    category: "Layout",
    acceptsChildren: true,
    propSchema: {
      properties: {
        className: { type: "string", editor: "text" },
      },
      required: [],
    },
  },
]

export default BlockCanvas
