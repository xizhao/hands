/**
 * MDX Serialization Types
 *
 * Type definitions for the serialization rule system.
 */

import type { TElement, TText, SlateEditor } from "platejs";

// ============================================================================
// MDX AST Types (from mdast-util-mdx-jsx)
// ============================================================================

export interface MdxJsxAttribute {
  type: "mdxJsxAttribute";
  name: string;
  value: string | MdxJsxAttributeValueExpression | null;
}

export interface MdxJsxAttributeValueExpression {
  type: "mdxJsxAttributeValueExpression";
  value: string;
}

export interface MdxJsxElement {
  type: "mdxJsxFlowElement" | "mdxJsxTextElement";
  name: string;
  attributes: MdxJsxAttribute[];
  children: MdxNode[];
}

export type MdxNode = MdxJsxElement | MdastText | MdastParagraph | TElement;

export interface MdastText {
  type: "text";
  value: string;
}

export interface MdastParagraph {
  type: "paragraph";
  children: MdxNode[];
}

// ============================================================================
// Deserialization Options
// ============================================================================

/**
 * Options passed to deserialize functions.
 * Matches Plate's MarkdownPlugin deserialize signature.
 */
export interface DeserializeOptions {
  /** Recursively deserialize child nodes */
  convertChildren?: (
    children: unknown[],
    deco: unknown,
    options: DeserializeOptions
  ) => (TElement | TText)[];
}

/**
 * Node passed to deserialize function.
 * Contains MDX JSX element attributes and children.
 */
export interface MdxDeserializeNode {
  attributes?: MdxJsxAttribute[];
  children?: unknown[];
}

// ============================================================================
// Serialization Options
// ============================================================================

/**
 * Options passed to serialize functions by Plate's MarkdownPlugin.
 * Matches Plate's SerializeMdOptions interface.
 */
export interface SerializeOptions {
  /** The Plate editor instance */
  editor?: SlateEditor;
  /** Serialization rules - maps element types to serialize functions */
  rules?: Record<string, { serialize?: (node: TElement, options: SerializeOptions) => unknown }>;
  /** Other options passed by MarkdownPlugin */
  [key: string]: unknown;
}

// ============================================================================
// Serialization Rule
// ============================================================================

/**
 * A serialization rule for a stdlib component.
 *
 * Defines how to convert between MDX JSX elements and Plate elements.
 */
export interface MdxSerializationRule<T extends TElement = TElement> {
  /** MDX tag name (e.g., "LiveValue", "Kanban") */
  tagName: string;

  /** Plate element type key (e.g., "live_value", "kanban") */
  key: string;

  /**
   * Convert MDX JSX element → Plate element.
   *
   * @param node - The MDX JSX element node
   * @param deco - Decoration context (for marks)
   * @param options - Contains convertChildren helper
   * @returns Plate element
   */
  deserialize: (
    node: MdxDeserializeNode,
    deco?: unknown,
    options?: DeserializeOptions
  ) => T;

  /**
   * Convert Plate element → MDX JSX element.
   *
   * @param element - The Plate element
   * @param options - Contains convertNodes helper
   * @returns MDX JSX AST node
   */
  serialize: (element: T, options?: SerializeOptions) => MdxJsxElement;
}

// ============================================================================
// Plate MarkdownPlugin Rule Format
// ============================================================================

/**
 * Rule format expected by Plate's MarkdownPlugin.
 */
export interface PlateMarkdownRule {
  deserialize?: (
    node: MdxDeserializeNode,
    deco?: unknown,
    options?: DeserializeOptions
  ) => TElement;
  serialize?: (element: TElement, options?: SerializeOptions) => MdxJsxElement;
}

/**
 * Collection of Plate markdown rules keyed by tag/element name.
 */
export type PlateMarkdownRules = Record<string, PlateMarkdownRule>;
