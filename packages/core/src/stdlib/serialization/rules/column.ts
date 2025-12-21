/**
 * Column Layout Serialization Rules
 *
 * Handles MDX ↔ Plate conversion for:
 * - Columns (ColumnGroup container)
 * - Column (individual column with width)
 */

import { convertChildrenDeserialize } from "@platejs/markdown";
import {
  COLUMN_GROUP_KEY,
  COLUMN_KEY,
  type TColumnGroupElement,
  type TColumnElement,
} from "../../../types";
import type { MdxSerializationRule } from "../types";
import { parseAttributes, serializeAttributes, serializeChildren } from "../helpers";

// ============================================================================
// Columns (ColumnGroup)
// ============================================================================

/**
 * Columns serialization rule.
 *
 * MDX Example:
 * ```mdx
 * <Columns>
 *   <Column width="50%">Left content</Column>
 *   <Column width="50%">Right content</Column>
 * </Columns>
 * ```
 */
export const columnsRule: MdxSerializationRule<TColumnGroupElement> = {
  tagName: "Columns",
  key: COLUMN_GROUP_KEY,

  deserialize: (node, _deco, options) => {
    // Deserialize children (should be Column elements)
    let children: TColumnGroupElement["children"] = [];
    if (node.children && node.children.length > 0 && options) {
      const converter = options.convertChildren ?? convertChildrenDeserialize;
      const converted = converter(
        node.children as any,
        _deco as any,
        options as any
      );
      if (converted.length > 0) {
        // Filter to only Column elements
        children = converted.filter(
          (child): child is TColumnElement =>
            "type" in child && child.type === COLUMN_KEY
        );
      }
    }

    // Ensure at least one column exists
    if (children.length === 0) {
      children = [
        {
          type: COLUMN_KEY,
          width: "100%",
          children: [{ type: "p" as const, children: [{ text: "" }] }],
        } as TColumnElement,
      ];
    }

    return {
      type: COLUMN_GROUP_KEY,
      children,
    };
  },

  serialize: (element, options) => {
    const children = serializeChildren(element.children, options);

    return {
      type: "mdxJsxFlowElement",
      name: "Columns",
      attributes: [],
      children: children as any[],
    };
  },
};

// ============================================================================
// Column
// ============================================================================

/**
 * Column serialization rule.
 *
 * MDX Example:
 * ```mdx
 * <Column width="50%">
 *   <p>Column content here...</p>
 * </Column>
 * ```
 */
export const columnRule: MdxSerializationRule<TColumnElement> = {
  tagName: "Column",
  key: COLUMN_KEY,

  deserialize: (node, _deco, options) => {
    const props = parseAttributes(node);

    // Deserialize children
    let children: TColumnElement["children"] = [
      { type: "p" as const, children: [{ text: "" }] },
    ];
    if (node.children && node.children.length > 0 && options) {
      const converter = options.convertChildren ?? convertChildrenDeserialize;
      const converted = converter(
        node.children as any,
        _deco as any,
        options as any
      );
      if (converted.length > 0) {
        children = converted;
      }
    }

    return {
      type: COLUMN_KEY,
      width: props.width as string | undefined,
      children,
    };
  },

  serialize: (element, options) => {
    const attrs = serializeAttributes(
      {
        width: element.width,
      },
      {
        include: ["width"],
      }
    );

    const children = serializeChildren(element.children, options);

    return {
      type: "mdxJsxFlowElement",
      name: "Column",
      attributes: attrs,
      children: children as any[],
    };
  },
};

// ============================================================================
// Export all rules
// ============================================================================

export const columnRules = [columnsRule, columnRule];
