/**
 * @hands/editor
 *
 * Standalone Plate-based rich text editor with MDX support.
 */

// Action Editor (visual data lineage + code view)
export * from "./action-editor";
// Action Flow Analysis (AST-based extraction)
export * from "./action-flow";

// Diagnostics type (for code editor mode)
export type { Diagnostic } from "./code-editor/types";
// Editor context (for backend integration)
export * from "./context";
// Main Editor component
export {
  type AdvancedCustomBlock,
  type CustomBlock,
  Editor,
  type EditorHandle,
  type EditorProps,
  type SimpleCustomBlock,
} from "./Editor";
// Editor base kit
export * from "./editor-base-kit";
// Re-export Frontmatter type from Editor (it's already in frontmatter.ts but nice to have at top level)
export type { Frontmatter } from "./frontmatter";

// Frontmatter support
export * from "./frontmatter";
// Preview Editor (read-only)
export { PreviewEditor, type PreviewEditorProps } from "./PreviewEditor";
// Plate elements
export * from "./plate-elements";
// All plugin kits (for custom composition)
export * from "./plugins";
// Copilot factory (also available via Editor's copilot prop)
export { type CopilotConfig, createCopilotKit } from "./plugins/copilot-kit";
// Plugin presets
export { BaseKit, EditorCorePlugins, FullKit, RichTextKit } from "./plugins/presets";
// Transforms
export * from "./transforms";
// Types
export * from "./types";
// Editor mode toggle
export type { EditorMode } from "./ui/mode-toggle";
// SpecBar (description as spec with push/pull sync)
export { SpecBar, type SpecBarProps } from "./ui/spec-bar";
