/**
 * Core types for the WYSIWYG block editor
 */

// ============================================================================
// AST Types (JSX Tree)
// ============================================================================

/**
 * Property value in JSX - can be literal, expression, or nested JSX
 */
export interface PropValue {
  type: 'literal' | 'expression' | 'jsx'
  value: string | number | boolean | null | JsxNode
  /** Original source for expressions */
  rawSource?: string
}

/**
 * A node in the JSX AST
 */
export interface JsxNode {
  /** Unique ID for tracking */
  id: string
  /** Node type */
  type: 'element' | 'fragment' | 'text' | 'expression'
  /** Tag name for elements (e.g., 'div', 'Card', 'Button') */
  tagName?: string
  /** Props for elements */
  props?: Record<string, PropValue>
  /** Child nodes */
  children?: JsxNode[]
  /** Text content (for text nodes) */
  text?: string
  /** Expression code (for expression nodes like {data.map(...)}) */
  expression?: string
}

// ============================================================================
// Path Types
// ============================================================================

/**
 * Path to a node in the AST
 * e.g., ['children', 0, 'children', 2] means root.children[0].children[2]
 */
export type NodePath = (string | number)[]

// ============================================================================
// Mutation Types (Oplog Operations)
// ============================================================================

export interface InsertNodeMutation {
  type: 'insert-node'
  /** Path to parent node */
  path: NodePath
  /** Index to insert at */
  index: number
  /** Node to insert */
  node: JsxNode
}

export interface DeleteNodeMutation {
  type: 'delete-node'
  /** Path to node to delete */
  path: NodePath
}

export interface MoveNodeMutation {
  type: 'move-node'
  /** Current path of node */
  fromPath: NodePath
  /** New parent path */
  toPath: NodePath
  /** Index in new parent */
  toIndex: number
}

export interface SetPropMutation {
  type: 'set-prop'
  /** Path to element node */
  path: NodePath
  /** Prop name */
  prop: string
  /** New value */
  value: PropValue
}

export interface DeletePropMutation {
  type: 'delete-prop'
  /** Path to element node */
  path: NodePath
  /** Prop name to delete */
  prop: string
}

export interface SetTextMutation {
  type: 'set-text'
  /** Path to text node */
  path: NodePath
  /** New text content */
  text: string
}

export interface WrapNodeMutation {
  type: 'wrap-node'
  /** Path to node to wrap */
  path: NodePath
  /** Wrapper element (children will be set to wrapped node) */
  wrapper: JsxNode
}

export interface UnwrapNodeMutation {
  type: 'unwrap-node'
  /** Path to wrapper element to remove */
  path: NodePath
}

/**
 * All possible mutations
 */
export type Mutation =
  | InsertNodeMutation
  | DeleteNodeMutation
  | MoveNodeMutation
  | SetPropMutation
  | DeletePropMutation
  | SetTextMutation
  | WrapNodeMutation
  | UnwrapNodeMutation

// ============================================================================
// Oplog Types
// ============================================================================

/**
 * Entry in the operation log
 */
export interface OplogEntry {
  /** Unique ID */
  id: string
  /** When this was applied */
  timestamp: number
  /** The mutation that was applied */
  mutation: Mutation
  /** Inverse mutation for undo */
  inverse: Mutation
}

/**
 * The full operation log with undo/redo cursor
 */
export interface Oplog {
  /** All entries */
  entries: OplogEntry[]
  /** Current position (entries after cursor are redo-able) */
  cursor: number
}

// ============================================================================
// Scene Types (Rendered Output)
// ============================================================================

/**
 * Context for nodes rendered from .map() expressions
 */
export interface IteratorContext {
  /** The array expression (e.g., "users") */
  arrayExpression: string
  /** The iterator variable (e.g., "u" in users.map(u => ...)) */
  itemVar: string
  /** Index in the array */
  index: number
}

/**
 * A node in the rendered scene graph
 */
export interface RenderedNode {
  /** Unique ID for selection/drag-drop */
  id: string
  /** Node type */
  type: 'element' | 'text'
  /** Resolved tag name */
  tagName: string
  /** Computed props (after expression evaluation) */
  props: Record<string, unknown>
  /** Rendered children */
  children: RenderedNode[]
  /** Text content for text nodes */
  text?: string
  /** Path to corresponding AST node */
  sourcePath: NodePath
  /** Context if from .map() iteration */
  iteratorContext?: IteratorContext
  /** Bounding box (set after DOM render) */
  bounds?: DOMRect
}

/**
 * The rendered scene
 */
export interface RenderedScene {
  /** Root node */
  root: RenderedNode
  /** Mock data used for rendering */
  mockData: Record<string, unknown>
}

// ============================================================================
// Editor State
// ============================================================================

/**
 * Complete editor state
 */
export interface EditorState {
  /** Current TSX source code */
  source: string
  /** Parsed AST */
  ast: JsxNode
  /** Rendered scene */
  scene: RenderedScene | null
  /** Mock data for rendering */
  mockData: Record<string, unknown>
  /** Currently selected node path */
  selectedPath: NodePath | null
  /** Operation log */
  oplog: Oplog
  /** Is there an error? */
  error: string | null
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

/**
 * Create an empty oplog
 */
export function createEmptyOplog(): Oplog {
  return { entries: [], cursor: 0 }
}

/**
 * Create a literal prop value
 */
export function literal(value: string | number | boolean | null): PropValue {
  return { type: 'literal', value }
}

/**
 * Create an expression prop value
 */
export function expression(code: string): PropValue {
  return { type: 'expression', value: code, rawSource: code }
}

/**
 * Compare two paths for equality
 */
export function pathEquals(a: NodePath, b: NodePath): boolean {
  if (a.length !== b.length) return false
  return a.every((segment, i) => segment === b[i])
}

/**
 * Check if path `a` is an ancestor of path `b`
 */
export function isAncestor(ancestor: NodePath, descendant: NodePath): boolean {
  if (ancestor.length >= descendant.length) return false
  return ancestor.every((segment, i) => segment === descendant[i])
}
