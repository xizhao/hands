// Config
export { defineConfig } from "./config.js"
export type { HandsConfig } from "./config.js"

// Runtime helpers for user code
export { monitor } from "./runtime/monitor.js"
export { dashboard } from "./runtime/dashboard.js"
export { integration } from "./runtime/integration.js"
export { sql } from "./runtime/sql.js"

// SST Components
export { DataStore } from "./components/DataStore.js"
export { Monitor } from "./components/Monitor.js"
export { Dashboard } from "./components/Dashboard.js"
export { Integration } from "./components/Integration.js"

// Sources - polling data connectors
export {
  defineSource,
  createWorkerHandler,
  registry as sourceRegistry,
  type SourceConfig,
  type SourceContext,
  type SourceDefinition,
  type SourceHandler,
  type Registry,
  type RegistryItem,
} from "./sources/index.js"

// Build system
export {
  build,
  needsBuild,
  loadHandsJson,
  saveHandsJson,
  createDefaultHandsJson,
  generateWranglerToml,
  generateWorkerEntry,
  type HandsJson,
  type BuildOptions,
  type BuildResult,
} from "./build/index.js"

// CLI utilities (for programmatic use)
export { addSource, listSources, type AddSourceOptions, type AddSourceResult } from "./cli/add.js"
