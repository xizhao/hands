/**
 * Slate Operations → Source Mutations
 *
 * Converts Slate's low-level operations directly to source text edits.
 * This is more precise than diffing values because we get exact operation types.
 *
 * Slate Operation Types:
 * - insert_node: Insert a node at a path
 * - remove_node: Remove a node at a path
 * - move_node: Move a node from one path to another
 * - set_node: Update properties of a node
 * - insert_text: Insert text at an offset
 * - remove_text: Remove text at an offset
 * - merge_node: Merge node with previous sibling
 * - split_node: Split node at a position
 * - set_selection: Update selection (ignored)
 */

import type { Operation, Node, Path } from 'slate'
import type { EditableNode, SourceLocation, ParseResult } from './babel-parser'
import { getNodeById, parseSourceWithLocations } from './babel-parser'

// ============================================================================
// Path Utilities
// ============================================================================

/**
 * Convert a Slate path to our stable ID
 * Path like [0, 1, 2] becomes "tagname_0.1.2"
 */
function slatePathToStableId(path: Path, parseResult: ParseResult): string | null {
  if (!parseResult.root) return null

  // Navigate to the node at this path
  let current: EditableNode | undefined = parseResult.root
  const pathParts = [...path]

  // First element is root (index 0), skip it
  if (pathParts[0] === 0) {
    pathParts.shift()
  }

  for (const index of pathParts) {
    if (!current || !current.children || index >= current.children.length) {
      return null
    }
    current = current.children[index]
  }

  return current?.id ?? null
}

/**
 * Get the EditableNode at a Slate path
 */
function getNodeAtPath(path: Path, parseResult: ParseResult): EditableNode | null {
  const id = slatePathToStableId(path, parseResult)
  if (!id) return null
  return getNodeById(parseResult.root, id)
}

// ============================================================================
// Operation to Source Edit
// ============================================================================

export interface SourceEdit {
  start: number
  end: number
  replacement: string
}

/**
 * Apply a source edit
 */
function applySourceEdit(source: string, edit: SourceEdit): string {
  return source.slice(0, edit.start) + edit.replacement + source.slice(edit.end)
}

/**
 * Apply multiple source edits (in reverse order to preserve positions)
 */
function applySourceEdits(source: string, edits: SourceEdit[]): string {
  // Sort by start position descending so we don't invalidate positions
  const sorted = [...edits].sort((a, b) => b.start - a.start)
  let result = source
  for (const edit of sorted) {
    result = applySourceEdit(result, edit)
  }
  return result
}

// ============================================================================
// Individual Operation Handlers
// ============================================================================

/**
 * Convert a Slate node to JSX string for insertion
 */
function nodeToJsx(node: Node, indent: string = ''): string {
  if ('text' in node) {
    return node.text
  }

  const element = node as { type: string; children: Node[]; [key: string]: unknown }
  const tagName = typeToTagName(element.type)

  // Build props string
  const props: string[] = []
  for (const [key, value] of Object.entries(element)) {
    if (key === 'type' || key === 'children' || key === 'id') continue
    props.push(formatProp(key, value))
  }
  const propsStr = props.length > 0 ? ' ' + props.join(' ') : ''

  // Build children
  const children = element.children || []
  if (children.length === 0) {
    return `${indent}<${tagName}${propsStr} />`
  }

  // Check if all children are text
  const allText = children.every((c: Node) => 'text' in c)
  if (allText) {
    const text = children.map((c: Node) => ('text' in c ? c.text : '')).join('')
    return `${indent}<${tagName}${propsStr}>${text}</${tagName}>`
  }

  // Multi-line children
  const childJsx = children.map((c: Node) => nodeToJsx(c, indent + '  ')).join('\n')
  return `${indent}<${tagName}${propsStr}>\n${childJsx}\n${indent}</${tagName}>`
}

function typeToTagName(type: string): string {
  const map: Record<string, string> = {
    p: 'p',
    paragraph: 'p',
    h1: 'h1',
    h2: 'h2',
    h3: 'h3',
    blockquote: 'blockquote',
    hr: 'hr',
  }
  return map[type] || type
}

