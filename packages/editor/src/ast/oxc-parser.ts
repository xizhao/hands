/**
 * OXC-based TSX Parser with Source Locations
 *
 * Uses OXC for ~100x faster parsing than Babel.
 * Parses TSX source and extracts only editable JSX nodes with:
 * - Stable IDs based on structural position
 * - Exact source locations (start/end character positions)
 * - Preserves non-JSX code untouched
 */

import { parseSync } from 'oxc-parser'

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
// OXC AST Types (subset of what we need)
// ============================================================================

interface OxcNode {
  type: string
  start: number
  end: number
}

interface OxcJSXIdentifier extends OxcNode {
  type: 'JSXIdentifier'
  name: string
}

interface OxcJSXMemberExpression extends OxcNode {
  type: 'JSXMemberExpression'
  object: OxcJSXIdentifier | OxcJSXMemberExpression
  property: OxcJSXIdentifier
}

interface OxcJSXNamespacedName extends OxcNode {
  type: 'JSXNamespacedName'
  namespace: OxcJSXIdentifier
  name: OxcJSXIdentifier
}

type OxcJSXElementName = OxcJSXIdentifier | OxcJSXMemberExpression | OxcJSXNamespacedName

interface OxcJSXAttribute extends OxcNode {
  type: 'JSXAttribute'
  name: OxcJSXIdentifier | OxcJSXNamespacedName
  value: OxcJSXAttributeValue | null
}

interface OxcJSXSpreadAttribute extends OxcNode {
  type: 'JSXSpreadAttribute'
  argument: OxcNode
}

type OxcJSXAttributeItem = OxcJSXAttribute | OxcJSXSpreadAttribute

// OXC uses unified "Literal" type instead of separate StringLiteral/NumericLiteral/etc.
interface OxcLiteral extends OxcNode {
  type: 'Literal'
  value: string | number | boolean | null
  raw: string
}

interface OxcJSXExpressionContainer extends OxcNode {
  type: 'JSXExpressionContainer'
  expression: OxcNode
}

type OxcJSXAttributeValue = OxcLiteral | OxcJSXExpressionContainer | OxcJSXElement

interface OxcJSXOpeningElement extends OxcNode {
  type: 'JSXOpeningElement'
  name: OxcJSXElementName
  attributes: OxcJSXAttributeItem[]
  selfClosing: boolean
}

interface OxcJSXClosingElement extends OxcNode {
  type: 'JSXClosingElement'
  name: OxcJSXElementName
}

interface OxcJSXText extends OxcNode {
  type: 'JSXText'
  value: string
}

interface OxcJSXElement extends OxcNode {
  type: 'JSXElement'
  openingElement: OxcJSXOpeningElement
  closingElement: OxcJSXClosingElement | null
  children: OxcJSXChild[]
}

interface OxcJSXFragment extends OxcNode {
  type: 'JSXFragment'
  openingFragment: OxcNode
  closingFragment: OxcNode
  children: OxcJSXChild[]
}

type OxcJSXChild = OxcJSXElement | OxcJSXFragment | OxcJSXText | OxcJSXExpressionContainer

// ============================================================================
// Stable ID Generation
// ============================================================================

function generateStableId(path: number[], tagName: string): string {
  const pathStr = path.join('.')
  const safeName = tagName.toLowerCase().replace(/[^a-z0-9]/g, '')
  return `${safeName}_${pathStr}`
}

// ============================================================================
// OXC AST → EditableNode
// ============================================================================

