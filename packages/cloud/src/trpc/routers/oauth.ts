import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../index";
import {
  oauthConnections,
  OAUTH_PROVIDERS,
  type OAuthProviderType,
} from "../../schema/oauth-tokens";
import { eq, and } from "drizzle-orm";
import { encrypt, decrypt } from "../../lib/crypto";
import type { Env } from "../../types";

// Token response type from OAuth providers
interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

// User info response type
interface UserInfo {
  id: string;
  email: string;
}

export const oauthRouter = router({
  // List user's connected integrations
  connections: protectedProcedure.query(async ({ ctx }) => {
    const connections = await ctx.db
      .select({
        id: oauthConnections.id,
        provider: oauthConnections.provider,
        accountEmail: oauthConnections.accountEmail,
        scopes: oauthConnections.scopes,
        createdAt: oauthConnections.createdAt,
      })
      .from(oauthConnections)
      .where(eq(oauthConnections.userId, ctx.user.id));

    return connections.map((conn) => ({
      id: conn.id,
      provider: conn.provider,
      providerName:
        OAUTH_PROVIDERS[conn.provider as OAuthProviderType]?.name ??
        conn.provider,
      accountEmail: conn.accountEmail,
      scopes: conn.scopes ?? [],
      connectedAt: conn.createdAt,
    }));
  }),

  // Get available providers
  providers: protectedProcedure.query(async () => {
    return Object.entries(OAUTH_PROVIDERS).map(([key, config]) => ({
      id: key,
      name: config.name,
      scopes: [...config.scopes],
    }));
  }),

  // Start OAuth flow for an integration
  startConnect: protectedProcedure
    .input(
      z.object({
        provider: z.enum([
          "google",
          "slack",
          "github",
          "salesforce",
          "quickbooks",
          "shopify",
        ]),
        // For Shopify, need the shop domain
        shopDomain: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const providerConfig = OAUTH_PROVIDERS[input.provider];
      if (!providerConfig) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Unknown provider",
        });
      }

      // Generate state token
      const state = crypto.randomUUID();

      // Build auth URL
      let authUrl: string = providerConfig.authUrl;

      // Handle Shopify's per-store URLs
      if (input.provider === "shopify") {
        if (!input.shopDomain) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Shopify requires shop domain",
          });
        }
        authUrl = authUrl.replace("{shop}", input.shopDomain);
      }

      const redirectUri = `${ctx.env.API_URL}/oauth/${input.provider}/callback`;

      const params = new URLSearchParams({
        client_id: getClientId(input.provider, ctx.env),
        redirect_uri: redirectUri,
        response_type: "code",
        scope: providerConfig.scopes.join(" "),
        state,
      });

      // Provider-specific params
      if (input.provider === "google") {
        params.set("access_type", "offline");
        params.set("prompt", "consent");
      }

      if (input.provider === "salesforce") {
        params.set("prompt", "login consent");
      }

      // Store state in KV for validation
      await ctx.env.AUTH_STATE.put(
        `oauth-connect:${state}`,
        JSON.stringify({
          userId: ctx.user.id,
          provider: input.provider,
          shopDomain: input.shopDomain,
        }),
        { expirationTtl: 600 } // 10 minutes
      );

      return {
        authUrl: `${authUrl}?${params}`,
        state,
      };
    }),

  // Exchange code for tokens (called after OAuth callback)
  completeConnect: protectedProcedure
    .input(
      z.object({
        provider: z.enum([
          "google",
          "slack",
          "github",
          "salesforce",
          "quickbooks",
          "shopify",
        ]),
        code: z.string(),
        state: z.string(),
        shopDomain: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Validate state from KV
      const stateKey = `oauth-connect:${input.state}`;
      const stateData = await ctx.env.AUTH_STATE.get(stateKey);

      if (!stateData) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid or expired state",
        });
      }

      // Delete state (one-time use)
      await ctx.env.AUTH_STATE.delete(stateKey);

      const providerConfig = OAUTH_PROVIDERS[input.provider];

      // Exchange code for tokens
      let tokenUrl: string = providerConfig.tokenUrl;
      if (input.provider === "shopify" && input.shopDomain) {
        tokenUrl = tokenUrl.replace("{shop}", input.shopDomain);
      }

      const redirectUri = `${ctx.env.API_URL}/oauth/${input.provider}/callback`;

      const tokenResponse = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          client_id: getClientId(input.provider, ctx.env),
          client_secret: getClientSecret(input.provider, ctx.env),
          code: input.code,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenResponse.ok) {
        const error = await tokenResponse.text();
        console.error(`OAuth token exchange failed: ${error}`);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Failed to complete OAuth flow",
        });
      }

      const tokens = (await tokenResponse.json()) as TokenResponse;

      // Get account info (provider-specific)
      const accountInfo = await getAccountInfo(
        input.provider,
        tokens.access_token
      );

      // Encrypt tokens before storing
      const encryptedAccessToken = await encrypt(
        tokens.access_token,
        ctx.env.ENCRYPTION_KEY
      );
      const encryptedRefreshToken = tokens.refresh_token
        ? await encrypt(tokens.refresh_token, ctx.env.ENCRYPTION_KEY)
        : null;

      // Check for existing connection
      const existing = await ctx.db
        .select()
        .from(oauthConnections)
        .where(
          and(
            eq(oauthConnections.userId, ctx.user.id),
            eq(oauthConnections.provider, input.provider)
          )
        )
        .limit(1)
        .then((rows) => rows[0]);

      const expiresAt = tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : null;

      // Convert readonly scopes to mutable array for DB
      const scopesArray = [...providerConfig.scopes];

      if (existing) {
        // Update existing connection
        await ctx.db
          .update(oauthConnections)
          .set({
            accessToken: encryptedAccessToken,
            refreshToken: encryptedRefreshToken ?? existing.refreshToken,
            expiresAt,
            scopes: scopesArray,
            accountEmail: accountInfo.email,
            accountId: accountInfo.id,
            updatedAt: new Date(),
          })
          .where(eq(oauthConnections.id, existing.id));

        return { id: existing.id, updated: true };
      } else {
        // Create new connection
        const connection = await ctx.db
          .insert(oauthConnections)
          .values({
            userId: ctx.user.id,
            provider: input.provider,
            accessToken: encryptedAccessToken,
            refreshToken: encryptedRefreshToken,
            expiresAt,
            scopes: scopesArray,
            accountEmail: accountInfo.email,
            accountId: accountInfo.id,
          })
          .returning({ id: oauthConnections.id })
          .then((rows) => rows[0]);

        return { id: connection.id, updated: false };
      }
    }),

  // Disconnect an integration
  disconnect: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const connection = await ctx.db
        .select()
        .from(oauthConnections)
        .where(
          and(
            eq(oauthConnections.id, input.id),
            eq(oauthConnections.userId, ctx.user.id)
          )
        )
        .limit(1)
        .then((rows) => rows[0]);

      if (!connection) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // Optionally revoke the token with the provider
      // (implementation depends on provider)

      await ctx.db
        .delete(oauthConnections)
        .where(eq(oauthConnections.id, input.id));

      return { success: true };
    }),

  // Get access token for a provider (for making API calls)
  getToken: protectedProcedure
    .input(z.object({ provider: z.string() }))
    .query(async ({ ctx, input }) => {
      const connection = await ctx.db
        .select()
        .from(oauthConnections)
        .where(
          and(
            eq(oauthConnections.userId, ctx.user.id),
            eq(oauthConnections.provider, input.provider)
          )
        )
        .limit(1)
        .then((rows) => rows[0]);

      if (!connection) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Integration not connected",
        });
      }

      // Check if token needs refresh
      if (connection.expiresAt && connection.expiresAt < new Date()) {
        if (!connection.refreshToken) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Token expired, please reconnect",
          });
        }

        // Decrypt refresh token
        const decryptedRefreshToken = await decrypt(
          connection.refreshToken,
          ctx.env.ENCRYPTION_KEY
        );

        // Refresh the token
        const newTokens = await refreshOAuthToken(
          input.provider as OAuthProviderType,
          decryptedRefreshToken,
          ctx.env
        );

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

        return { accessToken: newTokens.access_token };
      }

      // Decrypt and return access token
      const decryptedAccessToken = await decrypt(
        connection.accessToken,
        ctx.env.ENCRYPTION_KEY
      );

      return { accessToken: decryptedAccessToken };
    }),
});

