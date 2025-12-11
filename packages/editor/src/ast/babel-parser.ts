/**
 * Babel-based TSX Parser with Source Locations
 *
 * Parses TSX source and extracts only editable JSX nodes with:
 * - Stable IDs based on structural position
 * - Exact source locations (start/end character positions)
 * - Preserves non-JSX code untouched
 */

import { parse } from '@babel/parser'
import type * as t from '@babel/types'

// ============================================================================
// Types
// ============================================================================

/** Source location in the original source string */
export interface SourceLocation {
  start: number
  end: number
}

/** A prop on a JSX element */
export interface EditableProp {
  name: string
  value: string | number | boolean | null | object
  /** Raw source of the value (for expressions) */
  rawValue: string
  /** Is this an expression like {foo} vs literal "foo" */
  isExpression: boolean
  /** Location of the entire attribute (name="value") */
  loc: SourceLocation
  /** Location of just the value */
  valueLoc: SourceLocation
}

/** An editable JSX element */
export interface EditableNode {
  /** Stable ID based on structural position */
  id: string
  /** Tag name (div, Card, Button, etc) */
  tagName: string
  /** Is this a self-closing element */
  selfClosing: boolean
  /** Props/attributes */
  props: Record<string, EditableProp>
  /** Child nodes (only JSX elements and text, not expressions) */
  children: EditableNode[]
  /** Text content if this is a text node */
  text?: string
  /** Is this a text node */
  isText?: boolean
  /** Source location of the entire element */
  loc: SourceLocation
  /** Source location of opening tag (for inserting props) */
  openingTagLoc: SourceLocation
  /** Source location of children area (for inserting children) */
  childrenLoc?: SourceLocation
}

/** Result of parsing source */
export interface ParseResult {
  /** The editable JSX tree (null if no JSX found) */
  root: EditableNode | null
  /** Location of the JSX return expression in source */
  jsxLoc: SourceLocation | null
  /** The full source string */
  source: string
  /** Any parse errors */
  errors: string[]
}

// ============================================================================
// Stable ID Generation
// ============================================================================

/**
 * Generate a stable ID for a node based on its structural position.
 *
 * Strategy: path-based ID like "0.1.2" representing:
 * - Root element (index 0)
 * - Second child (index 1)
 * - Third child of that (index 2)
 *
 * This is stable across edits that don't change structure.
 * For elements, we also include the tagName for readability.
 */
function generateStableId(path: number[], tagName: string): string {
  const pathStr = path.join('.')
  // Sanitize tagName (lowercase, remove special chars)
  const safeName = tagName.toLowerCase().replace(/[^a-z0-9]/g, '')
  return `${safeName}_${pathStr}`
}

// ============================================================================
// Babel AST → EditableNode
// ============================================================================

/**
 * Convert a Babel JSX node to our EditableNode format
 */
function babelJsxToEditableNode(
  node: t.JSXElement | t.JSXFragment | t.JSXText | t.JSXExpressionContainer,
  source: string,
  path: number[]
): EditableNode | null {
  // Handle JSX Text
  if (node.type === 'JSXText') {
    const text = node.value.trim()
    if (!text) return null // Skip whitespace-only text

    return {
      id: generateStableId(path, 'text'),
      tagName: '#text',
      selfClosing: false,
      props: {},
      children: [],
      text,
      isText: true,
      loc: {
        start: node.start ?? 0,
        end: node.end ?? 0,
      },
      openingTagLoc: {
        start: node.start ?? 0,
        end: node.end ?? 0,
      },
    }
  }

  // Handle JSX Expression Container (skip for now - just get text if literal)
  if (node.type === 'JSXExpressionContainer') {
    // For simple string/number literals, treat as text
    if (node.expression.type === 'StringLiteral') {
      return {
        id: generateStableId(path, 'text'),
        tagName: '#text',
        selfClosing: false,
        props: {},
        children: [],
        text: node.expression.value,
        isText: true,
        loc: {
          start: node.start ?? 0,
          end: node.end ?? 0,
        },
        openingTagLoc: {
          start: node.start ?? 0,
          end: node.end ?? 0,
        },
      }
    }
    // Skip other expressions for now
    return null
  }

  // Handle JSX Fragment
  if (node.type === 'JSXFragment') {
    const children = extractChildren(node.children, source, path)
    return {
      id: generateStableId(path, 'fragment'),
      tagName: '#fragment',
      selfClosing: false,
      props: {},
      children,
      loc: {
        start: node.start ?? 0,
        end: node.end ?? 0,
      },
      openingTagLoc: {
        start: node.openingFragment.start ?? 0,
        end: node.openingFragment.end ?? 0,
      },
      childrenLoc: children.length > 0
        ? {
            start: node.openingFragment.end ?? 0,
            end: node.closingFragment.start ?? 0,
          }
        : undefined,
    }
  }

  // Handle JSX Element
  if (node.type === 'JSXElement') {
    const opening = node.openingElement
    const tagName = getTagName(opening.name)
    const props = extractProps(opening.attributes, source)
    const children = extractChildren(node.children, source, path)

    return {
      id: generateStableId(path, tagName),
      tagName,
      selfClosing: opening.selfClosing,
      props,
      children,
      loc: {
        start: node.start ?? 0,
        end: node.end ?? 0,
      },
      openingTagLoc: {
        start: opening.start ?? 0,
        end: opening.end ?? 0,
      },
      childrenLoc:
        !opening.selfClosing && node.closingElement
          ? {
              start: opening.end ?? 0,
              end: node.closingElement.start ?? 0,
            }
          : undefined,
    }
  }

  return null
}

