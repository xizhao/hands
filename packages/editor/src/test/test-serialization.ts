/**
 * Test Serialization Utilities
 *
 * Standalone serialization functions for testing.
 * Uses the same serialization logic as the markdown worker.
 *
 * This file is kept separate from create-test-editor.ts to avoid
 * transitive imports of web workers which break in vitest.
 */

import { unified } from "unified";
import remarkStringify from "remark-stringify";
import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
import { KEYS, type Value } from 'platejs';
import {
  defaultRules,
  convertNodesSerialize,
  type MdRules,
} from "@platejs/markdown";

import {
  serializationRules,
  toMarkdownPluginRules,
  parseMarkdownToPlate,
  convertIndentListsToClassic,
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
  // Convert indent-based lists to classic format before serializing
  const classicValue = convertIndentListsToClassic(value);

  const mdastChildren = convertNodesSerialize(classicValue, serializeOptions, true);

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
