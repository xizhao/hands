/**
 * Primitives Module
 *
 * Core non-UI primitives for the Hands system.
 * This module provides foundational building blocks that don't depend on UI components.
 *
 * NOTE: Plugin primitives are NOT exported here because they have "use client"
 * directives that break SSR module resolution. Import them directly:
 *   import { createPlugin } from "@hands/core/plugin";
 */

// SQL validation primitives
export * from "./sql-validation";

// Schema primitives (action schema declarations, validation)
export * from "./schema";

// Action primitives (serverless compute functions)
export * from "./actions";

// Serialization primitives (MDX serialization rules)
export * from "./serialization";

// Sheet primitives (smart SQLite table abstraction)
export * from "./sheet";
