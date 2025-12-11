/**
 * Oplog types - re-exported from main types
 */
export type {
  Mutation,
  InsertNodeMutation,
  DeleteNodeMutation,
  MoveNodeMutation,
  SetPropMutation,
  DeletePropMutation,
  SetTextMutation,
  WrapNodeMutation,
  UnwrapNodeMutation,
  OplogEntry,
  Oplog,
} from '../types'

export { createEmptyOplog, generateId } from '../types'
