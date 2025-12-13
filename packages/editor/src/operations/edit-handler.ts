/**
 * Edit Handler - Map editor operations to source mutations
 *
 * Converts high-level edit operations (move, delete, edit-text, etc.)
 * into surgical mutations that can be applied to source code.
 */

import type { EditableNode, ParseResult } from "../ast/oxc-parser";
import { getNodeById, getPathById } from "../ast/oxc-parser";
import { applySurgicalMutations, type SurgicalMutation } from "../ast/surgical-mutations";
import type { EditOperation } from "../plate/PlateEditOverlay";

// ============================================================================
// Operation to Mutation Conversion
// ============================================================================

/**
 * Convert an edit operation to surgical mutations
 */
export function operationToMutations(
  operation: EditOperation,
  parseResult: ParseResult,
  source: string,
): SurgicalMutation[] | null {
  const { root } = parseResult;

  if (!root) {
    console.error("[edit-handler] No root node in parse result");
    return null;
  }

  switch (operation.type) {
    case "select":
      // Selection doesn't produce mutations
      return [];

    case "delete":
      return operation.nodeIds.map((nodeId) => ({
        type: "delete-node" as const,
        nodeId,
      }));

    case "duplicate":
      return handleDuplicate(operation.nodeId, root, source);

    case "move":
      return handleMove(operation, root, source);

    case "edit-text":
      return [
        {
          type: "set-text" as const,
          nodeId: operation.nodeId,
          text: operation.text,
        },
      ];

    case "edit-prop":
      return [
        {
          type: "set-prop" as const,
          nodeId: operation.nodeId,
          propName: operation.propName,
          value: operation.value as string | number | boolean | null,
        },
      ];

    default:
      console.warn("[edit-handler] Unknown operation type:", (operation as any).type);
      return null;
  }
}

/**
 * Handle duplicate operation
 */
function handleDuplicate(
  nodeId: string,
  root: EditableNode,
  source: string,
): SurgicalMutation[] | null {
  const node = getNodeById(root, nodeId);
  if (!node) {
    console.error(`[edit-handler] Node not found: ${nodeId}`);
    return null;
  }

  // Get the node's JSX source
  const nodeJsx = source.slice(node.loc.start, node.loc.end);

  // Find parent to determine insertion point
  const path = getPathById(root, nodeId);
  if (!path || path.length === 0) {
    console.error(`[edit-handler] Cannot find path for node: ${nodeId}`);
    return null;
  }

  // Get parent
  const parentPath = path.slice(0, -1);
  const siblingIndex = path[path.length - 1];
  const parentNode = parentPath.length === 0 ? root : getNodeByPath(root, parentPath);

  if (!parentNode) {
    console.error(`[edit-handler] Cannot find parent node`);
    return null;
  }

  // Insert after the current node
  return [
    {
      type: "insert-node" as const,
      parentId: parentNode.id,
      index: siblingIndex + 1,
      jsx: nodeJsx,
    },
  ];
}

/**
 * Handle move operation
 */
function handleMove(
  operation: Extract<EditOperation, { type: "move" }>,
  root: EditableNode,
  _source: string,
): SurgicalMutation[] | null {
  const { nodeId, targetId, position } = operation;

  const targetNode = getNodeById(root, targetId);
  if (!targetNode) {
    console.error(`[edit-handler] Target node not found: ${targetId}`);
    return null;
  }

  // Find target's parent and index
  const targetPath = getPathById(root, targetId);
  if (!targetPath || targetPath.length === 0) {
    console.error(`[edit-handler] Cannot find path for target: ${targetId}`);
    return null;
  }

  const targetParentPath = targetPath.slice(0, -1);
  const targetIndex = targetPath[targetPath.length - 1];
  const targetParent = targetParentPath.length === 0 ? root : getNodeByPath(root, targetParentPath);

  if (!targetParent) {
    console.error(`[edit-handler] Cannot find target parent node`);
    return null;
  }

  // Calculate new parent and index based on position
  let newParentId: string;
  let newIndex: number;

  switch (position) {
    case "before":
      newParentId = targetParent.id;
      newIndex = targetIndex;
      break;

    case "after":
      newParentId = targetParent.id;
      newIndex = targetIndex + 1;
      break;

    case "inside":
      // Insert as first child of target
      newParentId = targetId;
      newIndex = 0;
      break;

    default:
      console.error(`[edit-handler] Unknown position: ${position}`);
      return null;
  }

  return [
    {
      type: "move-node" as const,
      nodeId,
      newParentId,
      newIndex,
    },
  ];
}

/**
 * Get a node by its path array
 */
function getNodeByPath(root: EditableNode, path: number[]): EditableNode | null {
  let current: EditableNode = root;

  for (const index of path) {
    if (index >= current.children.length) {
      return null;
    }
    current = current.children[index];
  }

  return current;
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Apply an edit operation to source code
 *
 * @param operation - The edit operation to apply
 * @param source - Current source code
 * @returns New source code, or null if operation failed
 */
export function applyEditOperation(operation: EditOperation, source: string): string | null {
  const { parseSourceWithLocations } = require("../ast/oxc-parser");
  const parseResult = parseSourceWithLocations(source);

  const mutations = operationToMutations(operation, parseResult, source);

  if (mutations === null) {
    return null;
  }

  if (mutations.length === 0) {
    // No mutations (e.g., select operation)
    return source;
  }

  // Apply mutations in order
  // Note: For delete operations, we need to process in reverse order
  // to preserve positions (delete from end first)
  if (operation.type === "delete" && mutations.length > 1) {
    // Sort by position descending
    const sortedMutations = [...mutations].sort((a, b) => {
      const nodeA = getNodeById(parseResult.root!, (a as any).nodeId);
      const nodeB = getNodeById(parseResult.root!, (b as any).nodeId);
      if (!nodeA || !nodeB) return 0;
      return nodeB.loc.start - nodeA.loc.start;
    });
    return applySurgicalMutations(source, sortedMutations);
  }

  return applySurgicalMutations(source, mutations);
}

/**
 * Batch apply multiple edit operations
 *
 * @param operations - Array of edit operations
 * @param source - Current source code
 * @returns New source code, or null if any operation failed
 */
export function applyEditOperations(operations: EditOperation[], source: string): string | null {
  let result = source;

  for (const operation of operations) {
    const newResult = applyEditOperation(operation, result);
    if (newResult === null) {
      console.error("[edit-handler] Operation failed:", operation);
      return null;
    }
    result = newResult;
  }

  return result;
}
