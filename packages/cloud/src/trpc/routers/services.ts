/**
 * Cloud Services Router
 *
 * Mega API for all external integrations. Actions use this to:
 * - Send emails (via Gmail)
 * - Post Slack messages
 * - Fetch GitHub data
 * - Make generic authenticated requests
 *
 * All requests use the user's stored OAuth tokens.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../index";
import { oauthConnections, type OAuthProviderType, OAUTH_PROVIDERS } from "../../schema/oauth-tokens";
import { eq, and } from "drizzle-orm";
import { decrypt, encrypt } from "../../lib/crypto";
import type { Context } from "../context";
import type { Env } from "../../types";

// =============================================================================
// Token Helper
// =============================================================================

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

/**
 * Get a valid OAuth token for a provider, refreshing if needed
 */
async function getValidToken(
  ctx: Context & { user: NonNullable<Context["user"]> },
  provider: OAuthProviderType
): Promise<string> {
  const connection = await ctx.db
    .select()
    .from(oauthConnections)
    .where(
      and(
        eq(oauthConnections.userId, ctx.user.id),
        eq(oauthConnections.provider, provider)
      )
    )
    .limit(1)
    .then((rows) => rows[0]);

  if (!connection) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `${provider} not connected. Please connect ${provider} in settings.`,
    });
  }

  // Check if token needs refresh
  if (connection.expiresAt && connection.expiresAt < new Date()) {
    if (!connection.refreshToken) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: `${provider} token expired. Please reconnect in settings.`,
      });
    }

    // Decrypt refresh token
    const decryptedRefreshToken = await decrypt(
      connection.refreshToken,
      ctx.env.ENCRYPTION_KEY
    );

    // Refresh the token
    const providerConfig = OAUTH_PROVIDERS[provider];
    const response = await fetch(providerConfig.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: getClientId(provider, ctx.env),
        client_secret: getClientSecret(provider, ctx.env),
        refresh_token: decryptedRefreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: `Failed to refresh ${provider} token. Please reconnect.`,
      });
    }

    const newTokens = (await response.json()) as TokenResponse;

    // Encrypt new tokens
    const encryptedAccessToken = await encrypt(
      newTokens.access_token,
      ctx.env.ENCRYPTION_KEY
    );
    const encryptedRefreshToken = newTokens.refresh_token
      ? await encrypt(newTokens.refresh_token, ctx.env.ENCRYPTION_KEY)
      : connection.refreshToken;

    await ctx.db
      .update(oauthConnections)
      .set({
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt: newTokens.expires_in
          ? new Date(Date.now() + newTokens.expires_in * 1000)
          : null,
        updatedAt: new Date(),
      })
      .where(eq(oauthConnections.id, connection.id));

    return newTokens.access_token;
  }

  // Decrypt and return access token
  return decrypt(connection.accessToken, ctx.env.ENCRYPTION_KEY);
}

function getClientId(provider: string, env: Env): string {
  const envRecord = env as unknown as Record<string, string>;
  const key = `${provider.toUpperCase()}_CLIENT_ID`;
  return envRecord[key] ?? "";
}

function getClientSecret(provider: string, env: Env): string {
  const envRecord = env as unknown as Record<string, string>;
  const key = `${provider.toUpperCase()}_CLIENT_SECRET`;
  return envRecord[key] ?? "";
}

// =============================================================================
// Email Service (Gmail)
// =============================================================================

