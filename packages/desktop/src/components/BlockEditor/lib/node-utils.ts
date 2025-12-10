/**
 * JsxNode tree manipulation utilities
 */

import type { JsxNode } from "../types";

export function createDefaultRoot(): JsxNode {
  return {
    id: "root",
    type: "fragment",
    children: [],
  };
}

export function generateNodeId(): string {
  return `node_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function findNode(root: JsxNode, nodeId: string): JsxNode | null {
  if (root.id === nodeId) return root;

  if (root.children) {
    for (const child of root.children) {
      const found = findNode(child, nodeId);
      if (found) return found;
    }
  }

  return null;
}

export function updateNode(root: JsxNode, nodeId: string, updates: Partial<JsxNode>): JsxNode {
  if (root.id === nodeId) {
    return { ...root, ...updates };
  }

  if (root.children) {
    return {
      ...root,
      children: root.children.map((child) => updateNode(child, nodeId, updates)),
    };
  }

  return root;
}

export function deleteNode(root: JsxNode, nodeId: string): JsxNode {
  if (root.children) {
    return {
      ...root,
      children: root.children
        .filter((child) => child.id !== nodeId)
        .map((child) => deleteNode(child, nodeId)),
    };
  }

  return root;
}

export function insertNode(
  root: JsxNode,
  node: JsxNode,
  targetId: string,
  position: "before" | "after" | "inside"
): JsxNode {
  if (root.id === targetId && position === "inside") {
    return {
      ...root,
      children: [...(root.children || []), node],
    };
  }

  if (root.children) {
    const targetIndex = root.children.findIndex((c) => c.id === targetId);

    if (targetIndex !== -1) {
      const newChildren = [...root.children];
      if (position === "before") {
        newChildren.splice(targetIndex, 0, node);
      } else if (position === "after") {
        newChildren.splice(targetIndex + 1, 0, node);
      } else if (position === "inside") {
        newChildren[targetIndex] = {
          ...newChildren[targetIndex],
          children: [...(newChildren[targetIndex].children || []), node],
        };
      }
      return { ...root, children: newChildren };
    }

    return {
      ...root,
      children: root.children.map((child) => insertNode(child, node, targetId, position)),
    };
  }

  return root;
}

export function moveNode(
  root: JsxNode,
  nodeId: string,
  targetId: string,
  position: "before" | "after" | "inside"
): JsxNode {
  const node = findNode(root, nodeId);
  if (!node) return root;

  let newRoot = deleteNode(root, nodeId);
  newRoot = insertNode(newRoot, node, targetId, position);

  return newRoot;
}
