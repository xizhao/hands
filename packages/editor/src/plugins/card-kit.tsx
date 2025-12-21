"use client";

/**
 * Card Plugin
 *
 * Provides Card layout components for MDX pages.
 * These are non-void block elements that contain children.
 *
 * MDX Syntax:
 * <Card>
 *   <CardHeader>
 *     <CardTitle>Title</CardTitle>
 *     <CardDescription>Description</CardDescription>
 *   </CardHeader>
 *   <CardContent>
 *     Content goes here...
 *   </CardContent>
 *   <CardFooter>
 *     Footer content...
 *   </CardFooter>
 * </Card>
 */

import { type TElement, type TText } from "platejs";
import {
  createPlatePlugin,
  PlateElement,
  type PlateElementProps,
  useSelected,
} from "platejs/react";
import { memo } from "react";
import { cn } from "../lib/utils";
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  CardTitle,
  CardDescription,
} from "../ui/card";

// ============================================================================
// Types
// ============================================================================

export const CARD_KEY = "card";
export const CARD_HEADER_KEY = "card_header";
export const CARD_CONTENT_KEY = "card_content";
export const CARD_FOOTER_KEY = "card_footer";
export const CARD_TITLE_KEY = "card_title";
export const CARD_DESCRIPTION_KEY = "card_description";

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
// Components
// ============================================================================

function CardElement(props: PlateElementProps) {
  const selected = useSelected();

  return (
    <PlateElement
      {...props}
      as="div"
      className={cn(
        "my-4",
        selected && "ring-2 ring-ring ring-offset-2"
      )}
    >
      <Card>{props.children}</Card>
    </PlateElement>
  );
}

function CardHeaderElement(props: PlateElementProps) {
  return (
    <PlateElement {...props} as="div">
      <CardHeader>{props.children}</CardHeader>
    </PlateElement>
  );
}

function CardContentElement(props: PlateElementProps) {
  return (
    <PlateElement {...props} as="div">
      <CardContent>{props.children}</CardContent>
    </PlateElement>
  );
}

function CardFooterElement(props: PlateElementProps) {
  return (
    <PlateElement {...props} as="div">
      <CardFooter>{props.children}</CardFooter>
    </PlateElement>
  );
}

function CardTitleElement(props: PlateElementProps) {
  return (
    <PlateElement {...props} as="div">
      <CardTitle>{props.children}</CardTitle>
    </PlateElement>
  );
}

function CardDescriptionElement(props: PlateElementProps) {
  return (
    <PlateElement {...props} as="div">
      <CardDescription>{props.children}</CardDescription>
    </PlateElement>
  );
}

// ============================================================================
// Plugins
// ============================================================================

export const CardPlugin = createPlatePlugin({
  key: CARD_KEY,
  node: {
    isElement: true,
    isInline: false,
    isVoid: false,
    component: memo(CardElement),
  },
});

export const CardHeaderPlugin = createPlatePlugin({
  key: CARD_HEADER_KEY,
  node: {
    isElement: true,
    isInline: false,
    isVoid: false,
    component: memo(CardHeaderElement),
  },
});

export const CardContentPlugin = createPlatePlugin({
  key: CARD_CONTENT_KEY,
  node: {
    isElement: true,
    isInline: false,
    isVoid: false,
    component: memo(CardContentElement),
  },
});

export const CardFooterPlugin = createPlatePlugin({
  key: CARD_FOOTER_KEY,
  node: {
    isElement: true,
    isInline: false,
    isVoid: false,
    component: memo(CardFooterElement),
  },
});

export const CardTitlePlugin = createPlatePlugin({
  key: CARD_TITLE_KEY,
  node: {
    isElement: true,
    isInline: false,
    isVoid: false,
    component: memo(CardTitleElement),
  },
});

export const CardDescriptionPlugin = createPlatePlugin({
  key: CARD_DESCRIPTION_KEY,
  node: {
    isElement: true,
    isInline: false,
    isVoid: false,
    component: memo(CardDescriptionElement),
  },
});

export const CardKit = [
  CardPlugin,
  CardHeaderPlugin,
  CardContentPlugin,
  CardFooterPlugin,
  CardTitlePlugin,
  CardDescriptionPlugin,
];

// ============================================================================
// NOTE: Markdown Serialization/Deserialization
// ============================================================================
//
// All Card serialization/deserialization rules are now provided by
// @hands/core/stdlib and imported via markdown-kit.tsx using
// toMarkdownPluginRules(serializationRules).
//
// This keeps serialization logic in a single place (core) and avoids duplication.

// ============================================================================
// Element Creators
// ============================================================================

export function createCardElement(
  children?: (TElement | TText)[]
): TCardElement {
  return {
    type: CARD_KEY,
    children: children ?? [{ type: "p" as const, children: [{ text: "" }] }],
  };
}

export function createCardHeaderElement(
  children?: (TElement | TText)[]
): TCardHeaderElement {
  return {
    type: CARD_HEADER_KEY,
    children: children ?? [{ type: "p" as const, children: [{ text: "" }] }],
  };
}

export function createCardContentElement(
  children?: (TElement | TText)[]
): TCardContentElement {
  return {
    type: CARD_CONTENT_KEY,
    children: children ?? [{ type: "p" as const, children: [{ text: "" }] }],
  };
}

export function createCardFooterElement(
  children?: (TElement | TText)[]
): TCardFooterElement {
  return {
    type: CARD_FOOTER_KEY,
    children: children ?? [{ type: "p" as const, children: [{ text: "" }] }],
  };
}

export function createCardTitleElement(
  children?: (TElement | TText)[]
): TCardTitleElement {
  return {
    type: CARD_TITLE_KEY,
    children: children ?? [{ text: "" }],
  };
}

export function createCardDescriptionElement(
  children?: (TElement | TText)[]
): TCardDescriptionElement {
  return {
    type: CARD_DESCRIPTION_KEY,
    children: children ?? [{ text: "" }],
  };
}
