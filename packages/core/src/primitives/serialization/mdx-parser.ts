/**
 * MDX Parser
 *
 * Shared MDX to Plate Value parser using @platejs/markdown.
 * Used by both the markdown worker (editor) and vite-plugin-workbook (runtime).
 */

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
import {
  defaultRules,
  convertNodesDeserialize,
  convertChildrenDeserialize,
  type MdRules,
} from "@platejs/markdown";
import { KEYS, type Value } from "platejs";

// Import rules directly to avoid circular dependency with index.ts
import type { MdxSerializationRule } from "./types";
import { liveValueRule, liveValueInlineRule, liveQueryRule } from "./rules/live-value";
import { liveActionRules } from "./rules/live-action";
import { chartRules } from "./rules/charts";
import { kanbanRules } from "./rules/kanban";
import { dataGridRules } from "./rules/data-grid";
import { viewRules } from "./rules/view";
import { cardRules } from "./rules/card";
import { columnRules } from "./rules/column";
import { blockRules } from "./rules/block";
import { tabsRules } from "./rules/tabs";

// Inline the rules array to avoid circular import
const serializationRules: MdxSerializationRule<any>[] = [
  liveValueRule,
  liveValueInlineRule,
  liveQueryRule,
  ...liveActionRules,
  ...chartRules,
  ...kanbanRules,
  ...dataGridRules,
  ...viewRules,
  ...cardRules,
  ...columnRules,
  ...blockRules,
  ...tabsRules,
];

// Inline toMarkdownPluginRules to avoid circular import
function toMarkdownPluginRules(rules: MdxSerializationRule<any>[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const rule of rules) {
    result[rule.tagName] = { deserialize: rule.deserialize };
    if (rule.key !== rule.tagName) {
      result[rule.key] = { serialize: rule.serialize };
    } else {
      (result[rule.tagName] as Record<string, unknown>).serialize = rule.serialize;
    }
  }
  return result;
}

// =============================================================================
// Editor Shim for @platejs/markdown
// =============================================================================

// Build combined rules - merge Plate defaults with our custom stdlib rules
const customRules = toMarkdownPluginRules(serializationRules);
const mergedRules = {
  ...defaultRules,
  ...customRules,
} as MdRules;

// Build type-to-key mapping for Plate's getPluginKey lookups
const typeToKeyMap: Record<string, string> = {};

// Minimal editor shim for @platejs/markdown deserialization
const editorShim = {
  // Add 'list' plugin marker so deserializer outputs indent-based format
  plugins: { list: true } as Record<string, unknown>,
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
    typeToKeyMap[key] = key;
  }
}

// Register custom stdlib types
for (const rule of serializationRules) {
  if (rule.key) {
    editorShim.plugins[rule.key] = { key: rule.key, node: { type: rule.key } };
    typeToKeyMap[rule.key] = rule.key;
  }
}

const deserializeOptions = {
  editor: editorShim as any,
  rules: mergedRules,
  convertChildren: (children: any[], deco: any, opts: any) =>
    convertChildrenDeserialize(children, deco, opts),
};

// =============================================================================
// Frontmatter Extraction
// =============================================================================

/**
 * Extract frontmatter from MDX source
 */
export function extractFrontmatter(source: string): {
  frontmatter: Record<string, unknown>;
  content: string;
} {
  if (!source.startsWith("---")) {
    return { frontmatter: {}, content: source };
  }

  const endIndex = source.indexOf("---", 3);
  if (endIndex === -1) {
    return { frontmatter: {}, content: source };
  }

  const frontmatterStr = source.slice(3, endIndex).trim();
  const content = source.slice(endIndex + 3).trim();

  // Parse simple YAML
  const frontmatter: Record<string, unknown> = {};
  for (const line of frontmatterStr.split("\n")) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value: string | boolean | number = line.slice(colonIndex + 1).trim();

    // Remove quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Parse booleans and numbers
    if (value === "true") value = true;
    else if (value === "false") value = false;
    else if (/^-?\d+(\.\d+)?$/.test(value)) {
      value = parseFloat(value);
    }

    frontmatter[key] = value;
  }

  return { frontmatter, content };
}

// =============================================================================
// MDX Parser
// =============================================================================

export interface ParseMdxResult {
  frontmatter: Record<string, unknown>;
  value: Value;
  errors: string[];
}

/**
 * Parse MDX source to Plate Value format
 */
export function parseMdxToPlate(source: string): ParseMdxResult {
  const errors: string[] = [];
  const { frontmatter, content } = extractFrontmatter(source);

  try {
    // Parse MDX to mdast
    const mdast = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkMdx)
      .parse(content);

    // Convert mdast to Plate Value using @platejs/markdown
    const value = convertNodesDeserialize(
      (mdast as any).children || [],
      {},
      deserializeOptions
    ) as Value;

    return { frontmatter, value, errors };
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
    return {
      frontmatter,
      value: [{ type: "p", children: [{ text: `Parse error: ${errors[0]}` }] }],
      errors,
    };
  }
}

/**
 * Parse markdown/MDX content to Plate Value (without frontmatter extraction)
 */
export function parseMarkdownToPlate(markdown: string): Value {
  const mdast = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMdx)
    .parse(markdown);

  return convertNodesDeserialize(
    (mdast as any).children || [],
    {},
    deserializeOptions
  ) as Value;
}

// =============================================================================
// Exports for advanced usage
// =============================================================================

export { mergedRules, deserializeOptions, editorShim };
