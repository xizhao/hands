/**
 * EditStateProvider - React context provider for edit state management
 */

import * as React from 'react'
import { useRef, useMemo, useCallback, useState } from 'react'
import {
  EditStateContext,
  EditStateManager,
  type EditState,
  createEmptyEditState,
} from './EditStateManager'

interface EditStateProviderProps {
  children: React.ReactNode
  /** Container element for scroll position tracking */
  containerRef?: React.RefObject<HTMLElement>
}

export function EditStateProvider({
  children,
  containerRef,
}: EditStateProviderProps) {
  const managerRef = useRef<EditStateManager | null>(null)

  // Create manager on first render
  if (!managerRef.current) {
    managerRef.current = new EditStateManager(containerRef?.current || null)
  }

  // Update container when ref changes
  React.useEffect(() => {
    if (managerRef.current && containerRef?.current) {
      managerRef.current.setContainer(containerRef.current)
    }
  }, [containerRef?.current])

  const captureState = useCallback((currentState: Partial<EditState>) => {
    return managerRef.current!.captureState(currentState)
  }, [])

  const restoreState = useCallback((state?: EditState) => {
    managerRef.current!.restoreState(state)
  }, [])

  const contextValue = useMemo(
    () => ({
      manager: managerRef.current!,
      captureState,
      restoreState,
    }),
    [captureState, restoreState]
  )

  return (
    <EditStateContext.Provider value={contextValue}>
      {children}
    </EditStateContext.Provider>
  )
}

/**
 * Hook for components to access edit state preservation
 */
export function useEditState() {
  const context = React.useContext(EditStateContext)
  if (!context) {
    throw new Error('useEditState must be used within EditStateProvider')
  }
  return context
}

/**
 * Hook that automatically captures state before a callback and restores after
 * Useful for wrapping RSC refresh
 */
export function usePreservingState<T extends (...args: any[]) => Promise<void>>(
  callback: T,
  getCurrentState: () => Partial<EditState>
): T {
  const context = React.useContext(EditStateContext)

  const wrappedCallback = useCallback(
    async (...args: Parameters<T>) => {
      // Capture state before
      const captured = context?.captureState(getCurrentState())

      // Run the callback
      await callback(...args)

      // Restore state after
      if (captured) {
        context?.restoreState(captured)
      }
    },
    [callback, getCurrentState, context]
  ) as T

  return wrappedCallback
}
