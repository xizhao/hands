/**
 * RSC Webpack Shim for Desktop
 *
 * Sets up globalThis.__webpack_require__ for react-server-dom-webpack/client
 * This must be imported BEFORE any react-server-dom-webpack imports.
 *
 * This shim dynamically loads "use client" modules from the workbook's
 * runtime dev server. When the Flight stream references a client component
 * like `/src/MyButton.tsx#default`, we fetch that module from the runtime
 * server's Vite and hydrate it properly.
 */

import React from 'react'

// Module cache for loaded client references (promise-based for async loading)
const moduleCache: Map<string, Promise<Record<string, unknown>>> = new Map()

// Current runtime port - set this before consuming RSC streams
let currentRuntimePort: number | null = null

/**
 * Configure the runtime port for loading client modules
 */
export function setRuntimePort(port: number): void {
  currentRuntimePort = port
}

/**
 * Get the current runtime port
 */
export function getRuntimePort(): number | null {
  return currentRuntimePort
}

/**
 * Convert absolute file path to client-modules path
 * e.g. /Users/kevin/.hands/workbook/blocks/ui/button.tsx -> /client-modules/ui/button.tsx
 *
 * The runtime serves these at /client-modules/* which proxies to Vite's /@fs/ endpoint
 */
function normalizeModulePath(file: string): string {
  // Extract the blocks/ portion and convert to client-modules path
  const blocksMatch = file.match(/\/blocks\/(.+)$/)
  if (blocksMatch) {
    return `/client-modules/${blocksMatch[1]}`
  }

  // Fallback: if it's already a relative path, convert
  if (file.startsWith('/blocks/')) {
    return file.replace('/blocks/', '/client-modules/')
  }

  // Last resort: return original
  console.warn('[rsc-shim] Could not normalize module path:', file)
  return file
}

/**
 * Load a module from the runtime dev server
 */
async function loadModuleFromRuntime(
  file: string
): Promise<Record<string, unknown>> {
  if (!currentRuntimePort) {
    throw new Error('[rsc-shim] Runtime port not configured')
  }

  // Normalize absolute paths to Vite-resolvable paths
  const modulePath = normalizeModulePath(file)

  // The runtime dev server (Vite) serves modules at their path
  // We need to import the ESM module directly
  const moduleUrl = `http://localhost:${currentRuntimePort}${modulePath}`

  console.debug('[rsc-shim] Loading module from runtime:', moduleUrl)

  try {
    // Use dynamic import with @vite-ignore to fetch from the runtime server
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - dynamic import from external URL
    const module = await import(/* @vite-ignore */ moduleUrl)
    return module
  } catch (err) {
    console.error('[rsc-shim] Failed to load module:', file, err)
    throw err
  }
}

/**
 * Memoized module loader - returns the same promise for the same file
 */
function loadModule(file: string): Promise<Record<string, unknown>> {
  let promise = moduleCache.get(file)
  if (!promise) {
    promise = loadModuleFromRuntime(file)
    moduleCache.set(file, promise)
  }
  return promise
}

/**
 * Create the webpack require function that React RSC uses
 *
 * This is an async function that returns a promise-like object.
 * React's Flight client expects this to return either:
 * - A synchronous module (already loaded)
 * - A thenable (promise) that resolves to the module
 */
const webpackRequire = function (id: string) {
  // Parse the module ID: format is "file#exportName"
  const [file, exportName] = id.split('#')

  console.debug('[rsc-shim] Requested module:', id, '-> file:', file, 'export:', exportName)

  // Load the module and return a lazy component wrapper
  const promisedModule = loadModule(file)
  const promisedComponent = promisedModule.then((module) => module[exportName])

  // Create a lazy component that wraps the async-loaded component
  const promisedDefault = promisedComponent.then((Component) => ({
    default: Component as React.ComponentType,
  }))

  const Lazy = React.lazy(() => promisedDefault)

  // Wrap in a component that renders the lazy component
  const Wrapped = (props: Record<string, unknown>) =>
    React.createElement(Lazy, props as React.Attributes)
  ;(Wrapped as unknown as { displayName: string }).displayName =
    `RSCClientComponent(${id})`

  // Return the module-like object that React expects
  return { [id]: Wrapped }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any

// Add required webpack runtime properties
webpackRequire.u = (chunkId: string) => chunkId + '.js'
webpackRequire.p = '/'
webpackRequire.O = (
  result: unknown,
  _chunkIds?: unknown,
  fn?: () => unknown
) => {
  if (fn) return fn()
  return result
}

// React 19 RSC error serialization requires these
webpackRequire.scriptsToBeLoaded = []
webpackRequire.scripts = {}

// Chunk loading (returns resolved promise since we don't load chunks dynamically)
;(globalThis as unknown as Record<string, unknown>).__webpack_chunk_load__ = (
  chunkId: string
) => {
  console.debug('[rsc-shim] Chunk load:', chunkId)
  return Promise.resolve()
}

// Set on globalThis
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).__webpack_require__ = webpackRequire
;(globalThis as unknown as Record<string, unknown>).__webpack_module_cache__ =
  moduleCache

/**
 * Clear the module cache (useful for HMR)
 */
export function clearModuleCache(): void {
  moduleCache.clear()
}

export {}
