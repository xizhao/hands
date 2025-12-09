// Use Miniflare for dev (CF Workers alignment with unenv polyfills)
// - Build system uses unenv nodeless preset to polyfill Node.js builtins
// - Uses react-dom/server.edge for React 19 compatibility
// - Compatibility date 2025-08-15+ enables MessageChannel globals
export { MiniflareServer as WorkerManager } from "../miniflare/server";
export { createMiniflareServer as createWorkerServer } from "../miniflare/server";

// Re-export for explicit access
export { MiniflareServer, createMiniflareServer } from "../miniflare/server";
export { WranglerManager } from "../wrangler/manager";
