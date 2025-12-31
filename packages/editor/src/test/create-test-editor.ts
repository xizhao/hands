/**
 * Create Test Editor
 *
 * Factory for creating editor instances for testing.
 *
 * Note: testSerialize/testDeserialize are in test-serialization.ts to avoid
 * transitive worker imports that break in vitest.
 */

import type { TElement, Value } from "platejs";
import { createPlateEditor } from "platejs/react";

import { BaseKit, FullKit, RichTextKit } from "../plugins/presets";

// Re-export serialization utilities from the isolated module
export { testDeserialize, testSerialize } from "./test-serialization";

// ============================================================================
// Test Editor Factory
// ============================================================================

export interface CreateTestEditorOptions {
  /** Initial value for the editor */
  value?: Value;
  /** Additional plugins to include */
  plugins?: any[];
  /** Preset to use: 'base', 'rich-text', 'full', or 'none' */
  preset?: "base" | "rich-text" | "full" | "none";
}

/**
 * Create a test editor instance.
 *
 * For serialization tests, use testSerialize/testDeserialize instead of
 * editor.api.markdown - they use the same logic as the production worker.
 */
export function createTestEditor(options: CreateTestEditorOptions = {}) {
  const { value, plugins = [], preset = "full" } = options;

  let presetPlugins: any[] = [];
  switch (preset) {
    case "base":
      presetPlugins = BaseKit;
      break;
    case "rich-text":
      presetPlugins = RichTextKit;
      break;
    case "full":
      presetPlugins = FullKit;
      break;
    case "none":
      presetPlugins = [];
      break;
  }

  return createPlateEditor({
    plugins: [...presetPlugins, ...plugins],
    value: value as TElement[] | undefined,
  });
}
