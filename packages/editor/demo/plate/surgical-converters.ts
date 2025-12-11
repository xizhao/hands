/**
 * Surgical Converters
 *
 * New bidirectional converters that:
 * - Source → Plate: Uses babel parser with stable IDs
 * - Plate → Source: Uses surgical mutations (character-level edits)
 */

import type { TElement, Value } from 'platejs'
import {
  parseSourceWithLocations,
  type EditableNode,
  type ParseResult,
} from '../../src/ast/babel-parser'
import {
  applySurgicalMutations,
  type SurgicalMutation,
} from '../../src/ast/surgical-mutations'
import { generateMutationsFromPlateChange } from '../../src/ast/plate-diff'
// Stdlib plugin no longer needed - all components use generic JSX elements

// ============================================================================
// Source → Plate Conversion
// ============================================================================

/**
 * Check if a tag is a "void" element (no editable children)
 * These are either self-closing HTML tags or complex components
 */
function isVoidElement(tagName: string): boolean {
  const voidTags = new Set([
    'img', 'br', 'hr', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed',
    'source', 'track', 'wbr',
  ])
  // PascalCase = React component, treat as potentially void
  const isPascalCase = /^[A-Z]/.test(tagName)
  return voidTags.has(tagName.toLowerCase()) || isPascalCase
}

/**
 * Check if an element has only text children (inline content)
 */
function hasOnlyTextChildren(node: EditableNode): boolean {
  return node.children.every(child => child.isText)
}

/**
 * Convert an EditableNode to a Plate element
 *
 * Every JSX element becomes a Plate block with:
 * - type: the original tagName (preserved for round-trip)
 * - id: stable ID for surgical updates
 * - props: all JSX props
 * - children: nested elements or text
 */
function editableNodeToPlateElement(node: EditableNode): TElement {
  // Handle text nodes - wrap in paragraph
  if (node.isText) {
    return {
      type: 'p',
      id: node.id,
      children: [{ text: node.text || '' }],
    }
  }

  // Handle fragments
  if (node.tagName === '#fragment') {
    return {
      type: 'fragment',
      id: node.id,
      children: node.children.length > 0
        ? node.children.map(editableNodeToPlateElement)
        : [{ text: '' }],
    } as unknown as TElement
  }

  // Convert props to plain values
  const plateProps: Record<string, unknown> = {}
  for (const [key, prop] of Object.entries(node.props)) {
    if (key !== '...spread') {
      plateProps[key] = prop.value
    }
  }

  // Use the actual tagName as the type
  // This preserves the original element for round-trip editing
  const type = node.tagName

  // Check if this is a void/component element
  const isVoid = isVoidElement(node.tagName)

  // Convert children
  const children: (TElement | { text: string })[] = []

  if (isVoid) {
    // Void elements get empty text child (Plate requirement)
    children.push({ text: '' })
  } else {
    for (const child of node.children) {
      if (child.isText) {
        children.push({ text: child.text || '' })
      } else {
        children.push(editableNodeToPlateElement(child))
      }
    }

    // Ensure at least one child
    if (children.length === 0) {
      children.push({ text: '' })
    }
  }

  return {
    type,
    id: node.id,
    ...plateProps,
    children,
    // Mark void elements so Plate knows they're not editable
    ...(isVoid ? { isVoid: true } : {}),
  }
}

/**
 * Convert source code to Plate value using babel parser
 *
 * This preserves stable IDs for surgical updates
 */
