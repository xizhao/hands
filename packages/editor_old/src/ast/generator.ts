/**
 * TSX Generator - Generate TSX source from JsxNode tree
 */
import type { JsxNode, PropValue } from "../types";

export interface GeneratorOptions {
  /** Indentation string (default: '  ') */
  indent?: string;
  /** Starting indent level (default: 0) */
  startIndent?: number;
}

/**
 * Generate JSX string from a JsxNode tree
 */
export function generateJsx(node: JsxNode, options: GeneratorOptions = {}): string {
  const { indent = "  ", startIndent = 0 } = options;
  return generateNode(node, indent, startIndent);
}

/**
 * Generate a complete block source from a JsxNode tree
 */
export function generateBlockSource(root: JsxNode): string {
  const jsx = generateJsx(root, { startIndent: 2 });

  return `import type { BlockFn } from '@hands/stdlib'

export default (async (ctx) => (
${jsx}
)) satisfies BlockFn
`;
}

/**
 * Generate a node recursively
 */
function generateNode(node: JsxNode, indent: string, level: number): string {
  switch (node.type) {
    case "element":
      return generateElement(node, indent, level);

    case "fragment":
      return generateFragment(node, indent, level);

    case "text":
      return node.text || "";

    case "expression":
      return `{${node.expression}}`;

    default:
      return "";
  }
}

/**
 * Generate an element node
 */
function generateElement(node: JsxNode, indent: string, level: number): string {
  const prefix = indent.repeat(level);
  const tagName = node.tagName || "div";
  const props = generateProps(node.props || {});
  const children = node.children || [];

  // Self-closing if no children
  if (children.length === 0) {
    if (props) {
      return `${prefix}<${tagName} ${props} />`;
    }
    return `${prefix}<${tagName} />`;
  }

  // Single text child - inline
  if (children.length === 1 && children[0].type === "text") {
    const text = children[0].text || "";
    if (props) {
      return `${prefix}<${tagName} ${props}>${text}</${tagName}>`;
    }
    return `${prefix}<${tagName}>${text}</${tagName}>`;
  }

  // Multiple children or complex children - multi-line
  const openTag = props ? `<${tagName} ${props}>` : `<${tagName}>`;
  const closeTag = `</${tagName}>`;

  const childrenStr = children.map((child) => generateNode(child, indent, level + 1)).join("\n");

  return `${prefix}${openTag}\n${childrenStr}\n${prefix}${closeTag}`;
}

/**
 * Generate a fragment node
 */
function generateFragment(node: JsxNode, indent: string, level: number): string {
  const prefix = indent.repeat(level);
  const children = node.children || [];

  if (children.length === 0) {
    return `${prefix}<></>`;
  }

  const childrenStr = children.map((child) => generateNode(child, indent, level + 1)).join("\n");

  return `${prefix}<>\n${childrenStr}\n${prefix}</>`;
}

/**
 * Generate props string
 */
function generateProps(props: Record<string, PropValue>): string {
  const parts: string[] = [];

  for (const [name, value] of Object.entries(props)) {
    // Handle spread
    if (name === "...spread") {
      parts.push(`{...${value.value}}`);
      continue;
    }

    parts.push(generateProp(name, value));
  }

  return parts.join(" ");
}

/**
 * Generate a single prop
 */
function generateProp(name: string, value: PropValue): string {
  switch (value.type) {
    case "literal":
      return generateLiteralProp(name, value.value);

    case "expression":
      return `${name}={${value.value}}`;

    case "jsx":
      if (typeof value.value === "object" && value.value !== null) {
        const jsx = generateJsx(value.value as JsxNode);
        return `${name}={${jsx}}`;
      }
      return `${name}={${value.value}}`;

    default:
      return "";
  }
}

/**
 * Generate a literal prop value
 */
function generateLiteralProp(
  name: string,
  value: string | number | boolean | null | JsxNode,
): string {
  if (value === true) {
    // Boolean shorthand: disabled instead of disabled={true}
    return name;
  }

  if (value === false) {
    return `${name}={false}`;
  }

  if (value === null) {
    return `${name}={null}`;
  }

  if (typeof value === "number") {
    return `${name}={${value}}`;
  }

  if (typeof value === "string") {
    // Use double quotes, escape internal double quotes
    const escaped = value.replace(/"/g, '\\"');
    return `${name}="${escaped}"`;
  }

  // Fallback
  return `${name}={${JSON.stringify(value)}}`;
}

/**
 * Generate minimal JSX (no indentation, compact)
 */
export function generateCompactJsx(node: JsxNode): string {
  switch (node.type) {
    case "element": {
      const tagName = node.tagName || "div";
      const props = generateProps(node.props || {});
      const children = node.children || [];

      if (children.length === 0) {
        return props ? `<${tagName} ${props} />` : `<${tagName} />`;
      }

      const openTag = props ? `<${tagName} ${props}>` : `<${tagName}>`;
      const closeTag = `</${tagName}>`;
      const childrenStr = children.map(generateCompactJsx).join("");

      return `${openTag}${childrenStr}${closeTag}`;
    }

    case "fragment": {
      const children = node.children || [];
      const childrenStr = children.map(generateCompactJsx).join("");
      return `<>${childrenStr}</>`;
    }

    case "text":
      return node.text || "";

    case "expression":
      return `{${node.expression}}`;

    default:
      return "";
  }
}