function oxcJsxToEditableNode(
  node: OxcJSXChild,
  source: string,
  path: number[]
): EditableNode | null {
  // Handle JSX Text
  if (node.type === 'JSXText') {
    const text = (node as OxcJSXText).value.trim()
    if (!text) return null // Skip whitespace-only text

    return {
      id: generateStableId(path, 'text'),
      tagName: '#text',
      selfClosing: false,
      props: {},
      children: [],
      text,
      isText: true,
      loc: { start: node.start, end: node.end },
      openingTagLoc: { start: node.start, end: node.end },
    }
  }

  // Handle JSX Expression Container
  if (node.type === 'JSXExpressionContainer') {
    const expr = (node as OxcJSXExpressionContainer).expression
    // For simple string literals, treat as text
    // OXC uses unified "Literal" type
    if (expr.type === 'Literal') {
      const lit = expr as OxcLiteral
      // Only treat string literals as text
      if (typeof lit.value === 'string') {
        return {
          id: generateStableId(path, 'text'),
          tagName: '#text',
          selfClosing: false,
          props: {},
          children: [],
          text: lit.value,
          isText: true,
          loc: { start: node.start, end: node.end },
          openingTagLoc: { start: node.start, end: node.end },
        }
      }
    }
    // Skip other expressions for now
    return null
  }

  // Handle JSX Fragment
  if (node.type === 'JSXFragment') {
    const frag = node as OxcJSXFragment
    const children = extractChildren(frag.children, source, path)
    return {
      id: generateStableId(path, 'fragment'),
      tagName: '#fragment',
      selfClosing: false,
      props: {},
      children,
      loc: { start: node.start, end: node.end },
      openingTagLoc: { start: frag.openingFragment.start, end: frag.openingFragment.end },
      childrenLoc: children.length > 0
        ? { start: frag.openingFragment.end, end: frag.closingFragment.start }
        : undefined,
    }
  }

  // Handle JSX Element
  if (node.type === 'JSXElement') {
    const el = node as OxcJSXElement
    const opening = el.openingElement
    const tagName = getTagName(opening.name)
    const props = extractProps(opening.attributes, source)
    const children = extractChildren(el.children, source, path)

    return {
      id: generateStableId(path, tagName),
      tagName,
      selfClosing: opening.selfClosing,
      props,
      children,
      loc: { start: node.start, end: node.end },
      openingTagLoc: { start: opening.start, end: opening.end },
      childrenLoc:
        !opening.selfClosing && el.closingElement
          ? { start: opening.end, end: el.closingElement.start }
          : undefined,
    }
  }

  return null
}

function getTagName(name: OxcJSXElementName): string {
  if (name.type === 'JSXIdentifier') {
    return name.name
  }
  if (name.type === 'JSXMemberExpression') {
    return `${getTagName(name.object as OxcJSXElementName)}.${name.property.name}`
  }
  if (name.type === 'JSXNamespacedName') {
    return `${name.namespace.name}:${name.name.name}`
  }
  return 'unknown'
}

