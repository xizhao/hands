/**
 * Scene Capture - Walk React element tree and build scene graph
 */
import * as React from 'react'
import type { JsxNode, RenderedNode, RenderedScene, NodePath, IteratorContext } from '../types'
import { generateId } from '../types'

/**
 * Capture the rendered scene from a React element and its corresponding AST
 */
export function captureScene(
  element: React.ReactElement,
  ast: JsxNode,
  mockData: Record<string, unknown> = {}
): RenderedScene {
  const root = walkElement(element, ast, [])

  return {
    root,
    mockData,
  }
}

/**
 * Walk a React element and build a RenderedNode
 */
function walkElement(
  element: React.ReactElement | string | number | null | undefined,
  astNode: JsxNode | null,
  path: NodePath
): RenderedNode {
  // Handle primitive children (text)
  if (typeof element === 'string' || typeof element === 'number') {
    return {
      id: generateId(),
      type: 'text',
      tagName: '#text',
      props: {},
      children: [],
      text: String(element),
      sourcePath: path,
    }
  }

  // Handle null/undefined
  if (!element || !React.isValidElement(element)) {
    return {
      id: generateId(),
      type: 'text',
      tagName: '#empty',
      props: {},
      children: [],
      sourcePath: path,
    }
  }

  // Get tag name
  const tagName = getTagName(element)

  // Get props (excluding children)
  const elementProps = (element.props || {}) as { children?: React.ReactNode; [key: string]: unknown }
  const { children: _children, ...props } = elementProps

  // Try to detect iterator context from key prop
  const iteratorContext = detectIteratorContext(element, astNode)

  // Walk children
  const childElements = React.Children.toArray(elementProps.children)
  const astChildren = astNode?.children || []

  const renderedChildren = childElements.map((child, index) => {
    // Try to match child to AST node
    const matchedAst = matchChildToAst(child, astChildren, index)
    const childPath: NodePath = astNode ? [...path, 'children', index] : path

    if (React.isValidElement(child)) {
      return walkElement(child, matchedAst, childPath)
    }

    // Text node
    return {
      id: generateId(),
      type: 'text' as const,
      tagName: '#text',
      props: {},
      children: [],
      text: String(child),
      sourcePath: childPath,
    }
  })

  return {
    id: generateId(),
    type: 'element',
    tagName,
    props,
    children: renderedChildren,
    sourcePath: path,
    iteratorContext,
  }
}

/**
 * Get the tag name from a React element
 */
function getTagName(element: React.ReactElement): string {
  const type = element.type

  if (typeof type === 'string') {
    return type
  }

  if (typeof type === 'function') {
    // Component - use displayName or function name
    return (type as any).displayName || type.name || 'Component'
  }

  if (typeof type === 'object' && type !== null) {
    // Could be a forwardRef, memo, etc.
    if ('displayName' in type) {
      return (type as any).displayName
    }
    if ('render' in type && typeof (type as any).render === 'function') {
      // ForwardRef
      return (type as any).render.displayName || (type as any).render.name || 'ForwardRef'
    }
  }

  // Fragment
  if (type === React.Fragment) {
    return 'Fragment'
  }

  return 'Unknown'
}

/**
 * Try to detect if this element came from a .map() expression
 */
function detectIteratorContext(
  element: React.ReactElement,
  astNode: JsxNode | null
): IteratorContext | undefined {
  // If the element has a key that looks like an index or ID, it might be from .map()
  const key = element.key

  if (!key || !astNode) return undefined

  // Check if the AST node's parent is an expression containing .map()
  // This is a heuristic - in production we'd need more sophisticated tracking

  // For now, just detect based on key pattern
  if (typeof key === 'string' || typeof key === 'number') {
    // Check if there's an expression node in the AST that looks like .map()
    const mapExpression = findMapExpression(astNode)
    if (mapExpression) {
      return {
        arrayExpression: mapExpression.array,
        itemVar: mapExpression.itemVar,
        index: typeof key === 'number' ? key : parseInt(String(key), 10) || 0,
      }
    }
  }

  return undefined
}

/**
 * Find a .map() expression in an AST node
 */
function findMapExpression(node: JsxNode): { array: string; itemVar: string } | null {
  if (node.type === 'expression' && node.expression) {
    const expr = node.expression
    // Match patterns like: items.map(item => ...) or items.map((item, index) => ...)
    const mapMatch = expr.match(/(\w+)\.map\s*\(\s*\(?(\w+)/)
    if (mapMatch) {
      return {
        array: mapMatch[1],
        itemVar: mapMatch[2],
      }
    }
  }

  // Check children
  if (node.children) {
    for (const child of node.children) {
      const result = findMapExpression(child)
      if (result) return result
    }
  }

  return null
}

/**
 * Try to match a rendered child to an AST node
 */
function matchChildToAst(
  child: React.ReactNode,
  astChildren: JsxNode[],
  index: number
): JsxNode | null {
  if (!React.isValidElement(child)) {
    // Try to find a matching text node
    return astChildren.find((n) => n.type === 'text') || null
  }

  const tagName = getTagName(child)

  // First try exact index match
  if (astChildren[index]) {
    const astChild = astChildren[index]
    if (astChild.type === 'element' && astChild.tagName === tagName) {
      return astChild
    }
  }

  // Then try to find by tag name
  const matchByTag = astChildren.find(
    (n) => n.type === 'element' && n.tagName === tagName
  )
  if (matchByTag) return matchByTag

  // Fall back to index
  return astChildren[index] || null
}

/**
 * Find a rendered node by its source path
 */
export function findNodeByPath(
  scene: RenderedScene,
  path: NodePath
): RenderedNode | null {
  return findInTree(scene.root, path)
}

function findInTree(node: RenderedNode, targetPath: NodePath): RenderedNode | null {
  // Check if this node matches
  if (pathEquals(node.sourcePath, targetPath)) {
    return node
  }

  // Search children
  for (const child of node.children) {
    const found = findInTree(child, targetPath)
    if (found) return found
  }

  return null
}

function pathEquals(a: NodePath, b: NodePath): boolean {
  if (a.length !== b.length) return false
  return a.every((segment, i) => segment === b[i])
}

/**
 * Find a rendered node by coordinates (hit testing)
 * Note: This requires bounds to be set on nodes after DOM render
 */
export function findNodeAtPoint(
  scene: RenderedScene,
  x: number,
  y: number
): RenderedNode | null {
  return hitTest(scene.root, x, y)
}

function hitTest(node: RenderedNode, x: number, y: number): RenderedNode | null {
  // Check children first (they're on top)
  for (const child of [...node.children].reverse()) {
    const hit = hitTest(child, x, y)
    if (hit) return hit
  }

  // Check this node
  if (node.bounds) {
    const { left, top, right, bottom } = node.bounds
    if (x >= left && x <= right && y >= top && y <= bottom) {
      return node
    }
  }

  return null
}
