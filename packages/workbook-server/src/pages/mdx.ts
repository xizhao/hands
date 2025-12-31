/**
 * MDX Compilation for Runtime
 *
 * Parses MDX pages and extracts block references.
 * Uses the same remark-based parsing as the editor for consistency.
 */

import type { Root } from "mdast";
import type { MdxJsxAttribute, MdxJsxFlowElement, MdxJsxTextElement } from "mdast-util-mdx-jsx";
import remarkFrontmatter from "remark-frontmatter";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";

// ============================================================================
// Types
// ============================================================================

export interface PageMeta {
  title: string;
  description?: string;
  layout?: string;
  [key: string]: unknown;
}

export interface BlockReference {
  /** Block ID (from src prop) */
  id: string;
  /** Additional props passed to the block */
  props: Record<string, unknown>;
  /** Position in source for replacement */
  position?: {
    start: number;
    end: number;
  };
}

export interface CompiledPage {
  /** Page metadata from frontmatter */
  meta: PageMeta;
  /** Markdown content (without frontmatter) */
  content: string;
  /** Raw source */
  source: string;
  /** Block references found in the page */
  blocks: BlockReference[];
  /** Parse errors */
  errors: string[];
}

// ============================================================================
// Parser Setup
// ============================================================================

const mdxProcessor = unified().use(remarkParse).use(remarkFrontmatter, ["yaml"]).use(remarkMdx);

// ============================================================================
// Main Compiler
// ============================================================================

/**
 * Compile a markdown/MDX page
 *
 * Extracts frontmatter, parses content, and finds Block references.
 *
 * @param source - Raw MDX source
 */
export function compilePage(source: string): CompiledPage {
  const errors: string[] = [];
  const blocks: BlockReference[] = [];

  // Extract frontmatter
  const { meta, content, contentStart } = extractFrontmatter(source);

  // Parse MDX to find Block elements
  try {
    const mdast = mdxProcessor.parse(source) as Root;

    // Walk AST to find Block elements
    function walk(node: any): void {
      if (node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") {
        const jsxNode = node as MdxJsxFlowElement | MdxJsxTextElement;

        if (jsxNode.name === "Block") {
          const blockRef = extractBlockReference(jsxNode);
          if (blockRef) {
            blocks.push(blockRef);
          }
        }
      }

      // Recurse into children
      if (node.children && Array.isArray(node.children)) {
        for (const child of node.children) {
          walk(child);
        }
      }
    }

    for (const child of mdast.children) {
      walk(child);
    }
  } catch (err) {
    errors.push(`MDX parse error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    meta: {
      title: (meta.title as string) || "Untitled",
      description: meta.description as string | undefined,
      ...meta,
    },
    content,
    source,
    blocks,
    errors,
  };
}

/**
 * Extract block reference from JSX element
 */
function extractBlockReference(node: MdxJsxFlowElement | MdxJsxTextElement): BlockReference | null {
  const props: Record<string, unknown> = {};
  let src: string | null = null;

  for (const attr of node.attributes) {
    if (attr.type === "mdxJsxAttribute") {
      const jsxAttr = attr as MdxJsxAttribute;
      const name = jsxAttr.name;
      const value = jsxAttr.value;

      if (name === "src") {
        src = typeof value === "string" ? value : null;
      } else if (value === null || value === undefined) {
        props[name] = true;
      } else if (typeof value === "string") {
        props[name] = value;
      } else if (value.type === "mdxJsxAttributeValueExpression") {
        // Try to parse expression value
        props[name] = parseExpressionValue(value.value);
      }
    }
  }

  if (!src) return null;

  return {
    id: src,
    props,
    position: node.position
      ? {
          start: node.position.start.offset ?? 0,
          end: node.position.end.offset ?? 0,
        }
      : undefined,
  };
}

/**
 * Parse a JSX expression value
 */
function parseExpressionValue(expr: string): unknown {
  const trimmed = expr.trim();

  // Boolean
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;

  // Number
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return parseFloat(trimmed);
  }

  // Null/undefined
  if (trimmed === "null") return null;
  if (trimmed === "undefined") return undefined;

  // Try JSON parse for arrays/objects
  try {
    return JSON.parse(trimmed);
  } catch {
    // Return as string if can't parse
    return trimmed;
  }
}

// ============================================================================
// Frontmatter Extraction
// ============================================================================

/**
 * Extract frontmatter from source
 */
function extractFrontmatter(source: string): {
  meta: Record<string, unknown>;
  content: string;
  contentStart: number;
} {
  if (!source.startsWith("---")) {
    return { meta: {}, content: source, contentStart: 0 };
  }

  const endIndex = source.indexOf("---", 3);
  if (endIndex === -1) {
    return { meta: {}, content: source, contentStart: 0 };
  }

  const frontmatterStr = source.slice(3, endIndex).trim();
  const contentStart = endIndex + 3;
  const content = source.slice(contentStart).trim();

  // Parse simple YAML
  const meta: Record<string, unknown> = {};

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

    meta[key] = value;
  }

  return { meta, content, contentStart };
}

/**
 * Get the raw content for a block reference (for editor source sync)
 */
export function getBlockSource(source: string, block: BlockReference): string {
  if (!block.position) return "";
  return source.slice(block.position.start, block.position.end);
}
