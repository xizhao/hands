"use client";

/**
 * createPlugin - Factory for custom MDX plugin elements
 *
 * Creates a Plate plugin + serialization rule from just a React component.
 * Automatically handles MDX ↔ Plate serialization based on props.
 *
 * Plugins are custom extensions to the editor stdlib - either installed
 * from a registry or AI-generated. They extend the editor's capabilities
 * with new element types.
 *
 * @example
 * ```tsx
 * // Define your plugin component
 * const CustomChart = ({ data, type }: { data: unknown[]; type?: string }) => (
 *   <Chart data={data} type={type} />
 * );
 *
 * // Create plugin + serialization
 * const { plugin, rule } = createPlugin("CustomChart", CustomChart, {
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
import { memo, type ComponentType } from "react";
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

export interface PluginOptions {
  /** Is the plugin element void (no editable children)? Default: true */
  isVoid?: boolean;
  /** Is the plugin element inline? Default: false */
  isInline?: boolean;
  /** Default prop values (won't be serialized if unchanged) */
  defaults?: Record<string, unknown>;
  /** Props to exclude from serialization */
  exclude?: string[];
  /** Custom wrapper className */
  className?: string;
}

export interface PluginResult<T extends TElement> {
  /** Plate plugin for the element */
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
  // "CustomChart" → "custom_chart"
  // "Block" → "block"
  return tagName
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase();
}

// ============================================================================
// createPlugin
// ============================================================================

/**
 * Create a custom plugin element with automatic serialization.
 *
 * @param tagName - MDX tag name (e.g., "CustomChart", "DataTable")
 * @param Component - React component to render
 * @param options - Configuration options
 * @returns Plugin and serialization rule
 */
export function createPlugin<P extends Record<string, unknown>>(
  tagName: string,
  Component: ComponentType<P>,
  options: PluginOptions = {}
): PluginResult<TElement & P> {
  const {
    isVoid = true,
    isInline = false,
    defaults = {},
    exclude = [],
    className,
  } = options;

  const key = toElementKey(tagName);

  // Create Plate element wrapper
  function PluginElement(props: PlateElementProps) {
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
      component: memo(PluginElement),
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
// Convenience: Create multiple plugins at once
// ============================================================================

export interface PluginDefinition<P extends Record<string, unknown> = Record<string, unknown>> {
  tagName: string;
  component: ComponentType<P>;
  options?: PluginOptions;
}

/**
 * Create multiple plugins at once.
 *
 * @param definitions - Array of plugin definitions
 * @returns Array of plugins and rules
 */
export function createPlugins(
  definitions: PluginDefinition[]
): {
  plugins: any[];
  rules: MdxSerializationRule<TElement>[];
} {
  const plugins: ReturnType<typeof createPlatePlugin>[] = [];
  const rules: MdxSerializationRule<TElement>[] = [];

  for (const { tagName, component, options } of definitions) {
    const result = createPlugin(tagName, component, options);
    plugins.push(result.plugin);
    rules.push(result.rule);
  }

  return { plugins, rules };
}

// ============================================================================
// Deprecated aliases for backward compatibility
// ============================================================================

/** @deprecated Use PluginOptions instead */
export type CustomBlockOptions = PluginOptions;

/** @deprecated Use PluginResult instead */
export type CustomBlockResult<T extends TElement> = PluginResult<T>;

/** @deprecated Use PluginDefinition instead */
export type CustomBlockDefinition<P extends Record<string, unknown> = Record<string, unknown>> = PluginDefinition<P>;

/** @deprecated Use createPlugin instead */
export const createCustomBlock = createPlugin;

/** @deprecated Use createPlugins instead */
export const createCustomBlocks = createPlugins;
