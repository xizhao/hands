/**
 * MDX Parser
 *
 * Converts MDX source to Plate editor value.
 * Uses remark for MDX parsing, then transforms mdast to Plate nodes.
 */

import remarkFrontmatter from "remark-frontmatter";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";
import type { TElement, Value } from "platejs";
import type { Root, Content, Heading, Paragraph, Blockquote, Code, List, ListItem, Text, InlineCode, Strong, Emphasis, Link, Image, ThematicBreak } from "mdast";
import type { MdxJsxFlowElement, MdxJsxTextElement, MdxJsxAttribute, MdxJsxExpressionAttribute } from "mdast-util-mdx-jsx";

import type { SourceLocation } from "../ast/oxc-parser";
import { parseFrontmatter } from "./frontmatter";
import type {
  MdxFrontmatter,
  MdxParseResult,
  MdxSourceMap,
  MdxToPlateOptions,
  RscBlockElement,
  RscBlockInfo,
  CodeBlockElement,
} from "./types";

// ============================================================================
// MDX AST Types
// ============================================================================

type MdastNode = Content | Root;
type MdxJsxElement = MdxJsxFlowElement | MdxJsxTextElement;

// ============================================================================
// Parser Setup
// ============================================================================

const mdxProcessor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ["yaml"])
  .use(remarkMdx);

// ============================================================================
// Main Parser
// ============================================================================

/**
 * Parse MDX source into Plate editor value
 *
 * @param source - MDX source string
 * @param options - Parse options
 * @returns Parsed result with Plate value, frontmatter, and source map
 */
export function parseMdx(source: string, options: MdxToPlateOptions = {}): MdxParseResult {
  const errors: string[] = [];
  const rscBlocks: RscBlockInfo[] = [];
  const nodeLocations = new Map<string, SourceLocation>();

  // Parse frontmatter
  const { frontmatter, loc: frontmatterLoc, contentStart, error: fmError } = parseFrontmatter(source);
  if (fmError) {
    errors.push(`Frontmatter: ${fmError}`);
  }

  // Parse MDX content
  let mdast: Root;
  try {
    mdast = mdxProcessor.parse(source) as Root;
  } catch (err) {
    errors.push(`MDX parse error: ${err instanceof Error ? err.message : String(err)}`);
    return {
      frontmatter,
      value: [{ type: "p", children: [{ text: "" }] }],
      sourceMap: {
        frontmatter: frontmatterLoc ?? undefined,
        contentStart,
        nodes: nodeLocations,
      },
      rscBlocks,
      errors,
    };
  }

  // Transform mdast to Plate value
  let nodeCounter = 0;
  const generateId = (prefix: string) => `${prefix}_${nodeCounter++}`;

  const value: Value = [];

  // Calculate starting line (after frontmatter)
  let prevEndLine = 0;
  if (frontmatterLoc) {
    // Find the line number after frontmatter ends
    const frontmatterText = source.slice(0, frontmatterLoc.end);
    prevEndLine = frontmatterText.split("\n").length;
  }

  const ctx: ConversionContext = {
    generateId,
    nodeLocations,
    rscBlocks,
    options,
    source,
    errors,
    prevEndLine,
  };

  for (const node of mdast.children) {
    // Skip frontmatter node (already parsed separately)
    if (node.type === "yaml") {
      // Update prevEndLine to after frontmatter
      if (node.position) {
        ctx.prevEndLine = node.position.end.line;
      }
      continue;
    }

    const plateNode = mdastNodeToPlate(node, ctx);

    if (plateNode) {
      if (Array.isArray(plateNode)) {
        value.push(...plateNode);
      } else {
        value.push(plateNode);
      }
    }

    // Update prevEndLine for next iteration
    if (node.position) {
      ctx.prevEndLine = node.position.end.line;
    }
  }

  // Ensure at least one paragraph if empty
  if (value.length === 0) {
    value.push({ type: "p", children: [{ text: "" }] });
  }

  return {
    frontmatter,
    value,
    sourceMap: {
      frontmatter: frontmatterLoc ?? undefined,
      contentStart,
      nodes: nodeLocations,
    },
    rscBlocks,
    errors,
  };
}

// ============================================================================
// MDAST to Plate Conversion
// ============================================================================

interface ConversionContext {
  generateId: (prefix: string) => string;
  nodeLocations: Map<string, SourceLocation>;
  rscBlocks: RscBlockInfo[];
  options: MdxToPlateOptions;
  source: string;
  errors: string[];
  /** End line of previous node, for calculating blank lines */
  prevEndLine: number;
}

