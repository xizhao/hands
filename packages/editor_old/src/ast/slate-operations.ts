/**
 * Slate Operations → Source Mutations
 *
 * Converts Slate's low-level operations directly to source text edits.
 * This is more precise than diffing values because we get exact operation types.
 *
 * KEY ARCHITECTURE: Path-Based Operations
 * ========================================
 * Slate uses PATHS (not IDs) to identify nodes. A path is an array of indices:
 * - [0] = first child of root
 * - [1, 2] = third child of second child of root
 *
 * Our AST (EditableNode) has the same structure, so we can map:
 * - Slate path [n] → parseResult.root.children[n] (for flattened docs)
 * - Slate path [n, m] → parseResult.root.children[n].children[m]
 *
 * This is the SINGLE ID SYSTEM - paths are the canonical identifier.
 * The `id` field on EditableNode is just for debugging.
 *
 * Slate Operation Types:
 * - insert_node: Insert a node at a path
 * - remove_node: Remove a node at a path
 * - move_node: Move a node from one path to another
 * - set_node: Update properties of a node
 * - insert_text: Insert text at an offset
 * - remove_text: Remove text at an offset
 * - merge_node: Merge node with previous sibling
 * - split_node: Split node at a position
 * - set_selection: Update selection (ignored)
 */

import type { Node, Operation, Path } from "slate";
import type { EditableNode, ParseResult } from "./oxc-parser";
import { parseSourceWithLocations } from "./oxc-parser";

// ============================================================================
// Path Utilities
// ============================================================================

/**
 * Check if the root element should be "flattened" (div/span wrapper unwrapped)
 * This matches the logic in sourceToPlateValueSurgical
 */
function isFlattened(parseResult: ParseResult): boolean {
  if (!parseResult.root) return false;
  const rootTag = parseResult.root.tagName.toLowerCase();

  // Check if root is a div/span with block children
  if ((rootTag === "div" || rootTag === "span") && parseResult.root.children.length > 0) {
    // If children exist and aren't all text, we flattened
    const hasBlockChildren = parseResult.root.children.some((c) => !c.isText);
    return hasBlockChildren;
  }

  return false;
}

/**
 * Get the EditableNode at a Slate path
 *
 * Handles the flattening case where:
 * - Plate has path [0] pointing to h1
 * - Source has h1 at root.children[0]
 *
 * So Plate path [n] → Source path root.children[n]
 */
function getNodeAtPath(path: Path, parseResult: ParseResult): EditableNode | null {
  if (!parseResult.root) return null;

  const pathParts = [...path];

  // If flattened, first index in Plate is a child of root in source
  if (isFlattened(parseResult)) {
    // Plate [n, ...rest] → root.children[n] ...rest
    let current: EditableNode | undefined = parseResult.root;

    for (const index of pathParts) {
      if (!current || !current.children || index >= current.children.length) {
        return null;
      }
      current = current.children[index];
    }

    return current ?? null;
  }

  // Not flattened - root element is the single top-level element
  // Plate path [0] → root
  // Plate path [0, n] → root.children[n]
  let current: EditableNode | undefined = parseResult.root;

  // Skip first 0 if it's pointing to root
  if (pathParts[0] === 0) {
    pathParts.shift();
  }

  for (const index of pathParts) {
    if (!current || !current.children || index >= current.children.length) {
      return null;
    }
    current = current.children[index];
  }

  return current ?? null;
}

// ============================================================================
// Operation to Source Edit
// ============================================================================

export interface SourceEdit {
  start: number;
  end: number;
  replacement: string;
}

/**
 * Apply a source edit
 */
function applySourceEdit(source: string, edit: SourceEdit): string {
  return source.slice(0, edit.start) + edit.replacement + source.slice(edit.end);
}

/**
 * Apply multiple source edits (in reverse order to preserve positions)
 */
function applySourceEdits(source: string, edits: SourceEdit[]): string {
  // Sort by start position descending so we don't invalidate positions
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let result = source;
  for (const edit of sorted) {
    result = applySourceEdit(result, edit);
  }
  return result;
}

// ============================================================================
// Individual Operation Handlers
// ============================================================================

/**
 * Convert a Slate node to JSX string for insertion
 */
