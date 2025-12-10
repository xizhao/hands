/**
 * @hands/block-editor
 *
 * Visual block editor with bidirectional source code sync.
 * Provides Craft.js-style editing for RSC block components.
 */

// Core types and model
export * from "./model"

// AST parsing and generation
export * from "./ast"

// Visual editor components
export * from "./editor"

// Sync engine
export * from "./sync"

// Utilities
export * from "./utils"

// Re-export main components for convenience
export { BlockCanvas } from "./editor/BlockCanvas"
export { parseBlock, getParser } from "./ast/parser"
export { generateSource, getGenerator } from "./ast/generator"
export { createSyncEngine } from "./sync/sync-engine"
