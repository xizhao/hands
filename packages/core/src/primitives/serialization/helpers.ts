/**
 * MDX Serialization Helpers
 *
 * DRY utilities for parsing MDX attributes and serializing Plate elements.
 * Handles edge cases: expressions, booleans, arrays, objects, null values.
 */

import type {
  MdxJsxAttribute,
  MdxJsxAttributeValueExpression,
  MdxDeserializeNode,
  SerializeOptions,
} from "./types";
import type { TElement, TText } from "platejs";
import {
  convertNodesSerialize as plateConvertNodesSerialize,
  convertChildrenDeserialize as plateConvertChildrenDeserialize,
} from "@platejs/markdown";

// ============================================================================
// Attribute Parsing (MDX → Props)
// ============================================================================

/**
 * Parse a single MDX attribute value to its JavaScript equivalent.
 *
 * Handles:
 * - null/undefined → true (boolean attribute like `required`)
 * - string → string (or stringified expression object)
 * - expression → parsed JSON or raw string
 */
export function parseAttributeValue(
  value: string | MdxJsxAttributeValueExpression | null | undefined
): unknown {
  // Boolean attribute: <Input required /> → required: true
  if (value === null || value === undefined) {
    return true;
  }

  // String value: <Input name="email" /> → name: "email"
  // Also handle stringified expression objects (can happen in worker contexts)
  if (typeof value === "string") {
    // Check if it's a stringified mdxJsxAttributeValueExpression
    if (value.startsWith('{"type":"mdxJsxAttributeValueExpression"')) {
      try {
        const parsed = JSON.parse(value);
        if (parsed.type === "mdxJsxAttributeValueExpression" && parsed.value) {
          return parseExpression(parsed.value);
        }
      } catch {
        // Not valid JSON, fall through
      }
    }
    return value;
  }

  // Expression value: <Input min={5} /> or <Select options={[...]} />
  if (
    typeof value === "object" &&
    value.type === "mdxJsxAttributeValueExpression"
  ) {
    return parseExpression(value.value);
  }

  return value;
}

/**
 * Convert JS object syntax to valid JSON by quoting unquoted keys.
 * e.g., `{value: "a", label: "A"}` → `{"value": "a", "label": "A"}`
 */
function jsObjectToJson(str: string): string {
  // Match unquoted keys followed by colon
  // This regex handles: { key: value } and { key : value }
  return str.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*:)/g, '$1"$2"$3');
}

/**
 * Parse an MDX expression string to its JavaScript value.
 *
 * Handles:
 * - JSON: `{"key": "value"}`, `[1, 2, 3]`
 * - JS object syntax: `{ value: "a", label: "A" }`
 * - Numbers: `5`, `3.14`
 * - Booleans: `true`, `false`
 * - null/undefined
 * - Fallback to raw string
 */
