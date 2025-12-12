/**
 * AST module - parsing, manipulation, and generation
 */
export * from './types'
export * from './path'
export * from './parser'
export * from './generator'

// New surgical mutation system (OXC-based parser, ~100x faster than Babel)
export * from './oxc-parser'
export * from './surgical-mutations'
export * from './plate-diff'
export * from './slate-operations'

// SQL data dependency extraction
export * from './sql-extractor'
