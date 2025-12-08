// Source types and utilities
export {
  defineSource,
  type SourceConfig,
  type SourceContext,
  type SourceDefinition,
  type SourceHandler,
  type SqlClient,
  type Registry,
  type RegistryItem,
  RegistrySchema,
  RegistryItemSchema,
} from "./types.js"

// Runtime for Cloudflare Workers
export { createWorkerHandler } from "./runtime.js"

// Registry data
import registryData from "./registry.json"
export const registry = registryData as import("./types.js").Registry
