/**
 * RSC Editor Drag and Drop Components
 *
 * Drag handles, drop zones, and indicators for the RSC editor.
 * Uses react-dnd with HTML5 backend.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useDrag, useDrop, useDragLayer } from 'react-dnd'
import { DotsSixVertical, Plus, Trash } from '@phosphor-icons/react'

// DnD item type
export const ELEMENT_TYPE = 'RSC_ELEMENT'

export interface DragItem {
  type: typeof ELEMENT_TYPE
  nodeId: string
}

// ============================================================================
// Drag Handle
// ============================================================================

interface DragHandleProps {
  nodeId: string
  containerRef: React.RefObject<HTMLDivElement | null>
  onDelete: () => void
  onInsert?: () => void
}

export function DragHandle({ nodeId, containerRef, onDelete, onInsert }: DragHandleProps) {
  const [rect, setRect] = useState<DOMRect | null>(null)

  // Set up drag
  const [{ isDragging }, dragRef] = useDrag(() => ({
    type: ELEMENT_TYPE,
    item: { type: ELEMENT_TYPE, nodeId } as DragItem,
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }), [nodeId])

  useEffect(() => {
    if (!containerRef.current) return

    const element = containerRef.current.querySelector(`[data-node-id="${nodeId}"]`)
    if (!element) return

    const updateRect = () => {
      const containerRect = containerRef.current!.getBoundingClientRect()
      const elementRect = element.getBoundingClientRect()

      setRect(new DOMRect(
        elementRect.left - containerRect.left + containerRef.current!.scrollLeft,
        elementRect.top - containerRect.top + containerRef.current!.scrollTop,
        elementRect.width,
        elementRect.height
      ))
    }

    updateRect()

    const observer = new ResizeObserver(updateRect)
    observer.observe(element)

    // Also update on scroll
    const container = containerRef.current
    container.addEventListener('scroll', updateRect)

    return () => {
      observer.disconnect()
      container.removeEventListener('scroll', updateRect)
    }
  }, [nodeId, containerRef])

  if (!rect) return null

  return (
    <div
      className="absolute flex items-start gap-0.5 z-50"
      style={{
        left: rect.x - 56,
        top: rect.y,
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      {/* Plus button to insert */}
      <button
        className="size-6 p-0 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        onClick={(e) => {
          e.stopPropagation()
          onInsert?.()
        }}
      >
        <Plus className="size-4 text-gray-500" weight="bold" />
      </button>

      {/* Drag handle */}
      <button
        ref={dragRef as any}
        className="size-6 p-0 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-800 cursor-grab active:cursor-grabbing transition-colors"
      >
        <DotsSixVertical className="size-4 text-gray-500" weight="bold" />
      </button>

      {/* Delete button */}
      <button
        className="size-6 p-0 flex items-center justify-center rounded hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
      >
        <Trash className="size-4 text-gray-500 hover:text-red-500" weight="bold" />
      </button>
    </div>
  )
}

// ============================================================================
// Drop Zone
// ============================================================================

interface DropZoneProps {
  containerRef: React.RefObject<HTMLDivElement | null>
  onDrop: (nodeId: string, targetId: string, position: 'before' | 'after' | 'inside') => void
}