/**
 * Calculate number of blank lines before a node
 * (gap between previous end line and this start line, minus 1 for the node itself)
 */
function calcBlankLinesBefore(node: MdastNode, ctx: ConversionContext): number {
  if (!node.position) return 0;
  const startLine = node.position.start.line;
  const gap = startLine - ctx.prevEndLine - 1;
  return Math.max(0, gap);
}

function mdastNodeToPlate(
  node: MdastNode,
  ctx: ConversionContext,
): TElement | TElement[] | null {
  switch (node.type) {
    case "heading":
      return headingToPlate(node as Heading, ctx);

    case "paragraph":
      return paragraphToPlate(node as Paragraph, ctx);

    case "blockquote":
      return blockquoteToPlate(node as Blockquote, ctx);

    case "code":
      return codeBlockToPlate(node as Code, ctx);

    case "list":
      return listToPlate(node as List, ctx);

    case "thematicBreak":
      return thematicBreakToPlate(node as ThematicBreak, ctx);

    case "mdxJsxFlowElement":
      return jsxElementToPlate(node as MdxJsxFlowElement, ctx);

    case "mdxJsxTextElement":
      // Text-level JSX in a paragraph context - wrap in paragraph
      const jsxPlate = jsxElementToPlate(node as MdxJsxTextElement, ctx);
      return jsxPlate;

    default:
      // Unknown node type - skip with warning
      ctx.errors.push(`Unknown mdast node type: ${node.type}`);
      return null;
  }
}

// ============================================================================
// Individual Node Converters
// ============================================================================

