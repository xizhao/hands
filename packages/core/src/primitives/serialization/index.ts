/**
 * MDX Serialization Registry
 *
 * Central registry of all stdlib serialization rules.
 * Import this in your editor to auto-register all components.
 */

// Re-export the centralized rules registry
export { serializationRules, toMarkdownPluginRules } from "./rules-registry";

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
export { claimRule, claimRules, evidenceRule } from "./rules/claim";
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
