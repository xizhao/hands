/**
 * Overlay Editor - RSC-based block editor with edit overlays
 *
 * Architecture:
 * 1. Polls runtime for source changes (via useEditorSource)
 * 2. Fetches RSC and renders directly (live, interactive)
 * 3. Injects node IDs into DOM after render (matches AST)
 * 4. Overlay provides selection, drag handles, and editing
 * 5. Mutations save to runtime, await success, then refetch
 * 6. Caches rendered HTML in localStorage for instant load & smooth transitions
 *
 * State Management:
 * - EditorContext: UI state (selection, hover, editing, menus, history, clipboard)
 * - useEditorSource: Source state (polling, mutations, version)
 */

import { useEffect, useRef, useCallback, useMemo, useState } from 'react'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import { renderBlockViaRsc, initFlightClient } from '../rsc/client'
import { parseSourceWithLocations } from '../ast/oxc-parser'
import type { EditableNode } from '../ast/oxc-parser'
import { DragHandle, DropZone, NodeHighlight } from './dnd'
import {
  EditorProvider,
  useEditor,
  useEditorSelection,
  useEditorHover,
  useEditorEditing,
  useEditorHistory,
} from './EditorContext'
import { useEditorSource } from './useEditorSource'
import { useRscCache, useFlipAnimation } from './cache'
import type { EditOperation } from './operations'


// ============================================================================
// Node ID Injection
// ============================================================================

function injectNodeIdsIntoDom(container: HTMLElement, astRoot: EditableNode): void {
  function walkAndInject(domNode: Element, astNode: EditableNode): void {
    domNode.setAttribute('data-node-id', astNode.id)

    const domChildren = Array.from(domNode.children)
    let domIndex = 0

    for (const astChild of astNode.children) {
      if (astChild.isText) continue

      while (domIndex < domChildren.length) {
        const domChild = domChildren[domIndex]
        if (domChild instanceof HTMLElement) {
          walkAndInject(domChild, astChild)
          domIndex++
          break
        }
        domIndex++
      }
    }
  }

  const rootElement = container.querySelector(':scope > *')
  if (rootElement && rootElement instanceof HTMLElement) {
    walkAndInject(rootElement, astRoot)
  }
}

// ============================================================================
// Get All Node IDs from DOM (for range selection)
// ============================================================================

function getAllNodeIds(container: HTMLElement): string[] {
  const elements = container.querySelectorAll('[data-node-id]')
  return Array.from(elements)
    .map((el) => el.getAttribute('data-node-id'))
    .filter((id): id is string => id !== null)
}

// ============================================================================
// Types
// ============================================================================

interface OverlayEditorProps {
  blockId: string
  runtimePort: number
  workerPort: number
  initialSource: string
  readOnly?: boolean
}

// ============================================================================
// Inner Component (uses context)
// ============================================================================

interface OverlayEditorInnerProps extends OverlayEditorProps {
  containerRef: React.RefObject<HTMLDivElement | null>
}

