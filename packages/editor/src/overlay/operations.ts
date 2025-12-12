/**
 * RSC Editor Operations
 *
 * High-level edit operations that map to surgical source mutations.
 * Designed for extensibility - add new operations here as we port Plate features.
 */

import { parseSourceWithLocations, getNodeById, getPathById } from '../ast/oxc-parser'
import type { EditableNode, ParseResult } from '../ast/oxc-parser'
import { applySurgicalMutation, applySurgicalMutations, type SurgicalMutation } from '../ast/surgical-mutations'

// ============================================================================
// Operation Types
// ============================================================================

export type EditOperation =
  | { type: 'move'; nodeId: string; targetId: string; position: 'before' | 'after' | 'inside' }
  | { type: 'delete'; nodeId: string }
  | { type: 'delete-many'; nodeIds: string[] }
  | { type: 'set-text'; nodeId: string; text: string }
  | { type: 'set-prop'; nodeId: string; propName: string; value: string | number | boolean | null }
  | { type: 'delete-prop'; nodeId: string; propName: string }
  | { type: 'insert'; parentId: string; index: number; jsx: string }
  | { type: 'insert-many'; parentId: string; index: number; jsxArray: string[] }
  | { type: 'duplicate'; nodeId: string }
  | { type: 'duplicate-many'; nodeIds: string[] }
  | { type: 'replace'; nodeId: string; jsx: string }

// ============================================================================
// Operation Result
// ============================================================================