function headingToPlate(node: Heading, ctx: ConversionContext): TElement {
  const id = ctx.generateId("h");
  const type = `h${node.depth}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  const blankLinesBefore = calcBlankLinesBefore(node, ctx);

  if (node.position) {
    ctx.nodeLocations.set(id, {
      start: node.position.start.offset ?? 0,
      end: node.position.end.offset ?? 0,
    });
  }

  return {
    type,
    id,
    _blankLinesBefore: blankLinesBefore,
    children: inlineNodesToPlate(node.children, ctx),
  };
}

function paragraphToPlate(node: Paragraph, ctx: ConversionContext): TElement | TElement[] {
  const id = ctx.generateId("p");
  const blankLinesBefore = calcBlankLinesBefore(node, ctx);

  if (node.position) {
    ctx.nodeLocations.set(id, {
      start: node.position.start.offset ?? 0,
      end: node.position.end.offset ?? 0,
    });
  }

  // Check if paragraph contains only a JSX element
  const firstChild = node.children[0] as { type: string };
  if (node.children.length === 1 && (firstChild.type === "mdxJsxTextElement" || firstChild.type === "mdxJsxFlowElement")) {
    const jsxElement = jsxElementToPlate(node.children[0] as MdxJsxElement, ctx, blankLinesBefore);
    if (jsxElement) return jsxElement;
  }

  return {
    type: "p",
    id,
    _blankLinesBefore: blankLinesBefore,
    children: inlineNodesToPlate(node.children, ctx),
  };
}

function blockquoteToPlate(node: Blockquote, ctx: ConversionContext): TElement {
  const id = ctx.generateId("bq");
  const blankLinesBefore = calcBlankLinesBefore(node, ctx);

  if (node.position) {
    ctx.nodeLocations.set(id, {
      start: node.position.start.offset ?? 0,
      end: node.position.end.offset ?? 0,
    });
  }

  // Blockquote children are paragraphs - extract text from first paragraph
  const firstPara = node.children[0];
  const children = firstPara && firstPara.type === "paragraph"
    ? inlineNodesToPlate((firstPara as Paragraph).children, ctx)
    : [{ text: "" }];

  return {
    type: "blockquote",
    id,
    _blankLinesBefore: blankLinesBefore,
    children,
  };
}

function codeBlockToPlate(node: Code, ctx: ConversionContext): TElement {
  const id = ctx.generateId("code");
  const blankLinesBefore = calcBlankLinesBefore(node, ctx);

  if (node.position) {
    ctx.nodeLocations.set(id, {
      start: node.position.start.offset ?? 0,
      end: node.position.end.offset ?? 0,
    });
  }

  const codeBlock: CodeBlockElement & { _blankLinesBefore: number } = {
    type: "code-block",
    id,
    _blankLinesBefore: blankLinesBefore,
    language: node.lang ?? undefined,
    code: node.value,
    children: [{ text: "" }],
  };

  return codeBlock;
}

function listToPlate(node: List, ctx: ConversionContext): TElement[] {
  const elements: TElement[] = [];
  const blankLinesBefore = calcBlankLinesBefore(node, ctx);

  let isFirst = true;
  for (const item of node.children) {
    if (item.type === "listItem") {
      const listItemElements = listItemToPlate(item as ListItem, node.ordered ?? false, ctx, isFirst ? blankLinesBefore : 0);
      elements.push(...listItemElements);
      isFirst = false;
    }
  }

  return elements;
}

function listItemToPlate(node: ListItem, ordered: boolean, ctx: ConversionContext, blankLinesBefore: number = 0): TElement[] {
  const elements: TElement[] = [];
  const id = ctx.generateId("li");

  if (node.position) {
    ctx.nodeLocations.set(id, {
      start: node.position.start.offset ?? 0,
      end: node.position.end.offset ?? 0,
    });
  }

  // Extract content from list item children
  let isFirst = true;
  for (const child of node.children) {
    if (child.type === "paragraph") {
      const para = child as Paragraph;
      // Create a paragraph with bullet/number prefix (simplified for now)
      elements.push({
        type: "p",
        id,
        _blankLinesBefore: isFirst ? blankLinesBefore : 0,
        children: [
          { text: ordered ? "• " : "• " }, // TODO: proper list support
          ...inlineNodesToPlate(para.children, ctx),
        ],
      });
      isFirst = false;
    }
  }

  return elements;
}

function thematicBreakToPlate(node: ThematicBreak, ctx: ConversionContext): TElement {
  const id = ctx.generateId("hr");
  const blankLinesBefore = calcBlankLinesBefore(node, ctx);

  if (node.position) {
    ctx.nodeLocations.set(id, {
      start: node.position.start.offset ?? 0,
      end: node.position.end.offset ?? 0,
    });
  }

  return {
    type: "hr",
    id,
    _blankLinesBefore: blankLinesBefore,
    children: [{ text: "" }],
  };
}

function jsxElementToPlate(node: MdxJsxElement, ctx: ConversionContext, parentBlankLines?: number): TElement | null {
  const id = ctx.generateId("jsx");
  const tagName = node.name ?? "Fragment";
  // Use parent's blank lines if provided, otherwise calculate
  const blankLinesBefore = parentBlankLines ?? calcBlankLinesBefore(node, ctx);

  if (node.position) {
    ctx.nodeLocations.set(id, {
      start: node.position.start.offset ?? 0,
      end: node.position.end.offset ?? 0,
    });
  }

  // Extract props from attributes
  const props: Record<string, unknown> = {};
  for (const attr of node.attributes) {
    if (attr.type === "mdxJsxAttribute") {
      const jsxAttr = attr as MdxJsxAttribute;
      const name = jsxAttr.name;
      const value = jsxAttr.value;

      if (value === null || value === undefined) {
        props[name] = true; // Boolean attribute
      } else if (typeof value === "string") {
        props[name] = value;
      } else if (value.type === "mdxJsxAttributeValueExpression") {
        // Expression value like prop={expression}
        props[name] = value.value;
      }
    } else if (attr.type === "mdxJsxExpressionAttribute") {
      // Spread attribute {...props}
      const exprAttr = attr as MdxJsxExpressionAttribute;
      props["...spread"] = exprAttr.value;
    }
  }

  // Check if this is an RSC Block (special <Block src="..."> syntax)
  // TODO: Consolidate rsc-block handling into @hands/core/blocks package
  // Currently scattered across:
  //   - editor/mdx/parser.ts (parse <Block> → rsc-block) ← YOU ARE HERE
  //   - editor/plate/plugins/markdown-kit.tsx (serialize rsc-block → <Block>)
  //   - runtime/components/PageStatic.tsx (render rsc-block in PlateStatic)
  if (tagName === "Block" && "src" in props) {
    const blockId = String(props.src);
    const rawSource = ctx.source.slice(
      node.position?.start.offset ?? 0,
      node.position?.end.offset ?? 0,
    );

    // Track RSC block info
    ctx.rscBlocks.push({
      id,
      src: blockId,
      props: Object.fromEntries(
        Object.entries(props).filter(([k]) => k !== "src"),
      ),
      loc: {
        start: node.position?.start.offset ?? 0,
        end: node.position?.end.offset ?? 0,
      },
      rawSource,
    });

    // Create RSC block element
    const rscBlock: RscBlockElement & { _blankLinesBefore: number } = {
      type: "rsc-block",
      id,
      _blankLinesBefore: blankLinesBefore,
      blockId,
      source: rawSource,
      blockProps: Object.fromEntries(
        Object.entries(props).filter(([k]) => k !== "src"),
      ),
      children: [{ text: "" }],
    };

    return rscBlock;
  }

  // Generic JSX element - render as custom component
  // This preserves the JSX structure for the element plugin to render
  return {
    type: tagName,
    id,
    _blankLinesBefore: blankLinesBefore,
    ...props,
    children: node.children && node.children.length > 0
      ? convertJsxChildren(node.children, ctx)
      : [{ text: "" }],
  };
}

function convertJsxChildren(children: MdastNode[], ctx: ConversionContext): Array<{ text: string } | TElement> {
  const result: Array<{ text: string } | TElement> = [];

  for (const child of children) {
    if (child.type === "text") {
      result.push({ text: (child as Text).value });
    } else if (child.type === "mdxJsxTextElement" || child.type === "mdxJsxFlowElement") {
      const element = jsxElementToPlate(child as MdxJsxElement, ctx);
      if (element) result.push(element);
    } else {
      // Try to convert other node types
      const converted = mdastNodeToPlate(child, ctx);
      if (converted) {
        if (Array.isArray(converted)) {
          result.push(...converted);
        } else {
          result.push(converted);
        }
      }
    }
  }

  // Ensure at least one text node
  if (result.length === 0) {
    result.push({ text: "" });
  }

  return result;
}

// ============================================================================
// Inline Content Conversion
// ============================================================================

type InlineNode = Text | InlineCode | Strong | Emphasis | Link | Image | MdxJsxTextElement;

function inlineNodesToPlate(
  nodes: (Content | InlineNode)[],
  ctx: ConversionContext,
): Array<{ text: string; bold?: boolean; italic?: boolean; code?: boolean; url?: string }> {
  const result: Array<{ text: string; bold?: boolean; italic?: boolean; code?: boolean; url?: string }> = [];

  for (const node of nodes) {
    const converted = inlineNodeToPlate(node as InlineNode, ctx);
    result.push(...converted);
  }

  // Ensure at least one text node
  if (result.length === 0) {
    result.push({ text: "" });
  }

  return result;
}

function inlineNodeToPlate(
  node: InlineNode | Content,
  ctx: ConversionContext,
  marks: { bold?: boolean; italic?: boolean; code?: boolean } = {},
): Array<{ text: string; bold?: boolean; italic?: boolean; code?: boolean; url?: string }> {
  switch (node.type) {
    case "text":
      return [{ text: (node as Text).value, ...marks }];

    case "inlineCode":
      return [{ text: (node as InlineCode).value, code: true, ...marks }];

    case "strong":
      const strongNode = node as Strong;
      const strongResult: Array<{ text: string; bold?: boolean; italic?: boolean; code?: boolean }> = [];
      for (const child of strongNode.children) {
        strongResult.push(...inlineNodeToPlate(child as InlineNode, ctx, { ...marks, bold: true }));
      }
      return strongResult;

    case "emphasis":
      const emNode = node as Emphasis;
      const emResult: Array<{ text: string; bold?: boolean; italic?: boolean; code?: boolean }> = [];
      for (const child of emNode.children) {
        emResult.push(...inlineNodeToPlate(child as InlineNode, ctx, { ...marks, italic: true }));
      }
      return emResult;

    case "link":
      const linkNode = node as Link;
      const linkResult: Array<{ text: string; bold?: boolean; italic?: boolean; code?: boolean; url?: string }> = [];
      for (const child of linkNode.children) {
        const converted = inlineNodeToPlate(child as InlineNode, ctx, marks);
        for (const item of converted) {
          linkResult.push({ ...item, url: linkNode.url });
        }
      }
      return linkResult;

    case "image":
      const imgNode = node as Image;
      return [{ text: `![${imgNode.alt ?? ""}](${imgNode.url})`, ...marks }];

    default:
      // Handle inline JSX or unknown nodes
      if ((node as any).type === "mdxJsxTextElement") {
        const jsxNode = node as MdxJsxTextElement;
        if (jsxNode.children && jsxNode.children.length > 0) {
          const jsxResult: Array<{ text: string; bold?: boolean; italic?: boolean; code?: boolean }> = [];
          for (const child of jsxNode.children) {
            jsxResult.push(...inlineNodeToPlate(child as InlineNode, ctx, marks));
          }
          return jsxResult;
        }
        return [{ text: `<${jsxNode.name ?? ""}/>`, ...marks }];
      }
      // Unknown inline node - return empty text
      return [{ text: "" }];
  }
}
