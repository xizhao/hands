/**
 * Hands Runtime Types
 *
 * Import types from @hands/runtime:
 *   import type { BlockFn, BlockMeta, defineAction, defineSource } from '@hands/runtime'
 */

// Block types
export type {
  BlockFn,
  BlockMeta,
  BlockRenderResult,
  DiscoveredBlock,
} from "./block.js";

// Source types
export type {
  DiscoveredSource,
  DiscoveredTable,
  SourceDefinition,
  SourcePermissions,
  SourceRole,
  SubscriptionStatus,
  TableColumn,
  TableDefinition,
  TableIndex,
  TableSchema,
  TableSubscription,
} from "./source.js";
export { defineSource } from "./source.js";

// Action types
export type {
  ActionContext,
  ActionDefinition,
  ActionLogger,
  ActionNotify,
  ActionRun,
  ActionRunMeta,
  ActionRunStatus,
  ActionTrigger,
  ActionTriggerType,
  DiscoveredAction,
  SelectOptions,
  TableClient,
} from "./action.js";
export { defineAction } from "./action.js";
