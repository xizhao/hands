/**
 * Serialization Rules Registry
 *
 * Centralized array of all MDX serialization rules.
 * Separated from index.ts to avoid circular dependency with mdx-parser.ts.
 */

import { blockRules } from "./rules/block";
import { cardRules } from "./rules/card";
import { chartRules } from "./rules/charts";
import { claimRules } from "./rules/claim";
import { columnRules } from "./rules/column";
import { dataGridRules } from "./rules/data-grid";
import { kanbanRules } from "./rules/kanban";
import { liveActionRules } from "./rules/live-action";
import { liveQueryRule, liveValueInlineRule, liveValueRule } from "./rules/live-value";
import { tabsRules } from "./rules/tabs";
import { viewRules } from "./rules/view";
import type { MdxSerializationRule } from "./types";

/**
 * All stdlib serialization rules.
 * This array contains rules for all stdlib components.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const serializationRules: MdxSerializationRule<any>[] = [
  // Live data components
  liveValueRule,
  liveValueInlineRule,
  liveQueryRule,

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

  // Claim/Evidence (CKG)
  ...claimRules,
];

/**
 * Convert serialization rules to Plate MarkdownPlugin format.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toMarkdownPluginRules(
  rules: MdxSerializationRule<any>[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const rule of rules) {
    result[rule.tagName] = { deserialize: rule.deserialize };

    if (rule.key !== rule.tagName) {
      result[rule.key] = { serialize: rule.serialize };
    } else {
      (result[rule.tagName] as Record<string, unknown>).serialize = rule.serialize;
    }
  }

  return result;
}