// Helper functions
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

async function getAccountInfo(
  provider: string,
  accessToken: string
): Promise<UserInfo> {
  switch (provider) {
    case "google": {
      const res = await fetch(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!res.ok) {
        throw new Error(`Failed to get Google user info: ${res.status}`);
      }
      const data = (await res.json()) as { sub: string; email: string };
      return { id: data.sub, email: data.email };
    }
    case "github": {
      const res = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github+json",
        },
      });
      if (!res.ok) {
        throw new Error(`Failed to get GitHub user info: ${res.status}`);
      }
      const data = (await res.json()) as { id: number; email: string | null };
      // GitHub email can be null if private, fetch from emails endpoint
      let email = data.email;
      if (!email) {
        const emailRes = await fetch("https://api.github.com/user/emails", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github+json",
          },
        });
        if (emailRes.ok) {
          const emails = (await emailRes.json()) as Array<{ email: string; primary: boolean }>;
          email = emails.find((e) => e.primary)?.email ?? emails[0]?.email ?? null;
        }
      }
      if (!email) {
        throw new Error("GitHub user has no accessible email");
      }
      return { id: String(data.id), email };
    }
    case "slack": {
      const res = await fetch("https://slack.com/api/users.identity", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        throw new Error(`Failed to get Slack user info: ${res.status}`);
      }
      const data = (await res.json()) as {
        ok: boolean;
        user?: { id: string; email: string };
        error?: string;
      };
      if (!data.ok || !data.user) {
        throw new Error(`Slack API error: ${data.error ?? "unknown"}`);
      }
      return { id: data.user.id, email: data.user.email };
    }
    case "salesforce": {
      const res = await fetch(
        "https://login.salesforce.com/services/oauth2/userinfo",
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!res.ok) {
        throw new Error(`Failed to get Salesforce user info: ${res.status}`);
      }
      const data = (await res.json()) as { user_id: string; email: string };
      return { id: data.user_id, email: data.email };
    }
    case "quickbooks": {
      // QuickBooks uses a different userinfo endpoint
      const res = await fetch(
        "https://accounts.platform.intuit.com/v1/openid_connect/userinfo",
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!res.ok) {
        throw new Error(`Failed to get QuickBooks user info: ${res.status}`);
      }
      const data = (await res.json()) as { sub: string; email: string };
      return { id: data.sub, email: data.email };
    }
    case "shopify": {
      // Shopify access tokens are shop-scoped, return shop info
      // The shop domain should be passed separately
      return { id: "shop", email: "shop@shopify.com" };
    }
    default:
      throw new Error(`Unsupported OAuth provider: ${provider}`);
  }
}

async function refreshOAuthToken(
  provider: OAuthProviderType,
  refreshTokenValue: string,
  env: Env
): Promise<TokenResponse> {
  const providerConfig = OAUTH_PROVIDERS[provider];

  const response = await fetch(providerConfig.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      client_id: getClientId(provider, env),
      client_secret: getClientSecret(provider, env),
      refresh_token: refreshTokenValue,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to refresh token");
  }

  return response.json() as Promise<TokenResponse>;
}
