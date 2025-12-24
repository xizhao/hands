/**
 * Cloud Services Client
 *
 * Provides access to external services (email, Slack, GitHub, Salesforce)
 * through the Hands cloud API with user authentication.
 *
 * @example
 * ```typescript
 * import { createServices } from "@hands/core/services";
 *
 * const services = createServices({
 *   cloudUrl: "https://api.hands.app",
 *   authToken: "user-jwt-token",
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
 *
 * // Query GitHub
 * const issues = await services.github.issues({
 *   owner: "org",
 *   repo: "repo",
 * });
 * ```
 */

// =============================================================================
// Types
// =============================================================================

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

// =============================================================================
// Implementation
// =============================================================================

class ServiceError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

/**
 * Get an access token for a provider from the cloud API
 */
async function getProviderToken(
  config: ServicesConfig,
  provider: OAuthProvider
): Promise<string> {
  const url = `${config.cloudUrl}/trpc/integrations.getToken?input=${encodeURIComponent(
    JSON.stringify({ provider })
  )}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.authToken}`,
    },
  });

  if (!res.ok) {
    if (res.status === 404) {
      throw new ServiceError(`${provider} is not connected. Connect it in Settings > Integrations.`, provider, 404);
    }
    throw new ServiceError(`Failed to get ${provider} token: ${res.status}`, provider, res.status);
  }

  const json = (await res.json()) as { result?: { data?: { accessToken: string } } };
  const token = json.result?.data?.accessToken;

  if (!token) {
    throw new ServiceError(`No access token returned for ${provider}`, provider);
  }

  return token;
}

/**
 * Create a services client
 */
