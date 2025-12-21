/**
 * MDX Serialization Registry
 *
 * Central registry of all stdlib serialization rules.
 * Import this in your editor to auto-register all components.
 */

import type { MdxSerializationRule } from "./types";

// Import all rule modules
import { liveValueRule, liveQueryRule } from "./rules/live-value";
import { liveActionRules } from "./rules/live-action";
import { chartRules } from "./rules/charts";
import { kanbanRules } from "./rules/kanban";
import { dataGridRules } from "./rules/data-grid";
import { viewRules } from "./rules/view";
import { cardRules } from "./rules/card";
import { columnRules } from "./rules/column";

// ============================================================================
// All Rules Registry
// ============================================================================

/**
 * All stdlib serialization rules.
 * This array contains rules for all stdlib components.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const serializationRules: MdxSerializationRule<any>[] = [
  // Live data components
  liveValueRule,
  liveQueryRule, // Legacy alias

  // Form controls and actions
  ...liveActionRules,

  // Charts
  ...chartRules,

  // Kanban
  ...kanbanRules,

  // DataGrid
  ...dataGridRules,

  // View display components
  ...viewRules,

  // Card components
  ...cardRules,

  // Column layout
  ...columnRules,
];

// ============================================================================
// Plate MarkdownPlugin Integration
// ============================================================================

/**
 * Convert serialization rules to Plate MarkdownPlugin format.
 *
 * This creates a rules object that can be spread into MarkdownPlugin.configure():
 * - Keys by tagName for deserialization (MDX → Plate)
 * - Keys by element key for serialization (Plate → MDX)
 *
 * @example
 * ```ts
 * import { serializationRules, toMarkdownPluginRules } from '@hands/core/stdlib/serialization';
 *
 * const MarkdownKit = [
 *   MarkdownPlugin.configure({
 *     options: {
 *       rules: {
 *         ...toMarkdownPluginRules(serializationRules),
 *         // Add any desktop-specific rules here
 *       },
 *     },
 *   }),
 * ];
 * ```
 */
export function toMarkdownPluginRules(rules: MdxSerializationRule[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const rule of rules) {
    // Deserialize rule: MDX tag → Plate element
    // e.g., "LiveValue" → { deserialize: fn }
    result[rule.tagName] = {
      deserialize: rule.deserialize,
    };

    // Serialize rule: Plate element → MDX
    // e.g., "live_value" → { serialize: fn }
    // Only add if key differs from tagName (avoids overwrite)
    if (rule.key !== rule.tagName) {
      result[rule.key] = {
        serialize: rule.serialize,
      };
    } else {
      // Same key - merge into existing entry
      (result[rule.tagName] as Record<string, unknown>).serialize = rule.serialize;
    }
  }

  return result;
}

// ============================================================================
// Re-exports
// ============================================================================

// Types
export type { MdxSerializationRule, DeserializeOptions, SerializeOptions } from "./types";
export type {
  MdxJsxAttribute,
  MdxJsxAttributeValueExpression,
  MdxJsxElement,
  MdxDeserializeNode,
} from "./types";

// Helpers (for custom rules)
export {
  parseAttributes,
  parseAttributeValue,
  parseExpression,
  serializeAttributes,
  serializeAttributeValue,
  serializeAttributeValueReadable,
  hasChildContent,
  createVoidElement,
  createContainerElement,
} from "./helpers";

// Individual rule modules (for selective imports)
export { liveValueRule, liveQueryRule } from "./rules/live-value";
export { liveActionRules, liveActionRule, buttonRule, inputRule, selectRule, checkboxRule, textareaRule } from "./rules/live-action";
export { chartRules, lineChartRule, barChartRule, areaChartRule, pieChartRule } from "./rules/charts";
export { kanbanRules, kanbanRule } from "./rules/kanban";
export { dataGridRules, dataGridRule } from "./rules/data-grid";
export { viewRules, metricRule, badgeRule, progressRule, alertRule, loaderRule } from "./rules/view";
// Legacy alias
export { viewRules as staticRules } from "./rules/view";
export { cardRules, cardRule, cardHeaderRule, cardContentRule, cardFooterRule, cardTitleRule, cardDescriptionRule } from "./rules/card";
export { columnRules, columnsRule, columnRule } from "./rules/column";
