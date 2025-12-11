/**
 * Compute inverse mutations for undo
 */
import type {
  Mutation,
  JsxNode,
  NodePath,
} from '../types'
import { getAtPath } from '../ast/path'

/**
 * Compute the inverse of a mutation (for undo)
 */
export function computeInverse(ast: JsxNode, mutation: Mutation): Mutation {
  switch (mutation.type) {
    case 'insert-node': {
      // Inverse of insert is delete
      const childPath: NodePath = [...mutation.path, 'children', mutation.index]
      return {
        type: 'delete-node',
        path: childPath,
      }
    }

    case 'delete-node': {
      // Inverse of delete is insert - need to capture the deleted node
      const node = getAtPath(ast, mutation.path)
      if (!node) {
        throw new Error(`Cannot compute inverse: node not found at path ${mutation.path.join('.')}`)
      }
      // Parent path is everything except the last two segments (children, index)
      const parentPath = mutation.path.slice(0, -2)
      const index = mutation.path[mutation.path.length - 1] as number
      return {
        type: 'insert-node',
        path: parentPath,
        index,
        node,
      }
    }

    case 'move-node': {
      // Inverse of move is move back
      // After the move, the node is at toPath + children + toIndex
      const newPath: NodePath = [...mutation.toPath, 'children', mutation.toIndex]
      // Compute what the original parent path was
      const originalParentPath = mutation.fromPath.slice(0, -2)
      const originalIndex = mutation.fromPath[mutation.fromPath.length - 1] as number
      return {
        type: 'move-node',
        fromPath: newPath,
        toPath: originalParentPath,
        toIndex: originalIndex,
      }
    }

    case 'set-prop': {
      // Inverse is to restore the old value or delete if it didn't exist
      const node = getAtPath(ast, mutation.path)
      if (!node || node.type !== 'element') {
        throw new Error(`Cannot compute inverse: element not found at path ${mutation.path.join('.')}`)
      }
      const oldValue = node.props?.[mutation.prop]
      if (oldValue === undefined) {
        return {
          type: 'delete-prop',
          path: mutation.path,
          prop: mutation.prop,
        }
      }
      return {
        type: 'set-prop',
        path: mutation.path,
        prop: mutation.prop,
        value: oldValue,
      }
    }

    case 'delete-prop': {
      // Inverse is to restore the old value
      const node = getAtPath(ast, mutation.path)
      if (!node || node.type !== 'element') {
        throw new Error(`Cannot compute inverse: element not found at path ${mutation.path.join('.')}`)
      }
      const oldValue = node.props?.[mutation.prop]
      if (oldValue === undefined) {
        // Prop didn't exist, inverse is no-op (or we could throw)
        // For safety, we'll just delete again (idempotent)
        return mutation
      }
      return {
        type: 'set-prop',
        path: mutation.path,
        prop: mutation.prop,
        value: oldValue,
      }
    }

    case 'set-text': {
      // Inverse is to restore the old text
      const node = getAtPath(ast, mutation.path)
      if (!node || node.type !== 'text') {
        throw new Error(`Cannot compute inverse: text node not found at path ${mutation.path.join('.')}`)
      }
      return {
        type: 'set-text',
        path: mutation.path,
        text: node.text ?? '',
      }
    }

    case 'wrap-node': {
      // Inverse of wrap is unwrap
      // After wrapping, the wrapper is at the original path
      return {
        type: 'unwrap-node',
        path: mutation.path,
      }
    }

    case 'unwrap-node': {
      // Inverse of unwrap is wrap
      // Need to capture the wrapper node
      const wrapper = getAtPath(ast, mutation.path)
      if (!wrapper || wrapper.type !== 'element') {
        throw new Error(`Cannot compute inverse: wrapper element not found at path ${mutation.path.join('.')}`)
      }
      // Create a copy of wrapper without children (they become the wrapped content)
      const wrapperCopy: JsxNode = {
        ...wrapper,
        children: [], // Will be filled by wrap operation
      }
      return {
        type: 'wrap-node',
        path: mutation.path,
        wrapper: wrapperCopy,
      }
    }
  }
}
