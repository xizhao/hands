/**
 * Card Component Serialization Rules
 *
 * Handles MDX ↔ Plate conversion for:
 * - Card (container)
 * - CardHeader (container)
 * - CardContent (container)
 * - CardFooter (container)
 * - CardTitle (container with text)
 * - CardDescription (container with text)
 */

import { serializeChildren } from "../helpers";
import type { MdxSerializationRule, DeserializeOptions } from "../types";

// ============================================================================
// Types
// ============================================================================

export const CARD_KEY = "card";
export const CARD_HEADER_KEY = "card_header";
export const CARD_CONTENT_KEY = "card_content";
export const CARD_FOOTER_KEY = "card_footer";
export const CARD_TITLE_KEY = "card_title";
export const CARD_DESCRIPTION_KEY = "card_description";

import type { TElement, TText } from "platejs";

export interface TCardElement extends TElement {
  type: typeof CARD_KEY;
  children: (TElement | TText)[];
}

export interface TCardHeaderElement extends TElement {
  type: typeof CARD_HEADER_KEY;
  children: (TElement | TText)[];
}

export interface TCardContentElement extends TElement {
  type: typeof CARD_CONTENT_KEY;
  children: (TElement | TText)[];
}

export interface TCardFooterElement extends TElement {
  type: typeof CARD_FOOTER_KEY;
  children: (TElement | TText)[];
}

export interface TCardTitleElement extends TElement {
  type: typeof CARD_TITLE_KEY;
  children: (TElement | TText)[];
}

export interface TCardDescriptionElement extends TElement {
  type: typeof CARD_DESCRIPTION_KEY;
  children: (TElement | TText)[];
}

// ============================================================================
// Card
// ============================================================================

/**
 * Card serialization rule.
 *
 * MDX Example:
 * ```mdx
 * <Card>
 *   <CardHeader>
 *     <CardTitle>Project Overview</CardTitle>
 *     <CardDescription>Summary of your project status</CardDescription>
 *   </CardHeader>
 *   <CardContent>
 *     <p>Your project is on track.</p>
 *   </CardContent>
 * </Card>
 * ```
 */
export const cardRule: MdxSerializationRule<TCardElement> = {
  tagName: "Card",
  key: CARD_KEY,

  deserialize: (node, _deco, options) => {
    // Deserialize children
    let children: TCardElement["children"] = [
      { type: "p" as const, children: [{ text: "" }] },
    ];
    if (node.children && node.children.length > 0 && options?.convertChildren) {
      const converted = options.convertChildren(
        node.children as any,
        _deco as any,
        options as any
      );
      if (converted.length > 0) {
        children = converted;
      }
    }

    return {
      type: CARD_KEY,
      children,
    };
  },

  serialize: (element, options) => {
    const children = serializeChildren(element.children, options);

    return {
      type: "mdxJsxFlowElement",
      name: "Card",
      attributes: [],
      children: children as any[],
    };
  },
};

// ============================================================================
// CardHeader
// ============================================================================

/**
 * CardHeader serialization rule.
 *
 * MDX Example:
 * ```mdx
 * <CardHeader>
 *   <CardTitle>Title</CardTitle>
 *   <CardDescription>Description</CardDescription>
 * </CardHeader>
 * ```
 */
export const cardHeaderRule: MdxSerializationRule<TCardHeaderElement> = {
  tagName: "CardHeader",
  key: CARD_HEADER_KEY,

  deserialize: (node, _deco, options) => {
    // Deserialize children
    let children: TCardHeaderElement["children"] = [
      { type: "p" as const, children: [{ text: "" }] },
    ];
    if (node.children && node.children.length > 0 && options?.convertChildren) {
      const converted = options.convertChildren(
        node.children as any,
        _deco as any,
        options as any
      );
      if (converted.length > 0) {
        children = converted;
      }
    }

    return {
      type: CARD_HEADER_KEY,
      children,
    };
  },

  serialize: (element, options) => {
    const children = serializeChildren(element.children, options);

    return {
      type: "mdxJsxFlowElement",
      name: "CardHeader",
      attributes: [],
      children: children as any[],
    };
  },
};

// ============================================================================
// CardContent
// ============================================================================

/**
 * CardContent serialization rule.
 *
 * MDX Example:
 * ```mdx
 * <CardContent>
 *   <p>Content goes here...</p>
 * </CardContent>
 * ```
 */