function OverlayEditorInner({
  blockId,
  runtimePort,
  workerPort,
  initialSource,
  readOnly = false,
  containerRef,
}: OverlayEditorInnerProps) {
  const { state, dispatch } = useEditor()
  const { selectedNodeIds, focusedNodeId, select, clearSelection } = useEditorSelection()
  const { hoveredNodeId, setHover } = useEditorHover()
  const { editingNodeId, startEditing, stopEditing } = useEditorEditing()
  const history = useEditorHistory()

  // RSC state
  const [rscElement, setRscElement] = React.useState<React.ReactNode>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  // RSC cache for instant display during loads
  const { cachedHtml, hasCachedContent, updateCache } = useRscCache({
    blockId,
    containerRef,
  })
  // Track if we're in a "refresh" (have cached content, loading new)
  const isRefreshing = isLoading && hasCachedContent

  // FLIP animations for element transitions
  const { capturePositions, animateFromCapture } = useFlipAnimation(containerRef)

  // Original text for inline editing
  const originalTextRef = useRef<string>('')

  // Track if mouse is on drag handle (to prevent hover clear)
  const isOnDragHandleRef = useRef(false)

  // Source management
  const { source, isSaving, version, mutate } = useEditorSource({
    blockId,
    runtimePort,
    initialSource,
  })

  // Parse source for AST
  const parseResult = useMemo(() => {
    return parseSourceWithLocations(source)
  }, [source])

  // Fetch RSC when source/version changes
  useEffect(() => {
    let mounted = true

    async function loadRsc() {
      setIsLoading(true)
      setError(null)

      try {
        await initFlightClient()
        const result = await renderBlockViaRsc(workerPort, blockId, { edit: 'true' })

        if (!mounted) return

        if (result.error) {
          setError(result.error)
        } else {
          setRscElement(result.element)
        }
      } catch (err) {
        if (!mounted) return
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (mounted) setIsLoading(false)
      }
    }

    loadRsc()
    return () => {
      mounted = false
    }
  }, [blockId, workerPort, version])

  // Cache rendered HTML after RSC settles
  useEffect(() => {
    if (isLoading || !containerRef.current || error) return

    // Small delay to ensure React has finished rendering
    const timeout = setTimeout(() => {
      updateCache()
    }, 100)

    return () => clearTimeout(timeout)
  }, [isLoading, rscElement, error, updateCache])

  // Inject node IDs after RSC renders, then animate FLIP
  useEffect(() => {
    if (isLoading || !containerRef.current || !parseResult.root) return

    const timeout = setTimeout(() => {
      injectNodeIdsIntoDom(containerRef.current!, parseResult.root!)
      // Animate elements from captured positions to new positions
      animateFromCapture(200)
    }, 50)

    return () => clearTimeout(timeout)
  }, [isLoading, rscElement, parseResult.root, containerRef, animateFromCapture])

  // Apply operation with history and FLIP animation
  const applyOperation = useCallback(
    async (operation: EditOperation): Promise<boolean> => {
      // Capture positions BEFORE mutation for FLIP animation
      capturePositions()

      // Push to history before mutation
      history.push({
        source,
        selectedNodeIds,
        timestamp: Date.now(),
      })

      const result = await mutate(operation)
      if (!result.success) {
        console.error('[OverlayEditor] Operation failed:', result.error)
        return false
      }
      return true
    },
    [source, selectedNodeIds, history, mutate, capturePositions]
  )

  // Operation handlers
  const handleMove = useCallback(
    (nodeId: string, targetId: string, position: 'before' | 'after' | 'inside') => {
      applyOperation({ type: 'move', nodeId, targetId, position })
    },
    [applyOperation]
  )

  const handleDelete = useCallback(
    (nodeId: string) => {
      applyOperation({ type: 'delete', nodeId }).then((ok) => {
        if (ok) clearSelection()
      })
    },
    [applyOperation, clearSelection]
  )

  const handleTextEdit = useCallback(
    (nodeId: string, text: string) => {
      applyOperation({ type: 'set-text', nodeId, text })
    },
    [applyOperation]
  )

  // Text elements that support inline editing (Linear-style: click to edit)
  const TEXT_ELEMENTS = ['p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'a', 'label', 'td', 'th']

  // Check if an element is editable text
  const isTextElement = useCallback((el: HTMLElement): boolean => {
    const tagName = el.tagName.toLowerCase()
    if (TEXT_ELEMENTS.includes(tagName)) return true
    // Div with only text content (no child elements with node-id)
    if (tagName === 'div' && !el.querySelector('[data-node-id]') && el.textContent?.trim()) return true
    return false
  }, [])

  // Start inline editing on an element
  const startInlineEdit = useCallback((el: HTMLElement, nodeId: string, selectAll: boolean = true) => {
    el.contentEditable = 'true'
    el.focus()

    if (selectAll) {
      const selection = window.getSelection()
      const range = document.createRange()
      range.selectNodeContents(el)
      selection?.removeAllRanges()
      selection?.addRange(range)
    }
    // If not selectAll, browser will place cursor at click position

    originalTextRef.current = el.textContent || ''
    startEditing(nodeId)
  }, [startEditing])

  // Event handlers
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (readOnly) return

      const target = e.target as HTMLElement
      const editableEl = target.closest('[data-node-id]') as HTMLElement
      const nodeId = editableEl?.getAttribute('data-node-id')

      // Commit editing if clicking outside current edit
      if (editingNodeId && editingNodeId !== nodeId) {
        const currentEditEl = containerRef.current?.querySelector(
          `[data-node-id="${editingNodeId}"]`
        ) as HTMLElement
        if (currentEditEl) {
          const newText = currentEditEl.textContent || ''
          if (newText !== originalTextRef.current) {
            handleTextEdit(editingNodeId, newText)
          }
          stopEditing()
          currentEditEl.contentEditable = 'false'
        }
      }

      // If clicking inside current edit, let it happen naturally
      if (editingNodeId === nodeId) return

      if (!nodeId || !editableEl) return

      // Multi-select with modifier keys
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault()
        e.stopPropagation()
        select(nodeId, true)
        return
      }

      if (e.shiftKey && focusedNodeId && containerRef.current) {
        e.preventDefault()
        e.stopPropagation()
        const allIds = getAllNodeIds(containerRef.current)
        dispatch({
          type: 'SELECT_RANGE',
          fromId: focusedNodeId,
          toId: nodeId,
          allNodeIds: allIds,
        })
        return
      }

      // Linear-style: single click on text elements starts editing immediately
      if (isTextElement(editableEl)) {
        e.preventDefault()
        e.stopPropagation()
        select(nodeId, false)
        // Small delay so selection renders, then start editing
        requestAnimationFrame(() => {
          startInlineEdit(editableEl, nodeId, false)
        })
        return
      }

      // Non-text elements: just select
      e.preventDefault()
      e.stopPropagation()
      select(nodeId, false)
    },
    [readOnly, editingNodeId, focusedNodeId, containerRef, select, dispatch, handleTextEdit, stopEditing, isTextElement, startInlineEdit]
  )

  // Double-click: select all text in element
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (readOnly) return

      const target = e.target as HTMLElement
      const editableEl = target.closest('[data-node-id]') as HTMLElement
      if (!editableEl) return

      const nodeId = editableEl.getAttribute('data-node-id')
      if (!nodeId) return

      if (!isTextElement(editableEl)) return

      e.preventDefault()
      e.stopPropagation()

      // If already editing, select all text (like double-click to select word, then all)
      if (editingNodeId === nodeId) {
        const selection = window.getSelection()
        const range = document.createRange()
        range.selectNodeContents(editableEl)
        selection?.removeAllRanges()
        selection?.addRange(range)
        return
      }

      // Start editing with all text selected
      startInlineEdit(editableEl, nodeId, true)
    },
    [readOnly, editingNodeId, isTextElement, startInlineEdit]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Handle inline editing
      if (editingNodeId) {
        const editingEl = containerRef.current?.querySelector(
          `[data-node-id="${editingNodeId}"]`
        ) as HTMLElement

        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          if (editingEl) {
            const newText = editingEl.textContent || ''
            if (newText !== originalTextRef.current) {
              handleTextEdit(editingNodeId, newText)
            }
            editingEl.contentEditable = 'false'
            editingEl.blur()
          }
          stopEditing()
          return
        } else if (e.key === 'Escape') {
          e.preventDefault()
          if (editingEl) {
            editingEl.textContent = originalTextRef.current
            editingEl.contentEditable = 'false'
            editingEl.blur()
          }
          stopEditing()
          return
        }
        // Let other keys pass through for editing
        return
      }

      // Global shortcuts (when not editing)
      if (e.key === 'Escape') {
        clearSelection()
        return
      }

      // Delete selected nodes
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeIds.length > 0) {
        e.preventDefault()
        // Delete all selected nodes (in reverse order to preserve positions)
        const nodesToDelete = [...selectedNodeIds].reverse()
        for (const nodeId of nodesToDelete) {
          handleDelete(nodeId)
        }
        return
      }

      // Undo/Redo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault()
        if (e.shiftKey) {
          // Redo
          if (history.canRedo) {
            const entry = history.getRedoEntry()
            if (entry) {
              history.redo()
              // TODO: Restore source from entry
            }
          }
        } else {
          // Undo
          if (history.canUndo) {
            const entry = history.getUndoEntry()
            if (entry) {
              history.undo()
              // TODO: Restore source from entry
            }
          }
        }
        return
      }

      // Duplicate
      if ((e.metaKey || e.ctrlKey) && e.key === 'd' && selectedNodeIds.length > 0) {
        e.preventDefault()
        applyOperation({ type: 'duplicate', nodeId: selectedNodeIds[0] })
        return
      }
    },
    [
      editingNodeId,
      selectedNodeIds,
      containerRef,
      handleTextEdit,
      handleDelete,
      stopEditing,
      clearSelection,
      history,
      applyOperation,
    ]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (readOnly) return
      const target = e.target as HTMLElement
      const nodeId = target.closest('[data-node-id]')?.getAttribute('data-node-id')
      setHover(nodeId || null)
    },
    [readOnly, setHover]
  )

  const handleMouseLeave = useCallback(() => {
    // Small delay to allow mouse to reach drag handle
    setTimeout(() => {
      if (!isOnDragHandleRef.current) {
        setHover(null)
      }
    }, 50)
  }, [setHover])

  // Loading state (only show if no cached content)
  if (isLoading && !hasCachedContent) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
          <span className="text-sm">Loading...</span>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="p-4">
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
          <div className="text-sm font-medium text-red-400">Render Error</div>
          <div className="text-xs text-red-400/70 mt-1 font-mono">{error}</div>
        </div>
      </div>
    )
  }

  // Primary selected node (first in array)
  const primarySelectedId = selectedNodeIds[0] ?? null

  return (
    <div className="h-full pl-10">
    <div className="overlay-editor relative h-full" onKeyDown={handleKeyDown} tabIndex={0}>
      {/* RSC content */}
      <div
        ref={containerRef}
        className={`overlay-content h-full overflow-auto p-4 transition-opacity duration-150 ${
          isRefreshing ? 'opacity-60 pointer-events-none' : ''
        }`}
        onClick={!isRefreshing ? handleClick : undefined}
        onDoubleClick={!isRefreshing ? handleDoubleClick : undefined}
        onMouseMove={!isRefreshing ? handleMouseMove : undefined}
        onMouseLeave={!isRefreshing ? handleMouseLeave : undefined}
      >
        {/* Show cached HTML during refresh, otherwise RSC element */}
        {isRefreshing && cachedHtml ? (
          <div dangerouslySetInnerHTML={{ __html: cachedHtml }} />
        ) : (
          rscElement
        )}
      </div>


      {/* Selection/editing highlight */}
      {selectedNodeIds.map((nodeId) => (
        <NodeHighlight
          key={nodeId}
          nodeId={nodeId}
          containerRef={containerRef}
          mode={editingNodeId === nodeId ? 'editing' : 'select'}
        />
      ))}

      {/* Drag handle - show on hover OR when selected (always persistent when selected) */}
      {(hoveredNodeId || primarySelectedId) && (
        <DragHandle
          nodeId={hoveredNodeId || primarySelectedId!}
          containerRef={containerRef}
          onDelete={() => handleDelete(hoveredNodeId || primarySelectedId!)}
          onHoverChange={(isHovered) => {
            isOnDragHandleRef.current = isHovered
            // Keep hover state when mouse enters handle area
            if (isHovered && hoveredNodeId) {
              setHover(hoveredNodeId)
            }
          }}
        />
      )}

      {/* Drop zone */}
      <DropZone containerRef={containerRef} onDrop={handleMove} />
    </div>
    </div>
  )
}

// Need React import
import React from 'react'

// ============================================================================
// Main Component (wraps with providers)
// ============================================================================

export function OverlayEditor(props: OverlayEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  return (
    <DndProvider backend={HTML5Backend}>
      <EditorProvider>
        <OverlayEditorInner {...props} containerRef={containerRef} />
      </EditorProvider>
    </DndProvider>
  )
}
