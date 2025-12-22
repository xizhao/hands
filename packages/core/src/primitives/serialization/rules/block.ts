/**
 * Block Serialization Rule
 *
 * Handles MDX ↔ Plate conversion for Block elements.
 */

import { BLOCK_KEY, type TBlockElement } from "../../../types";
import type { MdxSerializationRule } from "../types";
import {
  parseAttributes,
  serializeAttributes,
  createVoidElement,
} from "../helpers";

/**
 * Block serialization rule.
 *
 * MDX Examples:
 * ```mdx
 * <Block src="blocks/header" />
 * <Block src="blocks/user-card" params={{userId: 123}} />
 * <Block editing />
 * <Block prompt="create a metrics dashboard" />
 * ```
 */
export const blockRule: MdxSerializationRule<TBlockElement> = {
  tagName: "Block",
  key: BLOCK_KEY,

  deserialize: (node) => {
    const props = parseAttributes(node);

    return createVoidElement<TBlockElement>(BLOCK_KEY, {
      src: props.src as string | undefined,
      params: props.params as Record<string, unknown> | undefined,
      editing: props.editing as boolean | undefined,
      prompt: props.prompt as string | undefined,
      height: props.height as number | undefined,
      className: props.className as string | undefined,
    });
  },

  serialize: (element) => {
    const attrs = serializeAttributes(
      {
        src: element.src,
        params: element.params,
        editing: element.editing,
        prompt: element.prompt,
        height: element.height,
        className: element.className,
      },
      {
        include: ["src", "params", "editing", "prompt", "height", "className"],
        // Don't serialize false/undefined editing
        defaults: { editing: false },
      }
    );

    return {
      type: "mdxJsxFlowElement" as const,
      name: "Block",
      attributes: attrs,
      children: [],
    };
  },
};

/**
 * All block serialization rules.
 */
export const blockRules = [blockRule];