function formatProp(name: string, value: unknown): string {
  if (value === true) return name
  if (value === false) return `${name}={false}`
  if (value === null) return `${name}={null}`
  if (typeof value === 'number') return `${name}={${value}}`
  if (typeof value === 'string') return `${name}="${value.replace(/"/g, '\\"')}"`
  return `${name}={${JSON.stringify(value)}}`
}

/**
 * Handle insert_node operation
 */
function handleInsertNode(
  op: Extract<Operation, { type: 'insert_node' }>,
  source: string,
  parseResult: ParseResult
): SourceEdit | null {
  const parentPath = op.path.slice(0, -1)
  const insertIndex = op.path[op.path.length - 1]

  const parent = getNodeAtPath(parentPath, parseResult)
  if (!parent || !parent.childrenLoc) {
    console.warn('[slate-ops] Cannot find parent for insert_node:', parentPath)
    return null
  }

  // Find insertion position
  let insertPos: number
  if (insertIndex === 0 || parent.children.length === 0) {
    insertPos = parent.childrenLoc.start
  } else if (insertIndex >= parent.children.length) {
    insertPos = parent.childrenLoc.end
  } else {
    insertPos = parent.children[insertIndex].loc.start
  }

  const jsx = nodeToJsx(op.node, '    ')
  return {
    start: insertPos,
    end: insertPos,
    replacement: '\n' + jsx,
  }
}

/**
 * Handle remove_node operation
 */
function handleRemoveNode(
  op: Extract<Operation, { type: 'remove_node' }>,
  source: string,
  parseResult: ParseResult
): SourceEdit | null {
  const node = getNodeAtPath(op.path, parseResult)
  if (!node) {
    console.warn('[slate-ops] Cannot find node for remove_node:', op.path)
    return null
  }

  // Include leading whitespace/newline
  let start = node.loc.start
  while (start > 0 && source[start - 1] !== '\n' && /\s/.test(source[start - 1])) {
    start--
  }

  // Include trailing newline
  let end = node.loc.end
  if (source[end] === '\n') end++

  return { start, end, replacement: '' }
}

/**
 * Handle move_node operation
 */
function handleMoveNode(
  op: Extract<Operation, { type: 'move_node' }>,
  source: string,
  parseResult: ParseResult
): SourceEdit[] | null {
  const node = getNodeAtPath(op.path, parseResult)
  if (!node) {
    console.warn('[slate-ops] Cannot find node for move_node:', op.path)
    return null
  }

  const newParentPath = op.newPath.slice(0, -1)
  const newIndex = op.newPath[op.newPath.length - 1]

  const newParent = getNodeAtPath(newParentPath, parseResult)
  if (!newParent || !newParent.childrenLoc) {
    console.warn('[slate-ops] Cannot find new parent for move_node:', newParentPath)
    return null
  }

  // Get the JSX of the node being moved
  const nodeJsx = source.slice(node.loc.start, node.loc.end)

  // Find insertion position in new parent
  let insertPos: number
  if (newIndex === 0 || newParent.children.length === 0) {
    insertPos = newParent.childrenLoc.start
  } else if (newIndex >= newParent.children.length) {
    insertPos = newParent.childrenLoc.end
  } else {
    insertPos = newParent.children[newIndex].loc.start
  }

  // Delete from old position
  let deleteStart = node.loc.start
  while (deleteStart > 0 && source[deleteStart - 1] !== '\n' && /\s/.test(source[deleteStart - 1])) {
    deleteStart--
  }
  let deleteEnd = node.loc.end
  if (source[deleteEnd] === '\n') deleteEnd++

  // Adjust insertPos if it comes after deleteStart
  if (insertPos > deleteStart) {
    insertPos -= (deleteEnd - deleteStart)
  }

  return [
    { start: deleteStart, end: deleteEnd, replacement: '' },
    { start: insertPos, end: insertPos, replacement: '\n' + nodeJsx },
  ]
}

/**
 * Handle set_node operation (prop changes)
 */
