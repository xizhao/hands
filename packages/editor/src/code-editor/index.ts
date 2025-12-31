/**
 * @hands/editor/code-editor
 *
 * Monaco-based code editor submodule for editing raw MDX/Markdown.
 * This module is sectioned off for easy removal if not needed.
 *
 * @example
 * ```tsx
 * import { MonacoEditor, type Diagnostic } from "@hands/editor/code-editor";
 *
 * <MonacoEditor
 *   value={rawContent}
 *   onChange={setRawContent}
 *   diagnostics={[{ line: 5, column: 1, message: "Error", severity: "error" }]}
 * />
 * ```
 */

// Main component
export { MonacoEditor } from "./MonacoEditor";
// Language registration (for advanced customization)
export { registerMdxLanguage } from "./mdx-language";
// Theme utilities (for advanced customization)
export { defineEditorThemes, getThemeName, updateEditorThemes } from "./themes";
// Types
export type { Diagnostic, MonacoEditorProps } from "./types";
// Hook for programmatic control
export { type UseMonacoOptions, type UseMonacoReturn, useMonaco } from "./use-monaco";
