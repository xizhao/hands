/**
 * Editor Context - State management for the Overlay Editor
 *
 * Uses React Context + useReducer for UI state (selection, hover, editing, menus).
 * Source state is managed separately via useEditorSource hook.
 */

import {
  createContext,
  useContext,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react'

// ============================================================================
// Types
// ============================================================================

export interface HistoryEntry {
  source: string
  selectedNodeIds: string[]
  timestamp: number
}

export interface InsertTarget {
  parentId: string
  index: number
}

export interface SlashMenuState {
  open: boolean
  position: { x: number; y: number } | null
  filter: string
  insertTarget: InsertTarget | null
  highlightedIndex: number
}

export interface ClipboardState {
  jsx: string[]
  operation: 'copy' | 'cut'
}

export interface EditorUIState {
  // Selection
  selectedNodeIds: string[]
  focusedNodeId: string | null

  // Hover
  hoveredNodeId: string | null

  // Inline editing
  editingNodeId: string | null

  // Slash menu
  slashMenu: SlashMenuState

  // History (managed in state for undo/redo)
  history: {
    past: HistoryEntry[]
    future: HistoryEntry[]
  }

  // Clipboard
  clipboard: ClipboardState | null
}

// ============================================================================
// Actions
// ============================================================================

export type EditorAction =
  // Selection
  | { type: 'SELECT'; nodeId: string; additive?: boolean }
  | { type: 'SELECT_MANY'; nodeIds: string[] }
  | { type: 'SELECT_RANGE'; fromId: string; toId: string; allNodeIds: string[] }
  | { type: 'DESELECT'; nodeId: string }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'SET_FOCUSED'; nodeId: string | null }

  // Hover
  | { type: 'SET_HOVER'; nodeId: string | null }

  // Editing
  | { type: 'START_EDITING'; nodeId: string }
  | { type: 'STOP_EDITING' }

  // Slash menu
  | { type: 'OPEN_SLASH_MENU'; position: { x: number; y: number }; insertTarget: InsertTarget }
  | { type: 'UPDATE_SLASH_FILTER'; filter: string }
  | { type: 'UPDATE_SLASH_HIGHLIGHT'; index: number }
  | { type: 'CLOSE_SLASH_MENU' }

  // History
  | { type: 'PUSH_HISTORY'; entry: HistoryEntry }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'CLEAR_HISTORY' }

  // Clipboard
  | { type: 'SET_CLIPBOARD'; jsx: string[]; operation: 'copy' | 'cut' }
  | { type: 'CLEAR_CLIPBOARD' }

  // Bulk state restore (for RSC re-render recovery)
  | { type: 'RESTORE_STATE'; state: Partial<EditorUIState> }

// ============================================================================
// Initial State
// ============================================================================

const initialState: EditorUIState = {
  selectedNodeIds: [],
  focusedNodeId: null,
  hoveredNodeId: null,
  editingNodeId: null,
  slashMenu: {
    open: false,
    position: null,
    filter: '',
    insertTarget: null,
    highlightedIndex: 0,
  },
  history: {
    past: [],
    future: [],
  },
  clipboard: null,
}

// ============================================================================
// Reducer
// ============================================================================

const MAX_HISTORY_SIZE = 50

