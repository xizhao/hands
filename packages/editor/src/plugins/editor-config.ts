/**
 * Editor Configuration
 *
 * Shared plugin configuration for all editor modes (doc, slides, code).
 * This ensures consistent behavior across all editor instances.
 *
 * Note: Serialization is handled by the web worker, not MarkdownPlugin.
 * Custom serialization rules should be added to @hands/core/primitives/serialization.
 */

import { EditorCorePlugins } from "./presets";

export interface EditorConfig {
  /** Additional plugins beyond the core set */
  extraPlugins?: any[];
}

/**
 * Create the complete plugin array for an editor instance.
 * Used by DocEditor, SlideEditor, etc. to ensure consistent configuration.
 */
export function createEditorPlugins(config: EditorConfig = {}) {
  const { extraPlugins = [] } = config;

  return [...EditorCorePlugins, ...extraPlugins];
}

/** Default editor plugins with no extras */
export const DefaultEditorPlugins = createEditorPlugins();
