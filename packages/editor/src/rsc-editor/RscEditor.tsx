/**
 * RSC Editor - Pure RSC-based block editor
 *
 * Architecture:
 * 1. Fetch RSC with edit=true (injects data-node-id attributes)
 * 2. Render RSC output directly (live, interactive)
 * 3. Overlay edit UI for selection and drag handles
 * 4. Map edits back to AST → source mutations
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { renderBlockViaRsc, initFlightClient } from '../rsc/client'

interface RscEditorProps {
  /** Block ID to edit */
  blockId: string
  /** Runtime port for RSC server */
  runtimePort: number
  /** Block source code */
  source: string
  /** Callback when source changes */
  onSourceChange?: (source: string) => void
  /** Read-only mode */
  readOnly?: boolean
}

export function RscEditor({
  blockId,
  runtimePort,
  source,
  onSourceChange,
  readOnly = false,
}: RscEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [rscElement, setRscElement] = useState<React.ReactNode>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)

  // Initialize Flight client and fetch RSC
  useEffect(() => {
    let mounted = true

    async function loadRsc() {
      setIsLoading(true)
      setError(null)

      try {
        // Initialize Flight client if needed
        console.log('[RscEditor] Initializing Flight client...')
        const initOk = await initFlightClient()
        console.log('[RscEditor] Flight client init:', initOk)

        // Fetch RSC with edit mode enabled
        console.log('[RscEditor] Fetching RSC from port', runtimePort, 'block:', blockId)
        const result = await renderBlockViaRsc(runtimePort, blockId, { edit: 'true' })
        console.log('[RscEditor] RSC result:', result.error || 'success')

        if (!mounted) return

        if (result.error) {
          setError(result.error)
        } else {
          setRscElement(result.element)
        }
      } catch (err) {
        if (!mounted) return
        console.error('[RscEditor] Error:', err)
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    loadRsc()

    return () => {
      mounted = false
    }
  }, [blockId, runtimePort, source])

  // Handle click on elements with data-node-id
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (readOnly) return

    const target = e.target as HTMLElement
    const nodeId = target.closest('[data-node-id]')?.getAttribute('data-node-id')

    if (nodeId) {
      e.preventDefault()
      e.stopPropagation()
      setSelectedNodeId(nodeId)
      console.log('[RscEditor] Selected node:', nodeId)
    }
  }, [readOnly])

  // Handle mouse move for hover highlights
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (readOnly) return

    const target = e.target as HTMLElement
    const nodeId = target.closest('[data-node-id]')?.getAttribute('data-node-id')
    setHoveredNodeId(nodeId || null)
  }, [readOnly])

  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    setHoveredNodeId(null)
  }, [])

  // Get bounding rect for a node ID
  const getNodeRect = useCallback((nodeId: string): DOMRect | null => {
    if (!containerRef.current) return null
    const element = containerRef.current.querySelector(`[data-node-id="${nodeId}"]`)
    if (!element) return null
    return element.getBoundingClientRect()
  }, [])

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
    <div className="rsc-editor relative h-full">
      {/* RSC content layer */}
      <div
        ref={containerRef}
        className="rsc-content h-full overflow-auto p-4"
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {rscElement}
      </div>

      {/* Edit overlay - hover highlight */}
      {hoveredNodeId && hoveredNodeId !== selectedNodeId && (
        <NodeHighlight
          nodeId={hoveredNodeId}
          containerRef={containerRef}
          color="blue"
          opacity={0.1}
        />
      )}

      {/* Edit overlay - selection highlight */}
      {selectedNodeId && (
        <NodeHighlight
          nodeId={selectedNodeId}
          containerRef={containerRef}
          color="blue"
          opacity={0.2}
          showLabel
        />
      )}

      {/* Debug info */}
      <div className="absolute bottom-2 right-2 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded">
        {selectedNodeId ? `Selected: ${selectedNodeId}` : 'Click to select'}
      </div>
    </div>
  )
}

/**
 * Highlight overlay for a node
 */
function NodeHighlight({
  nodeId,
  containerRef,
  color = 'blue',
  opacity = 0.2,
  showLabel = false,
}: {
  nodeId: string
  containerRef: React.RefObject<HTMLDivElement>
  color?: string
  opacity?: number
  showLabel?: boolean
}) {
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

    return () => observer.disconnect()
  }, [nodeId, containerRef])

  if (!rect) return null

  return (
    <>
      <div
        className="absolute pointer-events-none border-2 rounded"
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
