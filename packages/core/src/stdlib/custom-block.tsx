"use client";

/**
 * createCustomBlock - Factory for custom MDX block elements
 *
 * Creates a Plate plugin + serialization rule from just a React component.
 * Automatically handles MDX ↔ Plate serialization based on props.
 *
 * @example
 * ```tsx
 * // Define your block component
 * const SandboxedBlock = ({ src, height }: { src: string; height?: number }) => (
 *   <iframe src={src} style={{ height }} />
 * );
 *
 * // Create plugin + serialization
 * const { plugin, rule } = createCustomBlock("Block", SandboxedBlock, {
 *   isVoid: true,
 * });
 *
 * // Use in editor
 * const EditorKit = [...FullKit, plugin];
 * const markdownRules = { ...baseRules, ...toMarkdownPluginRules([rule]) };
 * ```
 */

import {
  createPlatePlugin,
  PlateElement,
  type PlateElementProps,
  useElement,
  useSelected,
} from "platejs/react";
import { memo, type ComponentType, type ReactNode } from "react";
import type { TElement } from "platejs";

import {
  parseAttributes,
  serializeAttributes,
  createVoidElement,
  type MdxSerializationRule,
  type MdxJsxElement,
} from "./serialization";

// ============================================================================
// Types
// ============================================================================

export interface CustomBlockOptions {
  /** Is the block void (no editable children)? Default: true */
  isVoid?: boolean;
  /** Is the block inline? Default: false */
  isInline?: boolean;
  /** Default prop values (won't be serialized if unchanged) */
  defaults?: Record<string, unknown>;
  /** Props to exclude from serialization */
  exclude?: string[];
  /** Custom wrapper className */
  className?: string;
}

export interface CustomBlockResult<T extends TElement> {
  /** Plate plugin for the block */
  plugin: any; // PlatePlugin type is complex, use any for flexibility
  /** Serialization rule for MDX ↔ Plate */
  rule: MdxSerializationRule<T>;
  /** Element type key (lowercase, underscored) */
  key: string;
}

// ============================================================================
// Helper: Convert tag name to element key
// ============================================================================

function toElementKey(tagName: string): string {
  // "SandboxedBlock" → "sandboxed_block"
  // "Block" → "block"
  return tagName
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase();
}

// ============================================================================
// createCustomBlock
// ============================================================================

/**
 * Create a custom block element with automatic serialization.
 *
 * @param tagName - MDX tag name (e.g., "Block", "Prompt")
 * @param Component - React component to render
 * @param options - Configuration options
 * @returns Plugin and serialization rule
 */
export function createCustomBlock<P extends Record<string, unknown>>(
  tagName: string,
  Component: ComponentType<P>,
  options: CustomBlockOptions = {}
): CustomBlockResult<TElement & P> {
  const {
    isVoid = true,
    isInline = false,
    defaults = {},
    exclude = [],
    className,
  } = options;

  const key = toElementKey(tagName);

  // Create Plate element wrapper
  function CustomBlockElement(props: PlateElementProps) {
    const element = useElement<TElement & P>();
    const selected = useSelected();

    // Extract props from element (exclude Plate internals)
    const componentProps = { ...element } as P;
    delete (componentProps as Record<string, unknown>).type;
    delete (componentProps as Record<string, unknown>).children;
    delete (componentProps as Record<string, unknown>).id;

    return (
      <PlateElement
        {...props}
        className={`${selected ? "ring-2 ring-ring ring-offset-2 rounded" : ""} ${className || ""}`}
      >
        <div contentEditable={false}>
          <Component {...componentProps} />
        </div>
        {/* Void elements still need children for Slate */}
        {isVoid && <span className="hidden">{props.children}</span>}
        {!isVoid && props.children}
      </PlateElement>
    );
  }

  // Create Plate plugin
  const plugin = createPlatePlugin({
    key,
    node: {
      isElement: true,
      isInline,
      isVoid,
      component: memo(CustomBlockElement),
    },
  });

  // Create serialization rule
  const rule: MdxSerializationRule<TElement & P> = {
    tagName,
    key,

    deserialize: (node) => {
      const props = parseAttributes(node);

      if (isVoid) {
        return createVoidElement<TElement & P>(key, props as Omit<TElement & P, "type" | "children">);
      }

      return {
        type: key,
        ...props,
        children: [{ text: "" }],
      } as TElement & P;
    },

    serialize: (element) => {
      // Extract serializable props
      const props: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(element)) {
        // Skip Plate internals and excluded props
        if (k === "type" || k === "children" || k === "id" || exclude.includes(k)) {
          continue;
        }
        props[k] = v;
      }

      const attrs = serializeAttributes(props, { defaults });

      return {
        type: "mdxJsxFlowElement",
        name: tagName,
        attributes: attrs,
        children: [],
      } as MdxJsxElement;
    },
  };

  return { plugin, rule, key };
}

// ============================================================================
// Convenience: Create multiple blocks at once
// ============================================================================

export interface CustomBlockDefinition<P extends Record<string, unknown> = Record<string, unknown>> {
  tagName: string;
  component: ComponentType<P>;
  options?: CustomBlockOptions;
}

/**
 * Create multiple custom blocks at once.
 *
 * @param definitions - Array of block definitions
 * @returns Array of plugins and rules
 */
export function createCustomBlocks(
  definitions: CustomBlockDefinition[]
): {
  plugins: any[];
  rules: MdxSerializationRule<TElement>[];
} {
  const plugins: ReturnType<typeof createPlatePlugin>[] = [];
  const rules: MdxSerializationRule<TElement>[] = [];

  for (const { tagName, component, options } of definitions) {
    const result = createCustomBlock(tagName, component, options);
    plugins.push(result.plugin);
    rules.push(result.rule);
  }

  return { plugins, rules };
}
