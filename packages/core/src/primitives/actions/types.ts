/**
 * Actions - Serverless Compute Primitives
 *
 * Actions are serverless functions that can:
 * - Execute on triggers (cron, webhook, manual, pg_notify)
 * - Access database via ctx.sql
 * - Access secrets securely
 * - Log and notify
 */

import type { ActionSchema } from "../schema/types.js";
import type { Serializable, WorkflowFn } from "./workflow.js";

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
  /** Workflow steps (for workflow actions only) */
  steps?: import("./workflow.js").StepRecord[];
}

// =============================================================================
// Action Chaining
// =============================================================================

/**
 * A chained action to run after the current action completes
 */
export interface ActionChain {
  /** Action ID to run */
  action: string;
  /** Input to pass to the chained action */
  input?: unknown;
  /** Delay in ms before running the chained action */
  delay?: number;
  /** When to run the chain: "success" (default) or "always" */
  condition?: "success" | "always";
}

/**
 * Result returned from an action's run function.
 * Can optionally include a chain of actions to run after.
 *
 * @example
 * ```typescript
 * return {
 *   data: { synced: 100 },
 *   chain: [
 *     { action: "send-email", input: { to: "...", subject: "Sync complete" } },
 *     { action: "notify-slack", input: { channel: "#alerts", text: "Done!" } }
 *   ]
 * };
 * ```
 */
export interface ActionResult<T = unknown> {
  /** The action's return data */
  data: T;
  /** Actions to run after this one completes */
  chain?: ActionChain[];
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

// =============================================================================
// Cloud Services (via ctx.cloud)
// =============================================================================

export interface CloudEmailInput {
  to: string;
  subject: string;
  body: string;
  html?: boolean;
  cc?: string[];
  bcc?: string[];
}

export interface CloudSlackInput {
  channel: string;
  text: string;
  blocks?: unknown[];
  thread_ts?: string;
}

export interface CloudGitHubIssue {
  id: number;
  number: number;
  title: string;
  state: string;
  user: { login: string };
  created_at: string;
  updated_at: string;
}

export interface CloudGitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  description: string | null;
}

export interface CloudServiceStatus {
  google: { email: string | null; valid: boolean } | null;
  slack: { email: string | null; valid: boolean } | null;
  github: { email: string | null; valid: boolean } | null;
  salesforce: { email: string | null; valid: boolean } | null;
  quickbooks: { email: string | null; valid: boolean } | null;
  shopify: { email: string | null; valid: boolean } | null;
}

/**
 * Cloud services client interface.
 * Provides access to external services via the cloud API.
 */
export interface ActionCloud {
  /** Email service (via Gmail) */
  email: {
    send: (input: CloudEmailInput) => Promise<{ messageId: string; threadId: string }>;
  };

  /** Slack service */
  slack: {
    send: (input: CloudSlackInput) => Promise<{ ts?: string; channel?: string }>;
    channels: () => Promise<Array<{ id: string; name: string; is_private: boolean }>>;
  };

  /** GitHub service */
  github: {
    fetch: (input: {
      path: string;
      method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
      body?: unknown;
    }) => Promise<unknown>;
    issues: (input: {
      owner: string;
      repo: string;
      state?: "open" | "closed" | "all";
      per_page?: number;
    }) => Promise<CloudGitHubIssue[]>;
    createIssue: (input: {
      owner: string;
      repo: string;
      title: string;
      body?: string;
      labels?: string[];
      assignees?: string[];
    }) => Promise<{ id: number; number: number; html_url: string }>;
    repos: (input?: {
      per_page?: number;
      sort?: "created" | "updated" | "pushed" | "full_name";
    }) => Promise<CloudGitHubRepo[]>;
  };

  /** Salesforce service */
  salesforce: {
    query: (input: {
      soql: string;
      instanceUrl: string;
    }) => Promise<{ totalSize: number; done: boolean; records: unknown[] }>;
  };

  /** Generic authenticated fetch for any connected provider */
  fetch: (input: {
    provider: "google" | "slack" | "github" | "salesforce" | "quickbooks" | "shopify";
    url: string;
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    headers?: Record<string, string>;
    body?: unknown;
  }) => Promise<{ ok: boolean; status: number; data: unknown }>;

  /** Check which services are connected */
  status: () => Promise<CloudServiceStatus>;
}

// =============================================================================
// Action Runner (for chaining)
// =============================================================================

/**
 * Interface for running other actions from within an action.
 */
export interface ActionRunner {
  /**
   * Run another action by ID.
   *
   * @example
   * ```typescript
   * await ctx.actions.run("send-email", { to: "...", subject: "..." });
   * ```
   */
  run: <T = unknown>(actionId: string, input?: unknown) => Promise<T>;
}

export interface ActionContext {
  /** Raw SQL tagged template: ctx.sql`SELECT * FROM users` */
  sql: <T = unknown>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T[]>;

  /** Structured logging */
  log: ActionLogger;

  /** Notification integrations (legacy - prefer ctx.cloud) */
  notify: ActionNotify;

  /** Resolved secrets from .env.local */
  secrets: Record<string, string>;

