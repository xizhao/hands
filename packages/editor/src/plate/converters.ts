/**
 * Bidirectional Converters: Plate Value ↔ TSX Source
 *
 * Converts Plate editor state to/from JSX/TSX source code.
 */

import type { TElement, Value } from 'platejs'
import { parseSource } from '../ast/parser'
import { generateBlockSource } from '../ast/generator'
import type { JsxNode, PropValue } from '../types'
import { isCustomComponent, isStdlibComponent } from './plugins/element-plugin'

// Legacy constants for backward compatibility (stdlib-component-plugin was removed)
const STDLIB_COMPONENT_KEY = 'stdlib-component'

// Legacy type for backward compatibility
interface StdlibComponentElement extends TElement {
  type: 'stdlib-component'
  componentName: string
  props: Record<string, unknown>
  id?: string
}

// ============================================================================
// Plate Value → TSX Source
// ============================================================================

/**
 * Convert a Plate prop value to a JsxNode PropValue
 */
function platePropToJsxProp(value: unknown): PropValue {
  if (value === null || value === undefined) {
    return { type: 'literal', value: null }
  }

  if (typeof value === 'string') {
    return { type: 'literal', value }
  }

  if (typeof value === 'number') {
    return { type: 'literal', value }
  }

  if (typeof value === 'boolean') {
    return { type: 'literal', value }
  }

  // Arrays and objects become expressions
  if (Array.isArray(value) || typeof value === 'object') {
    return { type: 'expression', value: JSON.stringify(value) }
  }

  return { type: 'expression', value: String(value) }
}

/**
 * Convert Plate element props to JsxNode props
 */
function platePropsToJsxProps(props: Record<string, unknown>): Record<string, PropValue> {
  const result: Record<string, PropValue> = {}

  for (const [key, value] of Object.entries(props)) {
    // Skip internal Plate properties
    if (key === 'type' || key === 'children' || key === 'id') continue
    result[key] = platePropToJsxProp(value)
  }

  return result
}

/**
 * Convert a Plate text node to JsxNode
 */
