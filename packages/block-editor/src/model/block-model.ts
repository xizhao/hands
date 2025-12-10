/**
 * Block Model - Core data structures for the visual block editor
 *
 * These types represent the bridge between visual editing and source code.
 * The BlockModel is the source of truth for the visual editor.
 */

import type { BlockMeta } from "@hands/stdlib"

/**
 * Property value in JSX - can be literal, expression, or nested JSX
 */
export interface PropValue {
  /** Type of the value */
  type: "literal" | "expression" | "jsx"

  /** The actual value (for literals) or expression string */
  value: string | number | boolean | null | JsxNode

  /** Original source code (for complex expressions that can't be parsed) */
  rawSource?: string
}

/**
 * A node in the JSX tree
 */
export interface JsxNode {
  /** Unique ID for drag-drop and tracking */
  id: string

  /** Node type */
  type: "element" | "fragment" | "text" | "expression"

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

  /** Source location for mapping back to code */
  sourceRange?: {
    start: number
    end: number
  }
}

/**
 * SQL query extracted from ctx.sql calls
 */
export interface SqlQuery {
  /** Unique ID */
  id: string

  /** Variable name the result is assigned to (e.g., 'users', 'data') */
  variableName: string

  /** TypeScript type annotation if present (e.g., 'User[]') */
  resultType?: string

  /** The SQL template literal content */
  templateLiteral: string

  /** Interpolated expressions in the template */
  interpolations?: Array<{
    index: number
    expression: string
  }>

  /** Source location */
  sourceRange?: {
    start: number
    end: number
  }
}

/**
 * Import declaration from the block file
 */
export interface ImportDeclaration {
  /** Module path (e.g., 'react', '@hands/stdlib') */
  moduleSpecifier: string

  /** Default import name if present */
  defaultImport?: string

  /** Named imports */
  namedImports?: Array<{
    name: string
    alias?: string
  }>

  /** Namespace import (import * as X) */
  namespaceImport?: string

  /** Is it a type-only import? */
  isTypeOnly?: boolean
}

/**
 * Property definition for prop schemas
 */
export interface PropDefinition {
  /** TypeScript type */
  type: "string" | "number" | "boolean" | "object" | "array" | "union" | "function" | "unknown"

  /** JSDoc description */
  description?: string

  /** Default value if specified */
  defaultValue?: unknown

  /** Is the prop optional? */
  optional?: boolean

  /** For union types - the possible types */
  unionTypes?: PropDefinition[]

  /** For arrays - the item type */
  itemType?: PropDefinition

  /** For objects - nested schema */
  objectSchema?: PropSchema

  /** For unions with literal types - the options */
  literalOptions?: Array<string | number | boolean>

  /** UI editor hint */
  editor?: "text" | "number" | "textarea" | "select" | "color" | "code" | "json" | "boolean"
}

/**
 * Schema for a component's props
 */
export interface PropSchema {
  /** Property definitions by name */
  properties: Record<string, PropDefinition>

  /** Required property names */
  required: string[]
}

/**
 * Function signature extracted from the block
 */
export interface BlockSignature {
  /** Props type schema (from BlockFn<TProps>) */
  propsType: PropSchema

  /** Params type schema (from BlockFn<TProps, TParams>) */
  paramsType?: PropSchema

  /** Is the function async? */
  isAsync: boolean

  /** Function name (for named exports) */
  functionName?: string
}

/**
 * The complete model for a block file
 *
 * This is the source of truth for the visual editor and maps 1:1
 * with the .tsx source file.
 */
export interface BlockModel {
  /** Block ID (derived from filename without extension) */
  id: string

  /** Absolute path to the source file */
  filePath: string

  /** Block metadata from `export const meta` */
  meta: BlockMeta

  /** Function signature */
  signature: BlockSignature

  /** Root JSX node (the return value) */
  root: JsxNode

  /** Extracted SQL queries */
  queries: SqlQuery[]

  /** Import declarations */
  imports: ImportDeclaration[]

  /** Hash of the source for change detection */
  sourceHash: string

  /** Last modification timestamp */
  lastModified: number

  /** Parse errors if any (partial parse) */
  parseErrors?: string[]
}

/**
 * Create an empty JSX element node
 */
export function createElementNode(
  tagName: string,
  props?: Record<string, PropValue>,
  children?: JsxNode[]
): JsxNode {
  return {
    id: generateNodeId(),
    type: "element",
    tagName,
    props: props ?? {},
    children: children ?? [],
  }
}

/**
 * Create a text node
 */
export function createTextNode(text: string): JsxNode {
  return {
    id: generateNodeId(),
    type: "text",
    text,
  }
}

/**
 * Create an expression node
 */
export function createExpressionNode(expression: string): JsxNode {
  return {
    id: generateNodeId(),
    type: "expression",
    expression,
  }
}

/**
 * Create a fragment node
 */
export function createFragmentNode(children: JsxNode[]): JsxNode {
  return {
    id: generateNodeId(),
    type: "fragment",
    children,
  }
}

/**
 * Create a literal prop value
 */
export function createLiteralValue(value: string | number | boolean | null): PropValue {
  return { type: "literal", value }
}

/**
 * Create an expression prop value
 */
export function createExpressionValue(expression: string): PropValue {
  return { type: "expression", value: expression, rawSource: expression }
}

/**
 * Generate a unique node ID
 */
function generateNodeId(): string {
  // Use a simple incrementing counter + random suffix for uniqueness
  return `node_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

/**
 * Find a node by ID in the tree
 */
export function findNode(root: JsxNode, id: string): JsxNode | null {
  if (root.id === id) return root

  if (root.children) {
    for (const child of root.children) {
      const found = findNode(child, id)
      if (found) return found
    }
  }

  return null
}

/**
 * Update a node in the tree (immutably)
 */
export function updateNode(root: JsxNode, id: string, updates: Partial<JsxNode>): JsxNode {
  if (root.id === id) {
    return { ...root, ...updates }
  }

  if (root.children) {
    return {
      ...root,
      children: root.children.map((child) => updateNode(child, id, updates)),
    }
  }

  return root
}

/**
 * Remove a node from the tree (immutably)
 */
export function removeNode(root: JsxNode, id: string): JsxNode | null {
  if (root.id === id) return null

  if (root.children) {
    const newChildren = root.children
      .map((child) => removeNode(child, id))
      .filter((child): child is JsxNode => child !== null)

    return { ...root, children: newChildren }
  }

  return root
}

/**
 * Insert a node as a child of another node
 */
export function insertNode(
  root: JsxNode,
  parentId: string,
  newNode: JsxNode,
  index?: number
): JsxNode {
  if (root.id === parentId) {
    const children = root.children ?? []
    const insertIndex = index ?? children.length
    const newChildren = [
      ...children.slice(0, insertIndex),
      newNode,
      ...children.slice(insertIndex),
    ]
    return { ...root, children: newChildren }
  }

  if (root.children) {
    return {
      ...root,
      children: root.children.map((child) => insertNode(child, parentId, newNode, index)),
    }
  }

  return root
}

/**
 * Move a node to a new parent
 */
export function moveNode(
  root: JsxNode,
  nodeId: string,
  newParentId: string,
  index?: number
): JsxNode {
  const node = findNode(root, nodeId)
  if (!node) return root

  // Remove from old location
  const withoutNode = removeNode(root, nodeId)
  if (!withoutNode) return root

  // Insert at new location
  return insertNode(withoutNode, newParentId, node, index)
}
