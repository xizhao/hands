/**
 * Overlay Editor Module
 *
 * RSC-based block editor with:
 * - Live RSC rendering with client component hydration
 * - Source polling with fast mutation feedback
 * - Drag and drop for element reordering
 * - Inline text editing with contentEditable
 * - Surgical source mutations via AST
 * - Multi-select with Cmd/Ctrl+click and Shift+click
 * - Undo/redo history
 * - Keyboard shortcuts
 * - RSC cache for instant load & smooth transitions
 */

// Main component
export { OverlayEditor } from './OverlayEditor'

// State management
export {
  EditorProvider,
  useEditor,
  useEditorSelection,
  useEditorHover,
  useEditorEditing,
  useSlashMenu,
  useEditorHistory,
  useEditorClipboard,
  type EditorUIState,
  type EditorAction,
  type HistoryEntry,
  type InsertTarget,
  type SlashMenuState,
  type ClipboardState,
} from './EditorContext'

// Source management
export {
  useEditorSource,
  type UseEditorSourceOptions,
  type UseEditorSourceReturn,
  type MutationResult,
} from './useEditorSource'

// Operations API
export {
  applyOperation,
  applyOperations,
  type EditOperation,
  type OperationResult,
} from './operations'

// DnD components (for custom implementations)
export {
  DragHandle,
  DropZone,
  NodeHighlight,
  ELEMENT_TYPE,
  type DragItem,
} from './dnd'

// Cache & animation utilities
export {
  useRscCache,
  getCachedRscHtml,
  setCachedRscHtml,
  invalidateCachedRscHtml,
  useFlipAnimation,
  captureElementPositions,
  animateElementTransitions,
} from './cache'
