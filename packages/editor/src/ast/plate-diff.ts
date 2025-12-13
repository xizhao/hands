/**
 * Plate Value Differ
 *
 * Compares two Plate editor values and generates surgical mutations
 * to transform the old state into the new state.
 */

import type { TElement, Value } from "platejs";
import type { SurgicalMutation } from "./surgical-mutations";

// ============================================================================
// Types
// ============================================================================

/** A Plate element with our stable ID */
interface PlateElementWithId extends TElement {
  id?: string;
}

/** Text node in Plate */
interface PlateText {
  text: string;
  [key: string]: unknown;
}

// ============================================================================
// ID Management
// ============================================================================

/**
 * Generate stable ID for a Plate node based on its position
 * Must match the strategy in oxc-parser.ts
 */
function generatePlateNodeId(path: number[], element: TElement): string {
  const pathStr = path.join(".");
  const type = element.type as string;
  const safeName = type.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${safeName}_${pathStr}`;
}

/**
 * Get the ID from a Plate element, or generate one based on path
 */
function getOrGenerateId(element: TElement, path: number[]): string {
  if ((element as PlateElementWithId).id) {
    return (element as PlateElementWithId).id!;
  }
  return generatePlateNodeId(path, element);
}

// ============================================================================
// Value Extraction
// ============================================================================

/**
 * Get text content from Plate children
 */
function getTextContent(children: (TElement | PlateText)[]): string {
  return children
    .filter((child): child is PlateText => "text" in child)
    .map((child) => child.text)
    .join("");
}

/**
 * Get element children from Plate children
 */
function getElementChildren(children: (TElement | PlateText)[]): TElement[] {
  return children.filter((child): child is TElement => "type" in child && !("text" in child));
}

/**
 * Extract props from a Plate element (excluding internal fields)
 */
function extractProps(element: TElement): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  const internalKeys = ["type", "children", "id"];

  for (const [key, value] of Object.entries(element)) {
    if (!internalKeys.includes(key)) {
      props[key] = value;
    }
  }

  return props;
}

// ============================================================================
// Diffing
// ============================================================================

/**
 * Compare two values for equality (deep)
 */
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a !== "object") return a === b;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => valuesEqual(item, b[i]));
  }

  if (typeof a === "object" && typeof b === "object") {
    const aKeys = Object.keys(a as object);
    const bKeys = Object.keys(b as object);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) =>
      valuesEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
    );
  }

  return false;
}

/**
 * Diff props between old and new element
 */
function diffProps(
  nodeId: string,
  oldProps: Record<string, unknown>,
  newProps: Record<string, unknown>,
): SurgicalMutation[] {
  const mutations: SurgicalMutation[] = [];

  // Check for changed or new props
  for (const [key, newValue] of Object.entries(newProps)) {
    const oldValue = oldProps[key];
    if (!valuesEqual(oldValue, newValue)) {
      mutations.push({
        type: "set-prop",
        nodeId,
        propName: key,
        value: newValue as string | number | boolean | null,
      });
    }
  }

  // Check for deleted props
  for (const key of Object.keys(oldProps)) {
    if (!(key in newProps)) {
      mutations.push({
        type: "delete-prop",
        nodeId,
        propName: key,
      });
    }
  }

  return mutations;
}

/**
 * Diff children between old and new element
 */
function diffChildren(
  parentId: string,
  oldChildren: TElement[],
  newChildren: TElement[],
  basePath: number[],
): SurgicalMutation[] {
  const mutations: SurgicalMutation[] = [];

  // Build ID maps for old and new children
  const oldById = new Map<string, { element: TElement; index: number }>();
  const newById = new Map<string, { element: TElement; index: number }>();

  oldChildren.forEach((el, index) => {
    const id = getOrGenerateId(el, [...basePath, index]);
    oldById.set(id, { element: el, index });
  });

  newChildren.forEach((el, index) => {
    const id = getOrGenerateId(el, [...basePath, index]);
    newById.set(id, { element: el, index });
  });

  // Find deleted nodes (in old but not in new)
  for (const [id] of oldById) {
    if (!newById.has(id)) {
      mutations.push({ type: "delete-node", nodeId: id });
    }
  }

  // Find added nodes (in new but not in old)
  for (const [id, { element, index }] of newById) {
    if (!oldById.has(id)) {
      // Generate JSX for the new node
      const jsx = plateElementToJsx(element);
      mutations.push({
        type: "insert-node",
        parentId,
        index,
        jsx,
      });
    }
  }

  // Find moved nodes (same ID, different index)
  for (const [id, { element: newEl, index: newIndex }] of newById) {
    const oldEntry = oldById.get(id);
    if (oldEntry && oldEntry.index !== newIndex) {
      mutations.push({
        type: "move-node",
        nodeId: id,
        newParentId: parentId,
        newIndex,
      });
    }
  }

  // Recursively diff existing nodes
  for (const [id, { element: newEl, index: newIndex }] of newById) {
    const oldEntry = oldById.get(id);
    if (oldEntry) {
      const childMutations = diffElement(id, oldEntry.element, newEl, [...basePath, newIndex]);
      mutations.push(...childMutations);
    }
  }

  return mutations;
}

/**
 * Diff a single element
 */
function diffElement(
  nodeId: string,
  oldEl: TElement,
  newEl: TElement,
  path: number[],
): SurgicalMutation[] {
  const mutations: SurgicalMutation[] = [];

  // Check if type changed (requires full replace)
  if (oldEl.type !== newEl.type) {
    mutations.push({
      type: "replace-node",
      nodeId,
      jsx: plateElementToJsx(newEl),
    });
    return mutations;
  }

  // Diff props
  const oldProps = extractProps(oldEl);
  const newProps = extractProps(newEl);
  mutations.push(...diffProps(nodeId, oldProps, newProps));

  // Diff text content
  const oldText = getTextContent(oldEl.children || []);
  const newText = getTextContent(newEl.children || []);
  if (oldText !== newText && !getElementChildren(newEl.children || []).length) {
    // Only set text if there are no element children
    mutations.push({
      type: "set-text",
      nodeId,
      text: newText,
    });
  }

  // Diff element children
  const oldElementChildren = getElementChildren(oldEl.children || []);
  const newElementChildren = getElementChildren(newEl.children || []);

  if (oldElementChildren.length > 0 || newElementChildren.length > 0) {
    mutations.push(...diffChildren(nodeId, oldElementChildren, newElementChildren, path));
  }

  return mutations;
}

// ============================================================================
// JSX Generation (for insert/replace)
// ============================================================================

/**
 * Convert a Plate element to JSX string
 */
function plateElementToJsx(element: TElement): string {
  const type = element.type as string;

  // Map Plate types to JSX tags
  const tagName = plateTypeToTagName(type);
  const props = extractProps(element);
  const propsStr = Object.entries(props)
    .map(([key, value]) => formatPropForJsx(key, value))
    .join(" ");

  const children = element.children || [];
  const textContent = getTextContent(children);
  const elementChildren = getElementChildren(children);

  // Self-closing if no content
  if (!textContent && elementChildren.length === 0) {
    return propsStr ? `<${tagName} ${propsStr} />` : `<${tagName} />`;
  }

  // With children
  const openTag = propsStr ? `<${tagName} ${propsStr}>` : `<${tagName}>`;
  const closeTag = `</${tagName}>`;

  if (elementChildren.length > 0) {
    const childrenJsx = elementChildren.map(plateElementToJsx).join("\n");
    return `${openTag}\n${childrenJsx}\n${closeTag}`;
  }

  return `${openTag}${textContent}${closeTag}`;
}

/**
 * Map Plate type to JSX tag name
 */
function plateTypeToTagName(type: string): string {
  const mapping: Record<string, string> = {
    p: "p",
    paragraph: "p",
    h1: "h1",
    h2: "h2",
    h3: "h3",
    blockquote: "blockquote",
    hr: "hr",
    "stdlib-component": "div", // Special handling needed
  };

  return mapping[type] || type;
}

/**
 * Format a prop value for JSX
 */
function formatPropForJsx(name: string, value: unknown): string {
  if (value === true) return name;
  if (value === false) return `${name}={false}`;
  if (value === null) return `${name}={null}`;
  if (typeof value === "number") return `${name}={${value}}`;
  if (typeof value === "string") {
    if (value.includes('"')) {
      return `${name}={'${value.replace(/'/g, "\\'")}'}`;
    }
    return `${name}="${value}"`;
  }
  return `${name}={${JSON.stringify(value)}}`;
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Diff two Plate values and generate surgical mutations
 */
export function diffPlateValues(oldValue: Value, newValue: Value): SurgicalMutation[] {
  const mutations: SurgicalMutation[] = [];

  // Treat root as a virtual fragment
  const virtualParentId = "fragment_0"; // Matches oxc-parser root ID

  // Diff at the top level
  mutations.push(
    ...diffChildren(virtualParentId, oldValue as TElement[], newValue as TElement[], [0]),
  );

  return mutations;
}

/**
 * Generate mutations to transform source to match new Plate value
 *
 * This is the main entry point for the surgical editing system.
 */
export function generateMutationsFromPlateChange(
  oldValue: Value,
  newValue: Value,
): SurgicalMutation[] {
  return diffPlateValues(oldValue, newValue);
}
