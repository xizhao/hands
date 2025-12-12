/**
 * Overlay Editor - RSC-based block editor with edit overlays
 *
 * Architecture:
 * 1. Polls runtime for source changes (via useEditorSource)
 * 2. Fetches RSC and renders directly (live, interactive)
 * 3. Injects node IDs into DOM after render (matches AST)
 * 4. Overlay provides selection, drag handles, and editing
 * 5. Mutations save to runtime, await success, then refetch
 *
 * State Management:
 * - EditorContext: UI state (selection, hover, editing, menus, history, clipboard)
 * - useEditorSource: Source state (polling, mutations, version)
 */

import { useEffect, useRef, useCallback, useMemo } from 'react'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import { renderBlockViaRsc, initFlightClient } from '../rsc/client'
import { parseSourceWithLocations } from '../ast/oxc-parser'
import type { EditableNode } from '../ast/oxc-parser'
import { extractDataDependencies, getDataDependencySummary } from '../ast/sql-extractor'
import type { DataDependencies } from '../ast/sql-extractor'
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
import type { EditOperation } from './operations'

// ============================================================================
// Icons
// ============================================================================

function TableIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M3 15h18" />
      <path d="M9 3v18" />
    </svg>
  )
}

function DatabaseIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  )
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  )
}

// ============================================================================
// Data Dependencies Panel
// ============================================================================

interface DataDependenciesPanelProps {
  dataDeps: DataDependencies
  onClose: () => void
}

