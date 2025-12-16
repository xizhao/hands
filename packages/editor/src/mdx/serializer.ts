/**
 * MDX Serializer
 *
 * Uses Plate's MarkdownPlugin for proper markdown serialization,
 * with custom handling for frontmatter and RSC blocks.
 */

import { MarkdownPlugin } from "@platejs/markdown";
import type { PlateEditor, Value } from "platejs/react";
import { serializeFrontmatter } from "./frontmatter";
import type { MdxFrontmatter, RscBlockElement } from "./types";

// ============================================================================
// Main Serializer
// ============================================================================

/**
 * Serialize Plate value to MDX source using Plate's MarkdownPlugin
 *
 * @param editor - Plate editor instance (must have MarkdownPlugin installed)
 * @param frontmatter - Frontmatter metadata
 * @returns MDX source string
 */
export function serializeMdxWithEditor(
  editor: PlateEditor,
  frontmatter: MdxFrontmatter = {},
): string {
  const lines: string[] = [];

  // Serialize frontmatter
  const frontmatterStr = serializeFrontmatter(frontmatter);
  if (frontmatterStr) {
    lines.push(frontmatterStr.trim());
    lines.push(""); // Blank line after frontmatter
  }

  // Use Plate's MarkdownPlugin serializer
  const api = editor.getApi(MarkdownPlugin);
  const markdown = api.markdown.serialize();

  lines.push(markdown.trim());

  return lines.join("\n") + "\n";
}

/**
 * Legacy serializer - kept for compatibility but prefer serializeMdxWithEditor
 * @deprecated Use serializeMdxWithEditor instead
 */
export function serializeMdx(
  value: Value,
  frontmatter: MdxFrontmatter = {},
): string {
  // This is a fallback that doesn't use MarkdownPlugin
  // It won't support all markdown features
  console.warn("[mdx-serializer] Using legacy serializer - consider using serializeMdxWithEditor");

  const lines: string[] = [];

  // Serialize frontmatter
  const frontmatterStr = serializeFrontmatter(frontmatter);
  if (frontmatterStr) {
    lines.push(frontmatterStr.trim());
    lines.push(""); // Blank line after frontmatter
  }

  // Simple fallback serialization
  for (const element of value) {
    const serialized = serializeElementFallback(element);
    if (serialized) {
      lines.push(serialized);
    }
  }

  return lines.join("\n").trim() + "\n";
}

// ============================================================================
// Fallback Element Serialization (for legacy use)
// ============================================================================

function serializeElementFallback(element: any): string | null {
  const type = element.type as string;

  switch (type) {
    case "h1":
      return `# ${getTextContent(element.children)}`;
    case "h2":
      return `## ${getTextContent(element.children)}`;
    case "h3":
      return `### ${getTextContent(element.children)}`;
    case "p":
      return getTextContent(element.children);
    case "blockquote":
      return `> ${getTextContent(element.children)}`;
    case "hr":
      return "---";
    case "rsc-block":
      return serializeRscBlock(element as RscBlockElement);
    case "img":
      return `![${element.alt || ""}](${element.url || ""})`;
    default:
      // For unknown types, try to get text content
      if (element.children) {
        return getTextContent(element.children);
      }
      return null;
  }
}

function serializeRscBlock(element: RscBlockElement): string {
  // Don't use preserved source if editing (need to serialize the editing attribute)
  if (element.source && !element.editing) {
    return element.source;
  }

  const attrs: string[] = [];

  // Add src if we have a blockId
  if (element.blockId) {
    attrs.push(`src="${element.blockId}"`);
  }

  // Add editing attribute if true
  if (element.editing) {
    attrs.push("editing");
  }

  // Add additional props
  for (const [key, value] of Object.entries(element.blockProps || {})) {
    const formatted = formatProp(key, value);
    if (formatted) attrs.push(formatted);
  }

  const attrsStr = attrs.length > 0 ? ` ${attrs.join(" ")}` : "";
  return `<Block${attrsStr} />`;
}

function getTextContent(children: any[]): string {
  if (!children) return "";
  return children
    .map((child) => {
      if (typeof child.text === "string") {
        return serializeTextNode(child);
      }
      if (child.children) {
        return getTextContent(child.children);
      }
      return "";
    })
    .join("");
}

function serializeTextNode(node: {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
}): string {
  let text = node.text;
  if (!text) return "";

  if (node.code) text = `\`${text}\``;
  if (node.bold) text = `**${text}**`;
  if (node.italic) text = `*${text}*`;
  if (node.strikethrough) text = `~~${text}~~`;

  return text;
}

function formatProp(key: string, value: unknown): string {
  if (value === undefined || value === null) return "";
  if (value === true) return key;
  if (value === false) return "";
  if (typeof value === "string") return `${key}="${value.replace(/"/g, '\\"')}"`;
  if (typeof value === "number") return `${key}={${value}}`;
  return `${key}={${JSON.stringify(value)}}`;
}
