/**
 * @hands/editor
 *
 * Standalone Plate-based rich text editor with MDX support.
 */

// Main Editor component
export {
  Editor,
  type EditorProps,
  type EditorHandle,
  type CustomBlock,
  type SimpleCustomBlock,
  type AdvancedCustomBlock,
} from "./Editor";

// Re-export Frontmatter type from Editor (it's already in frontmatter.ts but nice to have at top level)
export type { Frontmatter } from "./frontmatter";

// Types
export * from "./types";

// Editor base kit
export * from "./editor-base-kit";

// Frontmatter support
export * from "./frontmatter";

// Transforms
export * from "./transforms";

// Plate elements
export * from "./plate-elements";

// Plugin presets
export { BaseKit, RichTextKit, FullKit, EditorCorePlugins } from "./plugins/presets";

// Copilot factory (also available via Editor's copilot prop)
export { createCopilotKit, type CopilotConfig } from "./plugins/copilot-kit";

// All plugin kits (for custom composition)
export * from "./plugins";

// Editor context (for backend integration)
export * from "./context";