export function createServices(config: ServicesConfig): Services {
  const { cloudUrl, authToken } = config;

  // Helper for provider API calls
  async function providerFetch<T>(
    provider: OAuthProvider,
    url: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = await getProviderToken(config, provider);

    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...options.headers,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new ServiceError(`${provider} API error: ${res.status} - ${text}`, provider, res.status);
    }

    return res.json() as Promise<T>;
  }

  return {
    email: {
      async send(input: EmailInput): Promise<EmailResult> {
        const token = await getProviderToken(config, "google");

        // Use Gmail API to send email
        const rawMessage = createRawEmail(input);

        const res = await fetch(
          "https://www.googleapis.com/gmail/v1/users/me/messages/send",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ raw: rawMessage }),
          }
        );

        if (!res.ok) {
          const text = await res.text();
          throw new ServiceError(`Gmail API error: ${res.status} - ${text}`, "google", res.status);
        }

        const data = (await res.json()) as { id: string; threadId: string };
        return { messageId: data.id, threadId: data.threadId };
      },
    },

    slack: {
      async send(input: SlackInput): Promise<SlackResult> {
        const token = await getProviderToken(config, "slack");

        const res = await fetch("https://slack.com/api/chat.postMessage", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            channel: input.channel,
            text: input.text,
            blocks: input.blocks,
            thread_ts: input.thread_ts,
          }),
        });

        const data = (await res.json()) as {
          ok: boolean;
          ts?: string;
          channel?: string;
          error?: string;
        };

        if (!data.ok) {
          throw new ServiceError(`Slack API error: ${data.error}`, "slack");
        }

        return { ts: data.ts, channel: data.channel };
      },

      async channels(): Promise<SlackChannel[]> {
        const token = await getProviderToken(config, "slack");

        const res = await fetch(
          "https://slack.com/api/conversations.list?types=public_channel,private_channel",
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        const data = (await res.json()) as {
          ok: boolean;
          channels?: Array<{ id: string; name: string; is_private: boolean }>;
          error?: string;
        };

        if (!data.ok) {
          throw new ServiceError(`Slack API error: ${data.error}`, "slack");
        }

        return (data.channels ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          is_private: c.is_private,
        }));
      },
    },

    github: {
      async fetch(input): Promise<unknown> {
        const url = input.path.startsWith("http")
          ? input.path
          : `https://api.github.com${input.path.startsWith("/") ? "" : "/"}${input.path}`;

        return providerFetch("github", url, {
          method: input.method ?? "GET",
          body: input.body ? JSON.stringify(input.body) : undefined,
          headers: {
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        });
      },

      async issues(input): Promise<GitHubIssue[]> {
        const params = new URLSearchParams();
        if (input.state) params.set("state", input.state);
        if (input.per_page) params.set("per_page", String(input.per_page));

        const url = `https://api.github.com/repos/${input.owner}/${input.repo}/issues?${params}`;
        return providerFetch("github", url, {
          headers: {
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        });
      },

      async createIssue(input): Promise<{ id: number; number: number; html_url: string }> {
        const url = `https://api.github.com/repos/${input.owner}/${input.repo}/issues`;
        return providerFetch("github", url, {
          method: "POST",
          body: JSON.stringify({
            title: input.title,
            body: input.body,
            labels: input.labels,
            assignees: input.assignees,
          }),
          headers: {
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        });
      },

      async repos(input = {}): Promise<GitHubRepo[]> {
        const params = new URLSearchParams();
        if (input.per_page) params.set("per_page", String(input.per_page));
        if (input.sort) params.set("sort", input.sort);

        const url = `https://api.github.com/user/repos?${params}`;
        return providerFetch("github", url, {
          headers: {
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        });
      },
    },

    salesforce: {
      async query(input): Promise<SalesforceQueryResult> {
        const token = await getProviderToken(config, "salesforce");
        const url = `${input.instanceUrl}/services/data/v59.0/query?q=${encodeURIComponent(input.soql)}`;

        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        });

        if (!res.ok) {
          const text = await res.text();
          throw new ServiceError(`Salesforce API error: ${res.status} - ${text}`, "salesforce", res.status);
        }

        return res.json() as Promise<SalesforceQueryResult>;
      },
    },

    async fetch(input): Promise<{ ok: boolean; status: number; data: unknown }> {
      const token = await getProviderToken(config, input.provider);

      const res = await fetch(input.url, {
        method: input.method ?? "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...input.headers,
        },
        body: input.body ? JSON.stringify(input.body) : undefined,
      });

      let data: unknown;
      const contentType = res.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        data = await res.json();
      } else {
        data = await res.text();
      }

      return { ok: res.ok, status: res.status, data };
    },

    async status(): Promise<ServiceStatus> {
      const url = `${cloudUrl}/trpc/integrations.connections`;

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (!res.ok) {
        throw new ServiceError(`Failed to get service status: ${res.status}`, "status", res.status);
      }

      const json = (await res.json()) as {
        result?: {
          data?: Array<{ provider: string; accountEmail: string | null }>;
        };
      };

      const connections = json.result?.data ?? [];
      const status: ServiceStatus = {
        google: null,
        slack: null,
        github: null,
        salesforce: null,
        quickbooks: null,
        shopify: null,
      };

      for (const conn of connections) {
        const provider = conn.provider as keyof ServiceStatus;
        if (provider in status) {
          status[provider] = { email: conn.accountEmail, valid: true };
        }
      }

      return status;
    },
  };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Create a raw RFC 2822 email for Gmail API
 */
function createRawEmail(input: EmailInput): string {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2)}`;

  let headers = [
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    `MIME-Version: 1.0`,
  ];

  if (input.cc?.length) {
    headers.push(`Cc: ${input.cc.join(", ")}`);
  }
  if (input.bcc?.length) {
    headers.push(`Bcc: ${input.bcc.join(", ")}`);
  }

  let body: string;
  if (input.html) {
    headers.push(`Content-Type: text/html; charset=UTF-8`);
    body = input.body;
  } else {
    headers.push(`Content-Type: text/plain; charset=UTF-8`);
    body = input.body;
  }

  const email = `${headers.join("\r\n")}\r\n\r\n${body}`;

  // Base64url encode
  return btoa(unescape(encodeURIComponent(email)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Re-export error class
export { ServiceError };
