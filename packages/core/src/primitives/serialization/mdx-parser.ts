/**
 * MDX Parser
 *
 * Shared MDX to Plate Value parser using @platejs/markdown.
 * Used by both the markdown worker (editor) and vite-plugin-workbook (runtime).
 */

import {
  convertChildrenDeserialize,
  convertNodesDeserialize,
  defaultRules,
  type MdRules,
} from "@platejs/markdown";
import { KEYS, type Value } from "platejs";
import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { serializationRules, toMarkdownPluginRules } from "./rules-registry";

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
  KEYS.p,
  KEYS.blockquote,
  KEYS.codeBlock,
  KEYS.codeLine,
  KEYS.h1,
  KEYS.h2,
  KEYS.h3,
  KEYS.h4,
  KEYS.h5,
  KEYS.h6,
  KEYS.ul,
  KEYS.ol,
  KEYS.li,
  KEYS.lic,
  KEYS.hr,
  KEYS.a,
  KEYS.img,
  KEYS.table,
  KEYS.tr,
  KEYS.td,
  KEYS.th,
  KEYS.column,
  KEYS.columnGroup,
  KEYS.bold,
  KEYS.italic,
  KEYS.code,
  KEYS.strikethrough,
  KEYS.underline,
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
// Preprocessing: Collapse Multi-line JSX Expressions
// =============================================================================

/**
 * Pre-process MDX to collapse multi-line JSX attribute expressions.
 *
 * remark-mdx with acorn cannot parse multi-line JavaScript expressions
 * in JSX attributes. This function collapses them to single-line.
 *
 * Example:
 * ```
 * <Select options={[
 *   { value: "1", label: "A" },
 *   { value: "2", label: "B" }
 * ]}>
 * ```
 * Becomes:
 * ```
 * <Select options={[{ value: "1", label: "A" }, { value: "2", label: "B" }]}>
 * ```
 */
function collapseMultilineJsxExpressions(source: string): string {
  // Match JSX attribute expressions: name={...content...}
  // This regex finds attributes where the expression spans multiple lines
  // Pattern: word={  followed by content  followed by }
  // We need to handle nested braces correctly

  let result = source;
  let match: RegExpExecArray | null;

  // Find all attribute expressions: name={...}
  // This regex matches the start of an expression attribute
  const attrStartRegex = /(\w+)=\{/g;

  while ((match = attrStartRegex.exec(result)) !== null) {
    const startIndex = match.index + match[0].length - 1; // Position of opening {

    // Find matching closing brace, accounting for nesting
    let depth = 1;
    let endIndex = startIndex + 1;
    let hasNewline = false;

    while (depth > 0 && endIndex < result.length) {
      const char = result[endIndex];
      if (char === "{") depth++;
      else if (char === "}") depth--;
      else if (char === "\n") hasNewline = true;
      endIndex++;
    }

    // If we found a multi-line expression, collapse it
    if (hasNewline && depth === 0) {
      const exprContent = result.slice(startIndex + 1, endIndex - 1);
      // Collapse to single line: remove newlines and normalize whitespace
      const collapsed = exprContent
        .replace(/\n\s*/g, " ") // Replace newlines and following whitespace with single space
        .replace(/\s+/g, " ") // Collapse multiple spaces
        .trim();

      // Replace in result
      const before = result.slice(0, startIndex + 1);
      const after = result.slice(endIndex - 1);
      result = before + collapsed + after;

      // Reset regex lastIndex since we modified the string
      attrStartRegex.lastIndex = startIndex + collapsed.length + 2;
    }
  }

  return result;
}

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
    // Pre-process: collapse multi-line JSX expressions
    // This fixes remark-mdx/acorn failing on multi-line attribute values
    const preprocessed = collapseMultilineJsxExpressions(content);

    // Parse MDX to mdast
    const mdast = unified().use(remarkParse).use(remarkGfm).use(remarkMdx).parse(preprocessed);

    // Convert mdast to Plate Value using @platejs/markdown
    const value = convertNodesDeserialize(
      (mdast as any).children || [],
      {},
      deserializeOptions,
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
  // Pre-process: collapse multi-line JSX expressions
  // This fixes remark-mdx/acorn failing on multi-line attribute values
  const preprocessed = collapseMultilineJsxExpressions(markdown);

  const mdast = unified().use(remarkParse).use(remarkGfm).use(remarkMdx).parse(preprocessed);

  return convertNodesDeserialize((mdast as any).children || [], {}, deserializeOptions) as Value;
}

// =============================================================================
// Exports for advanced usage
// =============================================================================

export { mergedRules, deserializeOptions, editorShim };
