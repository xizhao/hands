/**
 * View Component Serialization Rules
 *
 * Handles MDX ↔ Plate conversion for view display elements:
 * - Metric
 * - Badge
 * - Progress
 * - Alert
 * - Loader
 */

import {
  METRIC_KEY,
  BADGE_KEY,
  PROGRESS_KEY,
  ALERT_KEY,
  LOADER_KEY,
  type TMetricElement,
  type TBadgeElement,
  type TProgressElement,
  type TAlertElement,
  type TLoaderElement,
} from "../../../types";
import type { MdxSerializationRule } from "../types";
import { convertChildrenDeserialize } from "@platejs/markdown";
import { parseAttributes, serializeAttributes, createVoidElement, serializeChildren } from "../helpers";

// ============================================================================
// Metric
// ============================================================================

/**
 * Metric serialization rule.
 *
 * MDX Example:
 * ```mdx
 * <Metric value={1234} label="Total Users" prefix="$" />
 * <Metric value={87} suffix="%" change={5.2} changeLabel="vs last month" />
 * <Metric value="42.5K" label="Revenue" size="lg" />
 *
 * // With LiveValue data context:
 * <LiveValue query="SELECT SUM(amount) as value FROM orders">
 *   <Metric label="Total Revenue" />
 * </LiveValue>
 * ```
 */
export const metricRule: MdxSerializationRule<TMetricElement> = {
  tagName: "Metric",
  key: METRIC_KEY,

  deserialize: (node) => {
    const props = parseAttributes(node);

    return createVoidElement<TMetricElement>(METRIC_KEY, {
      value: props.value as number | string | undefined,
      label: props.label as string | undefined,
      prefix: props.prefix as string | undefined,
      suffix: props.suffix as string | undefined,
      change: props.change as number | undefined,
      changeLabel: props.changeLabel as string | undefined,
      size: props.size as TMetricElement["size"],
    });
  },

  serialize: (element) => {
    const attrs = serializeAttributes(
      {
        value: element.value,
        label: element.label,
        prefix: element.prefix,
        suffix: element.suffix,
        change: element.change,
        changeLabel: element.changeLabel,
        size: element.size,
      },
      {
        include: ["value", "label", "prefix", "suffix", "change", "changeLabel", "size"],
        defaults: {
          size: "md",
        },
      }
    );

    return {
      type: "mdxJsxFlowElement",
      name: "Metric",
      attributes: attrs,
      children: [],
    };
  },
};

// ============================================================================
// Badge
// ============================================================================

/**
 * Badge serialization rule.
 *
 * MDX Example:
 * ```mdx
 * <Badge>Default</Badge>
 * <Badge variant="success">Completed</Badge>
 * <Badge variant="warning">Pending</Badge>
 * ```
 */
export const badgeRule: MdxSerializationRule<TBadgeElement> = {
  tagName: "Badge",
  key: BADGE_KEY,

  deserialize: (node, deco, options) => {
    const props = parseAttributes(node);
    const children = (options?.convertChildren ?? convertChildrenDeserialize)(node.children as any || [], deco as any, options as any) || [{ text: "" }];

    return {
      type: BADGE_KEY,
      variant: props.variant as TBadgeElement["variant"],
      children,
    } as TBadgeElement;
  },

  serialize: (element, options) => {
    const attrs = serializeAttributes(
      {
        variant: element.variant,
      },
      {
        include: ["variant"],
        defaults: {
          variant: "default",
        },
      }
    );

    const children = serializeChildren(element.children, options);

    return {
      type: "mdxJsxFlowElement",
      name: "Badge",
      attributes: attrs,
      children: children as any[],
    };
  },
};

// ============================================================================
// Progress
// ============================================================================

/**
 * Progress serialization rule.
 *
 * MDX Example:
 * ```mdx
 * <Progress value={75} />
 * <Progress value={50} max={200} label="Upload Progress" showValue />
 * <Progress indeterminate label="Loading..." />
 * <Progress value={90} variant="success" size="lg" />
 * ```
 */
