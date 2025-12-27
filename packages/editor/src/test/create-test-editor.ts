/**
 * Create Test Editor
 *
 * Factory for creating editor instances for testing.
 * Uses the same serialization logic as the markdown worker.
 */

import { unified } from "unified";
import remarkStringify from "remark-stringify";
import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
import { KEYS, type TElement, type Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';
import {
  defaultRules,
  convertNodesSerialize,
  type MdRules,
} from "@platejs/markdown";

import { BaseKit, RichTextKit, FullKit } from '../plugins/presets';
import {
  serializationRules,
  toMarkdownPluginRules,
  parseMarkdownToPlate,
} from '@hands/core/primitives/serialization';

// ============================================================================
// Serialization Setup (mirrors markdown.worker.ts)
// ============================================================================

const customRules = toMarkdownPluginRules(serializationRules);
const mergedRules = {
  ...defaultRules,
  ...customRules,
} as MdRules;

const typeToKeyMap: Record<string, string> = {};

const editorShim = {
  plugins: {} as Record<string, { key: string; node?: { type?: string } }>,
  pluginList: [] as { key: string; node?: { type?: string } }[],
  meta: {
    pluginCache: {
      node: { types: typeToKeyMap, isContainer: [] },
      decorate: [],
      handlers: { onChange: [] },
    },
    pluginList: [],
    shortcuts: {},
    components: {},
  },
  getPlugin: ({ key }: { key: string }) => ({ key, node: { type: key } }),
  getType: (key: string) => key,
  children: [],
  getOptions: () => ({
    rules: mergedRules,
    remarkPlugins: [remarkGfm, remarkMdx],
  }),
};

// Register known Plate types
// Note: Include both new (disc/decimal) and classic (ul/ol) list keys
// The markdown serializer uses classic keys (ul/ol)
const knownTypes = [
  KEYS.p, KEYS.blockquote, KEYS.codeBlock, KEYS.codeLine,
  KEYS.h1, KEYS.h2, KEYS.h3, KEYS.h4, KEYS.h5, KEYS.h6,
  KEYS.ul, KEYS.ol, KEYS.li, KEYS.lic,
  KEYS.ulClassic, KEYS.olClassic, // Classic list keys for markdown serialization
  KEYS.hr, KEYS.a, KEYS.img,
  KEYS.table, KEYS.tr, KEYS.td, KEYS.th,
  KEYS.column, KEYS.columnGroup,
  KEYS.bold, KEYS.italic, KEYS.code, KEYS.strikethrough, KEYS.underline,
];

for (const key of knownTypes) {
  if (key) {
    editorShim.plugins[key] = { key, node: { type: key } };
    typeToKeyMap[key] = key;
  }
}

for (const rule of serializationRules) {
  if (rule.key) {
    editorShim.plugins[rule.key] = { key: rule.key, node: { type: rule.key } };
    typeToKeyMap[rule.key] = rule.key;
  }
}

const serializeOptions = {
  editor: editorShim as any,
  rules: mergedRules,
  convertNodes: (children: any[], opts: any) => convertNodesSerialize(children, opts, true),
};

// ============================================================================
// Test Markdown API (same logic as worker)
// ============================================================================

/**
 * Deserialize MDX to Plate Value (same as worker)
 */
export function testDeserialize(markdown: string): Value {
  return parseMarkdownToPlate(markdown);
}

/**
 * Serialize Plate Value to MDX (same as worker)
 */
export function testSerialize(value: Value): string {
  const mdastChildren = convertNodesSerialize(value, serializeOptions, true);
  const mdast = { type: "root", children: mdastChildren };

  return unified()
    .use(remarkGfm)
    .use(remarkMdx)
    .use(remarkStringify, {
      emphasis: "_",
      bullet: "-",
      fences: true,
      // Use incrementing numbers for ordered lists (1. 2. 3.)
      incrementListMarker: true,
    })
    .stringify(mdast as any);
}

// ============================================================================
// Test Editor Factory
// ============================================================================

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
 * For serialization tests, use testSerialize/testDeserialize instead of
 * editor.api.markdown - they use the same logic as the production worker.
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
