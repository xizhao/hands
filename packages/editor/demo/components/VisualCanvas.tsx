import React, { useCallback, useRef } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { JsxNode, NodePath, Mutation } from '../../src'

interface VisualCanvasProps {
  ast: JsxNode | null
  selectedPath: NodePath | null
  onSelect: (path: NodePath | null) => void
  onMutation: (mutation: Mutation) => void
}

export function VisualCanvas({ ast, selectedPath, onSelect, onMutation }: VisualCanvasProps) {
  const [activeId, setActiveId] = React.useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }, [])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = event

    if (over && active.id !== over.id) {
      // Find paths from IDs and create move mutation
      const fromPath = (active.data.current as any)?.path as NodePath
      const overData = over.data.current as any
      const toPath = overData?.parentPath as NodePath
      const toIndex = overData?.index as number

      if (fromPath && toPath !== undefined && toIndex !== undefined) {
        onMutation({
          type: 'move-node',
          fromPath,
          toPath,
          toIndex,
        })
      }
    }
  }, [onMutation])

  if (!ast) {
    return (
      <div style={styles.empty}>
        No AST to render. Select a fixture to get started.
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div style={styles.canvas} onClick={() => onSelect(null)}>
        <RenderNode
          node={ast}
          path={[]}
          selectedPath={selectedPath}
          onSelect={onSelect}
          depth={0}
        />
      </div>
      <DragOverlay>
        {activeId ? (
          <div style={styles.dragOverlay}>
            Dragging...
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

interface RenderNodeProps {
  node: JsxNode
  path: NodePath
  selectedPath: NodePath | null
  onSelect: (path: NodePath | null) => void
  depth: number
}

function RenderNode({ node, path, selectedPath, onSelect, depth }: RenderNodeProps) {
  const isSelected = selectedPath && pathEquals(path, selectedPath)
  const hasChildren = (node.children?.length ?? 0) > 0

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onSelect(path)
  }, [path, onSelect])

  // Text node
  if (node.type === 'text') {
    return (
      <span
        style={{
          ...styles.textNode,
          ...(isSelected ? styles.selected : {}),
        }}
        onClick={handleClick}
      >
        {node.text}
      </span>
    )
  }

  // Expression node
  if (node.type === 'expression') {
    return (
      <span
        style={{
          ...styles.expressionNode,
          ...(isSelected ? styles.selected : {}),
        }}
        onClick={handleClick}
      >
        {'{'}
        <span style={styles.expressionCode}>{node.expression}</span>
        {'}'}
      </span>
    )
  }

  // Element node - render as a visual block
  const tagName = node.tagName || 'div'
  const isInline = isInlineElement(tagName)
  const children = node.children ?? []

  // Get display props (filter out children prop)
  const displayProps = Object.entries(node.props ?? {})
    .filter(([key]) => key !== 'children')
    .slice(0, 3) // Show max 3 props

  return (
    <SortableElement id={node.id} path={path} index={getIndexFromPath(path)}>
      <div
        style={{
          ...styles.elementNode,
          ...(isInline ? styles.inlineElement : {}),
          ...(isSelected ? styles.selected : {}),
          marginLeft: depth > 0 ? 0 : 0,
        }}
        onClick={handleClick}
      >
        {/* Element header */}
        <div style={styles.elementHeader}>
          <span style={styles.tagName}>{tagName}</span>
          {displayProps.length > 0 && (
            <span style={styles.propsPreview}>
              {displayProps.map(([key, val]) => (
                <span key={key} style={styles.propChip}>
                  {key}={formatPropValue(val)}
                </span>
              ))}
            </span>
          )}
        </div>

        {/* Children */}
        {hasChildren && (
          <SortableContext
            items={children.map(c => c.id)}
            strategy={verticalListSortingStrategy}
          >
            <div style={styles.childrenContainer}>
              {children.map((child, index) => (
                <RenderNode
                  key={child.id}
                  node={child}
                  path={[...path, 'children', index]}
                  selectedPath={selectedPath}
                  onSelect={onSelect}
                  depth={depth + 1}
                />
              ))}
            </div>
          </SortableContext>
        )}
      </div>
    </SortableElement>
  )
}

interface SortableElementProps {
  id: string
  path: NodePath
  index: number
  children: React.ReactNode
}

function SortableElement({ id, path, index, children }: SortableElementProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    data: {
      path,
      index,
      parentPath: path.slice(0, -2),
    },
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  )
}

function pathEquals(a: NodePath, b: NodePath): boolean {
  if (a.length !== b.length) return false
  return a.every((segment, i) => segment === b[i])
}

function getIndexFromPath(path: NodePath): number {
  if (path.length < 2) return 0
  const lastSegment = path[path.length - 1]
  return typeof lastSegment === 'number' ? lastSegment : 0
}

function isInlineElement(tagName: string): boolean {
  const inlineElements = ['span', 'a', 'strong', 'em', 'b', 'i', 'Badge', 'Button']
  return inlineElements.includes(tagName)
}

function formatPropValue(value: any): string {
  if (!value) return '?'
  if (value.type === 'literal') {
    if (typeof value.value === 'string') {
      const str = value.value as string
      return `"${str.length > 15 ? str.slice(0, 15) + '...' : str}"`
    }
    return String(value.value)
  }
  if (value.type === 'expression') {
    return `{...}`
  }
  return '?'
}

const styles: Record<string, React.CSSProperties> = {
  canvas: {
    padding: '16px',
    minHeight: '100%',
  },
  empty: {
    color: '#666',
    fontSize: '14px',
    padding: '24px',
    textAlign: 'center',
  },
  elementNode: {
    border: '1px solid #333',
    borderRadius: '6px',
    backgroundColor: '#1e1e1e',
    marginBottom: '8px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  inlineElement: {
    display: 'inline-block',
    marginRight: '8px',
    marginBottom: '4px',
  },
  selected: {
    borderColor: '#4a9eff',
    boxShadow: '0 0 0 2px rgba(74, 158, 255, 0.3)',
  },
  elementHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    borderBottom: '1px solid #333',
    backgroundColor: '#252525',
    borderRadius: '6px 6px 0 0',
  },
  tagName: {
    color: '#7eb3ff',
    fontFamily: 'ui-monospace, monospace',
    fontSize: '13px',
    fontWeight: 600,
  },
  propsPreview: {
    display: 'flex',
    gap: '4px',
    flexWrap: 'wrap',
  },
  propChip: {
    fontSize: '11px',
    padding: '2px 6px',
    backgroundColor: '#333',
    borderRadius: '4px',
    color: '#a0a0a0',
    fontFamily: 'ui-monospace, monospace',
  },
  childrenContainer: {
    padding: '8px 12px',
  },
  textNode: {
    display: 'inline-block',
    padding: '4px 8px',
    backgroundColor: '#1a2a1a',
    borderRadius: '4px',
    color: '#a5d6a7',
    fontSize: '13px',
    marginBottom: '4px',
    cursor: 'pointer',
  },
  expressionNode: {
    display: 'inline-block',
    padding: '4px 8px',
    backgroundColor: '#2a2a1a',
    borderRadius: '4px',
    color: '#ffb74d',
    fontSize: '13px',
    marginBottom: '4px',
    cursor: 'pointer',
  },
  expressionCode: {
    fontFamily: 'ui-monospace, monospace',
    fontSize: '12px',
  },
  dragOverlay: {
    padding: '8px 16px',
    backgroundColor: '#333',
    borderRadius: '6px',
    border: '2px dashed #4a9eff',
    color: '#fff',
  },
}
