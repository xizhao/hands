/**
 * useEditorSource - Source state management for the Overlay Editor
 *
 * Handles:
 * - Source polling for external changes
 * - Source mutations via EditOperation
 * - Version tracking for RSC re-render triggers
 * - Undo/redo source restoration
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { applyOperation, applyOperations, type EditOperation } from './operations'

// ============================================================================
// Types
// ============================================================================

export interface UseEditorSourceOptions {
  blockId: string
  runtimePort: number
  initialSource: string
  pollInterval?: number
}

export interface UseEditorSourceReturn {
  /** Current source code */
  source: string

  /** Whether a save is in progress */
  isSaving: boolean

  /** Version number (increments on changes, triggers RSC re-render) */
  version: number

  /** Apply a single mutation */
  mutate: (operation: EditOperation) => Promise<MutationResult>

  /** Apply multiple mutations in sequence */
  mutateMany: (operations: EditOperation[]) => Promise<MutationResult>

  /** Set source directly (for undo/redo) */
  setSource: (source: string) => Promise<boolean>

  /** Force a refresh (increment version without source change) */
  refresh: () => void
}

export interface MutationResult {
  success: boolean
  newSource?: string
  error?: string
}

// ============================================================================
// Hook
// ============================================================================

export function useEditorSource({
  blockId,
  runtimePort,
  initialSource,
  pollInterval = 1000,
}: UseEditorSourceOptions): UseEditorSourceReturn {
  const [source, setSourceState] = useState(initialSource)
  const [isSaving, setIsSaving] = useState(false)
  const [version, setVersion] = useState(0)

  // Track the source that's confirmed saved on server (only updated AFTER successful save)
  const confirmedServerSource = useRef(initialSource)

  // Track pending source during save (to prevent poll overwrites)
  const pendingSource = useRef<string | null>(null)

  // ============================================================================
  // Polling for External Changes
  // ============================================================================

  useEffect(() => {
    let active = true

    const poll = async () => {
      // Skip polling if we have a pending save
      if (!active || pendingSource.current !== null) {
        return
      }

      try {
        const res = await fetch(
          `http://localhost:${runtimePort}/workbook/blocks/${blockId}/source`
        )
        if (res.ok && active && pendingSource.current === null) {
          const data = await res.json()
          // Only update if source changed externally (different from last confirmed server source)
          if (data.source !== confirmedServerSource.current) {
            console.log('[useEditorSource] Source changed externally, updating')
            setSourceState(data.source)
            confirmedServerSource.current = data.source
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
  }, [blockId, runtimePort, pollInterval])

  // ============================================================================
  // Save Source to Server
  // ============================================================================

  const saveSource = useCallback(
    async (newSource: string): Promise<boolean> => {
      // Mark as pending BEFORE any async work - blocks polling
      pendingSource.current = newSource
      setIsSaving(true)

      // Update local state immediately for fast feedback
      setSourceState(newSource)

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
          // Only update confirmed source AFTER server confirms
          confirmedServerSource.current = newSource
          // Increment version to trigger RSC re-render
          setVersion((v) => v + 1)
          console.log('[useEditorSource] Saved successfully')
          return true
        }
        console.error('[useEditorSource] Save returned non-ok status')
        return false
      } catch (e) {
        console.error('[useEditorSource] Save failed:', e)
        return false
      } finally {
        // Clear pending - allows polling to resume
        pendingSource.current = null
        setIsSaving(false)
      }
    },
    [blockId, runtimePort]
  )

  // ============================================================================
  // Mutations
  // ============================================================================

  const mutate = useCallback(
    async (operation: EditOperation): Promise<MutationResult> => {
      // Apply operation to source
      const result = applyOperation(source, operation)

      if (!result.success || !result.newSource) {
        return {
          success: false,
          error: result.error ?? 'Operation failed',
        }
      }

      // Save to server (saveSource handles pendingSource blocking)
      const saved = await saveSource(result.newSource)

      if (!saved) {
        return {
          success: false,
          error: 'Failed to save to server',
        }
      }

      return {
        success: true,
        newSource: result.newSource,
      }
    },
    [source, saveSource]
  )

  const mutateMany = useCallback(
    async (operations: EditOperation[]): Promise<MutationResult> => {
      if (operations.length === 0) {
        return { success: true, newSource: source }
      }

      // Apply all operations
      const result = applyOperations(source, operations)

      if (!result.success || !result.newSource) {
        return {
          success: false,
          error: result.error ?? 'Operations failed',
        }
      }

      // Save to server (saveSource handles pendingSource blocking)
      const saved = await saveSource(result.newSource)

      if (!saved) {
        return {
          success: false,
          error: 'Failed to save to server',
        }
      }

      return {
        success: true,
        newSource: result.newSource,
      }
    },
    [source, saveSource]
  )

  // ============================================================================
  // Direct Source Set (for undo/redo)
  // ============================================================================

  const setSource = useCallback(
    async (newSource: string): Promise<boolean> => {
      // saveSource handles pendingSource blocking
      return await saveSource(newSource)
    },
    [saveSource]
  )

  // ============================================================================
  // Manual Refresh
  // ============================================================================

  const refresh = useCallback(() => {
    setVersion((v) => v + 1)
  }, [])

  return {
    source,
    isSaving,
    version,
    mutate,
    mutateMany,
    setSource,
    refresh,
  }
}