function nodeToJsx(node: Node, indent: string = ""): string {
  if ("text" in node) {
    return node.text;
  }

  const element = node as { type: string; children: Node[]; [key: string]: unknown };
  const tagName = typeToTagName(element.type);

  // Build props string
  const props: string[] = [];
  for (const [key, value] of Object.entries(element)) {
    if (key === "type" || key === "children" || key === "id") continue;
    props.push(formatProp(key, value));
  }
  const propsStr = props.length > 0 ? ` ${props.join(" ")}` : "";

  // Build children
  const children = element.children || [];
  if (children.length === 0) {
    return `${indent}<${tagName}${propsStr} />`;
  }

  // Check if all children are text
  const allText = children.every((c: Node) => "text" in c);
  if (allText) {
    const text = children.map((c: Node) => ("text" in c ? c.text : "")).join("");
    return `${indent}<${tagName}${propsStr}>${text}</${tagName}>`;
  }

  // Multi-line children
  const childJsx = children.map((c: Node) => nodeToJsx(c, `${indent}  `)).join("\n");
  return `${indent}<${tagName}${propsStr}>\n${childJsx}\n${indent}</${tagName}>`;
}

function typeToTagName(type: string): string {
  const map: Record<string, string> = {
    p: "p",
    paragraph: "p",
    h1: "h1",
    h2: "h2",
    h3: "h3",
    blockquote: "blockquote",
    hr: "hr",
  };
  return map[type] || type;
}

function formatProp(name: string, value: unknown): string {
  if (value === true) return name;
  if (value === false) return `${name}={false}`;
  if (value === null) return `${name}={null}`;
  if (typeof value === "number") return `${name}={${value}}`;
  if (typeof value === "string") return `${name}="${value.replace(/"/g, '\\"')}"`;
  return `${name}={${JSON.stringify(value)}}`;
}

/**
 * Handle insert_node operation
 */
function handleInsertNode(
  op: Extract<Operation, { type: "insert_node" }>,
  _source: string,
  parseResult: ParseResult,
): SourceEdit | null {
  const parentPath = op.path.slice(0, -1);
  const insertIndex = op.path[op.path.length - 1];

  const parent = getNodeAtPath(parentPath, parseResult);
  if (!parent || !parent.childrenLoc) {
    console.warn("[slate-ops] Cannot find parent for insert_node:", parentPath);
    return null;
  }

  // Find insertion position
  let insertPos: number;
  if (insertIndex === 0 || parent.children.length === 0) {
    insertPos = parent.childrenLoc.start;
  } else if (insertIndex >= parent.children.length) {
    insertPos = parent.childrenLoc.end;
  } else {
    insertPos = parent.children[insertIndex].loc.start;
  }

  const jsx = nodeToJsx(op.node, "    ");
  return {
    start: insertPos,
    end: insertPos,
    replacement: `\n${jsx}`,
  };
}

/**
 * Handle remove_node operation
 */
function handleRemoveNode(
  op: Extract<Operation, { type: "remove_node" }>,
  source: string,
  parseResult: ParseResult,
): SourceEdit | null {
  const node = getNodeAtPath(op.path, parseResult);
  if (!node) {
    console.warn("[slate-ops] Cannot find node for remove_node:", op.path);
    return null;
  }

  // Include leading whitespace/newline
  let start = node.loc.start;
  while (start > 0 && source[start - 1] !== "\n" && /\s/.test(source[start - 1])) {
    start--;
  }

  // Include trailing newline
  let end = node.loc.end;
  if (source[end] === "\n") end++;

  return { start, end, replacement: "" };
}

/**
 * Handle move_node operation
 *
 * IMPORTANT: For move within same parent (same-level move):
 * - Slate's move_node uses the path BEFORE the move for 'path'
 * - And the path AFTER deletion for 'newPath'
 *
 * Example: Moving item from index 0 to index 2 (3 items total)
 * - path: [0] (h1 is at index 0)
 * - newPath: [2] (after deleting h1, we want to insert at index 2, which is after what was button)
 *
 * This means Slate's newPath accounts for the removal already!
 */
