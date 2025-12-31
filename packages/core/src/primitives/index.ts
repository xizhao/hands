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

// Action primitives (serverless compute functions)
export * from "./actions";

// Schema primitives (action schema declarations, validation)
export * from "./schema";
// SQL validation primitives
export * from "./sql-validation";

// Serialization primitives - NOT re-exported here to avoid Node ESM issues
// Import directly from "@hands/core/primitives/serialization" instead

// Domain primitives (table-as-first-class-entity abstraction)
export * from "./domain";
// Sheet primitives (smart SQLite table abstraction)
export * from "./sheet";