function editorReducer(state: EditorUIState, action: EditorAction): EditorUIState {
  switch (action.type) {
    // Selection
    case 'SELECT': {
      if (action.additive) {
        // Toggle: add if not present, remove if present
        const exists = state.selectedNodeIds.includes(action.nodeId)
        return {
          ...state,
          selectedNodeIds: exists
            ? state.selectedNodeIds.filter((id) => id !== action.nodeId)
            : [...state.selectedNodeIds, action.nodeId],
          focusedNodeId: action.nodeId,
        }
      }
      // Replace selection
      return {
        ...state,
        selectedNodeIds: [action.nodeId],
        focusedNodeId: action.nodeId,
      }
    }

    case 'SELECT_MANY':
      return {
        ...state,
        selectedNodeIds: action.nodeIds,
        focusedNodeId: action.nodeIds[action.nodeIds.length - 1] ?? null,
      }

    case 'SELECT_RANGE': {
      // Find indices in the full node list
      const fromIdx = action.allNodeIds.indexOf(action.fromId)
      const toIdx = action.allNodeIds.indexOf(action.toId)
      if (fromIdx === -1 || toIdx === -1) return state

      const start = Math.min(fromIdx, toIdx)
      const end = Math.max(fromIdx, toIdx)
      const rangeIds = action.allNodeIds.slice(start, end + 1)

      return {
        ...state,
        selectedNodeIds: rangeIds,
        focusedNodeId: action.toId,
      }
    }

    case 'DESELECT':
      return {
        ...state,
        selectedNodeIds: state.selectedNodeIds.filter((id) => id !== action.nodeId),
        focusedNodeId:
          state.focusedNodeId === action.nodeId
            ? state.selectedNodeIds.find((id) => id !== action.nodeId) ?? null
            : state.focusedNodeId,
      }

    case 'CLEAR_SELECTION':
      return {
        ...state,
        selectedNodeIds: [],
        focusedNodeId: null,
      }

    case 'SET_FOCUSED':
      return {
        ...state,
        focusedNodeId: action.nodeId,
      }

    // Hover
    case 'SET_HOVER':
      return {
        ...state,
        hoveredNodeId: action.nodeId,
      }

    // Editing
    case 'START_EDITING':
      return {
        ...state,
        editingNodeId: action.nodeId,
      }

    case 'STOP_EDITING':
      return {
        ...state,
        editingNodeId: null,
      }

    // Slash menu
    case 'OPEN_SLASH_MENU':
      return {
        ...state,
        slashMenu: {
          open: true,
          position: action.position,
          filter: '',
          insertTarget: action.insertTarget,
          highlightedIndex: 0,
        },
      }

    case 'UPDATE_SLASH_FILTER':
      return {
        ...state,
        slashMenu: {
          ...state.slashMenu,
          filter: action.filter,
          highlightedIndex: 0, // Reset highlight on filter change
        },
      }

    case 'UPDATE_SLASH_HIGHLIGHT':
      return {
        ...state,
        slashMenu: {
          ...state.slashMenu,
          highlightedIndex: action.index,
        },
      }

    case 'CLOSE_SLASH_MENU':
      return {
        ...state,
        slashMenu: {
          ...state.slashMenu,
          open: false,
          filter: '',
          insertTarget: null,
        },
      }

    // History
    case 'PUSH_HISTORY': {
      const past = [...state.history.past, action.entry].slice(-MAX_HISTORY_SIZE)
      return {
        ...state,
        history: {
          past,
          future: [], // Clear future on new action
        },
      }
    }

    case 'UNDO': {
      if (state.history.past.length === 0) return state

      const past = [...state.history.past]
      const entry = past.pop()!

      return {
        ...state,
        history: {
          past,
          future: [entry, ...state.history.future],
        },
        // Selection is restored when source is restored via useEditorSource
        selectedNodeIds: entry.selectedNodeIds,
      }
    }

    case 'REDO': {
      if (state.history.future.length === 0) return state

      const [entry, ...future] = state.history.future

      return {
        ...state,
        history: {
          past: [...state.history.past, entry],
          future,
        },
        selectedNodeIds: entry.selectedNodeIds,
      }
    }

    case 'CLEAR_HISTORY':
      return {
        ...state,
        history: {
          past: [],
          future: [],
        },
      }

    // Clipboard
    case 'SET_CLIPBOARD':
      return {
        ...state,
        clipboard: {
          jsx: action.jsx,
          operation: action.operation,
        },
      }

    case 'CLEAR_CLIPBOARD':
      return {
        ...state,
        clipboard: null,
      }

    // State restoration
    case 'RESTORE_STATE':
      return {
        ...state,
        ...action.state,
      }

    default:
      return state
  }
}

// ============================================================================
// Context
// ============================================================================

interface EditorContextValue {
  state: EditorUIState
  dispatch: Dispatch<EditorAction>
}

const EditorContext = createContext<EditorContextValue | null>(null)

