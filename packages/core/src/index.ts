/**
 * @hands/core
 *
 * Core package for the Hands data application framework.
 *
 * ## Exports
 *
 * - `@hands/core/ui` - UI component library (view + action + data)
 * - `@hands/core/ui/view` - Display-only components
 * - `@hands/core/ui/action` - Interactive action components
 * - `@hands/core/ui/data` - Data management components (DataGrid, Kanban)
 * - `@hands/core/primitives` - Core primitives (block, serialization)
 * - `@hands/core/types` - TypeScript type definitions
 * - `@hands/core/validation` - MDX validation utilities
 */

// Re-export primitives (serialization, block factory, etc.)
export * from "./primitives";
// Re-export types (source of truth for type definitions and keys)
export * from "./types";

// Re-export UI components
// Note: DATA_GRID_KEY and KANBAN_KEY are also exported from ./types,
// but TypeScript allows duplicate re-exports of the same value
export * from "./ui";

// Re-export validation utilities
export * from "./validation";

// Re-export database context
export * from "./db/context";
