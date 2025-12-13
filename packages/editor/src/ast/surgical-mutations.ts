/**
 * Surgical Mutations
 *
 * Apply mutations directly to source text using character positions.
 * This preserves all non-JSX code while making precise edits.
 */

import type { EditableNode } from "./oxc-parser";
import { getNodeById, parseSourceWithLocations } from "./oxc-parser";

// ============================================================================
// Mutation Types
// ============================================================================

export type SurgicalMutation =
  | { type: "set-prop"; nodeId: string; propName: string; value: string | number | boolean | null }
  | { type: "delete-prop"; nodeId: string; propName: string }
  | { type: "set-text"; nodeId: string; text: string }
  | { type: "insert-node"; parentId: string; index: number; jsx: string }
  | { type: "delete-node"; nodeId: string }
  | { type: "move-node"; nodeId: string; newParentId: string; newIndex: number }
  | { type: "replace-node"; nodeId: string; jsx: string };

// ============================================================================
// Source Text Editing
// ============================================================================

/**
 * Apply a text edit to source
 */
function applyTextEdit(source: string, start: number, end: number, replacement: string): string {
  return source.slice(0, start) + replacement + source.slice(end);
}

/**
 * Format a prop value for JSX
 */
function formatPropValue(value: string | number | boolean | null): string {
  if (value === true) return ""; // Boolean true is just the prop name
  if (value === false) return "{false}";
  if (value === null) return "{null}";
  if (typeof value === "number") return `{${value}}`;
  if (typeof value === "string") {
    // Check if it looks like an expression
    if (value.startsWith("{") && value.endsWith("}")) {
      return value;
    }
    // Escape quotes and use double quotes
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return `{${JSON.stringify(value)}}`;
}

/**
 * Generate JSX for inserting a prop
 */
function formatProp(name: string, value: string | number | boolean | null): string {
  const formattedValue = formatPropValue(value);
  if (formattedValue === "") {
    return name; // Boolean true shorthand
  }
  return `${name}=${formattedValue}`;
}

// ============================================================================
// Mutation Applicators
// ============================================================================

/**
 * Apply set-prop mutation
 */
function applySetProp(
  source: string,
  root: EditableNode,
  nodeId: string,
  propName: string,
  value: string | number | boolean | null,
): string | null {
  const node = getNodeById(root, nodeId);
  if (!node) {
    console.error(`[surgical] Node not found: ${nodeId}`);
    return null;
  }

  const existingProp = node.props[propName];

  if (existingProp) {
    // Update existing prop value
    const newValue = formatPropValue(value);
    return applyTextEdit(source, existingProp.valueLoc.start, existingProp.valueLoc.end, newValue);
  } else {
    // Insert new prop at end of opening tag (before > or />)
    const openingEnd = node.openingTagLoc.end;
    // Find the position just before > or />
    let insertPos = openingEnd - 1;
    if (source[insertPos - 1] === "/") {
      insertPos -= 1; // Account for self-closing />
    }
    // Go back past any whitespace
    while (insertPos > node.openingTagLoc.start && /\s/.test(source[insertPos - 1])) {
      insertPos--;
    }

    const newProp = ` ${formatProp(propName, value)}`;
    return applyTextEdit(source, insertPos, insertPos, newProp);
  }
}

/**
 * Apply delete-prop mutation
 */
function applyDeleteProp(
  source: string,
  root: EditableNode,
  nodeId: string,
  propName: string,
): string | null {
  const node = getNodeById(root, nodeId);
  if (!node) {
    console.error(`[surgical] Node not found: ${nodeId}`);
    return null;
  }

  const prop = node.props[propName];
  if (!prop) {
    console.warn(`[surgical] Prop not found: ${propName} on ${nodeId}`);
    return source; // Nothing to delete
  }

  // Delete the prop including leading whitespace
  let start = prop.loc.start;
  // Include leading whitespace
  while (start > 0 && /\s/.test(source[start - 1])) {
    start--;
  }

  return applyTextEdit(source, start, prop.loc.end, "");
}

/**
 * Apply set-text mutation
 */
function applySetText(
  source: string,
  root: EditableNode,
  nodeId: string,
  text: string,
): string | null {
  const node = getNodeById(root, nodeId);
  console.log("[surgical] applySetText:", { nodeId, text, node: node ? { tagName: node.tagName, isText: node.isText, childrenLoc: node.childrenLoc, loc: node.loc } : null });

  if (!node) {
    console.error(`[surgical] Node not found: ${nodeId}`);
    return null;
  }

  if (node.isText) {
    // Replace text content directly
    console.log("[surgical] Replacing text node content");
    return applyTextEdit(source, node.loc.start, node.loc.end, text);
  }

  // For elements, replace children area with text
  if (node.childrenLoc) {
    console.log("[surgical] Replacing element children area:", node.childrenLoc);
    return applyTextEdit(source, node.childrenLoc.start, node.childrenLoc.end, text);
  }

  console.error(`[surgical] Cannot set text on node without children area: ${nodeId}`);
  return null;
}

/**
 * Apply insert-node mutation
 */
function applyInsertNode(
  source: string,
  root: EditableNode,
  parentId: string,
  index: number,
  jsx: string,
): string | null {
  const parent = getNodeById(root, parentId);
  if (!parent) {
    console.error(`[surgical] Parent not found: ${parentId}`);
    return null;
  }

  if (!parent.childrenLoc) {
    console.error(`[surgical] Parent has no children area: ${parentId}`);
    return null;
  }

  // Find insertion position
  let insertPos: number;

  if (index === 0 || parent.children.length === 0) {
    // Insert at start of children area
    insertPos = parent.childrenLoc.start;
  } else if (index >= parent.children.length) {
    // Insert at end of children area
    insertPos = parent.childrenLoc.end;
  } else {
    // Insert before the child at index
    insertPos = parent.children[index].loc.start;
  }

  // Add newline and indentation if needed
  const needsNewlineBefore = insertPos > 0 && source[insertPos - 1] !== "\n";
  const needsNewlineAfter = insertPos < source.length && source[insertPos] !== "\n";

  let insertion = jsx;
  if (needsNewlineBefore) insertion = `\n${insertion}`;
  if (needsNewlineAfter) insertion = `${insertion}\n`;

  return applyTextEdit(source, insertPos, insertPos, insertion);
}

/**
 * Apply delete-node mutation
 */
function applyDeleteNode(source: string, root: EditableNode, nodeId: string): string | null {
  const node = getNodeById(root, nodeId);
  if (!node) {
    console.error(`[surgical] Node not found: ${nodeId}`);
    return null;
  }

  // Delete the node and surrounding whitespace/newlines
  let start = node.loc.start;
  let end = node.loc.end;

  // Include leading whitespace up to previous newline
  while (start > 0 && source[start - 1] !== "\n" && /\s/.test(source[start - 1])) {
    start--;
  }

  // Include trailing newline if present
  if (source[end] === "\n") {
    end++;
  }

  return applyTextEdit(source, start, end, "");
}

/**
 * Apply replace-node mutation
 */
function applyReplaceNode(
  source: string,
  root: EditableNode,
  nodeId: string,
  jsx: string,
): string | null {
  const node = getNodeById(root, nodeId);
  if (!node) {
    console.error(`[surgical] Node not found: ${nodeId}`);
    return null;
  }

  return applyTextEdit(source, node.loc.start, node.loc.end, jsx);
}

/**
 * Apply move-node mutation (delete + insert)
 */
function applyMoveNode(
  source: string,
  root: EditableNode,
  nodeId: string,
  newParentId: string,
  newIndex: number,
): string | null {
  const node = getNodeById(root, nodeId);
  if (!node) {
    console.error(`[surgical] Node not found: ${nodeId}`);
    return null;
  }

  // Get the JSX source of the node to move
  const nodeJsx = source.slice(node.loc.start, node.loc.end);

  // Delete the node first
  let result = applyDeleteNode(source, root, nodeId);
  if (!result) return null;

  // Re-parse to get updated positions
  const { root: newRoot } = parseSourceWithLocations(result);
  if (!newRoot) {
    console.error(`[surgical] Failed to re-parse after delete`);
    return null;
  }

  // Insert at new position
  result = applyInsertNode(result, newRoot, newParentId, newIndex, nodeJsx);

  return result;
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Apply a surgical mutation to source code
 *
 * Returns the modified source, or null if the mutation failed
 */
export function applySurgicalMutation(source: string, mutation: SurgicalMutation): string | null {
  const { root } = parseSourceWithLocations(source);

  if (!root) {
    console.error(`[surgical] Failed to parse source`);
    return null;
  }

  switch (mutation.type) {
    case "set-prop":
      return applySetProp(source, root, mutation.nodeId, mutation.propName, mutation.value);

    case "delete-prop":
      return applyDeleteProp(source, root, mutation.nodeId, mutation.propName);

    case "set-text":
      return applySetText(source, root, mutation.nodeId, mutation.text);

    case "insert-node":
      return applyInsertNode(source, root, mutation.parentId, mutation.index, mutation.jsx);

    case "delete-node":
      return applyDeleteNode(source, root, mutation.nodeId);

    case "move-node":
      return applyMoveNode(source, root, mutation.nodeId, mutation.newParentId, mutation.newIndex);

    case "replace-node":
      return applyReplaceNode(source, root, mutation.nodeId, mutation.jsx);

    default:
      console.error(`[surgical] Unknown mutation type: ${(mutation as any).type}`);
      return null;
  }
}

/**
 * Apply multiple mutations in sequence
 *
 * Each mutation is applied and the source is re-parsed for the next
 */
export function applySurgicalMutations(
  source: string,
  mutations: SurgicalMutation[],
): string | null {
  let result = source;

  for (const mutation of mutations) {
    const newResult = applySurgicalMutation(result, mutation);
    if (newResult === null) {
      console.error(`[surgical] Mutation failed:`, mutation);
      return null;
    }
    result = newResult;
  }

  return result;
}
