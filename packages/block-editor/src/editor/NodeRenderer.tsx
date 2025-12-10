/**
 * Node Renderer - Renders JSX nodes in the visual editor
 *
 * Each node is a droppable/sortable target for drag-and-drop.
 */

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import type { JsxNode } from "../model/block-model"

export interface NodeRendererProps {
  /** The node to render */
  node: JsxNode

  /** Currently selected node ID */
  selectedId: string | null

  /** Currently hovered node ID (during drag) */
  hoveredId: string | null

  /** Callback when a node is selected */
  onSelect: (nodeId: string) => void

  /** Callback when a node should be deleted */
  onDelete: (nodeId: string) => void

  /** Current nesting depth */
  depth: number
}

/**
 * Renders a single JSX node with drag-and-drop support
 */
export function NodeRenderer({
  node,
  selectedId,
  hoveredId,
  onSelect,
  onDelete,
  depth,
}: NodeRendererProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: node.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const isSelected = selectedId === node.id
  const isHovered = hoveredId === node.id
  const indent = depth * 16

  // Handle click to select
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onSelect(node.id)
  }

  // Handle delete key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault()
      onDelete(node.id)
    }
  }

  // Render based on node type
  switch (node.type) {
    case "text":
      return (
        <div
          ref={setNodeRef}
          style={{ ...style, marginLeft: indent }}
          {...attributes}
          {...listeners}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          tabIndex={0}
          className={`
            px-2 py-1 rounded text-sm cursor-pointer
            ${isSelected ? "bg-primary/20 ring-1 ring-primary" : "hover:bg-muted/50"}
            ${isHovered ? "ring-1 ring-blue-400" : ""}
          `}
        >
          <span className="text-muted-foreground italic">
            "{node.text || "(empty text)"}"
          </span>
        </div>
      )

    case "expression":
      return (
        <div
          ref={setNodeRef}
          style={{ ...style, marginLeft: indent }}
          {...attributes}
          {...listeners}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          tabIndex={0}
          className={`
            px-2 py-1 rounded text-sm cursor-pointer font-mono
            ${isSelected ? "bg-primary/20 ring-1 ring-primary" : "hover:bg-muted/50"}
            ${isHovered ? "ring-1 ring-blue-400" : ""}
          `}
        >
          <span className="text-amber-600 dark:text-amber-400">
            {`{${node.expression || "..."}}`}
          </span>
        </div>
      )

    case "fragment":
      return (
        <div
          ref={setNodeRef}
          style={style}
          className="space-y-1"
        >
          <div
            {...attributes}
            {...listeners}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            tabIndex={0}
            style={{ marginLeft: indent }}
            className={`
              px-2 py-1 rounded text-sm cursor-pointer
              ${isSelected ? "bg-primary/20 ring-1 ring-primary" : "hover:bg-muted/50"}
              ${isHovered ? "ring-1 ring-blue-400" : ""}
            `}
          >
            <span className="text-purple-600 dark:text-purple-400 font-mono">
              {"<>"}
            </span>
          </div>

          {/* Children */}
          <div className="ml-4 border-l border-border/50 pl-2 space-y-1">
            {node.children?.map((child) => (
              <NodeRenderer
                key={child.id}
                node={child}
                selectedId={selectedId}
                hoveredId={hoveredId}
                onSelect={onSelect}
                onDelete={onDelete}
                depth={depth + 1}
              />
            ))}

            {/* Empty drop zone */}
            {(!node.children || node.children.length === 0) && (
              <div className="px-2 py-4 text-xs text-muted-foreground text-center border border-dashed border-border rounded">
                Drop components here
              </div>
            )}
          </div>

          <div style={{ marginLeft: indent }} className="px-2 py-1 text-sm">
            <span className="text-purple-600 dark:text-purple-400 font-mono">
              {"</>"}
            </span>
          </div>
        </div>
      )

    case "element":
      return (
        <div
          ref={setNodeRef}
          style={style}
          className="space-y-1"
        >
          {/* Opening tag */}
          <div
            {...attributes}
            {...listeners}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            tabIndex={0}
            style={{ marginLeft: indent }}
            className={`
              px-2 py-1 rounded text-sm cursor-pointer flex items-center gap-2
              ${isSelected ? "bg-primary/20 ring-1 ring-primary" : "hover:bg-muted/50"}
              ${isHovered ? "ring-1 ring-blue-400" : ""}
            `}
          >
            <span className="text-blue-600 dark:text-blue-400 font-mono">
              {"<"}
              <span className="text-green-600 dark:text-green-400">
                {node.tagName}
              </span>
              {renderInlineProps(node.props)}
              {(!node.children || node.children.length === 0) ? " />" : ">"}
            </span>

            {/* Delete button */}
            {isSelected && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(node.id)
                }}
                className="ml-auto px-1 text-xs text-destructive hover:bg-destructive/20 rounded"
              >
                ×
              </button>
            )}
          </div>

          {/* Children */}
          {node.children && node.children.length > 0 && (
            <>
              <div className="ml-4 border-l border-border/50 pl-2 space-y-1">
                {node.children.map((child) => (
                  <NodeRenderer
                    key={child.id}
                    node={child}
                    selectedId={selectedId}
                    hoveredId={hoveredId}
                    onSelect={onSelect}
                    onDelete={onDelete}
                    depth={depth + 1}
                  />
                ))}
              </div>

              {/* Closing tag */}
              <div style={{ marginLeft: indent }} className="px-2 py-1 text-sm">
                <span className="text-blue-600 dark:text-blue-400 font-mono">
                  {"</"}
                  <span className="text-green-600 dark:text-green-400">
                    {node.tagName}
                  </span>
                  {">"}
                </span>
              </div>
            </>
          )}
        </div>
      )

    default:
      return null
  }
}

/**
 * Render inline props preview
 */
function renderInlineProps(props?: Record<string, unknown>): React.ReactNode {
  if (!props) return null

  const entries = Object.entries(props).slice(0, 3)
  if (entries.length === 0) return null

  return (
    <span className="text-muted-foreground ml-1">
      {entries.map(([key, value], i) => (
        <span key={key}>
          {i > 0 && " "}
          <span className="text-orange-500">{key}</span>
          {value !== undefined && (
            <>
              =
              <span className="text-amber-600">
                {typeof value === "string" ? `"${value}"` : "{...}"}
              </span>
            </>
          )}
        </span>
      ))}
      {Object.keys(props).length > 3 && (
        <span className="text-muted-foreground"> ...</span>
      )}
    </span>
  )
}

export default NodeRenderer
