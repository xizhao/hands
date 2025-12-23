/**
 * Actions - Serverless Compute Primitives
 *
 * Actions are serverless functions that can:
 * - Read/write data via ctx.sources
 * - Execute on triggers (cron, webhook, manual, pg_notify)
 * - Access secrets securely
 * - Log and notify
 */

import type { ActionSchema } from "../schema/types.js";

// =============================================================================
// Trigger Types
// =============================================================================

export type ActionTriggerType = "manual" | "cron" | "webhook" | "pg_notify";

export type ActionTrigger =
  | { type: "manual" }
  | { type: "cron"; schedule: string }
  | { type: "webhook"; path?: string }
  | { type: "pg_notify"; channel: string };

// =============================================================================
// Run Types
// =============================================================================

export type ActionRunStatus = "running" | "success" | "failed";

export interface ActionRun {
  id: string;
  actionId: string;
  trigger: ActionTriggerType;
  status: ActionRunStatus;
  input: unknown;
  output?: unknown;
  error?: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
}

// =============================================================================
// Table Client (for ctx.sources)
// =============================================================================

export interface SelectOptions {
  where?: string;
  limit?: number;
  offset?: number;
  orderBy?: string;
}

export interface TableClient<T = Record<string, unknown>> {
  select(opts?: SelectOptions): Promise<T[]>;
  selectOne(opts?: SelectOptions): Promise<T | null>;
  insert(rows: T | T[]): Promise<T[]>;
  update(where: string, data: Partial<T>): Promise<T[]>;
  delete(where: string): Promise<number>;
  upsert(rows: T | T[], conflictKeys: string[]): Promise<T[]>;
  count(where?: string): Promise<number>;
}

// =============================================================================
// Action Context
// =============================================================================

export interface ActionLogger {
  debug: (msg: string, meta?: unknown) => void;
  info: (msg: string, meta?: unknown) => void;
  warn: (msg: string, meta?: unknown) => void;
  error: (msg: string, meta?: unknown) => void;
}

export interface ActionNotify {
  slack?: (channel: string, message: string) => Promise<void>;
  email?: (to: string, subject: string, body: string) => Promise<void>;
  webhook?: (url: string, payload: unknown) => Promise<Response>;
}

export interface ActionRunMeta {
  id: string;
  trigger: ActionTriggerType;
  startedAt: Date;
  input: unknown;
}

export interface ActionContext {
  /** Access to source tables: ctx.sources.mySource.myTable.select() */
  sources: Record<string, Record<string, TableClient>>;

  /** Raw SQL tagged template: ctx.sql`SELECT * FROM users` */
  sql: <T = unknown>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T[]>;

  /** Structured logging */
  log: ActionLogger;

  /** Notification integrations */
  notify: ActionNotify;

  /** Resolved secrets from .env.local */
  secrets: Record<string, string>;

  /** Current run metadata */
  run: ActionRunMeta;
}

// =============================================================================
// Action Definition
// =============================================================================

/**
 * Input validator interface (compatible with zod schemas)
 */
export interface InputValidator<T> {
  parse(data: unknown): T;
  description?: string;
}

export interface ActionDefinition<TInput = unknown, TOutput = unknown> {
  /** Unique action name (used in API routes, must be URL-safe) */
  name: string;

  /** Human-readable description */
  description?: string;

  /** Cron schedule expression (e.g., "0 * * * *" for hourly) */
  schedule?: string;

  /** Additional trigger types beyond schedule */
  triggers?: Array<"manual" | "webhook" | "pg_notify">;

  /** pg_notify channel to listen on (if triggers includes pg_notify) */
  pgNotifyChannel?: string;

  /** Webhook path override (default: /webhook/:actionName) */
  webhookPath?: string;

  /** Required secrets (validated at startup) */
  secrets?: string[];

  /** Input validation schema (zod-compatible) */
  input?: InputValidator<TInput>;

  /**
   * Schema requirements - tables/columns this action needs.
   * Used for runtime validation and import-time checking.
   * Compile-time validation is handled by Kysely types.
   */
  schema?: ActionSchema;

  /** The action function */
  run: (input: TInput, ctx: ActionContext) => Promise<TOutput>;
}

// =============================================================================
// Discovered Action (Runtime)
// =============================================================================

export interface DiscoveredAction {
  /** Action ID (usually same as name) */
  id: string;

  /** Path to the action file */
  path: string;

  /** The action definition */
  definition: ActionDefinition;

  /** Most recent run (if any) */
  lastRun?: ActionRun;

  /** Next scheduled run (ISO timestamp, if scheduled) */
  nextRun?: string;

  /** Missing secrets (if any) */
  missingSecrets?: string[];
}

// =============================================================================
// Helper Function
// =============================================================================

/**
 * Define an action (serverless compute function)
 *
 * @example
 * ```typescript
 * import { defineAction } from "@hands/core/primitives";
 * import { z } from "zod";
 *
 * export default defineAction({
 *   name: "sync-hackernews",
 *   description: "Sync top stories from Hacker News",
 *   schedule: "0 * * * *", // Every hour
 *   triggers: ["manual", "webhook"],
 *   secrets: ["HN_API_KEY"],
 *   input: z.object({
 *     limit: z.number().min(1).max(500).default(100),
 *   }),
 *   async run(input, ctx) {
 *     ctx.log.info("Starting sync", { limit: input.limit });
 *     // ...
 *   },
 * });
 * ```
 */
export function defineAction<TInput, TOutput>(
  config: ActionDefinition<TInput, TOutput>,
): ActionDefinition<TInput, TOutput> {
  return config;
}
