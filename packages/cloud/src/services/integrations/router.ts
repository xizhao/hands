import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../trpc/base";
import { oauthConnections } from "../../schema/oauth-tokens";
import { eq, and } from "drizzle-orm";
import { encrypt, decrypt } from "../../lib/crypto";
import { OAUTH_PROVIDERS } from "./providers";
import { getClientId, exchangeCode, refreshToken, getAccountInfo } from "./client";
import type { OAuthProviderType } from "./types";

const providerSchema = z.enum([
  "google",
  "slack",
  "github",
  "salesforce",
  "quickbooks",
  "shopify",
]);

export const integrationsRouter = router({
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
      providerName: OAUTH_PROVIDERS[conn.provider as OAuthProviderType]?.name ?? conn.provider,
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

  // Start OAuth flow
  connect: protectedProcedure
    .input(
      z.object({
        provider: providerSchema,
        shopDomain: z.string().optional(), // For Shopify
      })
    )
    .mutation(async ({ ctx, input }) => {
      const providerConfig = OAUTH_PROVIDERS[input.provider];
      if (!providerConfig) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown provider" });
      }

      const state = crypto.randomUUID();

      let authUrl = providerConfig.authUrl;
      if (input.provider === "shopify") {
        if (!input.shopDomain) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Shopify requires shop domain" });
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

      if (input.provider === "google") {
        params.set("access_type", "offline");
        params.set("prompt", "consent");
      }

      if (input.provider === "salesforce") {
        params.set("prompt", "login consent");
      }

      // Store state in KV
      await ctx.env.AUTH_STATE.put(
        `oauth-connect:${state}`,
        JSON.stringify({
          userId: ctx.user.id,
          provider: input.provider,
          shopDomain: input.shopDomain,
        }),
        { expirationTtl: 600 }
      );

      return {
        authUrl: `${authUrl}?${params}`,
        state,
      };
    }),

  // Complete OAuth flow
  completeConnect: protectedProcedure
    .input(
      z.object({
        provider: providerSchema,
        code: z.string(),
        state: z.string(),
        shopDomain: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const stateKey = `oauth-connect:${input.state}`;
      const stateData = await ctx.env.AUTH_STATE.get(stateKey);

      if (!stateData) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or expired state" });
      }

      await ctx.env.AUTH_STATE.delete(stateKey);

      const redirectUri = `${ctx.env.API_URL}/oauth/${input.provider}/callback`;
      const tokens = await exchangeCode(
        input.provider,
        input.code,
        redirectUri,
        ctx.env,
        input.shopDomain
      );

      const accountInfo = await getAccountInfo(input.provider, tokens.access_token);

      const encryptedAccessToken = await encrypt(tokens.access_token, ctx.env.ENCRYPTION_KEY);
      const encryptedRefreshToken = tokens.refresh_token
        ? await encrypt(tokens.refresh_token, ctx.env.ENCRYPTION_KEY)
        : null;

      const providerConfig = OAUTH_PROVIDERS[input.provider];
      const scopesArray = [...providerConfig.scopes];

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

      if (existing) {
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

      await ctx.db.delete(oauthConnections).where(eq(oauthConnections.id, input.id));

      return { success: true };
    }),

  // Get access token for making API calls
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
        throw new TRPCError({ code: "NOT_FOUND", message: "Integration not connected" });
      }

      // Check if token needs refresh
      if (connection.expiresAt && connection.expiresAt < new Date()) {
        if (!connection.refreshToken) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Token expired, please reconnect" });
        }

        const decryptedRefreshToken = await decrypt(
          connection.refreshToken,
          ctx.env.ENCRYPTION_KEY
        );

        const newTokens = await refreshToken(
          input.provider as OAuthProviderType,
          decryptedRefreshToken,
          ctx.env
        );

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

      const decryptedAccessToken = await decrypt(
        connection.accessToken,
        ctx.env.ENCRYPTION_KEY
      );

      return { accessToken: decryptedAccessToken };
    }),
});
