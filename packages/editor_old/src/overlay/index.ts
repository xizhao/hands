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

// Cache utilities
export {
  getCachedRscHtml,
  invalidateCachedRscHtml,
  setCachedRscHtml,
  useRscCache,
} from "./cache";
// Selection components
export { DragSelect } from "./DragSelect";
// DnD components (for custom implementations)
export {
  DragHandle,
  type DragItem,
  DropZone,
  ELEMENT_TYPE,
  NodeHighlight,
} from "./dnd";
// State management
export {
  type ClipboardState,
  type EditorAction,
  EditorProvider,
  type EditorUIState,
  type HistoryEntry,
  type InsertTarget,
  type SlashMenuState,
  useEditor,
  useEditorClipboard,
  useEditorEditing,
  useEditorHistory,
  useEditorHover,
  useEditorSelection,
  useSlashMenu,
} from "./EditorContext";
// Main component
export { OverlayEditor } from "./OverlayEditor";
// Operations API
export {
  applyOperation,
  applyOperations,
  type EditOperation,
  extractJsxForNodes,
  getNodeParentInfo,
  type OperationResult,
} from "./operations";
// Source management
export {
  type MutationResult,
  type UseEditorSourceOptions,
  type UseEditorSourceReturn,
  useEditorSource,
} from "./useEditorSource";
