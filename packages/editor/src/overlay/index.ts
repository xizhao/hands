/**
 * Overlay Editor Module
 *
 * RSC-based block editor with:
 * - Live RSC rendering with client component hydration
 * - Source polling with fast mutation feedback
 * - Drag and drop for element reordering
 * - Inline text editing with contentEditable
 * - Surgical source mutations via AST
 */

// Main component
export { OverlayEditor } from './OverlayEditor'

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
