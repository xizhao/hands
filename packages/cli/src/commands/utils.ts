/**
 * Shared utilities for CLI commands
 *
 * Re-exports from @hands/runtime/config for backward compatibility.
 * The runtime package is the single source of truth for config schemas.
 */

// Re-export everything from the runtime config module
export {
  type BlocksConfig,
  BlocksConfigSchema,
  type BuildConfig,
  BuildConfigSchema,
  createDefaultConfig as createDefaultHandsJson,
  type DatabaseConfig,
  DatabaseConfigSchema,
  type DevConfig,
  DevConfigSchema,
  // Types
  type HandsJson,
  HandsJsonSchema,
  // Functions
  loadConfig as loadHandsJson,
  type PagesConfig,
  PagesConfigSchema,
  type SecretConfig,
  SecretSchema,
  type SourceConfig,
  // Schemas
  SourceConfigSchema,
  saveConfig as saveHandsJson,
  slugify,
} from "@hands/runtime/config";
