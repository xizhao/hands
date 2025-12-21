/**
 * Path utilities for navigating and manipulating the AST
 */
import type { JsxNode, NodePath, PropValue } from "../types";

/**
 * Get a node at a path
 */
export function getAtPath(root: JsxNode, path: NodePath): JsxNode | null {
  let current: JsxNode | undefined = root;

  for (const segment of path) {
    if (!current) return null;

    if (segment === "children") {
      // Next segment will be the index
      continue;
    }

    if (typeof segment === "number") {
      // Index into children array
      current = current.children?.[segment];
    } else {
      // String key - could be a property access
      return null; // Only 'children' + index is supported for now
    }
  }

  return current ?? null;
}

/**
 * Set a node at a path (immutably)
 */
export function setAtPath(root: JsxNode, path: NodePath, node: JsxNode): JsxNode {
  if (path.length === 0) {
    return node;
  }

  return updateAtPath(root, path, () => node);
}

/**
 * Delete a node at a path (immutably)
 */
export function deleteAtPath(root: JsxNode, path: NodePath): JsxNode {
  if (path.length < 2) {
    throw new Error("Cannot delete root node");
  }

  // Path should end with ['children', index]
  const parentPath = path.slice(0, -2);
  const index = path[path.length - 1] as number;

  return updateAtPath(root, parentPath, (parent) => {
    if (!parent.children) return parent;
    const newChildren = [...parent.children];
    newChildren.splice(index, 1);
    return { ...parent, children: newChildren };
  });
}

/**
 * Insert a node at a path (immutably)
 */
export function insertAtPath(
  root: JsxNode,
  parentPath: NodePath,
  index: number,
  node: JsxNode,
): JsxNode {
  return updateAtPath(root, parentPath, (parent) => {
    const children = parent.children ?? [];
    const newChildren = [...children];
    newChildren.splice(index, 0, node);
    return { ...parent, children: newChildren };
  });
}

/**
 * Move a node from one path to another (immutably)
 */
export function moveNode(
  root: JsxNode,
  fromPath: NodePath,
  toParentPath: NodePath,
  toIndex: number,
): JsxNode {
  // Get the node to move
  const node = getAtPath(root, fromPath);
  if (!node) {
    throw new Error(`Node not found at path: ${fromPath.join(".")}`);
  }

  // Delete from old location
  let result = deleteAtPath(root, fromPath);

  // Insert at new location
  // Note: if toParentPath was affected by the deletion, we need to adjust
  // This is a simplified version - production would need more careful handling
  result = insertAtPath(result, toParentPath, toIndex, node);

  return result;
}

/**
 * Update a node at a path using a transform function (immutably)
 */
export function updateAtPath(
  root: JsxNode,
  path: NodePath,
  transform: (node: JsxNode) => JsxNode,
): JsxNode {
  if (path.length === 0) {
    return transform(root);
  }

  // Build up the path segments, handling 'children' + index pairs
  const segments: { key: "children"; index: number }[] = [];

  for (let i = 0; i < path.length; i++) {
    if (path[i] === "children" && typeof path[i + 1] === "number") {
      segments.push({ key: "children", index: path[i + 1] as number });
      i++; // Skip the index
    }
  }

  // Apply transform from bottom up
  let current = root;
  for (const segment of segments) {
    const child = current.children?.[segment.index];
    if (!child) {
      throw new Error(`Invalid path: no child at index ${segment.index}`);
    }
    current = child;
  }

  // Now rebuild from bottom up
  let transformed = transform(current);

  for (let i = segments.length - 1; i >= 0; i--) {
    const parentPath = segments.slice(0, i);
    let parent = root;

    for (const seg of parentPath) {
      parent = parent.children?.[seg.index];
    }

    const newChildren = [...(parent.children ?? [])];
    newChildren[segments[i].index] = transformed;

    transformed = { ...parent, children: newChildren };
  }

  // If we had no segments, transform was applied to root
  if (segments.length === 0) {
    return transform(root);
  }

  // Final step: update root's children
  const newRootChildren = [...(root.children ?? [])];
  newRootChildren[segments[0].index] = transformed;

  return { ...root, children: newRootChildren };
}

/**
 * Set a prop on an element at a path
 */
export function setPropAtPath(
  root: JsxNode,
  path: NodePath,
  propName: string,
  value: PropValue,
): JsxNode {
  return updateAtPath(root, path, (node) => {
    if (node.type !== "element") {
      throw new Error("Cannot set prop on non-element node");
    }
    return {
      ...node,
      props: {
        ...node.props,
        [propName]: value,
      },
    };
  });
}

/**
 * Delete a prop from an element at a path
 */
export function deletePropAtPath(root: JsxNode, path: NodePath, propName: string): JsxNode {
  return updateAtPath(root, path, (node) => {
    if (node.type !== "element" || !node.props) {
      return node;
    }
    const { [propName]: _, ...restProps } = node.props;
    return {
      ...node,
      props: restProps,
    };
  });
}

/**
 * Set text content at a path
 */
export function setTextAtPath(root: JsxNode, path: NodePath, text: string): JsxNode {
  return updateAtPath(root, path, (node) => {
    if (node.type !== "text") {
      throw new Error("Cannot set text on non-text node");
    }
    return { ...node, text };
  });
}

/**
 * Wrap a node with another node
 */
export function wrapNodeAtPath(root: JsxNode, path: NodePath, wrapper: JsxNode): JsxNode {
  const node = getAtPath(root, path);
  if (!node) {
    throw new Error(`Node not found at path: ${path.join(".")}`);
  }

  // Create wrapper with the node as its child
  const wrappedNode: JsxNode = {
    ...wrapper,
    children: [node],
  };

  return setAtPath(root, path, wrappedNode);
}

/**
 * Unwrap a node (replace wrapper with its children)
 */
export function unwrapNodeAtPath(root: JsxNode, path: NodePath): JsxNode {
  const wrapper = getAtPath(root, path);
  if (!wrapper || wrapper.type !== "element") {
    throw new Error("Cannot unwrap non-element node");
  }

  const children = wrapper.children ?? [];
  if (children.length === 0) {
    // No children - just delete the wrapper
    return deleteAtPath(root, path);
  }

  if (children.length === 1) {
    // Single child - replace wrapper with child
    return setAtPath(root, path, children[0]);
  }

  // Multiple children - replace wrapper with first child, insert rest after
  // This is a simplification - production might want different behavior
  const parentPath = path.slice(0, -2);
  const index = path[path.length - 1] as number;

  let result = setAtPath(root, path, children[0]);

  for (let i = 1; i < children.length; i++) {
    result = insertAtPath(result, parentPath, index + i, children[i]);
  }

  return result;
}
