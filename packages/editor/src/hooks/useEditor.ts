/**
 * Main editor hook - manages editor state and operations
 */
import { useCallback, useReducer } from "react";
import { parseSource } from "../ast/parser";
import type { EditorState, NodePath, RenderedScene } from "../types";

// ============================================================================
// Reducer
// ============================================================================

type EditorAction =
  | { type: "SET_SOURCE"; source: string }
  | { type: "SET_SELECTED"; path: NodePath | null }
  | { type: "SET_SCENE"; scene: RenderedScene }
  | { type: "SET_MOCK_DATA"; mockData: Record<string, unknown> }
  | { type: "SET_ERROR"; error: string | null };

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "SET_SOURCE": {
      try {
        const ast = parseSource(action.source);
        return {
          ...state,
          source: action.source,
          ast,
          error: null,
        };
      } catch (e) {
        return {
          ...state,
          source: action.source,
          error: e instanceof Error ? e.message : "Parse error",
        };
      }
    }

    case "SET_SELECTED":
      return { ...state, selectedPath: action.path };

    case "SET_SCENE":
      return { ...state, scene: action.scene };

    case "SET_MOCK_DATA":
      return { ...state, mockData: action.mockData };

    case "SET_ERROR":
      return { ...state, error: action.error };

    default:
      return state;
  }
}

// ============================================================================
// Initial State
// ============================================================================

function createInitialState(source: string): EditorState {
  const ast = parseSource(source);

  return {
    source,
    ast,
    scene: null,
    mockData: {},
    selectedPath: null,
    error: null,
  };
}

// ============================================================================
// Hook
// ============================================================================

export interface UseEditorReturn {
  /** Current editor state */
  state: EditorState;

  /** Set selected node path */
  setSelected: (path: NodePath | null) => void;

  /** Set rendered scene */
  setScene: (scene: RenderedScene) => void;

  /** Set mock data */
  setMockData: (data: Record<string, unknown>) => void;

  /** Set source */
  setSource: (source: string) => void;

  /** Clear error */
  clearError: () => void;
}

/**
 * Main editor hook
 */
export function useEditor(initialSource: string): UseEditorReturn {
  const [state, dispatch] = useReducer(editorReducer, initialSource, createInitialState);

  const setSelected = useCallback((path: NodePath | null) => {
    dispatch({ type: "SET_SELECTED", path });
  }, []);

  const setScene = useCallback((scene: RenderedScene) => {
    dispatch({ type: "SET_SCENE", scene });
  }, []);

  const setMockData = useCallback((mockData: Record<string, unknown>) => {
    dispatch({ type: "SET_MOCK_DATA", mockData });
  }, []);

  const setSource = useCallback((source: string) => {
    dispatch({ type: "SET_SOURCE", source });
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: "SET_ERROR", error: null });
  }, []);

  return {
    state,
    setSelected,
    setScene,
    setMockData,
    setSource,
    clearError,
  };
}