export const progressRule: MdxSerializationRule<TProgressElement> = {
  tagName: "Progress",
  key: PROGRESS_KEY,

  deserialize: (node) => {
    const props = parseAttributes(node);

    return createVoidElement<TProgressElement>(PROGRESS_KEY, {
      value: props.value as number | undefined,
      max: props.max as number | undefined,
      indeterminate: props.indeterminate as boolean | undefined,
      label: props.label as string | undefined,
      showValue: props.showValue as boolean | undefined,
      variant: props.variant as TProgressElement["variant"],
      size: props.size as TProgressElement["size"],
    });
  },

  serialize: (element) => {
    const attrs = serializeAttributes(
      {
        value: element.value,
        max: element.max,
        indeterminate: element.indeterminate,
        label: element.label,
        showValue: element.showValue,
        variant: element.variant,
        size: element.size,
      },
      {
        include: ["value", "max", "indeterminate", "label", "showValue", "variant", "size"],
        defaults: {
          max: 100,
          indeterminate: false,
          showValue: false,
          variant: "default",
          size: "md",
        },
      }
    );

    return {
      type: "mdxJsxFlowElement",
      name: "Progress",
      attributes: attrs,
      children: [],
    };
  },
};

// ============================================================================
// Alert
// ============================================================================

/**
 * Alert serialization rule.
 *
 * MDX Example:
 * ```mdx
 * <Alert>This is an informational message.</Alert>
 * <Alert title="Success" variant="success">Your changes have been saved.</Alert>
 * <Alert title="Warning" variant="warning">Please review before continuing.</Alert>
 * ```
 */
export const alertRule: MdxSerializationRule<TAlertElement> = {
  tagName: "Alert",
  key: ALERT_KEY,

  deserialize: (node, deco, options) => {
    const props = parseAttributes(node);
    const children = (options?.convertChildren ?? convertChildrenDeserialize)(node.children as any || [], deco as any, options as any) || [{ text: "" }];

    return {
      type: ALERT_KEY,
      title: props.title as string | undefined,
      variant: props.variant as TAlertElement["variant"],
      children,
    } as TAlertElement;
  },

  serialize: (element, options) => {
    const attrs = serializeAttributes(
      {
        title: element.title,
        variant: element.variant,
      },
      {
        include: ["title", "variant"],
        defaults: {
          variant: "default",
        },
      }
    );

    const children = serializeChildren(element.children, options);

    return {
      type: "mdxJsxFlowElement",
      name: "Alert",
      attributes: attrs,
      children: children as any[],
    };
  },
};

// ============================================================================
// Loader
// ============================================================================

/**
 * Loader serialization rule.
 *
 * MDX Example:
 * ```mdx
 * <Loader />
 * <Loader variant="dots" size="lg" />
 * <Loader variant="spinner" label="Loading data..." color="primary" />
 * <Loader variant="pulse" size="xl" speed="fast" />
 * ```
 */
export const loaderRule: MdxSerializationRule<TLoaderElement> = {
  tagName: "Loader",
  key: LOADER_KEY,

  deserialize: (node) => {
    const props = parseAttributes(node);

    return createVoidElement<TLoaderElement>(LOADER_KEY, {
      variant: props.variant as TLoaderElement["variant"],
      size: props.size as TLoaderElement["size"],
      color: props.color as TLoaderElement["color"],
      label: props.label as string | undefined,
      speed: props.speed as TLoaderElement["speed"],
    });
  },

  serialize: (element) => {
    const attrs = serializeAttributes(
      {
        variant: element.variant,
        size: element.size,
        color: element.color,
        label: element.label,
        speed: element.speed,
      },
      {
        include: ["variant", "size", "color", "label", "speed"],
        defaults: {
          variant: "spinner",
          size: "md",
          color: "default",
          speed: "normal",
        },
      }
    );

    return {
      type: "mdxJsxFlowElement",
      name: "Loader",
      attributes: attrs,
      children: [],
    };
  },
};

// ============================================================================
// Export all rules
// ============================================================================

export const viewRules = [metricRule, badgeRule, progressRule, alertRule, loaderRule];
