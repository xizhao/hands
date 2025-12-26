/**
 * Markdown Worker - handles serialization off main thread
 *
 * Uses Plate's markdown serialization with minimal shim.
 * This avoids duplicating Plate's logic while keeping serialization off the main thread.
 */

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
import {
  defaultRules,
  convertNodesSerialize,
  convertNodesDeserialize,
  type MdRules,
} from "@platejs/markdown";
import { KEYS } from "platejs";
import { serializationRules, toMarkdownPluginRules } from "@hands/core/primitives/serialization";

// ============================================================================
// Build Combined Rules
// ============================================================================

// Merge Plate's default rules with our custom stdlib rules
const customRules = toMarkdownPluginRules(serializationRules);
const mergedRules = {
  ...defaultRules,
  ...customRules,
} as MdRules;

console.log("[MarkdownWorker] Merged rules:", Object.keys(mergedRules).length, "total");
console.log("[MarkdownWorker] Custom rules:", Object.keys(customRules).join(", "));

// ============================================================================
// Minimal Editor Shim
// ============================================================================

/**
 * Minimal editor shim that satisfies Plate's serialization functions.
 *
 * Plate's convertNodesSerialize uses getPluginType(editor, key) to look up
 * element types. For standard elements, this just returns the key itself.
 * We shim this to avoid needing a full editor instance.
 */
// Build type-to-key mapping for getPluginKey lookups
// For standard plugins, type === key
const typeToKeyMap: Record<string, string> = {};

const editorShim = {
  // Plugin registry - maps plugin keys to their types
  plugins: {} as Record<string, { key: string; node?: { type?: string } }>,
  pluginList: [] as { key: string; node?: { type?: string } }[],

  // Meta object containing plugin cache (used by getPluginKey)
  // getPluginKey accesses: editor.meta.pluginCache.node.types[type]
  meta: {
    pluginCache: {
      node: {
        types: typeToKeyMap,
        isContainer: [],
      },
      decorate: [],
      handlers: { onChange: [] },
    },
    pluginList: [],
    shortcuts: {},
    components: {},
  },

  // getPlugin mock - returns plugin by key
  getPlugin: ({ key }: { key: string }) => ({
    key,
    node: { type: key },
  }),

  // Method used by getPluginType internally
  getType: (key: string) => key,

  // Children (used for serialization, we pass explicitly)
  children: [],

  // getOptions mock for MarkdownPlugin options lookup
  getOptions: () => ({
    rules: mergedRules,
    remarkPlugins: [remarkGfm, remarkMdx],
  }),
};

// Populate plugins and type map for all known types
const knownTypes = [
  KEYS.p, KEYS.blockquote, KEYS.codeBlock, KEYS.codeLine,
  KEYS.h1, KEYS.h2, KEYS.h3, KEYS.h4, KEYS.h5, KEYS.h6,
  KEYS.ul, KEYS.ol, KEYS.li, KEYS.lic,
  KEYS.hr, KEYS.a, KEYS.img,
  KEYS.table, KEYS.tr, KEYS.td, KEYS.th,
  KEYS.column, KEYS.columnGroup,
  KEYS.bold, KEYS.italic, KEYS.code, KEYS.strikethrough, KEYS.underline,
];

for (const key of knownTypes) {
  if (key) {
    editorShim.plugins[key] = { key, node: { type: key } };
    typeToKeyMap[key] = key; // type -> key mapping
  }
}

// Also register all custom rule types from our stdlib
for (const rule of serializationRules) {
  if (rule.key) {
    editorShim.plugins[rule.key] = { key: rule.key, node: { type: rule.key } };
    typeToKeyMap[rule.key] = rule.key;
  }
}

// ============================================================================
// Serialization Options
// ============================================================================

const serializeOptions = {
  editor: editorShim as any,
  rules: mergedRules,
};

const deserializeOptions = {
  editor: editorShim as any,
  rules: mergedRules,
};

// ============================================================================
// Message Handler
// ============================================================================

let isReady = true;
self.postMessage({ type: "ready" });

self.onmessage = (e) => {
  const { id, type, value, markdown } = e.data;

  if (!isReady) {
    self.postMessage({ id, type: "error", error: "Not ready" });
    return;
  }

  try {
    if (type === "serialize") {
      // Use Plate's convertNodesSerialize with our shim
      const mdastChildren = convertNodesSerialize(value, serializeOptions, true);
      const mdast = { type: "root", children: mdastChildren };

      const result = unified()
        .use(remarkGfm)
        .use(remarkMdx)
        .use(remarkStringify, { emphasis: "_", bullet: "-", fences: true })
        .stringify(mdast as any);

      self.postMessage({ id, type: "serialize", result });
    } else if (type === "deserialize") {
      const mdast = unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkMdx)
        .parse(markdown);

      // Use Plate's convertNodesDeserialize with our shim
      const result = convertNodesDeserialize(
        (mdast as any).children || [],
        {},
        deserializeOptions
      );

      self.postMessage({ id, type: "deserialize", result });
    }
  } catch (err) {
    console.error("[MarkdownWorker] Error:", err);
    self.postMessage({ id, type: "error", error: String(err) });
  }
};
