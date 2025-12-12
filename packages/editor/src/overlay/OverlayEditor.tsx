/**
 * Overlay Editor - RSC-based block editor with edit overlays
 *
 * Architecture:
 * 1. Polls runtime for source changes (every 1s)
 * 2. Fetches RSC and renders directly (live, interactive)
 * 3. Injects node IDs into DOM after render (matches AST)
 * 4. Overlay provides selection, drag handles, and editing
 * 5. Mutations save to runtime, await success, then refetch
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import { renderBlockViaRsc, initFlightClient } from '../rsc/client'
import { parseSourceWithLocations } from '../ast/oxc-parser'
import type { EditableNode } from '../ast/oxc-parser'
import { applyOperation, type EditOperation } from './operations'
import { DragHandle, DropZone, NodeHighlight } from './dnd'

// ============================================================================
// Source Polling Hook
// ============================================================================

interface UseSourcePollingOptions {
  blockId: string
  runtimePort: number
  initialSource: string
  pollInterval?: number
}

function useSourcePolling({
  blockId,
  runtimePort,
  initialSource,
  pollInterval = 1000,
}: UseSourcePollingOptions) {
  const [source, setSource] = useState(initialSource)
  const [isSaving, setIsSaving] = useState(false)
  const [version, setVersion] = useState(0)
  const lastSavedSource = useRef(initialSource)

  // Poll for source changes
  useEffect(() => {
    let active = true

    const poll = async () => {
      if (!active || isSaving) return

      try {
        const res = await fetch(
          `http://localhost:${runtimePort}/workbook/blocks/${blockId}/source`
        )
        if (res.ok && active) {
          const data = await res.json()
          // Only update if source changed externally (not from our own save)
          if (data.source !== lastSavedSource.current) {
            console.log('[OverlayEditor] Source changed externally, updating')
            setSource(data.source)
            lastSavedSource.current = data.source
            setVersion((v) => v + 1)
          }
        }
      } catch (e) {
        // Ignore polling errors
      }
    }

    // Initial poll after short delay
    const initialTimeout = setTimeout(poll, 100)

    // Set up interval
    const interval = setInterval(poll, pollInterval)

    return () => {
      active = false
      clearTimeout(initialTimeout)
      clearInterval(interval)
    }
  }, [blockId, runtimePort, pollInterval, isSaving])

  // Save mutation and update immediately
  const saveSource = useCallback(
    async (newSource: string): Promise<boolean> => {
      setIsSaving(true)
      lastSavedSource.current = newSource

      try {
        const res = await fetch(
          `http://localhost:${runtimePort}/workbook/blocks/${blockId}/source`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source: newSource }),
          }
        )

        if (res.ok) {
          // Update local state immediately for fast feedback
          setSource(newSource)
          setVersion((v) => v + 1)
          console.log('[OverlayEditor] Saved successfully')
          return true
        }
        console.error('[OverlayEditor] Save returned non-ok status')
        return false
      } catch (e) {
        console.error('[OverlayEditor] Save failed:', e)
        return false
      } finally {
        setIsSaving(false)
      }
    },
    [blockId, runtimePort]
  )

  return { source, saveSource, isSaving, version }
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
// Types
// ============================================================================

interface EditingState {
  nodeId: string
  originalText: string
}

interface OverlayEditorProps {
  blockId: string
  runtimePort: number
  workerPort: number
  initialSource: string
  readOnly?: boolean
}

// ============================================================================
// Main Component
// ============================================================================

export function OverlayEditor({
  blockId,
  runtimePort,
  workerPort,
  initialSource,
  readOnly = false,
}: OverlayEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [rscElement, setRscElement] = useState<React.ReactNode>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [editing, setEditing] = useState<EditingState | null>(null)

  // Source polling with save
  const { source, saveSource, isSaving, version } = useSourcePolling({
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
    return () => { mounted = false }
  }, [blockId, workerPort, version])

  // Inject node IDs after RSC renders
  useEffect(() => {
    if (isLoading || !containerRef.current || !parseResult.root) return

    const timeout = setTimeout(() => {
      injectNodeIdsIntoDom(containerRef.current!, parseResult.root!)
    }, 50)

    return () => clearTimeout(timeout)
  }, [isLoading, rscElement, parseResult.root])

  // Apply operation and save
  const applyAndSave = useCallback(
    async (operation: EditOperation): Promise<boolean> => {
      const result = applyOperation(source, operation)
      if (result.success && result.newSource) {
        return saveSource(result.newSource)
      }
      console.error('[OverlayEditor] Operation failed:', result.error)
      return false
    },
    [source, saveSource]
  )

  // Operation handlers
  const handleMove = useCallback(
    (nodeId: string, targetId: string, position: 'before' | 'after' | 'inside') => {
      applyAndSave({ type: 'move', nodeId, targetId, position })
    },
    [applyAndSave]
  )

  const handleDelete = useCallback(
    (nodeId: string) => {
      applyAndSave({ type: 'delete', nodeId }).then((ok) => {
        if (ok) setSelectedNodeId(null)
      })
    },
    [applyAndSave]
  )

  const handleTextEdit = useCallback(
    (nodeId: string, text: string) => {
      applyAndSave({ type: 'set-text', nodeId, text })
    },
    [applyAndSave]
  )

  // Event handlers
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (readOnly) return

      // Commit editing if clicking outside
      if (editing) {
        const editingEl = containerRef.current?.querySelector(
          `[data-node-id="${editing.nodeId}"]`
        )
        if (editingEl && !editingEl.contains(e.target as Node)) {
          const newText = editingEl.textContent || ''
          if (newText !== editing.originalText) {
            handleTextEdit(editing.nodeId, newText)
          }
          setEditing(null)
          ;(editingEl as HTMLElement).contentEditable = 'false'
        }
      }

      const target = e.target as HTMLElement
      const nodeId = target.closest('[data-node-id]')?.getAttribute('data-node-id')
      if (nodeId) {
        e.preventDefault()
        e.stopPropagation()
        setSelectedNodeId(nodeId)
      }
    },
    [readOnly, editing, handleTextEdit]
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

      setEditing({ nodeId, originalText: editableEl.textContent || '' })
    },
    [readOnly]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!editing) return

      const editingEl = containerRef.current?.querySelector(
        `[data-node-id="${editing.nodeId}"]`
      ) as HTMLElement

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (editingEl) {
          const newText = editingEl.textContent || ''
          if (newText !== editing.originalText) {
            handleTextEdit(editing.nodeId, newText)
          }
          editingEl.contentEditable = 'false'
          editingEl.blur()
        }
        setEditing(null)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        if (editingEl) {
          editingEl.textContent = editing.originalText
          editingEl.contentEditable = 'false'
          editingEl.blur()
        }
        setEditing(null)
      }
    },
    [editing, handleTextEdit]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (readOnly) return
      const target = e.target as HTMLElement
      const nodeId = target.closest('[data-node-id]')?.getAttribute('data-node-id')
      setHoveredNodeId(nodeId || null)
    },
    [readOnly]
  )

  const handleMouseLeave = useCallback(() => setHoveredNodeId(null), [])

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

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="overlay-editor relative h-full" onKeyDown={handleKeyDown}>
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
        {hoveredNodeId && hoveredNodeId !== selectedNodeId && (
          <NodeHighlight
            nodeId={hoveredNodeId}
            containerRef={containerRef}
            color="blue"
            opacity={0.1}
          />
        )}

        {/* Selection + drag handle */}
        {selectedNodeId && (
          <>
            <NodeHighlight
              nodeId={selectedNodeId}
              containerRef={containerRef}
              color="blue"
              opacity={0.2}
              showLabel
            />
            <DragHandle
              nodeId={selectedNodeId}
              containerRef={containerRef}
              onDelete={() => handleDelete(selectedNodeId)}
            />
          </>
        )}

        {/* Drop zone */}
        <DropZone containerRef={containerRef} onDrop={handleMove} />

        {/* Status bar */}
        <div className="absolute bottom-2 right-2 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded flex items-center gap-2">
          {isSaving && (
            <div className="w-3 h-3 border border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
          )}
          {editing
            ? `Editing (Enter to save, Esc to cancel)`
            : selectedNodeId
              ? `Selected: ${selectedNodeId}`
              : 'Click to select'}
        </div>
      </div>
    </DndProvider>
  )
}
