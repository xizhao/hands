/**
 * Code generation - converts JsxNode tree to .tsx source
 */

import type { JsxNode, PropValue } from "../types";

export function generateBlockSource(blockId: string, root: JsxNode): string {
  const funcName = toPascalCase(blockId);
  const jsx = jsxNodeToString(root, 2);

  return `import type { BlockFn, BlockMeta } from "@hands/stdlib"

const ${funcName}: BlockFn = async ({ ctx }) => {
  return (
${jsx}
  )
}

export default ${funcName}

export const meta: BlockMeta = {
  title: "${blockId}"
}
`;
}

function jsxNodeToString(node: JsxNode, indent: number = 0): string {
  const pad = "  ".repeat(indent);

  switch (node.type) {
    case "text":
      return node.text ?? "";

    case "expression":
      return `${pad}{${node.expression}}`;

    case "fragment": {
      if (!node.children || node.children.length === 0) {
        return `${pad}<></>`;
      }
      const children = node.children.map((c) => jsxNodeToString(c, indent + 1)).join("\n");
      return `${pad}<>\n${children}\n${pad}</>`;
    }

    case "element": {
      const tagName = node.tagName ?? "div";
      const propsStr = node.props ? propsToString(node.props) : "";

      if (!node.children || node.children.length === 0) {
        return `${pad}<${tagName}${propsStr} />`;
      }

      // Single text child - inline
      if (node.children.length === 1 && node.children[0].type === "text") {
        return `${pad}<${tagName}${propsStr}>${node.children[0].text}</${tagName}>`;
      }

      const children = node.children.map((c) => jsxNodeToString(c, indent + 1)).join("\n");
      return `${pad}<${tagName}${propsStr}>\n${children}\n${pad}</${tagName}>`;
    }

    default:
      return "";
  }
}

function propsToString(props: Record<string, PropValue>): string {
  const entries = Object.entries(props);
  if (entries.length === 0) return "";

  const parts = entries.map(([name, value]) => {
    if (value.type === "literal" && value.value === true) {
      return name;
    }
    if (value.type === "literal" && typeof value.value === "string") {
      return `${name}="${value.value}"`;
    }
    if (value.type === "literal") {
      return `${name}={${JSON.stringify(value.value)}}`;
    }
    return `${name}={${value.rawSource ?? String(value.value)}}`;
  });

  return " " + parts.join(" ");
}

function toPascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}
