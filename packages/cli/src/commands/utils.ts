/**
 * Shared utilities for CLI commands
 *
 * Re-exports from @hands/runtime/config for backward compatibility.
 * The runtime package is the single source of truth for config schemas.
 */

// Re-export everything from the runtime config module
export {
  // Schemas
  SourceConfigSchema,
  SecretSchema,
  PagesConfigSchema,
  BlocksConfigSchema,
  DatabaseConfigSchema,
  BuildConfigSchema,
  DevConfigSchema,
  HandsJsonSchema,
  // Types
  type HandsJson,
  type SourceConfig,
  type SecretConfig,
  type PagesConfig,
  type BlocksConfig,
  type DatabaseConfig,
  type BuildConfig,
  type DevConfig,
  // Functions
  loadConfig as loadHandsJson,
  saveConfig as saveHandsJson,
  createDefaultConfig as createDefaultHandsJson,
  slugify,
} from "@hands/runtime/config"
