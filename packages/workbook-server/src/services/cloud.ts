/**
 * Cloud Services Client
 *
 * Lightweight client for calling cloud services from actions.
 * Uses fetch directly to call tRPC endpoints (avoids tRPC client dependency).
 */

export interface CloudConfig {
  /** Cloud API base URL */
  baseUrl: string;
  /** User's auth token */
  token: string;
}

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

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface CloudGitHubFetchInput {
  path: string;
  method?: HttpMethod;
  body?: unknown;
}

export interface CloudGenericFetchInput {
  provider: "google" | "slack" | "github" | "salesforce" | "quickbooks" | "shopify";
  url: string;
  method?: HttpMethod;
  headers?: Record<string, string>;
  body?: unknown;
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
 * Make a tRPC request via fetch
 */
async function trpcFetch<T>(
  config: CloudConfig,
  path: string,
  type: "query" | "mutation",
  input?: unknown,
): Promise<T> {
  const url = new URL(`/trpc/${path}`, config.baseUrl);

  if (type === "query" && input !== undefined) {
    url.searchParams.set("input", JSON.stringify(input));
  }

  const response = await fetch(url.toString(), {
    method: type === "query" ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: type === "mutation" ? JSON.stringify(input) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Cloud service error (${response.status}): ${text}`);
  }

  const result = (await response.json()) as { result?: { data: T }; error?: { message: string } };

  if (result.error) {
    throw new Error(result.error.message);
  }

  if (!result.result) {
    throw new Error("Cloud service returned no result");
  }

  return result.result.data;
}

/**
 * Cloud Services Client
 *
 * Provides access to all cloud services from actions.
 *
 * @example
 * ```typescript
 * // In an action:
 * await ctx.cloud.email.send({
 *   to: "user@example.com",
 *   subject: "Hello",
 *   body: "World"
 * });
 *
 * await ctx.cloud.slack.send({
 *   channel: "#alerts",
 *   text: "Sync complete!"
 * });
 *
 * const issues = await ctx.cloud.github.issues({
 *   owner: "myorg",
 *   repo: "myrepo"
 * });
 * ```
 */
export function createCloudClient(config: CloudConfig) {
  return {
    /**
     * Email service (via Gmail)
     */
    email: {
      /**
       * Send an email
       */
      send: (input: CloudEmailInput) =>
        trpcFetch<{ messageId: string; threadId: string }>(
          config,
          "services.email.send",
          "mutation",
          input,
        ),
    },

    /**
     * Slack service
     */
    slack: {
      /**
       * Send a message to a channel
       */
      send: (input: CloudSlackInput) =>
        trpcFetch<{ ts?: string; channel?: string }>(
          config,
          "services.slack.send",
          "mutation",
          input,
        ),

      /**
       * List available channels
       */
      channels: () =>
        trpcFetch<Array<{ id: string; name: string; is_private: boolean }>>(
          config,
          "services.slack.channels",
          "query",
        ),
    },

    /**
     * GitHub service
     */
    github: {
      /**
       * Make a GitHub API request
       */
      fetch: (input: CloudGitHubFetchInput) =>
        trpcFetch<unknown>(config, "services.github.fetch", "mutation", input),

      /**
       * List issues for a repo
       */
      issues: (input: {
        owner: string;
        repo: string;
        state?: "open" | "closed" | "all";
        per_page?: number;
      }) =>
        trpcFetch<
          Array<{
            id: number;
            number: number;
            title: string;
            state: string;
            user: { login: string };
            created_at: string;
            updated_at: string;
          }>
        >(config, "services.github.issues", "query", input),

      /**
       * Create an issue
       */
      createIssue: (input: {
        owner: string;
        repo: string;
        title: string;
        body?: string;
        labels?: string[];
        assignees?: string[];
      }) =>
        trpcFetch<{ id: number; number: number; html_url: string }>(
          config,
          "services.github.createIssue",
          "mutation",
          input,
        ),

      /**
       * List user's repos
       */
      repos: (input?: {
        per_page?: number;
        sort?: "created" | "updated" | "pushed" | "full_name";
      }) =>
        trpcFetch<
          Array<{
            id: number;
            name: string;
            full_name: string;
            private: boolean;
            html_url: string;
            description: string | null;
          }>
        >(config, "services.github.repos", "query", input),
    },

    /**
     * Salesforce service
     */
    salesforce: {
      /**
       * Run a SOQL query
       */
      query: (input: { soql: string; instanceUrl: string }) =>
        trpcFetch<{ totalSize: number; done: boolean; records: unknown[] }>(
          config,
          "services.salesforce.query",
          "query",
          input,
        ),
    },

    /**
     * Generic authenticated fetch for any connected provider
     */
    fetch: (input: CloudGenericFetchInput) =>
      trpcFetch<{ ok: boolean; status: number; data: unknown }>(
        config,
        "services.fetch.request",
        "mutation",
        input,
      ),

    /**
     * Check which services are connected
     */
    status: () => trpcFetch<CloudServiceStatus>(config, "services.status", "query"),
  };
}

export type CloudClient = ReturnType<typeof createCloudClient>;