function handleMoveNode(
  op: Extract<Operation, { type: "move_node" }>,
  source: string,
  parseResult: ParseResult,
): SourceEdit[] | null {
  const fromIndex = op.path[op.path.length - 1];
  const toIndex = op.newPath[op.newPath.length - 1];

  // For sibling moves (same parent), we handle specially
  const fromParentPath = op.path.slice(0, -1);
  const toParentPath = op.newPath.slice(0, -1);
  const isSiblingMove = JSON.stringify(fromParentPath) === JSON.stringify(toParentPath);

  // Get the node being moved using the source path
  // For flattened documents, path [n] means root.children[n]
  const node = getNodeAtPath(op.path, parseResult);
  if (!node) {
    console.warn("[slate-ops] Cannot find node for move_node:", op.path);
    return null;
  }

  // Get the parent containing the children
  const parent =
    fromParentPath.length === 0 && isFlattened(parseResult)
      ? parseResult.root!
      : getNodeAtPath(fromParentPath, parseResult);

  if (!parent || !parent.childrenLoc) {
    console.warn("[slate-ops] Cannot find parent for move_node");
    return null;
  }

  // Get the JSX of the node being moved
  const nodeJsx = source.slice(node.loc.start, node.loc.end);

  // For sibling moves within same parent:
  if (isSiblingMove) {
    // Slate's newPath already accounts for removal, so we need to think about
    // what the final position should be in the ORIGINAL document

    // If moving forward (to higher index), the target in original is toIndex + 1
    // Because Slate's newPath assumes the node is already removed
    //
    // Example: [h1, p, button] - move h1 to end
    // - fromIndex = 0 (h1)
    // - toIndex = 2 (Slate says insert at position 2 after removal)
    // - In original doc with 3 items, position 2 after removal = after item at original index 2
    // - So we insert AFTER children[2] (button)
    //
    // If moving backward, it's simpler - we just insert before children[toIndex]

    let insertPos: number;
    let deleteStart: number;
    let deleteEnd: number;

    // Get the range to delete (including surrounding whitespace/newline)
    deleteStart = node.loc.start;
    // Include leading spaces (but stop at newline)
    while (
      deleteStart > 0 &&
      source[deleteStart - 1] !== "\n" &&
      /\s/.test(source[deleteStart - 1])
    ) {
      deleteStart--;
    }
    // Also include the leading newline if there is one
    if (deleteStart > 0 && source[deleteStart - 1] === "\n") {
      deleteStart--;
    }

    deleteEnd = node.loc.end;
    // Include trailing newline
    if (source[deleteEnd] === "\n") deleteEnd++;

    // Determine insertion position
    if (toIndex > fromIndex) {
      // Moving forward - insert AFTER the element that's currently at toIndex
      // (because Slate's toIndex already accounts for our removal)
      const targetOriginalIndex = toIndex; // After our element is removed, this is where we go
      // So in original we insert after what will become the item before us
      // That's original index = toIndex (since our removal shifts everything down)
      if (targetOriginalIndex >= parent.children.length) {
        // Insert at end (after last child)
        const lastChild = parent.children[parent.children.length - 1];
        insertPos = lastChild.loc.end;
      } else {
        // Insert after children[targetOriginalIndex]
        const targetChild = parent.children[targetOriginalIndex];
        insertPos = targetChild.loc.end;
      }
    } else {
      // Moving backward - insert BEFORE the element at toIndex
      const targetChild = parent.children[toIndex];
      insertPos = targetChild.loc.start;
      // Go back to include leading whitespace
      while (insertPos > 0 && source[insertPos - 1] !== "\n" && /\s/.test(source[insertPos - 1])) {
        insertPos--;
      }
    }

    // Build the insert replacement
    // Preserve proper indentation
    const indent = "    "; // TODO: detect from source
    const insertText =
      toIndex > fromIndex
        ? `\n${indent}${nodeJsx.trim()}` // Insert after, add newline before
        : `${indent + nodeJsx.trim()}\n`; // Insert before, add newline after

    // Return edits - they'll be applied in reverse position order
    // which handles the position shifting correctly
    return [
      { start: deleteStart, end: deleteEnd, replacement: "" },
      { start: insertPos, end: insertPos, replacement: insertText },
    ];
  }

  // Non-sibling move (different parents) - more complex
  // For now, handle the simple case of moving to a different parent
  const newParent = getNodeAtPath(toParentPath, parseResult);
  if (!newParent || !newParent.childrenLoc) {
    console.warn("[slate-ops] Cannot find new parent for move_node:", toParentPath);
    return null;
  }

  // Similar logic but between different parents
  let insertPos: number;
  if (toIndex === 0 || newParent.children.length === 0) {
    insertPos = newParent.childrenLoc.start;
  } else if (toIndex >= newParent.children.length) {
    insertPos = newParent.childrenLoc.end;
  } else {
    insertPos = newParent.children[toIndex].loc.start;
  }

  let deleteStart = node.loc.start;
  while (
    deleteStart > 0 &&
    source[deleteStart - 1] !== "\n" &&
    /\s/.test(source[deleteStart - 1])
  ) {
    deleteStart--;
  }
  if (deleteStart > 0 && source[deleteStart - 1] === "\n") {
    deleteStart--;
  }
  let deleteEnd = node.loc.end;
  if (source[deleteEnd] === "\n") deleteEnd++;

  return [
    { start: deleteStart, end: deleteEnd, replacement: "" },
    { start: insertPos, end: insertPos, replacement: `\n    ${nodeJsx.trim()}` },
  ];
}

/**
 * Handle set_node operation (prop changes)
 */
