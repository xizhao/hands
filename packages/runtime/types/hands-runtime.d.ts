/**
 * @hands/runtime type declarations for workbook type checking
 */
import type { ReactNode } from "react";

/**
 * Block metadata for display in the UI
 */
export interface BlockMeta {
  title: string;
  description?: string;
  refreshable?: boolean;
}

/**
 * Block function type - async function that returns JSX
 */
export type BlockFn = () => Promise<ReactNode> | ReactNode;

/**
 * Block render result from the runtime
 */
export interface BlockRenderResult {
  html: string;
  meta: BlockMeta;
}

/**
 * Discovered block from the blocks/ directory
 */
export interface DiscoveredBlock {
  id: string;
  path: string;
  meta: BlockMeta;
}

// Re-export source and action types
export type {
  SourceDefinition,
  DiscoveredSource,
  DiscoveredTable,
  TableDefinition,
  TableColumn,
  TableIndex,
  TableSchema,
  TableSubscription,
  SubscriptionStatus,
  SourcePermissions,
  SourceRole,
} from "./source";

export type {
  ActionDefinition,
  ActionContext,
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
} from "./action";

export { defineSource } from "./source";
export { defineAction } from "./action";
