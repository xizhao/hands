/**
 * MDX Serializer
 *
 * Converts Plate editor value back to MDX source.
 */

import type { TElement, Value } from "platejs";
import { serializeFrontmatter } from "./frontmatter";
import type {
  CodeBlockElement,
  MdxFrontmatter,
  PlateToMdxOptions,
  RscBlockElement,
} from "./types";
import { isCodeBlockElement, isRscBlockElement } from "./types";

// ============================================================================
// Main Serializer
// ============================================================================

/**
 * Serialize Plate value to MDX source
 *
 * @param value - Plate editor value
 * @param frontmatter - Frontmatter metadata
 * @param options - Serialization options
 * @returns MDX source string
 */
export function serializeMdx(
  value: Value,
  frontmatter: MdxFrontmatter = {},
  options: PlateToMdxOptions = {},
): string {
  const lines: string[] = [];

  // Serialize frontmatter
  const frontmatterStr = serializeFrontmatter(frontmatter);
  if (frontmatterStr) {
    lines.push(frontmatterStr.trim());
    lines.push(""); // Blank line after frontmatter
  }

  // Serialize content
  for (let i = 0; i < value.length; i++) {
    const element = value[i];
    const serialized = serializeElement(element, options);

    if (serialized !== null) {
      lines.push(serialized);

      // Add blank line between block elements (except for consecutive paragraphs)
      const nextElement = value[i + 1];
      if (nextElement && shouldAddBlankLine(element, nextElement)) {
        lines.push("");
      }
    }
  }

  return lines.join("\n").trim() + "\n";
}

// ============================================================================
// Element Serialization
// ============================================================================

function serializeElement(element: TElement, options: PlateToMdxOptions): string | null {
  const type = element.type as string;

  switch (type) {
    // Headings
    case "h1":
      return `# ${getTextContent(element.children)}`;
    case "h2":
      return `## ${getTextContent(element.children)}`;
    case "h3":
      return `### ${getTextContent(element.children)}`;
    case "h4":
      return `#### ${getTextContent(element.children)}`;
    case "h5":
      return `##### ${getTextContent(element.children)}`;
    case "h6":
      return `###### ${getTextContent(element.children)}`;

    // Paragraph
    case "p":
      return getTextContent(element.children);

    // Blockquote
    case "blockquote":
      return `> ${getTextContent(element.children)}`;

    // Horizontal rule
    case "hr":
      return "---";

    // Code block
    case "code-block":
      return serializeCodeBlock(element as CodeBlockElement);

    // RSC Block
    case "rsc-block":
      return serializeRscBlock(element as RscBlockElement);

    // Generic JSX element (custom component)
    default:
      return serializeJsxElement(element, options);
  }
}

function serializeCodeBlock(element: CodeBlockElement): string {
  const lang = element.language || "";
  const code = element.code || "";
  return `\`\`\`${lang}\n${code}\n\`\`\``;
}

function serializeRscBlock(element: RscBlockElement): string {
  // Use the stored raw source if available, otherwise reconstruct
  if (element.source) {
    return element.source;
  }

  // Reconstruct from props
  const props = Object.entries(element.blockProps || {})
    .map(([key, value]) => formatProp(key, value))
    .filter(Boolean)
    .join(" ");

  const propsStr = props ? ` ${props}` : "";
  return `<Block src="${element.blockId}"${propsStr} />`;
}

function serializeJsxElement(element: TElement, options: PlateToMdxOptions): string {
  const tagName = element.type as string;

  // Skip standard Plate node types that aren't JSX
  if (["p", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "hr", "code-block", "rsc-block"].includes(tagName)) {
    return "";
  }

  // Extract props (exclude internal Plate fields)
  const internalFields = new Set(["type", "id", "children", "isVoid"]);
  const props = Object.entries(element)
    .filter(([key]) => !internalFields.has(key))
    .map(([key, value]) => formatProp(key, value))
    .filter(Boolean)
    .join(" ");

  const propsStr = props ? ` ${props}` : "";
  const children = element.children;

  // Check if void/self-closing
  const hasContent =
    children &&
    children.length > 0 &&
    !(children.length === 1 && "text" in children[0] && children[0].text === "");

  if (!hasContent) {
    return `<${tagName}${propsStr} />`;
  }

  // Serialize children
  const childrenStr = serializeChildren(children, options);
  return `<${tagName}${propsStr}>${childrenStr}</${tagName}>`;
}

// ============================================================================
// Children Serialization
// ============================================================================

function serializeChildren(
  children: Array<{ text: string } | TElement>,
  options: PlateToMdxOptions,
): string {
  return children
    .map((child) => {
      if ("text" in child && typeof (child as any).text === "string") {
        return serializeTextNode(child as { text: string; bold?: boolean; italic?: boolean; code?: boolean; url?: string });
      }
      return serializeElement(child as TElement, options);
    })
    .filter((s) => s !== null)
    .join("");
}

function serializeTextNode(node: {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  url?: string;
}): string {
  let text = node.text;

  if (!text) return "";

  // Apply marks
  if (node.code) {
    text = `\`${text}\``;
  }
  if (node.bold) {
    text = `**${text}**`;
  }
  if (node.italic) {
    text = `*${text}*`;
  }
  if (node.url) {
    text = `[${text}](${node.url})`;
  }

  return text;
}

// ============================================================================
// Helpers
// ============================================================================

function getTextContent(children: Array<{ text: string } | TElement>): string {
  return children
    .map((child) => {
      if ("text" in child && typeof (child as any).text === "string") {
        return serializeTextNode(child as { text: string; bold?: boolean; italic?: boolean; code?: boolean; url?: string });
      }
      // Nested element - recursively get text
      if ("children" in child) {
        return getTextContent((child as TElement).children as Array<{ text: string } | TElement>);
      }
      return "";
    })
    .join("");
}

function formatProp(key: string, value: unknown): string {
  if (value === undefined || value === null) return "";
  if (value === true) return key;
  if (value === false) return "";

  if (typeof value === "string") {
    // Escape quotes in string values
    const escaped = value.replace(/"/g, '\\"');
    return `${key}="${escaped}"`;
  }

  if (typeof value === "number") {
    return `${key}={${value}}`;
  }

  // Complex values as JSX expressions
  return `${key}={${JSON.stringify(value)}}`;
}

function shouldAddBlankLine(current: TElement, next: TElement): boolean {
  // Always add blank line after headings
  const headings = ["h1", "h2", "h3", "h4", "h5", "h6"];
  if (headings.includes(current.type as string)) return true;

  // Add blank line after code blocks
  if (current.type === "code-block") return true;

  // Add blank line after RSC blocks
  if (current.type === "rsc-block") return true;

  // Add blank line before headings
  if (headings.includes(next.type as string)) return true;

  // Add blank line after blockquotes
  if (current.type === "blockquote") return true;

  return false;
}
