/**
 * Oplog history management with undo/redo
 */
import type { Oplog, OplogEntry, Mutation, JsxNode } from '../types'
import { generateId, createEmptyOplog } from '../types'
import { computeInverse } from './inverse'

/**
 * Append a mutation to the oplog
 * This truncates any redo history (entries after cursor)
 */
export function appendMutation(
  oplog: Oplog,
  ast: JsxNode,
  mutation: Mutation
): Oplog {
  const inverse = computeInverse(ast, mutation)

  const entry: OplogEntry = {
    id: generateId(),
    timestamp: Date.now(),
    mutation,
    inverse,
  }

  // Truncate redo history
  const entries = oplog.entries.slice(0, oplog.cursor)
  entries.push(entry)

  return {
    entries,
    cursor: entries.length,
  }
}

/**
 * Get the mutation to apply for undo
 * Returns null if nothing to undo
 */
export function getUndoMutation(oplog: Oplog): Mutation | null {
  if (oplog.cursor === 0) return null
  const entry = oplog.entries[oplog.cursor - 1]
  return entry.inverse
}

/**
 * Get the mutation to apply for redo
 * Returns null if nothing to redo
 */
export function getRedoMutation(oplog: Oplog): Mutation | null {
  if (oplog.cursor >= oplog.entries.length) return null
  const entry = oplog.entries[oplog.cursor]
  return entry.mutation
}

/**
 * Move cursor back after undo
 */
export function moveUndoCursor(oplog: Oplog): Oplog {
  if (oplog.cursor === 0) return oplog
  return { ...oplog, cursor: oplog.cursor - 1 }
}

/**
 * Move cursor forward after redo
 */
export function moveRedoCursor(oplog: Oplog): Oplog {
  if (oplog.cursor >= oplog.entries.length) return oplog
  return { ...oplog, cursor: oplog.cursor + 1 }
}

/**
 * Check if undo is available
 */
export function canUndo(oplog: Oplog): boolean {
  return oplog.cursor > 0
}

/**
 * Check if redo is available
 */
export function canRedo(oplog: Oplog): boolean {
  return oplog.cursor < oplog.entries.length
}

/**
 * Get the entries that have been applied (before cursor)
 */
export function getAppliedEntries(oplog: Oplog): OplogEntry[] {
  return oplog.entries.slice(0, oplog.cursor)
}

/**
 * Get the entries that can be redone (after cursor)
 */
export function getRedoableEntries(oplog: Oplog): OplogEntry[] {
  return oplog.entries.slice(oplog.cursor)
}

/**
 * Clear all history
 */
export function clearHistory(): Oplog {
  return createEmptyOplog()
}