function extractProps(
  attributes: OxcJSXAttributeItem[],
  source: string
): Record<string, EditableProp> {
  const props: Record<string, EditableProp> = {}

  for (const attr of attributes) {
    if (attr.type === 'JSXSpreadAttribute') {
      const spread = attr as OxcJSXSpreadAttribute
      const rawValue = source.slice(attr.start, attr.end)
      props['...spread'] = {
        name: '...spread',
        value: rawValue,
        rawValue,
        isExpression: true,
        loc: { start: attr.start, end: attr.end },
        valueLoc: { start: spread.argument.start, end: spread.argument.end },
      }
      continue
    }

    const jsxAttr = attr as OxcJSXAttribute
    const name = jsxAttr.name.type === 'JSXIdentifier'
      ? jsxAttr.name.name
      : `${(jsxAttr.name as OxcJSXNamespacedName).namespace.name}:${(jsxAttr.name as OxcJSXNamespacedName).name.name}`

    // No value means boolean true: <Input disabled />
    if (!jsxAttr.value) {
      props[name] = {
        name,
        value: true,
        rawValue: 'true',
        isExpression: false,
        loc: { start: attr.start, end: attr.end },
        valueLoc: { start: attr.start, end: attr.end },
      }
      continue
    }

    // String literal: name="value"
    // OXC uses 'Literal' type for string attribute values (not JSXExpressionContainer)
    if (jsxAttr.value.type === 'Literal') {
      const lit = jsxAttr.value as OxcLiteral
      props[name] = {
        name,
        value: lit.value,
        rawValue: lit.raw,
        isExpression: false,
        loc: { start: attr.start, end: attr.end },
        valueLoc: { start: jsxAttr.value.start, end: jsxAttr.value.end },
      }
      continue
    }

    // Expression: name={...}
    if (jsxAttr.value.type === 'JSXExpressionContainer') {
      const container = jsxAttr.value as OxcJSXExpressionContainer
      const expr = container.expression
      const rawValue = source.slice(jsxAttr.value.start, jsxAttr.value.end)

      let value: string | number | boolean | null | object = rawValue

      // Try to extract literal values
      // OXC uses unified "Literal" type instead of separate NumericLiteral/StringLiteral/etc.
      if (expr.type === 'Literal') {
        // OxcLiteral has value: string | number | boolean | null
        value = (expr as OxcLiteral).value
      } else if (expr.type === 'ObjectExpression' || expr.type === 'ArrayExpression') {
        // Try to parse as JSON
        try {
          const innerSource = source.slice(expr.start, expr.end)
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
        loc: { start: attr.start, end: attr.end },
        valueLoc: { start: jsxAttr.value.start, end: jsxAttr.value.end },
      }
      continue
    }

    // JSX Element as prop value: name={<Element />}
    if (jsxAttr.value.type === 'JSXElement') {
      const rawValue = source.slice(jsxAttr.value.start, jsxAttr.value.end)
      props[name] = {
        name,
        value: rawValue,
        rawValue,
        isExpression: true,
        loc: { start: attr.start, end: attr.end },
        valueLoc: { start: jsxAttr.value.start, end: jsxAttr.value.end },
      }
    }
  }

  return props
}

function extractChildren(
  children: OxcJSXChild[],
  source: string,
  parentPath: number[]
): EditableNode[] {
  const result: EditableNode[] = []
  let childIndex = 0

  for (const child of children) {
    const node = oxcJsxToEditableNode(child, source, [...parentPath, childIndex])
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

function findJsxInExpression(node: any): OxcJSXElement | OxcJSXFragment | null {
  if (!node) return null

  // Direct JSX
  if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
    return node
  }

  // Parenthesized: (expr)
  if (node.type === 'ParenthesizedExpression') {
    return findJsxInExpression(node.expression)
  }

  // Arrow function body
  if (node.type === 'ArrowFunctionExpression') {
    if (node.body.type === 'BlockStatement') {
      // Block body: look for return statement
      for (const stmt of node.body.body) {
        if (stmt.type === 'ReturnStatement' && stmt.argument) {
          const jsx = findJsxInExpression(stmt.argument)
          if (jsx) return jsx
        }
      }
    } else {
      // Expression body
      return findJsxInExpression(node.body)
    }
  }

  // Function expression body
  if (node.type === 'FunctionExpression' || node.type === 'FunctionDeclaration') {
    for (const stmt of node.body.body) {
      if (stmt.type === 'ReturnStatement' && stmt.argument) {
        const jsx = findJsxInExpression(stmt.argument)
        if (jsx) return jsx
      }
    }
  }

  // TypeScript satisfies: expr satisfies Type
  if (node.type === 'TSSatisfiesExpression') {
    return findJsxInExpression(node.expression)
  }

  // TypeScript as: expr as Type
  if (node.type === 'TSAsExpression') {
    return findJsxInExpression(node.expression)
  }

  // Call expression: might be IIFE or wrapped
  if (node.type === 'CallExpression') {
    // Check callee (for IIFE)
    const calleeJsx = findJsxInExpression(node.callee)
    if (calleeJsx) return calleeJsx
    // Check arguments
    for (const arg of node.arguments) {
      const argJsx = findJsxInExpression(arg)
      if (argJsx) return argJsx
    }
  }

  return null
}

function findJsxReturn(program: any): { node: OxcJSXElement | OxcJSXFragment; loc: SourceLocation } | null {
  // Walk the AST to find export default with JSX return
  for (const statement of program.body) {
    if (statement.type === 'ExportDefaultDeclaration') {
      const jsx = findJsxInExpression(statement.declaration)
      if (jsx) {
        return {
          node: jsx,
          loc: { start: jsx.start, end: jsx.end },
        }
      }
    }
  }

  return null
}

/**
 * Parse TSX source and extract editable JSX nodes using OXC
 */
export function parseSourceWithLocations(source: string): ParseResult {
  const errors: string[] = []

  try {
    const result = parseSync('source.tsx', source, { sourceType: 'module' })

    // Check for parse errors
    if (result.errors && result.errors.length > 0) {
      for (const err of result.errors) {
        errors.push(err.message || String(err))
      }
    }

    const jsxResult = findJsxReturn(result.program)
    if (!jsxResult) {
      return {
        root: null,
        jsxLoc: null,
        source,
        errors: errors.length > 0 ? errors : ['No JSX return found in export default'],
      }
    }

    const root = oxcJsxToEditableNode(jsxResult.node, source, [0])

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