function plateTextToJsxNode(text: { text: string }): JsxNode | null {
  if (!text.text) return null

  return {
    id: `text_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    type: 'text',
    text: text.text,
  }
}

/**
 * Convert a Plate element to JsxNode
 */
function plateElementToJsxNode(element: TElement): JsxNode | null {
  // Handle stdlib components
  if (element.type === STDLIB_COMPONENT_KEY) {
    const stdlibEl = element as StdlibComponentElement
    return {
      id: stdlibEl.id || `comp_${Date.now().toString(36)}`,
      type: 'element',
      tagName: stdlibEl.componentName,
      props: platePropsToJsxProps(stdlibEl.props),
      children: [],
    }
  }

  // Convert children
  const children: JsxNode[] = []
  for (const child of element.children || []) {
    if ('text' in child) {
      const textNode = plateTextToJsxNode(child as { text: string })
      if (textNode) children.push(textNode)
    } else if ('type' in child) {
      const childNode = plateElementToJsxNode(child as TElement)
      if (childNode) children.push(childNode)
    }
  }

  // Map Plate types to HTML tags
  let tagName = 'div'
  switch (element.type) {
    case 'p':
    case 'paragraph':
      tagName = 'p'
      break
    case 'h1':
      tagName = 'h1'
      break
    case 'h2':
      tagName = 'h2'
      break
    case 'h3':
      tagName = 'h3'
      break
    case 'blockquote':
      tagName = 'blockquote'
      break
    case 'hr':
      tagName = 'hr'
      break
    default:
      // Check if it's a stdlib component by name
      if (typeof element.type === 'string' && isStdlibComponent(element.type)) {
        tagName = element.type
      }
  }

  return {
    id: (element as any).id || `el_${Date.now().toString(36)}`,
    type: 'element',
    tagName,
    props: platePropsToJsxProps(element as Record<string, unknown>),
    children,
  }
}

/**
 * Convert Plate Value to JsxNode tree
 */
export function plateValueToJsxTree(value: Value): JsxNode {
  const children: JsxNode[] = []

  for (const element of value) {
    const node = plateElementToJsxNode(element)
    if (node) children.push(node)
  }

  // Single child - return directly
  if (children.length === 1) {
    return children[0]
  }

  // Multiple children - wrap in fragment
  return {
    id: `root_${Date.now().toString(36)}`,
    type: 'fragment',
    children,
  }
}

/**
 * Convert Plate Value to TSX source code
 */
export function plateValueToSource(value: Value): string {
  const jsxTree = plateValueToJsxTree(value)
  return generateBlockSource(jsxTree)
}

// ============================================================================
// TSX Source → Plate Value
// ============================================================================

/**
 * Convert a PropValue to a plain JavaScript value
 */
function jsxPropToPlateProp(propValue: PropValue): unknown {
  if (propValue.type === 'literal') {
    return propValue.value
  }

  if (propValue.type === 'expression') {
    // Try to parse expression as JSON for arrays/objects
    if (typeof propValue.value === 'string') {
      try {
        return JSON.parse(propValue.value)
      } catch {
        return propValue.value
      }
    }
    return propValue.value
  }

  if (propValue.type === 'jsx') {
    return propValue.value
  }

  return propValue.value
}

/**
 * Convert JsxNode props to Plate element props
 */
function jsxPropsToPlateProps(props?: Record<string, PropValue>): Record<string, unknown> {
  if (!props) return {}

  const result: Record<string, unknown> = {}
  for (const [key, propValue] of Object.entries(props)) {
    result[key] = jsxPropToPlateProp(propValue)
  }
  return result
}

/**
 * Convert a text JsxNode to Plate text
 */
function jsxTextToPlateText(node: JsxNode): { text: string } {
  return { text: node.text || '' }
}

/**
 * Convert JsxNode children to Plate children
 */
function jsxChildrenToPlateChildren(children?: JsxNode[]): (TElement | { text: string })[] {
  if (!children || children.length === 0) {
    return [{ text: '' }]
  }

  const result: (TElement | { text: string })[] = []

  for (const child of children) {
    const converted = jsxNodeToPlateNode(child)
    if (converted) {
      if (Array.isArray(converted)) {
        result.push(...converted)
      } else {
        result.push(converted)
      }
    }
  }

  if (result.length === 0) {
    return [{ text: '' }]
  }

  return result
}

/**
 * Convert a JsxNode to Plate element(s)
 */
function jsxNodeToPlateNode(node: JsxNode): TElement | { text: string } | TElement[] | null {
  switch (node.type) {
    case 'text':
      return jsxTextToPlateText(node)

    case 'expression':
      // Expressions become code blocks
      return {
        type: 'code_block',
        children: [{ text: node.expression || '' }],
      }

    case 'element': {
      const tagName = node.tagName?.toLowerCase()

      // Check if this is a stdlib component
      if (node.tagName && isStdlibComponent(node.tagName)) {
        const element: StdlibComponentElement = {
          type: STDLIB_COMPONENT_KEY,
          componentName: node.tagName,
          props: jsxPropsToPlateProps(node.props) as Record<string, unknown>,
          children: [{ text: '' }],
          id: node.id,
        }
        return element
      }

      // Map HTML tags to Plate types
      if (tagName === 'h1') {
        return {
          type: 'h1',
          id: node.id,
          children: jsxChildrenToPlateChildren(node.children),
        }
      }
      if (tagName === 'h2') {
        return {
          type: 'h2',
          id: node.id,
          children: jsxChildrenToPlateChildren(node.children),
        }
      }
      if (tagName === 'h3') {
        return {
          type: 'h3',
          id: node.id,
          children: jsxChildrenToPlateChildren(node.children),
        }
      }
      if (tagName === 'p' || tagName === 'div' || tagName === 'span') {
        return {
          type: 'p',
          id: node.id,
          children: jsxChildrenToPlateChildren(node.children),
        }
      }
      if (tagName === 'blockquote') {
        return {
          type: 'blockquote',
          id: node.id,
          children: jsxChildrenToPlateChildren(node.children),
        }
      }
      if (tagName === 'hr') {
        return {
          type: 'hr',
          id: node.id,
          children: [{ text: '' }],
        }
      }

      // Default: treat as paragraph
      return {
        type: 'p',
        id: node.id,
        ...jsxPropsToPlateProps(node.props),
        children: jsxChildrenToPlateChildren(node.children),
      }
    }

    case 'fragment': {
      // Fragments become multiple elements
      if (node.children && node.children.length > 0) {
        const elements: TElement[] = []
        for (const child of node.children) {
          const converted = jsxNodeToPlateNode(child)
          if (converted) {
            if (Array.isArray(converted)) {
              elements.push(...converted)
            } else if ('type' in converted) {
              elements.push(converted)
            } else {
              // Wrap text in paragraph
              elements.push({
                type: 'p',
                children: [converted],
              })
            }
          }
        }
        return elements
      }
      return null
    }

    default:
      return null
  }
}

/**
 * Convert JsxNode tree to Plate Value
 */
export function jsxTreeToPlateValue(root: JsxNode): Value {
  const converted = jsxNodeToPlateNode(root)

  if (!converted) {
    return [{ type: 'p', children: [{ text: '' }] }]
  }

  if (Array.isArray(converted)) {
    return converted
  }

  if ('type' in converted) {
    return [converted]
  }

  // Wrap text in paragraph
  return [{ type: 'p', children: [converted] }]
}

/**
 * Convert TSX source code to Plate Value
 *
 * Returns a Plate Value array. If parsing fails, returns an empty paragraph
 * as a fallback. Callers should check for this fallback to avoid losing
 * editor content during intermediate typing states.
 */
export function sourceToPlateValue(source: string): Value {
  try {
    // parseSource returns JsxNode directly, not { ast: JsxNode }
    const ast = parseSource(source)

    // Check if parsing returned something meaningful
    if (!ast) {
      console.warn('[converter] parseSource returned null')
      return [{ type: 'p', children: [{ text: '' }] }]
    }

    // Check for empty fragment (failed extraction)
    if (ast.type === 'fragment' && (!ast.children || ast.children.length === 0)) {
      console.warn('[converter] parseSource returned empty fragment - source may be invalid')
      return [{ type: 'p', children: [{ text: '' }] }]
    }

    // Check for text node (parse fallback when JSX is invalid)
    if (ast.type === 'text' && ast.text) {
      console.warn('[converter] parseSource returned text node - source is likely not valid JSX')
      return [{ type: 'p', children: [{ text: '' }] }]
    }

    const value = jsxTreeToPlateValue(ast)

    // Log successful conversion for debugging
    console.debug('[converter] sourceToPlateValue success:', {
      sourceLen: source.length,
      astType: ast.type,
      valueLen: value.length,
    })

    return value
  } catch (err) {
    console.error('[converter] Failed to parse source:', err)
    return [{ type: 'p', children: [{ text: '' }] }]
  }
}
