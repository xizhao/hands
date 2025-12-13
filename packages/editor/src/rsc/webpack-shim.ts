/**
 * RSC Webpack Shim for Editor
 *
 * Sets up globalThis.__webpack_require__ for react-server-dom-webpack/client
 * This must be imported BEFORE any react-server-dom-webpack imports.
 *
 * When the Flight stream references a "use client" component, RWSDK generates
 * absolute file paths as module IDs. We load these via Vite's /@fs/ endpoint.
 *
 * The runtime's Vite server has server.fs.allow: ["/"] so it can serve any file.
 */

import React from "react";

// Module cache for loaded client references (promise-based for async loading)
const moduleCache: Map<string, Promise<Record<string, unknown>>> = new Map();

// Current runtime port - set this before consuming RSC streams
let currentRuntimePort: number | null = null;

/**
 * Configure the runtime port for loading client modules
 */
export function setRuntimePort(port: number): void {
  currentRuntimePort = port;
}

/**
 * Get the current runtime port
 */
export function getRuntimePort(): number | null {
  return currentRuntimePort;
}

/**
 * Convert file path to Vite-loadable URL via runtime proxy
 * Absolute paths use /vite-proxy/@fs/, relative paths use /client-modules/
 *
 * All paths go through the runtime API, which proxies to Vite.
 * This allows the editor to use a single port for everything.
 */
function toViteUrl(file: string): string {
  // Absolute paths - use runtime's /vite-proxy which forwards to Vite's /@fs/
  if (file.startsWith("/")) {
    return `/vite-proxy/@fs${file}`;
  }

  // Relative paths from blocks/ - use client-modules proxy
  if (file.startsWith("blocks/")) {
    return `/client-modules/${file.replace("blocks/", "")}`;
  }

  // Fallback
  console.warn("[rsc-shim] Unexpected module path format:", file);
  return file;
}

/**
 * Load a module from the runtime dev server via Vite
 */
async function loadModuleFromRuntime(file: string): Promise<Record<string, unknown>> {
  if (!currentRuntimePort) {
    throw new Error("[rsc-shim] Runtime port not configured");
  }

  // Convert to Vite-loadable URL (/@fs/ for absolute paths)
  const vitePath = toViteUrl(file);
  const moduleUrl = `http://localhost:${currentRuntimePort}${vitePath}`;

  console.debug("[rsc-shim] Loading module:", file, "->", moduleUrl);

  try {
    // Use dynamic import with @vite-ignore to fetch from the runtime server
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error - dynamic import from external URL
    const module = await import(/* @vite-ignore */ moduleUrl);
    return module;
  } catch (err) {
    console.error("[rsc-shim] Failed to load module:", file, err);
    throw err;
  }
}

/**
 * Memoized module loader - returns the same promise for the same file
 */
function loadModule(file: string): Promise<Record<string, unknown>> {
  let promise = moduleCache.get(file);
  if (!promise) {
    promise = loadModuleFromRuntime(file);
    moduleCache.set(file, promise);
  }
  return promise;
}

/**
 * Create the webpack require function that React RSC uses
 *
 * This is an async function that returns a promise-like object.
 * React's Flight client expects this to return either:
 * - A synchronous module (already loaded)
 * - A thenable (promise) that resolves to the module
 */
const webpackRequire = ((id: string) => {
  // Parse the module ID: format is "file#exportName"
  const [file, exportName] = id.split("#");

  console.debug("[rsc-shim] Requested module:", id, "-> file:", file, "export:", exportName);

  // Load the module and return a lazy component wrapper
  const promisedModule = loadModule(file);
  const promisedComponent = promisedModule.then((module) => module[exportName]);

  // Create a lazy component that wraps the async-loaded component
  const promisedDefault = promisedComponent.then((Component) => ({
    default: Component as React.ComponentType,
  }));

  const Lazy = React.lazy(() => promisedDefault);

  // Wrap in a component that renders the lazy component
  const Wrapped = (props: Record<string, unknown>) =>
    React.createElement(Lazy, props as React.Attributes);
  (Wrapped as unknown as { displayName: string }).displayName = `RSCClientComponent(${id})`;

  // Return the module-like object that React expects
  return { [id]: Wrapped };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any;

// Add required webpack runtime properties
webpackRequire.u = (chunkId: string) => `${chunkId}.js`;
webpackRequire.p = "/";
webpackRequire.O = (result: unknown, _chunkIds?: unknown, fn?: () => unknown) => {
  if (fn) return fn();
  return result;
};

// React 19 RSC error serialization requires these
webpackRequire.scriptsToBeLoaded = [];
webpackRequire.scripts = {};

// Chunk loading (returns resolved promise since we don't load chunks dynamically)
(globalThis as unknown as Record<string, unknown>).__webpack_chunk_load__ = (chunkId: string) => {
  console.debug("[rsc-shim] Chunk load:", chunkId);
  return Promise.resolve();
};

// Set on globalThis
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).__webpack_require__ = webpackRequire;
(globalThis as unknown as Record<string, unknown>).__webpack_module_cache__ = moduleCache;

/**
 * Clear the module cache (useful for HMR)
 */
export function clearModuleCache(): void {
  moduleCache.clear();
}