export interface OperationResult {
  success: boolean
  newSource?: string
  error?: string
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get a node by walking a path from root
 */
function getNodeByPath(root: EditableNode, path: number[]): EditableNode | null {
  let current: EditableNode = root

  for (const index of path) {
    if (index >= current.children.length) {
      return null
    }
    current = current.children[index]
  }

  return current
}

/**
 * Find parent node of a given node ID
 */
function findParentInfo(
  root: EditableNode,
  nodeId: string
): { parent: EditableNode; index: number } | null {
  const path = getPathById(root, nodeId)
  if (!path || path.length === 0) {
    return null
  }

  const parentPath = path.slice(0, -1)
  const index = path[path.length - 1]

  const parent = parentPath.length === 0 ? root : getNodeByPath(root, parentPath)
  if (!parent) {
    return null
  }

  return { parent, index }
}

// ============================================================================
// Operation Handlers
// ============================================================================

/**
 * Handle move operation
 */
function handleMove(
  source: string,
  parseResult: ParseResult,
  nodeId: string,
  targetId: string,
  position: 'before' | 'after' | 'inside'
): OperationResult {
  const { root } = parseResult

  if (!root) {
    return { success: false, error: 'No root node in parse result' }
  }

  // Validate source node exists
  const sourceNode = getNodeById(root, nodeId)
  if (!sourceNode) {
    return { success: false, error: `Source node not found: ${nodeId}` }
  }

  // Validate target node exists
  const targetNode = getNodeById(root, targetId)
  if (!targetNode) {
    return { success: false, error: `Target node not found: ${targetId}` }
  }

  // Find target's parent info
  const targetParentInfo = findParentInfo(root, targetId)
  if (!targetParentInfo) {
    return { success: false, error: `Cannot find parent for target: ${targetId}` }
  }

  // Calculate new parent and index
  let newParentId: string
  let newIndex: number

  switch (position) {
    case 'before':
      newParentId = targetParentInfo.parent.id
      newIndex = targetParentInfo.index
      break
    case 'after':
      newParentId = targetParentInfo.parent.id
      newIndex = targetParentInfo.index + 1
      break
    case 'inside':
      newParentId = targetId
      newIndex = 0
      break
  }

  // Check if moving to same position (no-op)
  const sourceParentInfo = findParentInfo(root, nodeId)
  if (sourceParentInfo &&
      sourceParentInfo.parent.id === newParentId &&
      sourceParentInfo.index === newIndex) {
    return { success: true, newSource: source } // No change needed
  }

  // Apply mutation
  const mutation: SurgicalMutation = {
    type: 'move-node',
    nodeId,
    newParentId,
    newIndex,
  }

  const newSource = applySurgicalMutation(source, mutation)
  if (!newSource) {
    return { success: false, error: 'Move mutation failed' }
  }

  return { success: true, newSource }
}

/**
 * Handle delete operation
 */
function handleDelete(
  source: string,
  parseResult: ParseResult,
  nodeId: string
): OperationResult {
  const { root } = parseResult

  if (!root) {
    return { success: false, error: 'No root node in parse result' }
  }

  const node = getNodeById(root, nodeId)
  if (!node) {
    return { success: false, error: `Node not found: ${nodeId}` }
  }

  const mutation: SurgicalMutation = {
    type: 'delete-node',
    nodeId,
  }

  const newSource = applySurgicalMutation(source, mutation)
  if (!newSource) {
    return { success: false, error: 'Delete mutation failed' }
  }

  return { success: true, newSource }
}

/**
 * Handle set-text operation
 */
function handleSetText(
  source: string,
  parseResult: ParseResult,
  nodeId: string,
  text: string
): OperationResult {
  const { root } = parseResult

  if (!root) {
    return { success: false, error: 'No root node in parse result' }
  }

  const node = getNodeById(root, nodeId)
  if (!node) {
    return { success: false, error: `Node not found: ${nodeId}` }
  }

  const mutation: SurgicalMutation = {
    type: 'set-text',
    nodeId,
    text,
  }

  const newSource = applySurgicalMutation(source, mutation)
  if (!newSource) {
    return { success: false, error: 'Set-text mutation failed' }
  }

  return { success: true, newSource }
}

/**
 * Handle duplicate operation
 */
function handleDuplicate(
  source: string,
  parseResult: ParseResult,
  nodeId: string
): OperationResult {
  const { root } = parseResult

  if (!root) {
    return { success: false, error: 'No root node in parse result' }
  }

  const node = getNodeById(root, nodeId)
  if (!node) {
    return { success: false, error: `Node not found: ${nodeId}` }
  }

  const parentInfo = findParentInfo(root, nodeId)
  if (!parentInfo) {
    return { success: false, error: `Cannot find parent for: ${nodeId}` }
  }

  // Get the JSX source of the node
  const nodeJsx = source.slice(node.loc.start, node.loc.end)

  const mutation: SurgicalMutation = {
    type: 'insert-node',
    parentId: parentInfo.parent.id,
    index: parentInfo.index + 1,
    jsx: nodeJsx,
  }

  const newSource = applySurgicalMutation(source, mutation)
  if (!newSource) {
    return { success: false, error: 'Duplicate mutation failed' }
  }

  return { success: true, newSource }
}

// ============================================================================
// JSX Extraction Helper
// ============================================================================

/**
 * Extract JSX source code for given node IDs
 * Returns array of JSX strings in the order provided
 */
export function extractJsxForNodes(source: string, nodeIds: string[]): string[] {
  const parseResult = parseSourceWithLocations(source)
  if (!parseResult.root) return []

  const jsxStrings: string[] = []
  for (const nodeId of nodeIds) {
    const node = getNodeById(parseResult.root, nodeId)
    if (node) {
      jsxStrings.push(source.slice(node.loc.start, node.loc.end))
    }
  }
  return jsxStrings
}

/**
 * Get parent info for a node (for paste operations)
 */
export function getNodeParentInfo(
  source: string,
  nodeId: string
): { parentId: string; index: number } | null {
  const parseResult = parseSourceWithLocations(source)
  if (!parseResult.root) return null

  const parentInfo = findParentInfo(parseResult.root, nodeId)
  if (!parentInfo) return null

  return {
    parentId: parentInfo.parent.id,
    index: parentInfo.index,
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Apply an edit operation to source code
 */
export function applyOperation(source: string, operation: EditOperation): OperationResult {
  const parseResult = parseSourceWithLocations(source)

  if (parseResult.errors.length > 0 && !parseResult.root) {
    return { success: false, error: `Parse error: ${parseResult.errors[0]}` }
  }

  switch (operation.type) {
    case 'move':
      return handleMove(source, parseResult, operation.nodeId, operation.targetId, operation.position)

    case 'delete':
      return handleDelete(source, parseResult, operation.nodeId)

    case 'set-text':
      return handleSetText(source, parseResult, operation.nodeId, operation.text)

    case 'duplicate':
      return handleDuplicate(source, parseResult, operation.nodeId)

    case 'delete-many': {
      // Delete nodes in reverse DOM order to preserve positions
      // Sort by finding each node's path and comparing depths then indices
      const nodeIds = [...operation.nodeIds]
      const withPaths = nodeIds.map((id) => ({
        id,
        path: parseResult.root ? getPathById(parseResult.root, id) : null,
      }))
      // Sort in reverse order (later nodes first)
      withPaths.sort((a, b) => {
        if (!a.path || !b.path) return 0
        // Compare path lengths (deeper first), then indices (larger first)
        for (let i = 0; i < Math.min(a.path.length, b.path.length); i++) {
          if (a.path[i] !== b.path[i]) return b.path[i] - a.path[i]
        }
        return b.path.length - a.path.length
      })

      let currentSource = source
      for (const { id } of withPaths) {
        const result = applyOperation(currentSource, { type: 'delete', nodeId: id })
        if (!result.success) {
          return { success: false, error: `Failed to delete node ${id}: ${result.error}` }
        }
        currentSource = result.newSource!
      }
      return { success: true, newSource: currentSource }
    }

    case 'duplicate-many': {
      let currentSource = source
      for (const nodeId of operation.nodeIds) {
        const result = applyOperation(currentSource, { type: 'duplicate', nodeId })
        if (!result.success) {
          return { success: false, error: `Failed to duplicate node ${nodeId}: ${result.error}` }
        }
        currentSource = result.newSource!
      }
      return { success: true, newSource: currentSource }
    }

    case 'insert-many': {
      let currentSource = source
      let insertIndex = operation.index
      for (const jsx of operation.jsxArray) {
        const result = applyOperation(currentSource, {
          type: 'insert',
          parentId: operation.parentId,
          index: insertIndex,
          jsx,
        })
        if (!result.success) {
          return { success: false, error: `Failed to insert JSX: ${result.error}` }
        }
        currentSource = result.newSource!
        insertIndex++
      }
      return { success: true, newSource: currentSource }
    }

    case 'set-prop': {
      const mutation: SurgicalMutation = {
        type: 'set-prop',
        nodeId: operation.nodeId,
        propName: operation.propName,
        value: operation.value,
      }
      const newSource = applySurgicalMutation(source, mutation)
      return newSource
        ? { success: true, newSource }
        : { success: false, error: 'Set-prop mutation failed' }
    }

    case 'delete-prop': {
      const mutation: SurgicalMutation = {
        type: 'delete-prop',
        nodeId: operation.nodeId,
        propName: operation.propName,
      }
      const newSource = applySurgicalMutation(source, mutation)
      return newSource
        ? { success: true, newSource }
        : { success: false, error: 'Delete-prop mutation failed' }
    }

    case 'insert': {
      const mutation: SurgicalMutation = {
        type: 'insert-node',
        parentId: operation.parentId,
        index: operation.index,
        jsx: operation.jsx,
      }
      const newSource = applySurgicalMutation(source, mutation)
      return newSource
        ? { success: true, newSource }
        : { success: false, error: 'Insert mutation failed' }
    }

    case 'replace': {
      const mutation: SurgicalMutation = {
        type: 'replace-node',
        nodeId: operation.nodeId,
        jsx: operation.jsx,
      }
      const newSource = applySurgicalMutation(source, mutation)
      return newSource
        ? { success: true, newSource }
        : { success: false, error: 'Replace mutation failed' }
    }

    default:
      return { success: false, error: `Unknown operation type: ${(operation as any).type}` }
  }
}

/**
 * Apply multiple operations in sequence
 */
export function applyOperations(source: string, operations: EditOperation[]): OperationResult {
  let currentSource = source

  for (const operation of operations) {
    const result = applyOperation(currentSource, operation)
    if (!result.success) {
      return result
    }
    currentSource = result.newSource!
  }

  return { success: true, newSource: currentSource }
}
