/**
 * MDX Serialization Registry
 *
 * Central registry of all stdlib serialization rules.
 * Import this in your editor to auto-register all components.
 */

import { blockRules } from "./rules/block";
import { cardRules } from "./rules/card";
import { chartRules } from "./rules/charts";
import { columnRules } from "./rules/column";
import { dataGridRules } from "./rules/data-grid";
import { kanbanRules } from "./rules/kanban";
import { liveActionRules } from "./rules/live-action";
// Import all rule modules
import { liveQueryRule, liveValueInlineRule, liveValueRule } from "./rules/live-value";
import { tabsRules } from "./rules/tabs";
import { viewRules } from "./rules/view";
import type { MdxSerializationRule } from "./types";

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
  liveValueInlineRule, // Inline variant (serializes to same MDX)
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

  // Block embedding
  ...blockRules,

  // Tabs navigation
  ...tabsRules,
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
 * import { serializationRules, toMarkdownPluginRules } from '@hands/core/primitives/serialization';
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

// Helpers (for custom rules)
export {
  createContainerElement,
  createVoidElement,
  hasChildContent,
  parseAttributes,
  parseAttributeValue,
  parseExpression,
  serializeAttributes,
  serializeAttributeValue,
  serializeAttributeValueReadable,
} from "./helpers";
// List format conversion (indent-based ↔ classic)
export {
  convertClassicListsToIndent,
  convertIndentListsToClassic,
} from "./list-conversion";
// MDX Parser
export {
  extractFrontmatter,
  type ParseMdxResult,
  parseMarkdownToPlate,
  parseMdxToPlate,
} from "./mdx-parser";
export { blockRule, blockRules } from "./rules/block";
export {
  cardContentRule,
  cardDescriptionRule,
  cardFooterRule,
  cardHeaderRule,
  cardRule,
  cardRules,
  cardTitleRule,
} from "./rules/card";
export {
  areaChartRule,
  barChartRule,
  chartRules,
  interactiveMapRule,
  lineChartRule,
  pieChartRule,
} from "./rules/charts";
export { columnRule, columnRules, columnsRule } from "./rules/column";
export { dataGridRule, dataGridRules } from "./rules/data-grid";
export { kanbanRule, kanbanRules } from "./rules/kanban";
export {
  buttonRule,
  checkboxRule,
  inputRule,
  liveActionRule,
  liveActionRules,
  selectRule,
  textareaRule,
} from "./rules/live-action";
// Individual rule modules (for selective imports)
export { liveQueryRule, liveValueInlineRule, liveValueRule } from "./rules/live-value";
export { tabRule, tabsRule, tabsRules } from "./rules/tabs";
// Legacy alias
export {
  alertRule,
  badgeRule,
  loaderRule,
  metricRule,
  progressRule,
  viewRules,
  viewRules as staticRules,
} from "./rules/view";
// Types
export type {
  DeserializeOptions,
  MdxDeserializeNode,
  MdxJsxAttribute,
  MdxJsxAttributeValueExpression,
  MdxJsxElement,
  MdxSerializationRule,
  SerializeOptions,
} from "./types";