/**
 * Get tag name from JSX identifier
 */
function getTagName(name: t.JSXIdentifier | t.JSXMemberExpression | t.JSXNamespacedName): string {
  if (name.type === 'JSXIdentifier') {
    return name.name
  }
  if (name.type === 'JSXMemberExpression') {
    return `${getTagName(name.object)}.${name.property.name}`
  }
  if (name.type === 'JSXNamespacedName') {
    return `${name.namespace.name}:${name.name.name}`
  }
  return 'unknown'
}

/**
 * Extract props from JSX attributes
 */
function extractProps(
  attributes: (t.JSXAttribute | t.JSXSpreadAttribute)[],
  source: string
): Record<string, EditableProp> {
  const props: Record<string, EditableProp> = {}

  for (const attr of attributes) {
    if (attr.type === 'JSXSpreadAttribute') {
      // Handle spread: {...props}
      const rawValue = source.slice(attr.start ?? 0, attr.end ?? 0)
      props['...spread'] = {
        name: '...spread',
        value: rawValue,
        rawValue,
        isExpression: true,
        loc: { start: attr.start ?? 0, end: attr.end ?? 0 },
        valueLoc: { start: attr.argument.start ?? 0, end: attr.argument.end ?? 0 },
      }
      continue
    }

    const name = attr.name.type === 'JSXIdentifier'
      ? attr.name.name
      : `${attr.name.namespace.name}:${attr.name.name.name}`

    // No value means boolean true: <Input disabled />
    if (!attr.value) {
      props[name] = {
        name,
        value: true,
        rawValue: 'true',
        isExpression: false,
        loc: { start: attr.start ?? 0, end: attr.end ?? 0 },
        valueLoc: { start: attr.start ?? 0, end: attr.end ?? 0 },
      }
      continue
    }

    // String literal: name="value"
    if (attr.value.type === 'StringLiteral') {
      props[name] = {
        name,
        value: attr.value.value,
        rawValue: `"${attr.value.value}"`,
        isExpression: false,
        loc: { start: attr.start ?? 0, end: attr.end ?? 0 },
        valueLoc: { start: attr.value.start ?? 0, end: attr.value.end ?? 0 },
      }
      continue
    }

    // Expression: name={...}
    if (attr.value.type === 'JSXExpressionContainer') {
      const expr = attr.value.expression
      const rawValue = source.slice(attr.value.start ?? 0, attr.value.end ?? 0)

      let value: string | number | boolean | null | object = rawValue

      // Try to extract literal values
      if (expr.type === 'NumericLiteral') {
        value = expr.value
      } else if (expr.type === 'StringLiteral') {
        value = expr.value
      } else if (expr.type === 'BooleanLiteral') {
        value = expr.value
      } else if (expr.type === 'NullLiteral') {
        value = null
      } else if (expr.type === 'ObjectExpression' || expr.type === 'ArrayExpression') {
        // Try to parse as JSON
        try {
          const innerSource = source.slice(expr.start ?? 0, expr.end ?? 0)
          value = JSON.parse(innerSource.replace(/'/g, '"'))
        } catch {
          value = rawValue
        }
      }

      props[name] = {
        name,
        value,
        rawValue,
        isExpression: true,
        loc: { start: attr.start ?? 0, end: attr.end ?? 0 },
        valueLoc: { start: attr.value.start ?? 0, end: attr.value.end ?? 0 },
      }
      continue
    }

    // JSX Element as prop value: name={<Element />}
    if (attr.value.type === 'JSXElement') {
      const rawValue = source.slice(attr.value.start ?? 0, attr.value.end ?? 0)
      props[name] = {
        name,
        value: rawValue,
        rawValue,
        isExpression: true,
        loc: { start: attr.start ?? 0, end: attr.end ?? 0 },
        valueLoc: { start: attr.value.start ?? 0, end: attr.value.end ?? 0 },
      }
    }
  }

  return props
}

/**
 * Extract children from JSX children array
 */
function extractChildren(
  children: (t.JSXElement | t.JSXFragment | t.JSXText | t.JSXExpressionContainer | t.JSXSpreadChild)[],
  source: string,
  parentPath: number[]
): EditableNode[] {
  const result: EditableNode[] = []
  let childIndex = 0

  for (const child of children) {
    if (child.type === 'JSXSpreadChild') continue // Skip spread children

    const node = babelJsxToEditableNode(
      child as t.JSXElement | t.JSXFragment | t.JSXText | t.JSXExpressionContainer,
      source,
      [...parentPath, childIndex]
    )

    if (node) {
      result.push(node)
      childIndex++
    }
  }

  return result
}

// ============================================================================
// Main Parser
// ============================================================================

/**
 * Recursively find JSX in any expression
 */
function findJsxInExpression(node: t.Node): t.JSXElement | t.JSXFragment | null {
  if (!node) return null

  // Direct JSX
  if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
    return node
  }

  // Parenthesized: (expr)
  if (node.type === 'ParenthesizedExpression') {
    return findJsxInExpression((node as t.ParenthesizedExpression).expression)
  }

  // Arrow function body
  if (node.type === 'ArrowFunctionExpression') {
    const arrow = node as t.ArrowFunctionExpression
    if (arrow.body.type === 'BlockStatement') {
      // Block body: look for return statement
      for (const stmt of arrow.body.body) {
        if (stmt.type === 'ReturnStatement' && stmt.argument) {
          const jsx = findJsxInExpression(stmt.argument)
          if (jsx) return jsx
        }
      }
    } else {
      // Expression body
      return findJsxInExpression(arrow.body)
    }
  }

  // Function expression body
  if (node.type === 'FunctionExpression' || node.type === 'FunctionDeclaration') {
    const func = node as t.FunctionExpression | t.FunctionDeclaration
    for (const stmt of func.body.body) {
      if (stmt.type === 'ReturnStatement' && stmt.argument) {
        const jsx = findJsxInExpression(stmt.argument)
        if (jsx) return jsx
      }
    }
  }

  // TypeScript satisfies: expr satisfies Type
  if (node.type === 'TSSatisfiesExpression') {
    return findJsxInExpression((node as any).expression)
  }

  // TypeScript as: expr as Type
  if (node.type === 'TSAsExpression') {
    return findJsxInExpression((node as any).expression)
  }

  // Call expression: might be IIFE or wrapped
  if (node.type === 'CallExpression') {
    const call = node as t.CallExpression
    // Check callee (for IIFE)
    const calleeJsx = findJsxInExpression(call.callee as t.Node)
    if (calleeJsx) return calleeJsx
    // Check arguments
    for (const arg of call.arguments) {
      const argJsx = findJsxInExpression(arg as t.Node)
      if (argJsx) return argJsx
    }
  }

  return null
}

/**
 * Find the JSX return expression in a parsed AST
 */
function findJsxReturn(ast: t.File): { node: t.JSXElement | t.JSXFragment; loc: SourceLocation } | null {
  // Walk the AST to find export default with JSX return
  for (const statement of ast.program.body) {
    if (statement.type === 'ExportDefaultDeclaration') {
      const jsx = findJsxInExpression(statement.declaration)
      if (jsx) {
        return {
          node: jsx,
          loc: { start: jsx.start ?? 0, end: jsx.end ?? 0 },
        }
      }
    }
  }

  return null
}

/**
 * Parse TSX source and extract editable JSX nodes
 */
export function parseSourceWithLocations(source: string): ParseResult {
  const errors: string[] = []

  try {
    const ast = parse(source, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
    })

    const jsxResult = findJsxReturn(ast)
    if (!jsxResult) {
      return {
        root: null,
        jsxLoc: null,
        source,
        errors: ['No JSX return found in export default'],
      }
    }

    const root = babelJsxToEditableNode(jsxResult.node, source, [0])

    return {
      root,
      jsxLoc: jsxResult.loc,
      source,
      errors,
    }
  } catch (err) {
    return {
      root: null,
      jsxLoc: null,
      source,
      errors: [err instanceof Error ? err.message : String(err)],
    }
  }
}

/**
 * Get an editable node by its stable ID
 */
export function getNodeById(root: EditableNode | null, id: string): EditableNode | null {
  if (!root) return null
  if (root.id === id) return root

  for (const child of root.children) {
    const found = getNodeById(child, id)
    if (found) return found
  }

  return null
}

/**
 * Get the path to a node by its ID
 */
export function getPathById(root: EditableNode | null, id: string, path: number[] = []): number[] | null {
  if (!root) return null
  if (root.id === id) return path

  for (let i = 0; i < root.children.length; i++) {
    const found = getPathById(root.children[i], id, [...path, i])
    if (found) return found
  }

  return null
}
