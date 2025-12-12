/**
 * Overlay Editor Module
 *
 * RSC-based block editor with:
 * - Live RSC rendering with client component hydration
 * - Source polling with fast mutation feedback
 * - Drag and drop for element reordering
 * - Inline text editing with contentEditable
 * - Surgical source mutations via AST
 * - Multi-select with Cmd/Ctrl+click, Shift+click, and drag selection
 * - Clipboard operations (copy/cut/paste)
 * - Undo/redo history with full source restoration
 * - Full keyboard shortcuts
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
  extractJsxForNodes,
  getNodeParentInfo,
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

// Selection components
export { DragSelect } from './DragSelect'

// Cache utilities
export {
  useRscCache,
  getCachedRscHtml,
  setCachedRscHtml,
  invalidateCachedRscHtml,
} from './cache'