  /** Current run metadata */
  run: ActionRunMeta;

  /**
   * Cloud services client.
   * Access external services like email, Slack, GitHub via the cloud API.
   *
   * @example
   * ```typescript
   * await ctx.cloud.email.send({ to: "user@example.com", subject: "Hello", body: "World" });
   * await ctx.cloud.slack.send({ channel: "#alerts", text: "Sync complete!" });
   * const issues = await ctx.cloud.github.issues({ owner: "org", repo: "repo" });
   * ```
   */
  cloud?: ActionCloud;

  /**
   * Run other actions from within this action.
   *
   * @example
   * ```typescript
   * await ctx.actions.run("notify-slack", { message: "Hello!" });
   * ```
   */
  actions?: ActionRunner;
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

/**
 * Base action definition properties (shared by run and workflow actions)
 */
interface ActionDefinitionBase<TInput = unknown> {
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
}

/**
 * Action with simple run function (legacy style)
 */
export interface RunActionDefinition<TInput = unknown, TOutput = unknown>
  extends ActionDefinitionBase<TInput> {
  /** The action function */
  run: (input: TInput, ctx: ActionContext) => Promise<TOutput>;
  workflow?: never;
}

/**
 * Action with CF-style workflow function
 */
export interface WorkflowActionDefinition<
  TInput extends Serializable = Serializable,
  TOutput extends Serializable = Serializable,
> extends ActionDefinitionBase<TInput> {
  /**
   * CF-style workflow function with step primitives.
   * Steps are recorded for visualization and compile to CF Workers.
   *
   * @example
   * ```typescript
   * async workflow(step, ctx, input) {
   *   const data = await step.do("fetch", async () => fetchData());
   *   await step.sleep("rate-limit", "5 seconds");
   *   await step.do("save", async () => saveData(data));
   *   return { saved: true };
   * }
   * ```
   */
  workflow: WorkflowFn<TInput, TOutput>;
  run?: never;
}

/**
 * Action definition - either run-based or workflow-based
 */
export type ActionDefinition<TInput = unknown, TOutput = unknown> =
  | RunActionDefinition<TInput, TOutput>
  | WorkflowActionDefinition<
      TInput extends Serializable ? TInput : Serializable,
      TOutput extends Serializable ? TOutput : Serializable
    >;

// =============================================================================
// Discovered Action (Runtime)
// =============================================================================

/** Base properties shared by all discovered actions */
interface DiscoveredActionBase {
  /** Action ID (usually same as name) */
  id: string;

  /** Path to the action file */
  path: string;

  /** Most recent run (if any) */
  lastRun?: ActionRun;

  /** Next scheduled run (ISO timestamp, if scheduled) */
  nextRun?: string;

  /** Missing secrets (if any) */
  missingSecrets?: string[];
}

/** A valid action that loaded successfully */
export interface ValidAction extends DiscoveredActionBase {
  valid: true;
  definition: ActionDefinition;
  error?: undefined;
}

/** An invalid action that failed to load */
export interface InvalidAction extends DiscoveredActionBase {
  valid: false;
  error: string;
  definition?: undefined;
}

/** Discriminated union - TypeScript narrows based on `valid` */
export type DiscoveredAction = ValidAction | InvalidAction;

// =============================================================================
// Helper Function
// =============================================================================

/**
 * Define a run-based action (simple async function)
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
  config: RunActionDefinition<TInput, TOutput>,
): RunActionDefinition<TInput, TOutput>;

/**
 * Define a workflow-based action (CF Workers compatible)
 *
 * @example
 * ```typescript
 * import { defineAction } from "@hands/core/primitives";
 * import { z } from "zod";
 *
 * export default defineAction({
 *   name: "sync-orders",
 *   description: "Sync orders with step primitives",
 *   schedule: "0 * * * *",
 *   input: z.object({ limit: z.number().default(100) }),
 *   async workflow(step, ctx, input) {
 *     const { orders } = await step.do("fetch", async () => {
 *       return { orders: await fetchOrders(input.limit) };
 *     });
 *     await step.sleep("rate-limit", "5 seconds");
 *     await step.do("save", async () => {
 *       await ctx.sql`INSERT INTO orders ${orders}`;
 *     });
 *     return { synced: orders.length };
 *   },
 * });
 * ```
 */
export function defineAction<TInput extends Serializable, TOutput extends Serializable>(
  config: WorkflowActionDefinition<TInput, TOutput>,
): WorkflowActionDefinition<TInput, TOutput>;

// Implementation
export function defineAction<TInput, TOutput>(
  config: ActionDefinition<TInput, TOutput>,
): ActionDefinition<TInput, TOutput> {
  return config;
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if action uses workflow (vs run)
 */
export function isWorkflowAction(action: ActionDefinition): action is WorkflowActionDefinition {
  return "workflow" in action && typeof action.workflow === "function";
}

/**
 * Check if action uses run (vs workflow)
 */
export function isRunAction(action: ActionDefinition): action is RunActionDefinition {
  return "run" in action && typeof action.run === "function";
}
