/**
 * LiveValue Serialization Rule
 *
 * Handles MDX ↔ Plate conversion for LiveValue elements.
 */

import {
  LIVE_VALUE_KEY,
  LIVE_VALUE_INLINE_KEY,
  type DisplayMode,
  type ColumnConfig,
  type TLiveValueElement,
} from "../../../types";
import type { MdxSerializationRule, DeserializeOptions } from "../types";
import { convertChildrenDeserialize } from "@platejs/markdown";
import {
  parseAttributes,
  serializeAttributes,
  hasChildContent,
  createVoidElement,
  serializeChildren,
} from "../helpers";

/**
 * LiveValue serialization rule.
 *
 * MDX Examples:
 * ```mdx
 * <LiveValue query="SELECT COUNT(*) FROM users" />
 * <LiveValue query="SELECT name FROM users" display="list" />
 * <LiveValue query="SELECT * FROM tasks" display="table" columns="auto" />
 * <LiveValue query="SELECT name, value FROM metrics">
 *   ## {{value}}
 *   {{name}}
 * </LiveValue>
 * ```
 */
/**
 * Shared serialize function for both block and inline LiveValue.
 */
function serializeLiveValue(element: TLiveValueElement, options: any) {
  const hasTemplate = hasChildContent(element.children);

  const attrs = serializeAttributes(
    {
      query: element.query,
      display: element.display,
      params: element.params,
      columns: element.columns,
      className: element.className,
    },
    {
      include: ["query", "display", "params", "columns", "className"],
      defaults: { display: "auto" },
    }
  );

  const children = hasTemplate
    ? serializeChildren(element.children, options)
    : [];

  return {
    type: "mdxJsxFlowElement",
    name: "LiveValue",
    attributes: attrs,
    children: children as any[],
  };
}

/**
 * LiveValue (Block) serialization rule - for charts and complex content.
 */
export const liveValueRule: MdxSerializationRule<TLiveValueElement> = {
  tagName: "LiveValue",
  key: LIVE_VALUE_KEY,

  deserialize: (node, deco, options) => {
    const props = parseAttributes(node);

    // Handle children if present (template mode or chart children)
    let children: TLiveValueElement["children"] = [{ text: "" }];
    let hasChildren = false;
    if (node.children && node.children.length > 0 && options) {
      const converter = options.convertChildren ?? convertChildrenDeserialize;
      const converted = converter(node.children as any, deco as any, options as any);
      if (hasChildContent(converted)) {
        children = converted;
        hasChildren = true;
      }
    }

    // Pick element type: block if has children (charts), inline if no children
    const elementType = hasChildren ? LIVE_VALUE_KEY : LIVE_VALUE_INLINE_KEY;

    return {
      type: elementType,
      query: (props.query as string) || "",
      display: (props.display as DisplayMode | undefined) ?? "auto",
      params: props.params as Record<string, unknown> | undefined,
      columns: props.columns as ColumnConfig[] | "auto" | undefined,
      className: props.className as string | undefined,
      children,
    };
  },

  serialize: serializeLiveValue,
};

/**
 * LiveValue Inline serialization rule - serializes inline variant to same MDX.
 */
export const liveValueInlineRule: MdxSerializationRule<TLiveValueElement> = {
  tagName: "LiveValue", // Same tag name (handled by liveValueRule for deserialize)
  key: LIVE_VALUE_INLINE_KEY,
  deserialize: liveValueRule.deserialize, // Shared deserialize
  serialize: serializeLiveValue, // Same serialize output
};

/**
 * Legacy alias: LiveQuery → LiveValue
 */
export const liveQueryRule: MdxSerializationRule<TLiveValueElement> = {
  tagName: "LiveQuery",
  key: LIVE_VALUE_KEY, // Maps to same element type
  deserialize: liveValueRule.deserialize,
  serialize: liveValueRule.serialize,
};
