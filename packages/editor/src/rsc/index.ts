/**
 * RSC (React Server Components) Integration
 *
 * This module provides Flight wire format support for rendering arbitrary
 * React components via RSC. It allows the standalone editor to render
 * PascalCase components (like shadcn, etc.) by fetching their rendered
 * output from a Vite runtime worker.
 *
 * Flow:
 * 1. Editor encounters a PascalCase component (e.g., <Card>, <Button>)
 * 2. Instead of showing a placeholder, fetches Flight stream from runtime
 * 3. Runtime renders the component server-side with full React
 * 4. Flight stream parsed into React elements for display
 */

export * from './client'
export * from './context.js'
export * from './types'
