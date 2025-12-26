/**
 * Create Test Editor
 *
 * Factory for creating editor instances for testing.
 * Uses the same presets as the Editor component.
 *
 * Note: Includes MarkdownPlugin for sync API (tests only).
 * Production code uses the web worker via useMarkdownWorker().
 */

import { type TElement, type Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';
import { MarkdownPlugin, remarkMdx } from '@platejs/markdown';
import remarkGfm from 'remark-gfm';

import { BaseKit, RichTextKit, FullKit } from '../plugins/presets';
import { serializationRules, toMarkdownPluginRules } from '@hands/core/primitives';

// Test-only MarkdownPlugin with full rules
const TestMarkdownPlugin = MarkdownPlugin.configure({
  options: {
    remarkPlugins: [remarkGfm, remarkMdx],
    // Type assertion needed - toMarkdownPluginRules returns compatible shape
    rules: toMarkdownPluginRules(serializationRules) as any,
  },
});

export interface CreateTestEditorOptions {
  /** Initial value for the editor */
  value?: Value;
  /** Additional plugins to include */
  plugins?: any[];
  /** Preset to use: 'base', 'rich-text', 'full', or 'none' */
  preset?: 'base' | 'rich-text' | 'full' | 'none';
}

/**
 * Create a test editor instance.
 *
 * Includes MarkdownPlugin for sync serialize/deserialize API.
 * This is TEST ONLY - production uses the web worker.
 *
 * @example
 * ```typescript
 * const editor = createTestEditor();
 * const parsed = editor.api.markdown.deserialize(mdxContent);
 * const serialized = editor.api.markdown.serialize({ value: parsed });
 * ```
 */
export function createTestEditor(options: CreateTestEditorOptions = {}) {
  const { value, plugins = [], preset = 'full' } = options;

  let presetPlugins: any[] = [];
  switch (preset) {
    case 'base':
      presetPlugins = BaseKit;
      break;
    case 'rich-text':
      presetPlugins = RichTextKit;
      break;
    case 'full':
      presetPlugins = FullKit;
      break;
    case 'none':
      presetPlugins = [];
      break;
  }

  return createPlateEditor({
    // TestMarkdownPlugin added for sync API in tests
    plugins: [...presetPlugins, TestMarkdownPlugin, ...plugins],
    value: value as TElement[] | undefined,
  });
}
