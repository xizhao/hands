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

// Hook for programmatic control
export { useMonaco, type UseMonacoOptions, type UseMonacoReturn } from "./use-monaco";

// Types
export type { Diagnostic, MonacoEditorProps } from "./types";

// Theme utilities (for advanced customization)
export { defineEditorThemes, getThemeName, updateEditorThemes } from "./themes";

// Language registration (for advanced customization)
export { registerMdxLanguage } from "./mdx-language";
