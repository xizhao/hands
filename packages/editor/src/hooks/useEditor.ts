/**
 * Main editor hook - manages editor state and operations
 */
import { useReducer, useCallback, useMemo } from 'react'
import type {
  EditorState,
  Mutation,
  NodePath,
  RenderedScene,
} from '../types'
import { createEmptyOplog } from '../types'
import { parseSource } from '../ast/parser'
import { generateBlockSource } from '../ast/generator'
import { applyMutation } from '../ast/apply'
import {
  appendMutation,
  getUndoMutation,
  getRedoMutation,
  moveUndoCursor,
  moveRedoCursor,
  canUndo as checkCanUndo,
  canRedo as checkCanRedo,
} from '../oplog/history'

// ============================================================================
// Reducer
// ============================================================================

type EditorAction =
  | { type: 'SET_SOURCE'; source: string }
  | { type: 'APPLY_MUTATION'; mutation: Mutation }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'SET_SELECTED'; path: NodePath | null }
  | { type: 'SET_SCENE'; scene: RenderedScene }
  | { type: 'SET_MOCK_DATA'; mockData: Record<string, unknown> }
  | { type: 'CLEAR_HISTORY' }
  | { type: 'SET_ERROR'; error: string | null }

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'SET_SOURCE': {
      try {
        const ast = parseSource(action.source)
        return {
          ...state,
          source: action.source,
          ast,
          error: null,
        }
      } catch (e) {
        return {
          ...state,
          source: action.source,
          error: e instanceof Error ? e.message : 'Parse error',
        }
      }
    }

    case 'APPLY_MUTATION': {
      try {
        // Apply mutation to AST
        const newAst = applyMutation(state.ast, action.mutation)

        // Generate new source
        const newSource = generateBlockSource(newAst)

        // Append to oplog
        const newOplog = appendMutation(state.oplog, state.ast, action.mutation)

        return {
          ...state,
          ast: newAst,
          source: newSource,
          oplog: newOplog,
          error: null,
        }
      } catch (e) {
        return {
          ...state,
          error: e instanceof Error ? e.message : 'Mutation error',
        }
      }
    }

    case 'UNDO': {
      const undoMutation = getUndoMutation(state.oplog)
      if (!undoMutation) return state

      try {
        const newAst = applyMutation(state.ast, undoMutation)
        const newSource = generateBlockSource(newAst)
        const newOplog = moveUndoCursor(state.oplog)

        return {
          ...state,
          ast: newAst,
          source: newSource,
          oplog: newOplog,
          error: null,
        }
      } catch (e) {
        return {
          ...state,
          error: e instanceof Error ? e.message : 'Undo error',
        }
      }
    }

    case 'REDO': {
      const redoMutation = getRedoMutation(state.oplog)
      if (!redoMutation) return state

      try {
        const newAst = applyMutation(state.ast, redoMutation)
        const newSource = generateBlockSource(newAst)
        const newOplog = moveRedoCursor(state.oplog)

        return {
          ...state,
          ast: newAst,
          source: newSource,
          oplog: newOplog,
          error: null,
        }
      } catch (e) {
        return {
          ...state,
          error: e instanceof Error ? e.message : 'Redo error',
        }
      }
    }

    case 'SET_SELECTED':
      return { ...state, selectedPath: action.path }

    case 'SET_SCENE':
      return { ...state, scene: action.scene }

    case 'SET_MOCK_DATA':
      return { ...state, mockData: action.mockData }

    case 'CLEAR_HISTORY':
      return { ...state, oplog: createEmptyOplog() }

    case 'SET_ERROR':
      return { ...state, error: action.error }

    default:
      return state
  }
}

// ============================================================================
// Initial State
// ============================================================================

function createInitialState(source: string): EditorState {
  const ast = parseSource(source)

  return {
    source,
    ast,
    scene: null,
    mockData: {},
    selectedPath: null,
    oplog: createEmptyOplog(),
    error: null,
  }
}

// ============================================================================
// Hook
// ============================================================================

export interface UseEditorReturn {
  /** Current editor state */
  state: EditorState

  /** Apply a mutation */
  applyMutation: (mutation: Mutation) => void

  /** Undo last mutation */
  undo: () => void

  /** Redo last undone mutation */
  redo: () => void

  /** Can undo? */
  canUndo: boolean

  /** Can redo? */
  canRedo: boolean

  /** Set selected node path */
  setSelected: (path: NodePath | null) => void

  /** Set rendered scene */
  setScene: (scene: RenderedScene) => void

  /** Set mock data */
  setMockData: (data: Record<string, unknown>) => void

  /** Clear history */
  clearHistory: () => void

  /** Set source (resets history) */
  setSource: (source: string) => void

  /** Clear error */
  clearError: () => void
}

/**
 * Main editor hook
 */
export function useEditor(initialSource: string): UseEditorReturn {
  const [state, dispatch] = useReducer(
    editorReducer,
    initialSource,
    createInitialState
  )

  const applyMutation = useCallback((mutation: Mutation) => {
    dispatch({ type: 'APPLY_MUTATION', mutation })
  }, [])

  const undo = useCallback(() => {
    dispatch({ type: 'UNDO' })
  }, [])

  const redo = useCallback(() => {
    dispatch({ type: 'REDO' })
  }, [])

  const setSelected = useCallback((path: NodePath | null) => {
    dispatch({ type: 'SET_SELECTED', path })
  }, [])

  const setScene = useCallback((scene: RenderedScene) => {
    dispatch({ type: 'SET_SCENE', scene })
  }, [])

  const setMockData = useCallback((mockData: Record<string, unknown>) => {
    dispatch({ type: 'SET_MOCK_DATA', mockData })
  }, [])

  const clearHistory = useCallback(() => {
    dispatch({ type: 'CLEAR_HISTORY' })
  }, [])

  const setSource = useCallback((source: string) => {
    dispatch({ type: 'SET_SOURCE', source })
    dispatch({ type: 'CLEAR_HISTORY' })
  }, [])

  const clearError = useCallback(() => {
    dispatch({ type: 'SET_ERROR', error: null })
  }, [])

  const canUndo = useMemo(() => checkCanUndo(state.oplog), [state.oplog])
  const canRedo = useMemo(() => checkCanRedo(state.oplog), [state.oplog])

  return {
    state,
    applyMutation,
    undo,
    redo,
    canUndo,
    canRedo,
    setSelected,
    setScene,
    setMockData,
    clearHistory,
    setSource,
    clearError,
  }
}
