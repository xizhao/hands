/**
 * Tabs Component Serialization Rules
 *
 * Handles MDX ↔ Plate conversion for tabbed navigation.
 *
 * ```mdx
 * <Tabs defaultValue="overview">
 *   <Tab value="overview" label="Overview">Overview content here</Tab>
 *   <Tab value="metrics" label="Metrics">Metrics and charts</Tab>
 * </Tabs>
 * ```
 */

import { TAB_KEY, TABS_KEY, type TTabElement, type TTabsElement } from "../../../types";
import { parseAttributes, serializeAttributes, serializeChildren } from "../helpers";
import type { MdxSerializationRule } from "../types";

// ============================================================================
// Tab (Individual Panel)
// ============================================================================

/**
 * Tab serialization rule.
 *
 * MDX Example:
 * ```mdx
 * <Tab value="overview" label="Overview">Content here</Tab>
 * ```
 */
export const tabRule: MdxSerializationRule<TTabElement> = {
  tagName: "Tab",
  key: TAB_KEY,

  deserialize: (node, deco, options) => {
    const props = parseAttributes(node);
    const children = options?.convertChildren
      ? options.convertChildren((node.children as any) || [], deco as any, options as any)
      : [{ text: "" }];

    return {
      type: TAB_KEY,
      value: props.value as string,
      label: props.label as string,
      children,
    } as TTabElement;
  },

  serialize: (element, options) => {
    const attrs = serializeAttributes(
      {
        value: element.value,
        label: element.label,
      },
      {
        include: ["value", "label"],
      },
    );

    const children = serializeChildren(element.children, options);

    return {
      type: "mdxJsxFlowElement",
      name: "Tab",
      attributes: attrs,
      children: children as any[],
    };
  },
};

// ============================================================================
// Tabs (Container)
// ============================================================================

/**
 * Tabs serialization rule.
 *
 * MDX Example:
 * ```mdx
 * <Tabs defaultValue="overview">
 *   <Tab value="overview" label="Overview">Overview content here</Tab>
 *   <Tab value="metrics" label="Metrics">Metrics and charts</Tab>
 * </Tabs>
 * ```
 */
export const tabsRule: MdxSerializationRule<TTabsElement> = {
  tagName: "Tabs",
  key: TABS_KEY,

  deserialize: (node, deco, options) => {
    const props = parseAttributes(node);
    const children = options?.convertChildren
      ? options.convertChildren((node.children as any) || [], deco as any, options as any)
      : [];

    // Filter to only Tab elements
    const tabChildren = (children || []).filter(
      (child: any) => child.type === TAB_KEY,
    ) as TTabElement[];

    // Ensure we have at least one tab
    if (tabChildren.length === 0) {
      tabChildren.push({
        type: TAB_KEY,
        value: "tab1",
        label: "Tab 1",
        children: [{ text: "" }],
      } as TTabElement);
    }

    return {
      type: TABS_KEY,
      defaultValue: (props.defaultValue as string) || tabChildren[0]?.value,
      children: tabChildren,
    } as TTabsElement;
  },

  serialize: (element, options) => {
    const attrs = serializeAttributes(
      {
        defaultValue: element.defaultValue,
      },
      {
        include: ["defaultValue"],
      },
    );

    // Serialize child Tab elements
    const children = serializeChildren(element.children, options);

    return {
      type: "mdxJsxFlowElement",
      name: "Tabs",
      attributes: attrs,
      children: children as any[],
    };
  },
};

// ============================================================================
// Export all rules
// ============================================================================

export const tabsRules = [tabsRule, tabRule];
