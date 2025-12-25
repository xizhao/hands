/**
 * Editor Configuration
 *
 * Shared plugin configuration for all editor modes (doc, slides, code).
 * This ensures consistent behavior across all editor instances.
 */

import { EditorCorePlugins } from "./presets";
import { createMarkdownKit, type MarkdownRule } from "./markdown-kit";

export interface EditorConfig {
  /** Additional plugins beyond the core set */
  extraPlugins?: any[];
  /** Additional markdown serialization rules */
  markdownRules?: Record<string, MarkdownRule>;
}

/**
 * Create the complete plugin array for an editor instance.
 * Used by DocEditor, SlideEditor, etc. to ensure consistent configuration.
 */
export function createEditorPlugins(config: EditorConfig = {}) {
  const { extraPlugins = [], markdownRules = {} } = config;

  return [
    ...EditorCorePlugins,
    ...extraPlugins,
    ...createMarkdownKit(markdownRules),
  ];
}

/** Default editor plugins with no extras */
export const DefaultEditorPlugins = createEditorPlugins();
