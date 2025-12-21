/**
 * LiveAction & Form Controls Serialization Rules
 *
 * Handles MDX ↔ Plate conversion for:
 * - LiveAction (container)
 * - Button
 * - Input
 * - Select
 * - Checkbox
 * - Textarea
 */

import {
  LIVE_ACTION_KEY,
  BUTTON_KEY,
  INPUT_KEY,
  SELECT_KEY,
  CHECKBOX_KEY,
  TEXTAREA_KEY,
  type TLiveActionElement,
  type TButtonElement,
  type TInputElement,
  type TSelectElement,
  type TCheckboxElement,
  type TTextareaElement,
} from "../../../types";
import type { MdxSerializationRule, DeserializeOptions } from "../types";
import { convertChildrenDeserialize, convertNodesSerialize } from "@platejs/markdown";
import {
  parseAttributes,
  serializeAttributes,
  hasChildContent,
  createContainerElement,
} from "../helpers";

// ============================================================================
// LiveAction
// ============================================================================

/**
 * LiveAction serialization rule.
 *
 * MDX Example:
 * ```mdx
 * <LiveAction sql="UPDATE tasks SET status = {{status}} WHERE id = 1">
 *   <Select name="status" options={[{ value: "done", label: "Done" }]} />
 *   <Button>Update</Button>
 * </LiveAction>
 * ```
 */
export const liveActionRule: MdxSerializationRule<TLiveActionElement> = {
  tagName: "LiveAction",
  key: LIVE_ACTION_KEY,

  deserialize: (node, deco, options) => {
    const props = parseAttributes(node);

    // Deserialize children - use options.convertChildren if available (for tests),
    // otherwise use Plate's native convertChildrenDeserialize
    let children: TLiveActionElement["children"] = [
      { type: "p" as const, children: [{ text: "" }] },
    ];
    if (node.children && node.children.length > 0 && options) {
      const converter = options.convertChildren ?? convertChildrenDeserialize;
      const converted = converter(node.children, deco, options as any);
      if (converted.length > 0) {
        // Unwrap children if they're wrapped in a single paragraph
        // This happens when MDX text elements are deserialized
        if (
          converted.length === 1 &&
          "type" in converted[0] &&
          converted[0].type === "p" &&
          "children" in converted[0]
        ) {
          children = converted[0].children as TLiveActionElement["children"];
        } else {
          children = converted;
        }
      }
    }

    return {
      type: LIVE_ACTION_KEY,
      sql: props.sql as string | undefined,
      src: props.src as string | undefined,
      params: props.params as Record<string, unknown> | undefined,
      children,
    };
  },

  serialize: (element, options) => {
    const attrs = serializeAttributes(
      {
        sql: element.sql,
        src: element.src,
        params: element.params,
      },
      { include: ["sql", "src", "params"] }
    );

    // Serialize children - use options.convertNodes if provided (for tests), otherwise use Plate's native function
    const converter = options?.convertNodes ?? convertNodesSerialize;
    const children = converter(element.children, options ?? {});

    return {
      type: "mdxJsxFlowElement",
      name: "LiveAction",
      attributes: attrs,
      children: children as any[],
    };
  },
};

// ============================================================================
// Button
// ============================================================================

/**
 * Button serialization rule.
 *
 * MDX Example:
 * ```mdx
 * <Button>Submit</Button>
 * <Button variant="destructive">Delete</Button>
 * ```
 */
export const buttonRule: MdxSerializationRule<TButtonElement> = {
  tagName: "Button",
  key: BUTTON_KEY,

  deserialize: (node, deco, options) => {
    const props = parseAttributes(node);

    // Deserialize children (button text)
    let children: TButtonElement["children"] = [{ text: "" }];
    if (node.children && node.children.length > 0 && options) {
      const converter = options.convertChildren ?? convertChildrenDeserialize;
      const converted = converter(node.children, deco, options as any);
      if (converted.length > 0) {
        children = converted;
      }
    }

    return {
      type: BUTTON_KEY,
      variant: props.variant as TButtonElement["variant"],
      children,
    };
  },

  serialize: (element, options) => {
    const attrs = serializeAttributes(
      { variant: element.variant },
      { defaults: { variant: "default" } }
    );

    const converter = options?.convertNodes ?? convertNodesSerialize;
    const children = converter(element.children, options ?? {});

    return {
      type: "mdxJsxTextElement",
      name: "Button",
      attributes: attrs,
      children: children as any[],
    };
  },
};

