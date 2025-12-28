/**
 * List Format Conversion Utilities
 *
 * Converts between classic list format (ul/ol/li/lic) and indent-based format
 * (paragraphs with listStyleType attribute).
 *
 * Classic format (output by markdown parser):
 *   { type: 'ul', children: [{ type: 'li', children: [{ type: 'lic', children: [{ text: 'Item' }] }] }] }
 *
 * Indent-based format (used by Plate ListPlugin):
 *   { type: 'p', listStyleType: 'disc', indent: 1, children: [{ text: 'Item' }] }
 */

import type { TElement, Value } from "platejs";

interface PlateNode {
  type?: string;
  children?: PlateNode[];
  text?: string;
  listStyleType?: string;
  indent?: number;
  listStart?: number;
  [key: string]: unknown;
}

/**
 * Convert classic list format to indent-based format.
 *
 * Call this after parsing MDX to convert ul/ol/li/lic structure
 * to paragraphs with listStyleType attributes that the editor expects.
 */
export function convertClassicListsToIndent(nodes: Value, baseIndent = 0): Value {
  const result: PlateNode[] = [];

  for (const node of nodes) {
    if (node.type === "ul" || node.type === "ol") {
      // Convert list container to flat paragraph list
      const listStyleType = node.type === "ol" ? "decimal" : "disc";
      const listItems = convertListItems(node.children as PlateNode[], listStyleType, baseIndent + 1);
      result.push(...listItems);
    } else if (node.children && Array.isArray(node.children)) {
      // Recursively process non-list elements
      result.push({
        ...node,
        children: convertClassicListsToIndent(node.children as Value, baseIndent),
      });
    } else {
      result.push(node);
    }
  }

  return result as Value;
}

/**
 * Convert list item children to indent-based paragraphs.
 */
function convertListItems(
  items: PlateNode[],
  listStyleType: string,
  indent: number
): PlateNode[] {
  const result: PlateNode[] = [];
  let isFirst = true;

  for (const item of items) {
    if (item.type !== "li") continue;

    const children = item.children || [];

    for (const child of children) {
      if (child.type === "lic") {
        // List item content - convert to paragraph with listStyleType
        const paragraph: PlateNode = {
          type: "p",
          listStyleType,
          indent,
          children: child.children || [{ text: "" }],
        };
        // Add listStart only for first ordered list item
        if (listStyleType === "decimal" && isFirst) {
          paragraph.listStart = 1;
        }
        result.push(paragraph);
        isFirst = false;
      } else if (child.type === "ul" || child.type === "ol") {
        // Nested list - recursively convert with increased indent
        const nestedStyleType = child.type === "ol" ? "decimal" : "disc";
        const nestedItems = convertListItems(
          child.children as PlateNode[],
          nestedStyleType,
          indent + 1
        );
        result.push(...nestedItems);
      } else if (child.type === "p") {
        // Sometimes parser produces p inside li instead of lic
        const paragraph: PlateNode = {
          type: "p",
          listStyleType,
          indent,
          children: child.children || [{ text: "" }],
        };
        if (listStyleType === "decimal" && isFirst) {
          paragraph.listStart = 1;
        }
        result.push(paragraph);
        isFirst = false;
      }
    }
  }

  return result;
}

/**
 * Convert indent-based list format to classic list format.
 *
 * Call this before serializing to markdown to convert paragraphs
 * with listStyleType attributes to ul/ol/li/lic structure.
 */
export function convertIndentListsToClassic(nodes: Value): Value {
  const result: PlateNode[] = [];
  let i = 0;

  while (i < nodes.length) {
    const node = nodes[i];

    const indent = node.indent as number | undefined;
    if (node.listStyleType && indent && indent > 0) {
      // Start of a list - collect consecutive list items at same base indent
      const { listNodes, endIndex } = collectListItems(nodes, i);
      const classicList = buildClassicList(listNodes);
      result.push(...classicList);
      i = endIndex;
    } else if (node.children && Array.isArray(node.children)) {
      // Recursively process children
      // Destructure to remove list-related properties (don't set to undefined)
      const { listStyleType, indent, listStart, ...rest } = node;
      result.push({
        ...rest,
        children: convertIndentListsToClassic(node.children as Value),
      });
      i++;
    } else {
      result.push(node);
      i++;
    }
  }

  return result as Value;
}

interface ListItemNode {
  node: PlateNode;
  indent: number;
  listStyleType: string;
}

/**
 * Collect consecutive list items starting from index.
 */
function collectListItems(
  nodes: Value,
  startIndex: number
): { listNodes: ListItemNode[]; endIndex: number } {
  const listNodes: ListItemNode[] = [];
  let i = startIndex;

  while (i < nodes.length) {
    const node = nodes[i];
    const indent = node.indent as number | undefined;
    if (node.listStyleType && indent && indent > 0) {
      listNodes.push({
        node,
        indent: indent,
        listStyleType: node.listStyleType as string,
      });
      i++;
    } else {
      break;
    }
  }

  return { listNodes, endIndex: i };
}

/**
 * Build classic list structure from collected list items.
 */
function buildClassicList(items: ListItemNode[]): PlateNode[] {
  if (items.length === 0) return [];

  const result: PlateNode[] = [];
  let i = 0;

  while (i < items.length) {
    const { indent: baseIndent, listStyleType } = items[i];
    const isOrdered = listStyleType === "decimal";
    const listType = isOrdered ? "ol" : "ul";

    // Collect items at this indent level
    const listChildren: PlateNode[] = [];

    while (i < items.length && items[i].indent >= baseIndent) {
      if (items[i].indent === baseIndent) {
        // Same level - add as list item
        const item = items[i];
        const content = item.node.children || [{ text: "" }];

        // Check for nested items
        const nestedStart = i + 1;
        let nestedEnd = nestedStart;
        while (nestedEnd < items.length && items[nestedEnd].indent > baseIndent) {
          nestedEnd++;
        }

        const liChildren: PlateNode[] = [
          { type: "lic", children: content as PlateNode[] },
        ];

        // Add nested lists if any
        if (nestedEnd > nestedStart) {
          const nestedItems = items.slice(nestedStart, nestedEnd);
          const nestedLists = buildClassicList(nestedItems);
          liChildren.push(...nestedLists);
        }

        listChildren.push({ type: "li", children: liChildren });
        i = nestedEnd;
      } else {
        // Higher indent - skip (handled by nested list)
        i++;
      }
    }

    if (listChildren.length > 0) {
      result.push({ type: listType, children: listChildren });
    }
  }

  return result;
}