export const cardContentRule: MdxSerializationRule<TCardContentElement> = {
  tagName: "CardContent",
  key: CARD_CONTENT_KEY,

  deserialize: (node, _deco, options) => {
    // Deserialize children
    let children: TCardContentElement["children"] = [
      { type: "p" as const, children: [{ text: "" }] },
    ];
    if (node.children && node.children.length > 0 && options?.convertChildren) {
      const converted = options.convertChildren(
        node.children as any,
        _deco as any,
        options as any
      );
      if (converted.length > 0) {
        children = converted;
      }
    }

    return {
      type: CARD_CONTENT_KEY,
      children,
    };
  },

  serialize: (element, options) => {
    const children = serializeChildren(element.children, options);

    return {
      type: "mdxJsxFlowElement",
      name: "CardContent",
      attributes: [],
      children: children as any[],
    };
  },
};

// ============================================================================
// CardFooter
// ============================================================================

/**
 * CardFooter serialization rule.
 *
 * MDX Example:
 * ```mdx
 * <CardFooter>
 *   <Button>Save</Button>
 * </CardFooter>
 * ```
 */
export const cardFooterRule: MdxSerializationRule<TCardFooterElement> = {
  tagName: "CardFooter",
  key: CARD_FOOTER_KEY,

  deserialize: (node, _deco, options) => {
    // Deserialize children
    let children: TCardFooterElement["children"] = [
      { type: "p" as const, children: [{ text: "" }] },
    ];
    if (node.children && node.children.length > 0 && options?.convertChildren) {
      const converted = options.convertChildren(
        node.children as any,
        _deco as any,
        options as any
      );
      if (converted.length > 0) {
        children = converted;
      }
    }

    return {
      type: CARD_FOOTER_KEY,
      children,
    };
  },

  serialize: (element, options) => {
    const children = serializeChildren(element.children, options);

    return {
      type: "mdxJsxFlowElement",
      name: "CardFooter",
      attributes: [],
      children: children as any[],
    };
  },
};

// ============================================================================
// CardTitle
// ============================================================================

/**
 * CardTitle serialization rule.
 *
 * MDX Example:
 * ```mdx
 * <CardTitle>Project Overview</CardTitle>
 * ```
 */
export const cardTitleRule: MdxSerializationRule<TCardTitleElement> = {
  tagName: "CardTitle",
  key: CARD_TITLE_KEY,

  deserialize: (node, _deco, options) => {
    // Deserialize children (title text)
    let children: TCardTitleElement["children"] = [{ text: "" }];
    if (node.children && node.children.length > 0 && options?.convertChildren) {
      const converted = options.convertChildren(
        node.children as any,
        _deco as any,
        options as any
      );
      if (converted.length > 0) {
        children = converted;
      }
    }

    return {
      type: CARD_TITLE_KEY,
      children,
    };
  },

  serialize: (element, options) => {
    const children = serializeChildren(element.children, options);

    return {
      type: "mdxJsxFlowElement",
      name: "CardTitle",
      attributes: [],
      children: children as any[],
    };
  },
};

// ============================================================================
// CardDescription
// ============================================================================

/**
 * CardDescription serialization rule.
 *
 * MDX Example:
 * ```mdx
 * <CardDescription>Summary of your project status</CardDescription>
 * ```
 */
export const cardDescriptionRule: MdxSerializationRule<TCardDescriptionElement> = {
  tagName: "CardDescription",
  key: CARD_DESCRIPTION_KEY,

  deserialize: (node, _deco, options) => {
    // Deserialize children (description text)
    let children: TCardDescriptionElement["children"] = [{ text: "" }];
    if (node.children && node.children.length > 0 && options?.convertChildren) {
      const converted = options.convertChildren(
        node.children as any,
        _deco as any,
        options as any
      );
      if (converted.length > 0) {
        children = converted;
      }
    }

    return {
      type: CARD_DESCRIPTION_KEY,
      children,
    };
  },

  serialize: (element, options) => {
    const children = serializeChildren(element.children, options);

    return {
      type: "mdxJsxFlowElement",
      name: "CardDescription",
      attributes: [],
      children: children as any[],
    };
  },
};

// ============================================================================
// Export all rules
// ============================================================================

export const cardRules = [
  cardRule,
  cardHeaderRule,
  cardContentRule,
  cardFooterRule,
  cardTitleRule,
  cardDescriptionRule,
];