// ============================================================================
// Input
// ============================================================================

/**
 * Input serialization rule.
 *
 * MDX Example:
 * ```mdx
 * <Input name="email" type="email" placeholder="Enter email">Email</Input>
 * <Input name="amount" type="number" min={0} max={100} />
 * ```
 */
export const inputRule: MdxSerializationRule<TInputElement> = {
  tagName: "Input",
  key: INPUT_KEY,

  deserialize: (node, deco, options) => {
    const props = parseAttributes(node);

    // Deserialize children (label text)
    let children: TInputElement["children"] = [{ text: "" }];
    if (node.children && node.children.length > 0 && options) {
      const converter = options.convertChildren ?? convertChildrenDeserialize;
      const converted = converter(node.children, deco, options as any);
      if (converted.length > 0) {
        children = converted;
      }
    }

    return {
      type: INPUT_KEY,
      name: (props.name as string) || "",
      inputType: (props.type as TInputElement["inputType"]) || "text",
      placeholder: props.placeholder as string | undefined,
      defaultValue: props.defaultValue as string | undefined,
      required: props.required === true,
      pattern: props.pattern as string | undefined,
      min: props.min as number | string | undefined,
      max: props.max as number | string | undefined,
      step: props.step as number | undefined,
      children,
    };
  },

  serialize: (element, options) => {
    const attrs = serializeAttributes(
      {
        name: element.name,
        type: element.inputType,
        placeholder: element.placeholder,
        defaultValue: element.defaultValue,
        required: element.required,
        pattern: element.pattern,
        min: element.min,
        max: element.max,
        step: element.step,
      },
      {
        include: [
          "name",
          "type",
          "placeholder",
          "defaultValue",
          "required",
          "pattern",
          "min",
          "max",
          "step",
        ],
        defaults: { type: "text", required: false },
      }
    );

    const converter = options?.convertNodes ?? convertNodesSerialize;
    const children = converter(element.children, options ?? {});

    return {
      type: "mdxJsxFlowElement",
      name: "Input",
      attributes: attrs,
      children: children as any[],
    };
  },
};

// ============================================================================
// Select
// ============================================================================

/**
 * Select serialization rule.
 *
 * MDX Example:
 * ```mdx
 * <Select name="status" options={[{ value: "active", label: "Active" }]}>
 *   Status
 * </Select>
 * ```
 */
export const selectRule: MdxSerializationRule<TSelectElement> = {
  tagName: "Select",
  key: SELECT_KEY,

  deserialize: (node, deco, options) => {
    const props = parseAttributes(node);

    // Deserialize children (label text)
    let children: TSelectElement["children"] = [{ text: "" }];
    if (node.children && node.children.length > 0 && options) {
      const converter = options.convertChildren ?? convertChildrenDeserialize;
      const converted = converter(node.children, deco, options as any);
      if (converted.length > 0) {
        children = converted;
      }
    }

    return {
      type: SELECT_KEY,
      name: (props.name as string) || "",
      options: (props.options as Array<{ value: string; label: string }>) || [],
      placeholder: props.placeholder as string | undefined,
      defaultValue: props.defaultValue as string | undefined,
      required: props.required === true,
      children,
    };
  },

  serialize: (element, options) => {
    const attrs = serializeAttributes(
      {
        name: element.name,
        options: element.options,
        placeholder: element.placeholder,
        defaultValue: element.defaultValue,
        required: element.required,
      },
      {
        include: ["name", "options", "placeholder", "defaultValue", "required"],
        defaults: { required: false },
      }
    );

    const converter = options?.convertNodes ?? convertNodesSerialize;
    const children = converter(element.children, options ?? {});

    return {
      type: "mdxJsxFlowElement",
      name: "Select",
      attributes: attrs,
      children: children as any[],
    };
  },
};

