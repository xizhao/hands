/**
 * LiveValue Serialization Rule
 *
 * Handles MDX ↔ Plate conversion for LiveValue elements.
 */

import {
  LIVE_VALUE_KEY,
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
export const liveValueRule: MdxSerializationRule<TLiveValueElement> = {
  tagName: "LiveValue",
  key: LIVE_VALUE_KEY,

  deserialize: (node, deco, options) => {
    const props = parseAttributes(node);

    // Handle children if present (template mode or chart children)
    // Use options.convertChildren if available (for tests), otherwise Plate's native function
    let children: TLiveValueElement["children"] = [{ text: "" }];
    if (node.children && node.children.length > 0 && options) {
      const converter = options.convertChildren ?? convertChildrenDeserialize;
      const converted = converter(node.children as any, deco as any, options as any);
      if (hasChildContent(converted)) {
        children = converted;
      }
    }

    return {
      type: LIVE_VALUE_KEY,
      query: (props.query as string) || "",
      display: (props.display as DisplayMode | undefined) ?? "auto",
      params: props.params as Record<string, unknown> | undefined,
      columns: props.columns as ColumnConfig[] | "auto" | undefined,
      className: props.className as string | undefined,
      children,
    };
  },

  serialize: (element, options) => {
    // Check if element has template content
    const hasTemplate = hasChildContent(element.children);

    // Build attributes
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

    // Serialize children if template mode
    const children = hasTemplate
      ? serializeChildren(element.children, options)
      : [];

    return {
      type: hasTemplate ? "mdxJsxFlowElement" : "mdxJsxTextElement",
      name: "LiveValue",
      attributes: attrs,
      children: children as any[],
    };
  },
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