function handleSetNode(
  op: Extract<Operation, { type: 'set_node' }>,
  source: string,
  parseResult: ParseResult
): SourceEdit | null {
  const node = getNodeAtPath(op.path, parseResult)
  if (!node) {
    console.warn('[slate-ops] Cannot find node for set_node:', op.path)
    return null
  }

  // Find what changed
  const changes = op.newProperties

  // For now, handle simple prop changes
  // This is a simplified version - full implementation would rebuild the opening tag
  for (const [key, value] of Object.entries(changes)) {
    if (key === 'type' || key === 'children' || key === 'id') continue

    const existingProp = node.props[key]
    if (existingProp) {
      // Update existing prop value
      const newValue = formatPropValue(value)
      return {
        start: existingProp.valueLoc.start,
        end: existingProp.valueLoc.end,
        replacement: newValue,
      }
    } else {
      // Insert new prop
      const insertPos = node.openingTagLoc.end - 1
      const skipBack = source[insertPos - 1] === '/' ? 2 : 1
      return {
        start: insertPos - skipBack + 1,
        end: insertPos - skipBack + 1,
        replacement: ` ${formatProp(key, value)}`,
      }
    }
  }

  return null
}

function formatPropValue(value: unknown): string {
  if (value === true) return ''
  if (value === false) return '{false}'
  if (value === null) return '{null}'
  if (typeof value === 'number') return `{${value}}`
  if (typeof value === 'string') return `"${value.replace(/"/g, '\\"')}"`
  return `{${JSON.stringify(value)}}`
}

/**
 * Handle insert_text operation
 */
function handleInsertText(
  op: Extract<Operation, { type: 'insert_text' }>,
  source: string,
  parseResult: ParseResult
): SourceEdit | null {
  const node = getNodeAtPath(op.path, parseResult)
  if (!node) {
    console.warn('[slate-ops] Cannot find node for insert_text:', op.path)
    return null
  }

  // For text nodes, insert at offset
  const insertPos = node.loc.start + op.offset
  return {
    start: insertPos,
    end: insertPos,
    replacement: op.text,
  }
}

/**
 * Handle remove_text operation
 */
function handleRemoveText(
  op: Extract<Operation, { type: 'remove_text' }>,
  source: string,
  parseResult: ParseResult
): SourceEdit | null {
  const node = getNodeAtPath(op.path, parseResult)
  if (!node) {
    console.warn('[slate-ops] Cannot find node for remove_text:', op.path)
    return null
  }

  const start = node.loc.start + op.offset
  const end = start + op.text.length
  return { start, end, replacement: '' }
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Convert a Slate operation to source edits
 */
export function operationToSourceEdits(
  op: Operation,
  source: string,
  parseResult: ParseResult
): SourceEdit[] | null {
  switch (op.type) {
    case 'insert_node': {
      const edit = handleInsertNode(op, source, parseResult)
      return edit ? [edit] : null
    }

    case 'remove_node': {
      const edit = handleRemoveNode(op, source, parseResult)
      return edit ? [edit] : null
    }

    case 'move_node': {
      return handleMoveNode(op, source, parseResult)
    }

    case 'set_node': {
      const edit = handleSetNode(op, source, parseResult)
      return edit ? [edit] : null
    }

    case 'insert_text': {
      const edit = handleInsertText(op, source, parseResult)
      return edit ? [edit] : null
    }

    case 'remove_text': {
      const edit = handleRemoveText(op, source, parseResult)
      return edit ? [edit] : null
    }

    case 'merge_node':
    case 'split_node':
      // These are complex - for now, skip and let the diff-based fallback handle them
      console.log('[slate-ops] Skipping complex operation:', op.type)
      return null

    case 'set_selection':
      // Selection changes don't affect source
      return []

    default:
      console.warn('[slate-ops] Unknown operation type:', (op as any).type)
      return null
  }
}

/**
 * Apply Slate operations to source code
 *
 * Returns the modified source, or null if any operation failed
 */
export function applySlateOperations(
  source: string,
  operations: Operation[]
): string | null {
  const parseResult = parseSourceWithLocations(source)

  if (!parseResult.root) {
    console.error('[slate-ops] Failed to parse source')
    return null
  }

  let result = source
  let currentParseResult = parseResult

  for (const op of operations) {
    const edits = operationToSourceEdits(op, result, currentParseResult)

    if (edits === null) {
      // Operation failed - return null to signal fallback needed
      return null
    }

    if (edits.length === 0) {
      // No-op (like selection changes)
      continue
    }

    result = applySourceEdits(result, edits)

    // Re-parse for next operation
    currentParseResult = parseSourceWithLocations(result)
    if (!currentParseResult.root) {
      console.error('[slate-ops] Source became invalid after operation:', op.type)
      return null
    }
  }

  return result
}