// ============================================================================
// Checkbox
// ============================================================================

/**
 * Checkbox serialization rule.
 *
 * MDX Example:
 * ```mdx
 * <Checkbox name="agree">I agree to the terms</Checkbox>
 * <Checkbox name="subscribe" defaultChecked />
 * ```
 */
export const checkboxRule: MdxSerializationRule<TCheckboxElement> = {
  tagName: "Checkbox",
  key: CHECKBOX_KEY,

  deserialize: (node, deco, options) => {
    const props = parseAttributes(node);

    // Deserialize children (label text)
    let children: TCheckboxElement["children"] = [{ text: "" }];
    if (node.children && node.children.length > 0 && options) {
      const converter = options.convertChildren ?? convertChildrenDeserialize;
      const converted = converter(node.children, deco, options as any);
      if (converted.length > 0) {
        children = converted;
      }
    }

    return {
      type: CHECKBOX_KEY,
      name: (props.name as string) || "",
      defaultChecked: props.defaultChecked === true,
      required: props.required === true,
      children,
    };
  },

  serialize: (element, options) => {
    const attrs = serializeAttributes(
      {
        name: element.name,
        defaultChecked: element.defaultChecked,
        required: element.required,
      },
      {
        include: ["name", "defaultChecked", "required"],
        defaults: { defaultChecked: false, required: false },
      }
    );

    const converter = options?.convertNodes ?? convertNodesSerialize;
    const children = converter(element.children, options ?? {});

    return {
      type: "mdxJsxFlowElement",
      name: "Checkbox",
      attributes: attrs,
      children: children as any[],
    };
  },
};

// ============================================================================
// Textarea
// ============================================================================

/**
 * Textarea serialization rule.
 *
 * MDX Example:
 * ```mdx
 * <Textarea name="description" rows={5} placeholder="Enter description">
 *   Description
 * </Textarea>
 * ```
 */
export const textareaRule: MdxSerializationRule<TTextareaElement> = {
  tagName: "Textarea",
  key: TEXTAREA_KEY,

  deserialize: (node, deco, options) => {
    const props = parseAttributes(node);

    // Deserialize children (label text)
    let children: TTextareaElement["children"] = [{ text: "" }];
    if (node.children && node.children.length > 0 && options) {
      const converter = options.convertChildren ?? convertChildrenDeserialize;
      const converted = converter(node.children, deco, options as any);
      if (converted.length > 0) {
        children = converted;
      }
    }

    return {
      type: TEXTAREA_KEY,
      name: (props.name as string) || "",
      placeholder: props.placeholder as string | undefined,
      defaultValue: props.defaultValue as string | undefined,
      rows: typeof props.rows === "number" ? props.rows : undefined,
      required: props.required === true,
      children,
    };
  },

  serialize: (element, options) => {
    const attrs = serializeAttributes(
      {
        name: element.name,
        placeholder: element.placeholder,
        defaultValue: element.defaultValue,
        rows: element.rows,
        required: element.required,
      },
      {
        include: ["name", "placeholder", "defaultValue", "rows", "required"],
        defaults: { rows: 3, required: false },
      }
    );

    const converter = options?.convertNodes ?? convertNodesSerialize;
    const children = converter(element.children, options ?? {});

    return {
      type: "mdxJsxFlowElement",
      name: "Textarea",
      attributes: attrs,
      children: children as any[],
    };
  },
};

// ============================================================================
// Export all rules
// ============================================================================

export const liveActionRules = [
  liveActionRule,
  buttonRule,
  inputRule,
  selectRule,
  checkboxRule,
  textareaRule,
];
