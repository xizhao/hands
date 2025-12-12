/**
 * RSCVisualEditor - RSC-First Block Editor
 *
 * Main editor component that renders blocks via RSC with Plate overlay for editing.
 *
 * Architecture:
 * 1. Parse source for AST (skeleton generation, edit mapping)
 * 2. Generate skeleton from AST while loading
 * 3. Fetch RSC render with node IDs (in edit mode)
 * 4. Hot-swap skeleton → RSC content
 * 5. In edit mode, overlay Plate for selection/editing
 * 6. Map edits back to source mutations
 */

import * as React from 'react'
import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { parseSourceWithLocations, type ParseResult, type EditableNode } from '../ast/oxc-parser'
import { generateSkeletonFromAST } from '../rsc/skeleton-generator'
import { HotSwapContainer } from '../rsc/HotSwapContainer'
import { useRSCRender, useDebouncedRefresh } from '../rsc/useRSCRender'
import { PlateEditOverlay, type EditOperation } from './PlateEditOverlay'
import { applyEditOperation } from '../operations/edit-handler'

export type EditorMode = 'preview' | 'edit'

export interface RSCVisualEditorProps {
  /** Block source code */
  source: string
  /** Block ID for RSC fetching */
  blockId: string
  /** Runtime port for RSC server */
  runtimePort: number
  /** Current editor mode */
  mode: EditorMode
  /** Callback when source changes (from edits) */
  onSourceChange?: (newSource: string) => void
  /** Whether editor is read-only */
  readOnly?: boolean
}

export function RSCVisualEditor({
  source,
  blockId,
  runtimePort,
  mode,
  onSourceChange,
  readOnly = false,
}: RSCVisualEditorProps) {
  // Container ref for position tracking
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Selection state
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])

  // Parse source for AST - only needed in edit mode
  const parseResult = useMemo(() => {
    if (mode !== 'edit') return null
    return parseSourceWithLocations(source)
  }, [source, mode])

  // Generate skeleton from AST - only in edit mode when we have AST
  const skeleton = useMemo(() => {
    if (!parseResult?.root) return null
    return generateSkeletonFromAST(parseResult.root)
  }, [parseResult?.root])

  // Fetch RSC render
  const {
    rscElement,
    isLoading,
    error,
    refresh,
    renderKey,
  } = useRSCRender({
    port: runtimePort,
    blockId,
  })

  // Debounced refresh on source change
  const debouncedRefresh = useDebouncedRefresh(refresh, 500)

  // Refresh when source changes (after initial load)
  const sourceRef = React.useRef(source)
  useEffect(() => {
    if (sourceRef.current !== source) {
      sourceRef.current = source
      debouncedRefresh()
    }
  }, [source, debouncedRefresh])

  // Handle edit operations
  const handleEditOperation = useCallback(
    (operation: EditOperation) => {
      if (readOnly) return

      // Handle selection updates
      if (operation.type === 'select') {
        setSelectedNodeIds(operation.nodeIds)
        return
      }

      // Other operations need onSourceChange
      if (!onSourceChange) return

      // Apply the edit operation to source
      const newSource = applyEditOperation(operation, source)
      if (newSource !== null && newSource !== source) {
        onSourceChange(newSource)
        // Clear selection after destructive operations
        if (operation.type === 'delete') {
          setSelectedNodeIds([])
        }
      }
    },
    [readOnly, onSourceChange, source]
  )

  // Error display
  if (error && !rscElement) {
    return (
      <div className="p-4">
        <ErrorDisplay error={error} parseErrors={parseResult?.errors || []} />
      </div>
    )
  }

  // Preview mode: Just show RSC content (no parsing needed)
  if (mode === 'preview') {
    return (
      <div className="rsc-visual-editor rsc-visual-editor--preview">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
          </div>
        ) : (
          rscElement
        )}
      </div>
    )
  }

  // Edit mode: RSC content + Plate overlay
  return (
    <div ref={containerRef} className="rsc-visual-editor rsc-visual-editor--edit relative">
      {/* RSC content layer */}
      <div className="rsc-content-layer">
        {isLoading ? (
          skeleton || (
            <div className="flex items-center justify-center py-8">
              <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
            </div>
          )
        ) : (
          rscElement
        )}
      </div>

      {/* Edit overlay layer */}
      {!isLoading && rscElement && parseResult && (
        <PlateEditOverlay
          parseResult={parseResult}
          onEditOperation={handleEditOperation}
          containerRef={containerRef}
          selectedNodeIds={selectedNodeIds}
          disabled={readOnly}
        />
      )}

      {/* Parse errors */}
      {parseResult?.errors && parseResult.errors.length > 0 && (
        <ParseErrorBanner errors={parseResult.errors} />
      )}

      {/* Edit mode indicator */}
      <div className="absolute top-2 right-2 px-2 py-1 rounded bg-primary/10 text-primary text-xs font-medium pointer-events-none">
        Edit Mode
      </div>
    </div>
  )
}

// Re-export EditOperation type from PlateEditOverlay
export type { EditOperation } from './PlateEditOverlay'

// ============================================================================
// Sub-components
// ============================================================================

function ErrorDisplay({
  error,
  parseErrors,
}: {
  error: string
  parseErrors: string[]
}) {
  return (
    <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
      <div className="text-sm font-medium text-red-400">Render Error</div>
      <div className="text-xs text-red-400/70 mt-1 font-mono">{error}</div>
      {parseErrors.length > 0 && (
        <div className="mt-3 pt-3 border-t border-red-500/20">
          <div className="text-xs text-red-400/60">Parse errors:</div>
          {parseErrors.map((err, i) => (
            <div key={i} className="text-xs text-red-400/50 font-mono mt-1">
              {err}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ParseErrorBanner({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null

  return (
    <div className="absolute bottom-2 left-2 right-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2">
      <div className="text-xs text-amber-400 font-medium">Parse warnings</div>
      {errors.slice(0, 3).map((err, i) => (
        <div key={i} className="text-xs text-amber-400/70 font-mono truncate mt-0.5">
          {err}
        </div>
      ))}
      {errors.length > 3 && (
        <div className="text-xs text-amber-400/50 mt-1">
          +{errors.length - 3} more
        </div>
      )}
    </div>
  )
}
