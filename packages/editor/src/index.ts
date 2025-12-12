/**
 * @hands/editor - WYSIWYG block editor
 *
 * A structural editor for React Server Component blocks.
 */

// Core types
export * from './types'

// Submodules (can also be imported directly)
export * as ast from './ast'
export * as scene from './scene'
export * as plate from './plate'

// Main hook
export { useEditor } from './hooks/useEditor'
export type { UseEditorReturn } from './hooks/useEditor'

// Plate visual editor (re-exported for convenience)
export { PlateVisualEditor } from './plate'
export type { } from './plate' // Placeholder for future type exports