// ============================================================================
// Provider
// ============================================================================

interface EditorProviderProps {
  children: ReactNode
  initialSelection?: string[]
}

export function EditorProvider({ children, initialSelection }: EditorProviderProps) {
  const [state, dispatch] = useReducer(editorReducer, {
    ...initialState,
    selectedNodeIds: initialSelection ?? [],
    focusedNodeId: initialSelection?.[0] ?? null,
  })

  return (
    <EditorContext.Provider value={{ state, dispatch }}>
      {children}
    </EditorContext.Provider>
  )
}

// ============================================================================
// Hook
// ============================================================================

export function useEditor() {
  const ctx = useContext(EditorContext)
  if (!ctx) {
    throw new Error('useEditor must be used within an EditorProvider')
  }
  return ctx
}

// ============================================================================
// Convenience Hooks
// ============================================================================

export function useEditorSelection() {
  const { state, dispatch } = useEditor()

  return {
    selectedNodeIds: state.selectedNodeIds,
    focusedNodeId: state.focusedNodeId,
    isSelected: (nodeId: string) => state.selectedNodeIds.includes(nodeId),
    select: (nodeId: string, additive?: boolean) =>
      dispatch({ type: 'SELECT', nodeId, additive }),
    selectMany: (nodeIds: string[]) =>
      dispatch({ type: 'SELECT_MANY', nodeIds }),
    selectRange: (fromId: string, toId: string, allNodeIds: string[]) =>
      dispatch({ type: 'SELECT_RANGE', fromId, toId, allNodeIds }),
    deselect: (nodeId: string) =>
      dispatch({ type: 'DESELECT', nodeId }),
    clearSelection: () =>
      dispatch({ type: 'CLEAR_SELECTION' }),
  }
}

export function useEditorHover() {
  const { state, dispatch } = useEditor()

  return {
    hoveredNodeId: state.hoveredNodeId,
    setHover: (nodeId: string | null) =>
      dispatch({ type: 'SET_HOVER', nodeId }),
  }
}

export function useEditorEditing() {
  const { state, dispatch } = useEditor()

  return {
    editingNodeId: state.editingNodeId,
    isEditing: (nodeId: string) => state.editingNodeId === nodeId,
    startEditing: (nodeId: string) =>
      dispatch({ type: 'START_EDITING', nodeId }),
    stopEditing: () =>
      dispatch({ type: 'STOP_EDITING' }),
  }
}

export function useSlashMenu() {
  const { state, dispatch } = useEditor()

  return {
    ...state.slashMenu,
    open: (position: { x: number; y: number }, insertTarget: InsertTarget) =>
      dispatch({ type: 'OPEN_SLASH_MENU', position, insertTarget }),
    updateFilter: (filter: string) =>
      dispatch({ type: 'UPDATE_SLASH_FILTER', filter }),
    updateHighlight: (index: number) =>
      dispatch({ type: 'UPDATE_SLASH_HIGHLIGHT', index }),
    close: () =>
      dispatch({ type: 'CLOSE_SLASH_MENU' }),
  }
}

export function useEditorHistory() {
  const { state, dispatch } = useEditor()

  return {
    canUndo: state.history.past.length > 0,
    canRedo: state.history.future.length > 0,
    push: (entry: HistoryEntry) =>
      dispatch({ type: 'PUSH_HISTORY', entry }),
    undo: () => dispatch({ type: 'UNDO' }),
    redo: () => dispatch({ type: 'REDO' }),
    clear: () => dispatch({ type: 'CLEAR_HISTORY' }),
    getUndoEntry: () => state.history.past[state.history.past.length - 1],
    getRedoEntry: () => state.history.future[0],
  }
}

export function useEditorClipboard() {
  const { state, dispatch } = useEditor()

  return {
    clipboard: state.clipboard,
    hasClipboard: state.clipboard !== null,
    setClipboard: (jsx: string[], operation: 'copy' | 'cut') =>
      dispatch({ type: 'SET_CLIPBOARD', jsx, operation }),
    clearClipboard: () =>
      dispatch({ type: 'CLEAR_CLIPBOARD' }),
  }
}
