/**
 * Create Test Editor
 *
 * Factory for creating editor instances for testing.
 * Uses the same presets as the Editor component.
 */

import { type TElement, type Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';

import { BaseKit, RichTextKit, FullKit } from '../plugins/presets';

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
 * All presets include StdlibKit and MarkdownKit with stdlib rules.
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
    plugins: [...presetPlugins, ...plugins],
    value: value as TElement[] | undefined,
  });
}
