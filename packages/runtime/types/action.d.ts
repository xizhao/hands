/**
 * Action types for @hands/runtime
 */

export type ActionTriggerType = "manual" | "cron" | "webhook" | "pg_notify";

export type ActionTrigger =
  | { type: "manual" }
  | { type: "cron"; schedule: string }
  | { type: "webhook"; path?: string }
  | { type: "pg_notify"; channel: string };

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
  sources: Record<string, Record<string, TableClient>>;
  sql: <T = unknown>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<T[]>;
  log: ActionLogger;
  notify: ActionNotify;
  secrets: Record<string, string>;
  run: ActionRunMeta;
}

export interface ActionDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description?: string;
  schedule?: string;
  triggers?: Array<"manual" | "webhook" | "pg_notify">;
  pgNotifyChannel?: string;
  webhookPath?: string;
  secrets?: string[];
  input?: unknown; // z.ZodType<TInput> simplified
  run: (input: TInput, ctx: ActionContext) => Promise<TOutput>;
}

export declare function defineAction<TInput = unknown, TOutput = unknown>(
  config: ActionDefinition<TInput, TOutput>
): ActionDefinition<TInput, TOutput>;

export interface DiscoveredAction {
  id: string;
  path: string;
  definition: ActionDefinition;
  lastRun?: ActionRun;
  nextRun?: string;
  missingSecrets?: string[];
}
