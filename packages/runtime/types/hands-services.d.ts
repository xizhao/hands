/**
 * @hands/services type declarations for workbook type checking
 *
 * Cloud services client for OAuth-authenticated external APIs.
 */

export interface ServicesConfig {
  /** Cloud API URL (e.g., "https://api.hands.app") */
  cloudUrl: string;
  /** User authentication token */
  authToken: string;
}

export interface EmailInput {
  to: string;
  subject: string;
  body: string;
  html?: boolean;
  cc?: string[];
  bcc?: string[];
}

export interface EmailResult {
  messageId: string;
  threadId: string;
}

export interface SlackInput {
  channel: string;
  text: string;
  blocks?: unknown[];
  thread_ts?: string;
}

export interface SlackResult {
  ts?: string;
  channel?: string;
}

export interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  state: string;
  user: { login: string };
  created_at: string;
  updated_at: string;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  description: string | null;
}

export interface SalesforceQueryResult {
  totalSize: number;
  done: boolean;
  records: unknown[];
}

export type OAuthProvider = "google" | "slack" | "github" | "salesforce" | "quickbooks" | "shopify";

export interface ServiceStatus {
  google: { email: string | null; valid: boolean } | null;
  slack: { email: string | null; valid: boolean } | null;
  github: { email: string | null; valid: boolean } | null;
  salesforce: { email: string | null; valid: boolean } | null;
  quickbooks: { email: string | null; valid: boolean } | null;
  shopify: { email: string | null; valid: boolean } | null;
}

export interface Services {
  /** Email service (via Gmail) */
  email: {
    send: (input: EmailInput) => Promise<EmailResult>;
  };

  /** Slack service */
  slack: {
    send: (input: SlackInput) => Promise<SlackResult>;
    channels: () => Promise<SlackChannel[]>;
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
    }) => Promise<GitHubIssue[]>;
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
    }) => Promise<GitHubRepo[]>;
  };

  /** Salesforce service */
  salesforce: {
    query: (input: { soql: string; instanceUrl: string }) => Promise<SalesforceQueryResult>;
  };

  /** Generic authenticated fetch for any connected provider */
  fetch: (input: {
    provider: OAuthProvider;
    url: string;
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    headers?: Record<string, string>;
    body?: unknown;
  }) => Promise<{ ok: boolean; status: number; data: unknown }>;

  /** Check which services are connected */
  status: () => Promise<ServiceStatus>;
}

/**
 * Create a services client for OAuth-authenticated APIs.
 *
 * @example
 * ```typescript
 * import { createServices } from "@hands/services";
 *
 * const services = createServices({
 *   cloudUrl: "https://api.hands.app",
 *   authToken: ctx.secrets.HANDS_CLOUD_TOKEN,
 * });
 *
 * // Send email via Gmail
 * await services.email.send({
 *   to: "user@example.com",
 *   subject: "Hello",
 *   body: "World",
 * });
 *
 * // Post to Slack
 * await services.slack.send({
 *   channel: "#alerts",
 *   text: "Sync complete!",
 * });
 * ```
 */
export declare function createServices(config: ServicesConfig): Services;

/**
 * Error thrown by service operations
 */
export declare class ServiceError extends Error {
  readonly provider: string;
  readonly statusCode?: number;
  constructor(message: string, provider: string, statusCode?: number);
}