function handleSetNode(
  op: Extract<Operation, { type: "set_node" }>,
  source: string,
  parseResult: ParseResult,
): SourceEdit | null {
  const node = getNodeAtPath(op.path, parseResult);
  if (!node) {
    console.warn("[slate-ops] Cannot find node for set_node:", op.path);
    return null;
  }

  // Find what changed
  const changes = op.newProperties;

  // For now, handle simple prop changes
  // This is a simplified version - full implementation would rebuild the opening tag
  for (const [key, value] of Object.entries(changes)) {
    if (key === "type" || key === "children" || key === "id") continue;

    const existingProp = node.props[key];
    if (existingProp) {
      // Update existing prop value
      const newValue = formatPropValue(value);
      return {
        start: existingProp.valueLoc.start,
        end: existingProp.valueLoc.end,
        replacement: newValue,
      };
    } else {
      // Insert new prop
      const insertPos = node.openingTagLoc.end - 1;
      const skipBack = source[insertPos - 1] === "/" ? 2 : 1;
      return {
        start: insertPos - skipBack + 1,
        end: insertPos - skipBack + 1,
        replacement: ` ${formatProp(key, value)}`,
      };
    }
  }

  return null;
}

function formatPropValue(value: unknown): string {
  if (value === true) return "";
  if (value === false) return "{false}";
  if (value === null) return "{null}";
  if (typeof value === "number") return `{${value}}`;
  if (typeof value === "string") return `"${value.replace(/"/g, '\\"')}"`;
  return `{${JSON.stringify(value)}}`;
}

/**
 * Handle insert_text operation
 */
function handleInsertText(
  op: Extract<Operation, { type: "insert_text" }>,
  _source: string,
  parseResult: ParseResult,
): SourceEdit | null {
  const node = getNodeAtPath(op.path, parseResult);
  if (!node) {
    console.warn("[slate-ops] Cannot find node for insert_text:", op.path);
    return null;
  }

  // For text nodes, insert at offset
  const insertPos = node.loc.start + op.offset;
  return {
    start: insertPos,
    end: insertPos,
    replacement: op.text,
  };
}

/**
 * Handle remove_text operation
 */
function handleRemoveText(
  op: Extract<Operation, { type: "remove_text" }>,
  _source: string,
  parseResult: ParseResult,
): SourceEdit | null {
  const node = getNodeAtPath(op.path, parseResult);
  if (!node) {
    console.warn("[slate-ops] Cannot find node for remove_text:", op.path);
    return null;
  }

  const start = node.loc.start + op.offset;
  const end = start + op.text.length;
  return { start, end, replacement: "" };
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Convert a Slate operation to source edits
 */
export function operationToSourceEdits(
  op: Operation,
  source: string,
  parseResult: ParseResult,
): SourceEdit[] | null {
  switch (op.type) {
    case "insert_node": {
      const edit = handleInsertNode(op, source, parseResult);
      return edit ? [edit] : null;
    }

    case "remove_node": {
      const edit = handleRemoveNode(op, source, parseResult);
      return edit ? [edit] : null;
    }

    case "move_node": {
      return handleMoveNode(op, source, parseResult);
    }

    case "set_node": {
      const edit = handleSetNode(op, source, parseResult);
      return edit ? [edit] : null;
    }

    case "insert_text": {
      const edit = handleInsertText(op, source, parseResult);
      return edit ? [edit] : null;
    }

    case "remove_text": {
      const edit = handleRemoveText(op, source, parseResult);
      return edit ? [edit] : null;
    }

    case "merge_node":
    case "split_node":
      // These are complex - for now, skip and let the diff-based fallback handle them
      console.log("[slate-ops] Skipping complex operation:", op.type);
      return null;

    case "set_selection":
      // Selection changes don't affect source
      return [];

    default:
      console.warn("[slate-ops] Unknown operation type:", (op as any).type);
      return null;
  }
}

/**
 * Apply Slate operations to source code
 *
 * Returns the modified source, or null if any operation failed
 */
export function applySlateOperations(source: string, operations: Operation[]): string | null {
  const parseResult = parseSourceWithLocations(source);

  if (!parseResult.root) {
    console.error("[slate-ops] Failed to parse source");
    return null;
  }

  let result = source;
  let currentParseResult = parseResult;

  for (const op of operations) {
    const edits = operationToSourceEdits(op, result, currentParseResult);

    if (edits === null) {
      // Operation failed - return null to signal fallback needed
      return null;
    }

    if (edits.length === 0) {
      // No-op (like selection changes)
      continue;
    }

    result = applySourceEdits(result, edits);

    // Re-parse for next operation
    currentParseResult = parseSourceWithLocations(result);
    if (!currentParseResult.root) {
      console.error("[slate-ops] Source became invalid after operation:", op.type);
      return null;
    }
  }

  return result;
}