const emailRouter = router({
  /**
   * Send an email via Gmail API
   */
  send: protectedProcedure
    .input(
      z.object({
        to: z.string().email(),
        subject: z.string(),
        body: z.string(),
        html: z.boolean().optional(),
        cc: z.array(z.string().email()).optional(),
        bcc: z.array(z.string().email()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const token = await getValidToken(ctx, "google");

      // Build RFC 2822 email message
      const headers = [
        `To: ${input.to}`,
        `Subject: ${input.subject}`,
        `MIME-Version: 1.0`,
        `Content-Type: ${input.html ? "text/html" : "text/plain"}; charset=utf-8`,
      ];

      if (input.cc?.length) {
        headers.push(`Cc: ${input.cc.join(", ")}`);
      }
      if (input.bcc?.length) {
        headers.push(`Bcc: ${input.bcc.join(", ")}`);
      }

      const message = headers.join("\r\n") + "\r\n\r\n" + input.body;

      // Base64 URL encode
      const encodedMessage = btoa(message)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      const response = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ raw: encodedMessage }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to send email: ${error}`,
        });
      }

      const result = (await response.json()) as { id: string; threadId: string };
      return { messageId: result.id, threadId: result.threadId };
    }),
});

// =============================================================================
// Slack Service
// =============================================================================

const slackRouter = router({
  /**
   * Send a message to a Slack channel
   */
  send: protectedProcedure
    .input(
      z.object({
        channel: z.string(), // Channel ID or name
        text: z.string(),
        blocks: z.array(z.any()).optional(), // Slack Block Kit
        thread_ts: z.string().optional(), // Reply to thread
      })
    )
    .mutation(async ({ ctx, input }) => {
      const token = await getValidToken(ctx, "slack");

      const response = await fetch("https://slack.com/api/chat.postMessage", {
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

      const result = (await response.json()) as {
        ok: boolean;
        ts?: string;
        channel?: string;
        error?: string;
      };

      if (!result.ok) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Slack error: ${result.error}`,
        });
      }

      return { ts: result.ts, channel: result.channel };
    }),

  /**
   * List channels the user has access to
   */
  channels: protectedProcedure.query(async ({ ctx }) => {
    const token = await getValidToken(ctx, "slack");

    const response = await fetch(
      "https://slack.com/api/conversations.list?types=public_channel,private_channel",
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const result = (await response.json()) as {
      ok: boolean;
      channels?: Array<{ id: string; name: string; is_private: boolean }>;
      error?: string;
    };

    if (!result.ok) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Slack error: ${result.error}`,
      });
    }

    return result.channels ?? [];
  }),
});

// =============================================================================
// GitHub Service
// =============================================================================

const githubRouter = router({
  /**
   * Fetch from GitHub API
   */
  fetch: protectedProcedure
    .input(
      z.object({
        path: z.string(), // e.g., "/repos/owner/repo/issues"
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
        body: z.any().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const token = await getValidToken(ctx, "github");

      const response = await fetch(`https://api.github.com${input.path}`, {
        method: input.method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(input.body ? { "Content-Type": "application/json" } : {}),
        },
        body: input.body ? JSON.stringify(input.body) : undefined,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `GitHub API error: ${error}`,
        });
      }

      // Handle no-content responses
      if (response.status === 204) {
        return null;
      }

      return response.json();
    }),

  /**
   * List issues for a repo
   */
  issues: protectedProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
        state: z.enum(["open", "closed", "all"]).default("open"),
        per_page: z.number().min(1).max(100).default(30),
      })
    )
    .query(async ({ ctx, input }) => {
      const token = await getValidToken(ctx, "github");

      const params = new URLSearchParams({
        state: input.state,
        per_page: String(input.per_page),
      });

      const response = await fetch(
        `https://api.github.com/repos/${input.owner}/${input.repo}/issues?${params}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `GitHub API error: ${error}`,
        });
      }

      return response.json() as Promise<
        Array<{
          id: number;
          number: number;
          title: string;
          state: string;
          user: { login: string };
          created_at: string;
          updated_at: string;
        }>
      >;
    }),

  /**
   * Create an issue
   */
  createIssue: protectedProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
        title: z.string(),
        body: z.string().optional(),
        labels: z.array(z.string()).optional(),
        assignees: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const token = await getValidToken(ctx, "github");

      const response = await fetch(
        `https://api.github.com/repos/${input.owner}/${input.repo}/issues`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: input.title,
            body: input.body,
            labels: input.labels,
            assignees: input.assignees,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `GitHub API error: ${error}`,
        });
      }

      return response.json() as Promise<{ id: number; number: number; html_url: string }>;
    }),

  /**
   * List repos for authenticated user
   */
  repos: protectedProcedure
    .input(
      z.object({
        per_page: z.number().min(1).max(100).default(30),
        sort: z.enum(["created", "updated", "pushed", "full_name"]).default("updated"),
      })
    )
    .query(async ({ ctx, input }) => {
      const token = await getValidToken(ctx, "github");

      const params = new URLSearchParams({
        per_page: String(input.per_page),
        sort: input.sort,
      });

      const response = await fetch(
        `https://api.github.com/user/repos?${params}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `GitHub API error: ${error}`,
        });
      }

      return response.json() as Promise<
        Array<{
          id: number;
          name: string;
          full_name: string;
          private: boolean;
          html_url: string;
          description: string | null;
        }>
      >;
    }),
});

// =============================================================================
// Generic Fetch (any connected provider)
// =============================================================================

const fetchRouter = router({
  /**
   * Make an authenticated request to any connected provider
   */
  request: protectedProcedure
    .input(
      z.object({
        provider: z.enum(["google", "slack", "github", "salesforce", "quickbooks", "shopify"]),
        url: z.string().url(),
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
        headers: z.record(z.string()).optional(),
        body: z.any().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const token = await getValidToken(ctx, input.provider);

      const response = await fetch(input.url, {
        method: input.method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...input.headers,
        },
        body: input.body ? JSON.stringify(input.body) : undefined,
      });

      const contentType = response.headers.get("content-type");
      let data: unknown;

      if (contentType?.includes("application/json")) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      return {
        ok: response.ok,
        status: response.status,
        data,
      };
    }),
});

// =============================================================================
// Salesforce Service
// =============================================================================

const salesforceRouter = router({
  /**
   * Query Salesforce via SOQL
   */
  query: protectedProcedure
    .input(
      z.object({
        soql: z.string(),
        instanceUrl: z.string().url(), // User needs to provide their instance URL
      })
    )
    .query(async ({ ctx, input }) => {
      const token = await getValidToken(ctx, "salesforce");

      const response = await fetch(
        `${input.instanceUrl}/services/data/v59.0/query?q=${encodeURIComponent(input.soql)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Salesforce error: ${error}`,
        });
      }

      return response.json() as Promise<{
        totalSize: number;
        done: boolean;
        records: unknown[];
      }>;
    }),
});

// =============================================================================
// Combined Services Router
// =============================================================================

export const servicesRouter = router({
  email: emailRouter,
  slack: slackRouter,
  github: githubRouter,
  salesforce: salesforceRouter,
  fetch: fetchRouter,

  /**
   * Check which services are connected for the current user
   */
  status: protectedProcedure.query(async ({ ctx }) => {
    const connections = await ctx.db
      .select({
        provider: oauthConnections.provider,
        accountEmail: oauthConnections.accountEmail,
        expiresAt: oauthConnections.expiresAt,
      })
      .from(oauthConnections)
      .where(eq(oauthConnections.userId, ctx.user.id));

    const connected = new Map<string, { email: string | null; valid: boolean }>();

    for (const conn of connections) {
      const isExpired = conn.expiresAt ? conn.expiresAt < new Date() : false;
      connected.set(conn.provider, {
        email: conn.accountEmail,
        valid: !isExpired,
      });
    }

    return {
      google: connected.get("google") ?? null,
      slack: connected.get("slack") ?? null,
      github: connected.get("github") ?? null,
      salesforce: connected.get("salesforce") ?? null,
      quickbooks: connected.get("quickbooks") ?? null,
      shopify: connected.get("shopify") ?? null,
    };
  }),
});