function DataDependenciesPanel({ dataDeps, onClose }: DataDependenciesPanelProps) {
  return (
    <div className="absolute top-2 left-2 w-72 bg-background/95 backdrop-blur border border-border rounded-lg shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2 text-sm font-medium">
          <DatabaseIcon className="w-4 h-4 text-blue-400" />
          <span>Data Dependencies</span>
        </div>
        <button
          onClick={onClose}
          className="p-0.5 rounded hover:bg-muted-foreground/10 transition-colors"
        >
          <XIcon className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Content */}
      <div className="p-3 space-y-3 max-h-80 overflow-y-auto">
        {/* Tables */}
        {dataDeps.allTables.length > 0 && (
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
              Tables
            </div>
            <div className="flex flex-wrap gap-1.5">
              {dataDeps.allTables.map((table) => (
                <span
                  key={table}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono bg-blue-500/10 text-blue-400 rounded"
                >
                  <TableIcon className="w-3 h-3" />
                  {table}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Queries */}
        <div>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
            Queries ({dataDeps.queries.length})
          </div>
          <div className="space-y-2">
            {dataDeps.queries.map((query, index) => (
              <div
                key={index}
                className="text-xs bg-muted/30 rounded p-2 border border-border/50"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                      query.type === 'select'
                        ? 'bg-green-500/20 text-green-400'
                        : query.type === 'insert'
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : query.type === 'update'
                            ? 'bg-orange-500/20 text-orange-400'
                            : query.type === 'delete'
                              ? 'bg-red-500/20 text-red-400'
                              : 'bg-purple-500/20 text-purple-400'
                    }`}
                  >
                    {query.type}
                  </span>
                  {query.assignedTo && (
                    <span className="text-muted-foreground">
                      → <span className="font-mono text-foreground">{query.assignedTo}</span>
                    </span>
                  )}
                </div>
                <div className="font-mono text-muted-foreground whitespace-pre-wrap break-all leading-relaxed">
                  {query.sql.length > 100 ? query.sql.slice(0, 100) + '...' : query.sql}
                </div>
                {query.tables.length > 0 && (
                  <div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                    Tables: {query.tables.join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Bindings (Data Flow) */}
        {dataDeps.bindings.length > 0 && (
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
              Data Flow
            </div>
            <div className="space-y-1">
              {dataDeps.bindings.map((binding, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                >
                  <span className="font-mono text-foreground">{binding.variable}</span>
                  <span>→</span>
                  <span>{binding.usages.length} JSX usage{binding.usages.length !== 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

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

  // Original text for inline editing
  const originalTextRef = useRef<string>('')

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

  // Extract SQL data dependencies
  const dataDeps = useMemo(() => {
    return extractDataDependencies(source)
  }, [source])

  // Show/hide data dependencies panel
  const [showDataDeps, setShowDataDeps] = React.useState(false)

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

  // Inject node IDs after RSC renders
  useEffect(() => {
    if (isLoading || !containerRef.current || !parseResult.root) return

    const timeout = setTimeout(() => {
      injectNodeIdsIntoDom(containerRef.current!, parseResult.root!)
    }, 50)

    return () => clearTimeout(timeout)
  }, [isLoading, rscElement, parseResult.root, containerRef])

  // Apply operation with history
  const applyOperation = useCallback(
    async (operation: EditOperation): Promise<boolean> => {
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
    [source, selectedNodeIds, history, mutate]
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

  // Event handlers
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (readOnly) return

      // Commit editing if clicking outside
      if (editingNodeId) {
        const editingEl = containerRef.current?.querySelector(
          `[data-node-id="${editingNodeId}"]`
        )
        if (editingEl && !editingEl.contains(e.target as Node)) {
          const newText = editingEl.textContent || ''
          if (newText !== originalTextRef.current) {
            handleTextEdit(editingNodeId, newText)
          }
          stopEditing()
          ;(editingEl as HTMLElement).contentEditable = 'false'
        }
      }

      const target = e.target as HTMLElement
      const nodeId = target.closest('[data-node-id]')?.getAttribute('data-node-id')
      if (nodeId) {
        e.preventDefault()
        e.stopPropagation()

        // Multi-select support
        if (e.metaKey || e.ctrlKey) {
          // Cmd/Ctrl+click: additive selection
          select(nodeId, true)
        } else if (e.shiftKey && focusedNodeId && containerRef.current) {
          // Shift+click: range selection
          const allIds = getAllNodeIds(containerRef.current)
          dispatch({
            type: 'SELECT_RANGE',
            fromId: focusedNodeId,
            toId: nodeId,
            allNodeIds: allIds,
          })
        } else {
          // Normal click: single selection
          select(nodeId, false)
        }
      }
    },
    [readOnly, editingNodeId, focusedNodeId, containerRef, select, dispatch, handleTextEdit, stopEditing]
  )

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (readOnly) return

      const target = e.target as HTMLElement
      const editableEl = target.closest('[data-node-id]') as HTMLElement
      if (!editableEl) return

      const nodeId = editableEl.getAttribute('data-node-id')
      if (!nodeId) return

      const tagName = editableEl.tagName.toLowerCase()
      const textElements = ['p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'li', 'a', 'label']
      if (!textElements.includes(tagName)) return

      e.preventDefault()
      e.stopPropagation()

      editableEl.contentEditable = 'true'
      editableEl.focus()

      const selection = window.getSelection()
      const range = document.createRange()
      range.selectNodeContents(editableEl)
      selection?.removeAllRanges()
      selection?.addRange(range)

      originalTextRef.current = editableEl.textContent || ''
      startEditing(nodeId)
    },
    [readOnly, startEditing]
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

  const handleMouseLeave = useCallback(() => setHover(null), [setHover])

  // Loading state
  if (isLoading) {
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
        className="overlay-content h-full overflow-auto p-4"
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {rscElement}
      </div>

      {/* Hover highlight */}
      {hoveredNodeId && !selectedNodeIds.includes(hoveredNodeId) && (
        <NodeHighlight
          nodeId={hoveredNodeId}
          containerRef={containerRef}
          color="blue"
          opacity={0.1}
        />
      )}

      {/* Selection highlights for all selected nodes */}
      {selectedNodeIds.map((nodeId, index) => (
        <NodeHighlight
          key={nodeId}
          nodeId={nodeId}
          containerRef={containerRef}
          color="blue"
          opacity={0.2}
          showLabel={index === 0} // Only show label on primary selection
        />
      ))}

      {/* Drag handle for primary selection */}
      {primarySelectedId && (
        <DragHandle
          nodeId={primarySelectedId}
          containerRef={containerRef}
          onDelete={() => handleDelete(primarySelectedId)}
        />
      )}

      {/* Drop zone */}
      <DropZone containerRef={containerRef} onDrop={handleMove} />

      {/* Data Dependencies Panel */}
      {showDataDeps && dataDeps.queries.length > 0 && (
        <DataDependenciesPanel dataDeps={dataDeps} onClose={() => setShowDataDeps(false)} />
      )}

      {/* Status bar */}
      <div className="absolute bottom-2 right-2 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded flex items-center gap-2">
        {isSaving && (
          <div className="w-3 h-3 border border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
        )}
        {/* Data deps toggle */}
        {dataDeps.queries.length > 0 && (
          <button
            onClick={() => setShowDataDeps(!showDataDeps)}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors ${
              showDataDeps
                ? 'bg-blue-500/20 text-blue-400'
                : 'hover:bg-muted-foreground/10'
            }`}
            title="Show data dependencies"
          >
            <TableIcon className="w-3 h-3" />
            <span>{dataDeps.allTables.length}</span>
          </button>
        )}
        <span className="border-l border-muted-foreground/20 pl-2">
          {editingNodeId
            ? `Editing (Enter to save, Esc to cancel)`
            : selectedNodeIds.length > 1
              ? `${selectedNodeIds.length} selected`
              : selectedNodeIds.length === 1
                ? `Selected: ${selectedNodeIds[0]}`
                : 'Click to select'}
        </span>
      </div>
    </div>
    </div>
  )
}

// Need React import for useState
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