export function parseExpression(expr: string): unknown {
  const trimmed = expr.trim();

  // Empty
  if (!trimmed) return undefined;

  // Try JSON first
  try {
    return JSON.parse(trimmed);
  } catch {
    // Not valid JSON, continue
  }

  // Handle JS object/array syntax (unquoted keys)
  // e.g., [{ value: "a", label: "A" }]
  if (
    (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
    (trimmed.startsWith("{") && trimmed.endsWith("}"))
  ) {
    try {
      // Convert JS object syntax to JSON by quoting keys
      const jsonified = jsObjectToJson(trimmed);
      return JSON.parse(jsonified);
    } catch {
      // Fallback to string
    }
  }

  // Number
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  // Boolean
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;

  // null/undefined
  if (trimmed === "null") return null;
  if (trimmed === "undefined") return undefined;

  // Fallback: return as string
  return trimmed;
}

/**
 * Parse all attributes from an MDX node into a props object.
 *
 * @example
 * ```tsx
 * // <LiveValue query="SELECT *" display="table" params={{ limit: 10 }} />
 * parseAttributes(node) // → { query: "SELECT *", display: "table", params: { limit: 10 } }
 * ```
 */
export function parseAttributes(
  node: MdxDeserializeNode
): Record<string, unknown> {
  const props: Record<string, unknown> = {};

  for (const attr of node.attributes || []) {
    if (attr.type === "mdxJsxAttribute") {
      props[attr.name] = parseAttributeValue(attr.value);
    }
  }

  return props;
}

/**
 * Parse attributes and return typed result with defaults.
 *
 * @example
 * ```ts
 * const { query, display } = parseAttributesTyped(node, {
 *   query: "",
 *   display: "auto",
 * });
 * ```
 */
export function parseAttributesTyped<T extends Record<string, unknown>>(
  node: MdxDeserializeNode,
  defaults: T
): T {
  const parsed = parseAttributes(node);
  return { ...defaults, ...parsed } as T;
}

// ============================================================================
// Attribute Serialization (Props → MDX)
// ============================================================================

/**
 * Serialize a JavaScript value to an MDX attribute value.
 *
 * Handles:
 * - undefined/null → omit (don't include attribute)
 * - true → null (boolean attribute)
 * - false → omit
 * - string → string
 * - number/object/array → expression
 */
export function serializeAttributeValue(
  value: unknown
): string | MdxJsxAttributeValueExpression | null | undefined {
  // Omit undefined/null values
  if (value === undefined || value === null) {
    return undefined;
  }

  // Boolean true → boolean attribute (no value)
  if (value === true) {
    return null;
  }

  // Boolean false → omit attribute
  if (value === false) {
    return undefined;
  }

  // String → direct value
  if (typeof value === "string") {
    return value;
  }

  // Number → expression
  if (typeof value === "number") {
    return {
      type: "mdxJsxAttributeValueExpression",
      value: String(value),
    };
  }

  // Array/Object → JSON expression
  if (typeof value === "object") {
    return {
      type: "mdxJsxAttributeValueExpression",
      value: JSON.stringify(value),
    };
  }

  // Fallback
  return String(value);
}

/**
 * Serialize a value to MDX attribute, using JS object syntax for arrays of objects.
 * This produces more readable output like `options={[{ value: "a", label: "A" }]}`
 * instead of `options={[{"value":"a","label":"A"}]}`.
 */
export function serializeAttributeValueReadable(
  value: unknown
): string | MdxJsxAttributeValueExpression | null | undefined {
  // Handle arrays of objects specially for readability
  if (
    Array.isArray(value) &&
    value.length > 0 &&
    typeof value[0] === "object" &&
    value[0] !== null
  ) {
    const items = value.map((item) => {
      if (typeof item === "object" && item !== null) {
        const entries = Object.entries(item)
          .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
          .join(", ");
        return `{ ${entries} }`;
      }
      return JSON.stringify(item);
    });
    return {
      type: "mdxJsxAttributeValueExpression",
      value: `[${items.join(", ")}]`,
    };
  }

  return serializeAttributeValue(value);
}

/**
 * Serialize a props object to MDX attributes array.
 *
 * @param props - Object with prop values
 * @param options - Serialization options
 * @returns Array of MDX JSX attributes
 *
 * @example
 * ```ts
 * serializeAttributes({ query: "SELECT *", display: "table" })
 * // → [{ type: "mdxJsxAttribute", name: "query", value: "SELECT *" }, ...]
 * ```
 */
export function serializeAttributes(
  props: Record<string, unknown>,
  options: {
    /** Use readable JS syntax for arrays of objects */
    readable?: boolean;
    /** Only include these keys (in this order) */
    include?: string[];
    /** Exclude these keys */
    exclude?: string[];
    /** Default values - don't serialize if value equals default */
    defaults?: Record<string, unknown>;
  } = {}
): MdxJsxAttribute[] {
  const { readable = true, include, exclude = [], defaults = {} } = options;

  const attrs: MdxJsxAttribute[] = [];
  const keys = include || Object.keys(props);

  for (const key of keys) {
    // Skip excluded keys
    if (exclude.includes(key)) continue;

    const value = props[key];

    // Skip undefined/null
    if (value === undefined || value === null) continue;

    // Skip if value equals default
    if (key in defaults && deepEqual(value, defaults[key])) continue;

    // Skip false booleans (they're omitted)
    if (value === false) continue;

    const serialized = readable
      ? serializeAttributeValueReadable(value)
      : serializeAttributeValue(value);

    // Skip if serialization returns undefined
    if (serialized === undefined) continue;

    attrs.push({
      type: "mdxJsxAttribute",
      name: key,
      value: serialized,
    });
  }

  return attrs;
}

// ============================================================================
// Child Handling
// ============================================================================

/**
 * Check if children contain actual content (not just empty text).
 */
export function hasChildContent(children: unknown[]): boolean {
  if (!children || children.length === 0) return false;

  // Single empty text node
  if (children.length === 1) {
    const child = children[0] as Record<string, unknown>;
    if (child.type === "text" && !child.value) return false;
    if ("text" in child && !child.text) return false;
  }

  return true;
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Deep equality check for values.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a !== "object") return a === b;

  const aKeys = Object.keys(a as object);
  const bKeys = Object.keys(b as object);

  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    if (
      !deepEqual(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key]
      )
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Create a simple void element (no children except empty text).
 */
export function createVoidElement<T extends { type: string }>(
  type: string,
  props: Omit<T, "type" | "children">
): T {
  return {
    type,
    ...props,
    children: [{ text: "" }],
  } as unknown as T;
}

/**
 * Create a container element with children.
 */
export function createContainerElement<T extends { type: string }>(
  type: string,
  props: Omit<T, "type" | "children">,
  children: unknown[]
): T {
  return {
    type,
    ...props,
    children: children.length > 0 ? children : [{ text: "" }],
  } as unknown as T;
}

// ============================================================================
// Child Serialization
// ============================================================================

/**
 * Serialize Plate children to mdast nodes.
 *
 * Uses convertNodesSerialize when a real editor is available,
 * falls back to custom _rules for testing.
 *
 * @param children - Plate element children to serialize
 * @param options - Serialization options
 * @returns Array of mdast nodes
 */
export function serializeChildren(
  children: (TElement | TText)[],
  options?: SerializeOptions
): unknown[] {
  if (!options) return [];

  // Use custom rules for testing (when no editor available)
  const rules = (options as any)._rules as Record<string, { serialize: (node: any, opts: SerializeOptions) => unknown }> | undefined;
  if (rules) {
    return children.map((node) => {
      // Handle text nodes with marks (bold, italic, code, strikethrough)
      if ("text" in node) {
        const textNode = node as TText & { bold?: boolean; italic?: boolean; code?: boolean; strikethrough?: boolean };
        // Inline code is special - it's a leaf node, not a wrapper
        if (textNode.code) {
          return { type: "inlineCode", value: textNode.text };
        }
        let result: any = { type: "text", value: textNode.text };
        if (textNode.bold) result = { type: "strong", children: [result] };
        if (textNode.italic) result = { type: "emphasis", children: [result] };
        if (textNode.strikethrough) result = { type: "delete", children: [result] };
        return result;
      }
      // Handle element nodes
      const element = node as TElement;
      const rule = rules[element.type];
      if (rule) {
        return rule.serialize(element, options);
      }
      // Fallback: return node as-is
      return node;
    });
  }

  // Use Plate's convertNodesSerialize when editor is available
  if (options.editor) {
    return plateConvertNodesSerialize(children, options as any);
  }

  return [];
}

// ============================================================================
// Child Deserialization
// ============================================================================

/**
 * Deserialize mdast children to Plate nodes.
 *
 * Uses convertChildrenDeserialize from Plate.
 *
 * @param children - Mdast children to deserialize
 * @param deco - Decoration object (for marks)
 * @param options - Deserialization options
 * @returns Array of Plate nodes
 */
export function deserializeChildren(
  children: unknown[],
  deco: unknown,
  options?: unknown
): (TElement | TText)[] {
  if (!children || children.length === 0) return [];
  return plateConvertChildrenDeserialize(children as any, deco as any, options as any);
}