export function DropZone({ containerRef, onDrop }: DropZoneProps) {
  const [dropInfo, setDropInfo] = useState<{
    targetId: string
    position: 'before' | 'after'
    rect: DOMRect
  } | null>(null)

  // Use drag layer to track dragging state globally
  const { isDragging, item } = useDragLayer((monitor) => ({
    isDragging: monitor.isDragging(),
    item: monitor.getItem() as DragItem | null,
  }))

  // Set up drop handler
  const [{ isOver }, dropRef] = useDrop(() => ({
    accept: ELEMENT_TYPE,
    hover: (dragItem: DragItem, monitor) => {
      if (!containerRef.current) return

      const clientOffset = monitor.getClientOffset()
      if (!clientOffset) return

      const containerRect = containerRef.current.getBoundingClientRect()
      const scrollTop = containerRef.current.scrollTop

      // Find all elements with data-node-id
      const elements = containerRef.current.querySelectorAll('[data-node-id]')
      let closestElement: Element | null = null
      let closestDistance = Infinity
      let position: 'before' | 'after' = 'after'

      elements.forEach((el) => {
        const elRect = el.getBoundingClientRect()
        const elMidY = elRect.top + elRect.height / 2

        const distance = Math.abs(clientOffset.y - elMidY)
        if (distance < closestDistance) {
          closestDistance = distance
          closestElement = el
          position = clientOffset.y < elMidY ? 'before' : 'after'
        }
      })

      if (closestElement) {
        const targetId = closestElement.getAttribute('data-node-id')!
        // Don't allow dropping on self
        if (targetId === dragItem.nodeId) {
          setDropInfo(null)
          return
        }

        const elRect = closestElement.getBoundingClientRect()
        setDropInfo({
          targetId,
          position,
          rect: new DOMRect(
            elRect.left - containerRect.left + containerRef.current!.scrollLeft,
            position === 'before'
              ? elRect.top - containerRect.top + scrollTop
              : elRect.bottom - containerRect.top + scrollTop,
            elRect.width,
            2
          ),
        })
      }
    },
    drop: (dragItem: DragItem) => {
      if (dropInfo) {
        console.log('[DropZone] Drop:', { nodeId: dragItem.nodeId, targetId: dropInfo.targetId, position: dropInfo.position })
        onDrop(dragItem.nodeId, dropInfo.targetId, dropInfo.position)
      }
      setDropInfo(null)
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  }), [containerRef, dropInfo, onDrop])

  // Attach drop ref to container when it changes
  useEffect(() => {
    if (containerRef.current) {
      dropRef(containerRef.current)
    }
  }, [dropRef, containerRef.current])

  // Clear drop info when not over
  useEffect(() => {
    if (!isOver) {
      setDropInfo(null)
    }
  }, [isOver])

  // Only show indicator when dragging and over
  if (!isDragging || !isOver || !dropInfo) return null

  return (
    <div
      className="absolute pointer-events-none bg-blue-500 z-50 rounded-full"
      style={{
        left: dropInfo.rect.x,
        top: dropInfo.rect.y - 1,
        width: dropInfo.rect.width,
        height: 3,
        boxShadow: '0 0 4px rgba(59, 130, 246, 0.5)',
      }}
    />
  )
}

// ============================================================================
// Node Highlight
// ============================================================================

interface NodeHighlightProps {
  nodeId: string
  containerRef: React.RefObject<HTMLDivElement | null>
  color?: string
  opacity?: number
  showLabel?: boolean
}

export function NodeHighlight({
  nodeId,
  containerRef,
  color = 'blue',
  opacity = 0.2,
  showLabel = false,
}: NodeHighlightProps) {
  const [rect, setRect] = useState<DOMRect | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const element = containerRef.current.querySelector(`[data-node-id="${nodeId}"]`)
    if (!element) return

    const updateRect = () => {
      const containerRect = containerRef.current!.getBoundingClientRect()
      const elementRect = element.getBoundingClientRect()

      // Calculate position relative to container
      setRect(new DOMRect(
        elementRect.left - containerRect.left + containerRef.current!.scrollLeft,
        elementRect.top - containerRect.top + containerRef.current!.scrollTop,
        elementRect.width,
        elementRect.height
      ))
    }

    updateRect()

    // Update on scroll/resize
    const observer = new ResizeObserver(updateRect)
    observer.observe(element)

    const container = containerRef.current
    container.addEventListener('scroll', updateRect)

    return () => {
      observer.disconnect()
      container.removeEventListener('scroll', updateRect)
    }
  }, [nodeId, containerRef])

  if (!rect) return null

  return (
    <>
      <div
        className="absolute pointer-events-none border-2 rounded transition-all duration-100"
        style={{
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: rect.height,
          borderColor: color === 'blue' ? 'rgb(59, 130, 246)' : color,
          backgroundColor: color === 'blue' ? `rgba(59, 130, 246, ${opacity})` : `${color}`,
        }}
      />
      {showLabel && (
        <div
          className="absolute pointer-events-none text-xs bg-blue-500 text-white px-1.5 py-0.5 rounded-t font-mono"
          style={{
            left: rect.x,
            top: rect.y - 20,
          }}
        >
          {nodeId}
        </div>
      )}
    </>
  )
}