export function sourceToPlateValueSurgical(source: string): {
  value: Value
  parseResult: ParseResult
} {
  const parseResult = parseSourceWithLocations(source)

  if (!parseResult.root) {
    return {
      value: [{ type: 'p', children: [{ text: '' }] }],
      parseResult,
    }
  }

  const rootElement = editableNodeToPlateElement(parseResult.root)

  // Handle fragments - extract children
  if ((rootElement as any).type === 'fragment') {
    const children = rootElement.children as TElement[]
    // Filter to only elements (not text nodes at root level)
    const elements = children.filter(child => 'type' in child) as TElement[]
    return {
      value: elements.length > 0 ? elements : [{ type: 'p', children: [{ text: '' }] }],
      parseResult,
    }
  }

  // If root is a div/span wrapper with block children, flatten to top-level
  // This matches Plate's flat document model
  const rootTag = parseResult.root.tagName.toLowerCase()
  if ((rootTag === 'div' || rootTag === 'span') && rootElement.children) {
    // Check if children are block elements (not just text)
    const blockChildren = rootElement.children.filter(
      (child: any) => 'type' in child && child.type !== 'text'
    ) as TElement[]

    if (blockChildren.length > 0) {
      return {
        value: blockChildren,
        parseResult,
      }
    }
  }

  return {
    value: [rootElement],
    parseResult,
  }
}

// ============================================================================
// Plate → Source Conversion (Surgical)
// ============================================================================

/**
 * Apply Plate changes to source surgically
 *
 * Instead of full serialization, this:
 * 1. Diffs old and new Plate values
 * 2. Generates surgical mutations
 * 3. Applies mutations directly to source text
 *
 * Returns null if mutations couldn't be applied
 */
export function applyPlateChangesToSource(
  source: string,
  oldValue: Value,
  newValue: Value
): string | null {
  // Generate mutations from the diff
  const mutations = generateMutationsFromPlateChange(oldValue, newValue)

  if (mutations.length === 0) {
    // No changes
    return source
  }

  console.log('[surgical-converters] Generated mutations:', mutations)

  // Apply mutations to source
  const result = applySurgicalMutations(source, mutations)

  if (result === null) {
    console.error('[surgical-converters] Failed to apply mutations')
    return null
  }

  return result
}

// ============================================================================
// Utility: Sync IDs between Plate and EditableNode
// ============================================================================

/**
 * Ensure Plate elements have stable IDs matching the source AST
 *
 * Call this after parsing source to sync IDs
 */
export function syncIdsFromSource(value: Value, parseResult: ParseResult): Value {
  if (!parseResult.root) return value

  // Build a map of IDs by structure
  const idMap = buildIdMap(parseResult.root)

  // Apply IDs to Plate value
  return applyIdsToValue(value, idMap, [0])
}

function buildIdMap(node: EditableNode, path: number[] = [0]): Map<string, string> {
  const map = new Map<string, string>()

  // Key by path for matching
  const pathKey = path.join('.')
  map.set(pathKey, node.id)

  // Recurse into children
  node.children.forEach((child, index) => {
    const childMap = buildIdMap(child, [...path, index])
    childMap.forEach((id, key) => map.set(key, id))
  })

  return map
}

function applyIdsToValue(value: Value, idMap: Map<string, string>, basePath: number[]): Value {
  return value.map((element, index) => {
    const path = [...basePath, index]
    const pathKey = path.slice(1).join('.') // Skip the leading [0] from basePath
    const id = idMap.get(pathKey) || idMap.get(index.toString())

    const newElement = { ...element }
    if (id) {
      (newElement as any).id = id
    }

    // Recurse into children
    if (Array.isArray(newElement.children)) {
      const elementChildren = newElement.children.filter(
        (child: any) => 'type' in child
      ) as TElement[]

      if (elementChildren.length > 0) {
        newElement.children = newElement.children.map((child: any, childIndex: number) => {
          if ('type' in child) {
            const childPath = [...path, childIndex]
            const childPathKey = childPath.slice(1).join('.')
            const childId = idMap.get(childPathKey)
            if (childId) {
              return { ...child, id: childId }
            }
          }
          return child
        })
      }
    }

    return newElement
  })
}

// ============================================================================
// Simple Mode (Full Serialize - Fallback)
// ============================================================================

// Re-export original converters as fallback
export { sourceToPlateValue, plateValueToSource } from './converters'
