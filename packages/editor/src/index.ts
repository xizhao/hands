/**
 * @hands/editor - WYSIWYG block editor
 *
 * A structural editor for React Server Component blocks.
 */

// Submodules (can also be imported directly)
export * as ast from "./ast";
export type {} from "./plate"; // Placeholder for future type exports
export * as plate from "./plate";
// Plate visual editor (re-exported for convenience)
export { PlateVisualEditor } from "./plate";
// Core types
export * from "./types";

// MDX editor module
export * as mdx from "./mdx";
// MDX visual editor (re-exported for convenience)
export { MdxVisualEditor } from "./mdx";
