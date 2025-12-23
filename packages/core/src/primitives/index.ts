/**
 * Primitives Module
 *
 * Core non-UI primitives for the Hands system.
 * This module provides foundational building blocks that don't depend on UI components.
 */

// Plugin primitives (custom editor extensions)
export * from "./plugin";

// Serialization primitives
export * from "./serialization";

// SQL validation primitives
export * from "./sql-validation";

// Schema primitives (action schema declarations, validation)
export * from "./schema";

// Action primitives (serverless compute functions)
export * from "./actions";
