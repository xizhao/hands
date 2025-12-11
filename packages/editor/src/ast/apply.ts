/**
 * Apply mutations to the AST
 */
import type { JsxNode, Mutation } from '../types'
import {
  insertAtPath,
  deleteAtPath,
  moveNode,
  setPropAtPath,
  deletePropAtPath,
  setTextAtPath,
  wrapNodeAtPath,
  unwrapNodeAtPath,
} from './path'

/**
 * Apply a mutation to the AST, returning the new AST
 */
export function applyMutation(ast: JsxNode, mutation: Mutation): JsxNode {
  switch (mutation.type) {
    case 'insert-node':
      return insertAtPath(ast, mutation.path, mutation.index, mutation.node)

    case 'delete-node':
      return deleteAtPath(ast, mutation.path)

    case 'move-node':
      return moveNode(ast, mutation.fromPath, mutation.toPath, mutation.toIndex)

    case 'set-prop':
      return setPropAtPath(ast, mutation.path, mutation.prop, mutation.value)

    case 'delete-prop':
      return deletePropAtPath(ast, mutation.path, mutation.prop)

    case 'set-text':
      return setTextAtPath(ast, mutation.path, mutation.text)

    case 'wrap-node':
      return wrapNodeAtPath(ast, mutation.path, mutation.wrapper)

    case 'unwrap-node':
      return unwrapNodeAtPath(ast, mutation.path)

    default:
      // TypeScript exhaustiveness check
      const _exhaustive: never = mutation
      throw new Error(`Unknown mutation type: ${(_exhaustive as Mutation).type}`)
  }
}

/**
 * Apply multiple mutations in sequence
 */
export function applyMutations(ast: JsxNode, mutations: Mutation[]): JsxNode {
  return mutations.reduce((current, mutation) => applyMutation(current, mutation), ast)
}
