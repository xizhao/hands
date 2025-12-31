import { TRPCError } from "@trpc/server";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { generateToken, hash } from "../../lib/crypto";
import { refreshTokens } from "../../schema/refresh-tokens";
import { PLANS, subscriptions } from "../../schema/subscriptions";
import { users } from "../../schema/users";
import { protectedProcedure, publicProcedure, router } from "../../trpc/base";
import {
  exchangeGoogleCode,
  getGoogleAuthUrl,
  getGoogleUserInfo,
  signToken,
  verifyCodeChallenge,
} from "./client";
import type { AuthState } from "./types";

const AUTH_STATE_TTL = 10 * 60; // 10 minutes
const REFRESH_TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const authRouter = router({
  // Start OAuth flow for desktop app
  startOAuth: publicProcedure
    .input(
      z.object({
        codeChallenge: z.string(),
        redirectUri: z.string().url(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const state = crypto.randomUUID();

      const authState: AuthState = {
        codeChallenge: input.codeChallenge,
        redirectUri: input.redirectUri,
        createdAt: Date.now(),
      };

      await ctx.env.AUTH_STATE.put(`oauth:${state}`, JSON.stringify(authState), {
        expirationTtl: AUTH_STATE_TTL,
      });

      const callbackUri = `${ctx.env.API_URL}/auth/callback`;

      const authUrl = getGoogleAuthUrl(ctx.env.GOOGLE_CLIENT_ID, callbackUri, state);

      return { authUrl, state };
    }),

  // Exchange authorization code for tokens
  exchangeCode: publicProcedure
    .input(
      z.object({
        code: z.string(),
        state: z.string(),
        codeVerifier: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const stateKey = `oauth:${input.state}`;
      const storedStateJson = await ctx.env.AUTH_STATE.get(stateKey);

      if (!storedStateJson) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid or expired state",
        });
      }

      const storedState: AuthState = JSON.parse(storedStateJson);

      const isValid = await verifyCodeChallenge(input.codeVerifier, storedState.codeChallenge);
      if (!isValid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid code verifier",
        });
      }

      await ctx.env.AUTH_STATE.delete(stateKey);

      const callbackUri = `${ctx.env.API_URL}/auth/callback`;
      const tokens = await exchangeGoogleCode(
        input.code,
        ctx.env.GOOGLE_CLIENT_ID,
        ctx.env.GOOGLE_CLIENT_SECRET,
        callbackUri,
      );

      const userInfo = await getGoogleUserInfo(tokens.access_token);

      // Upsert user
      const existingUser = await ctx.db
        .select()
        .from(users)
        .where(eq(users.email, userInfo.email))
        .limit(1)
        .then((rows) => rows[0]);

      let userId: string;

      if (existingUser) {
        userId = existingUser.id;
        await ctx.db
          .update(users)
          .set({
            name: userInfo.name,
            avatarUrl: userInfo.picture,
            updatedAt: new Date(),
          })
          .where(eq(users.id, existingUser.id));
      } else {
        const newUser = await ctx.db
          .insert(users)
          .values({
            email: userInfo.email,
            name: userInfo.name,
            avatarUrl: userInfo.picture,
          })
          .returning({ id: users.id })
          .then((rows) => rows[0]);

        userId = newUser.id;

        const now = new Date();
        await ctx.db.insert(subscriptions).values({
          userId,
          stripeSubscriptionId: "free",
          status: "active",
          plan: "free",
          includedTokens: PLANS.free.includedTokens,
          currentPeriodStart: now,
          currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        });
      }

      const accessToken = await signToken(
        { sub: userId, email: userInfo.email, name: userInfo.name },
        ctx.env.AUTH_SECRET,
        "7d",
      );

      const refreshTokenValue = generateToken(64);
      const refreshTokenHash = await hash(refreshTokenValue);

      await ctx.db.insert(refreshTokens).values({
        userId,
        tokenHash: refreshTokenHash,
        userAgent: ctx.req.headers.get("User-Agent") ?? undefined,
        ipAddress: ctx.req.headers.get("CF-Connecting-IP") ?? undefined,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS),
      });

      return {
        accessToken,
        refreshToken: refreshTokenValue,
        user: {
          id: userId,
          email: userInfo.email,
          name: userInfo.name,
          avatarUrl: userInfo.picture,
        },
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      };
    }),

  // Refresh access token
  refresh: publicProcedure
    .input(z.object({ refreshToken: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const tokenHash = await hash(input.refreshToken);

      const storedToken = await ctx.db
        .select()
        .from(refreshTokens)
        .where(
          and(
            eq(refreshTokens.tokenHash, tokenHash),
            eq(refreshTokens.isRevoked, false),
            gt(refreshTokens.expiresAt, new Date()),
          ),
        )
        .limit(1)
        .then((rows) => rows[0]);

      if (!storedToken) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid or expired refresh token",
        });
      }

      const user = await ctx.db
        .select()
        .from(users)
        .where(eq(users.id, storedToken.userId))
        .limit(1)
        .then((rows) => rows[0]);

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      const accessToken = await signToken(
        { sub: user.id, email: user.email, name: user.name ?? undefined },
        ctx.env.AUTH_SECRET,
        "7d",
      );

      return {
        accessToken,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      };
    }),

  // Revoke a refresh token
  revokeToken: protectedProcedure
    .input(z.object({ refreshToken: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const tokenHash = await hash(input.refreshToken);

      await ctx.db
        .update(refreshTokens)
        .set({
          isRevoked: true,
          revokedAt: new Date(),
        })
        .where(and(eq(refreshTokens.tokenHash, tokenHash), eq(refreshTokens.userId, ctx.user.id)));

      return { success: true };
    }),

  // Revoke all refresh tokens (logout everywhere)
  revokeAllTokens: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .update(refreshTokens)
      .set({
        isRevoked: true,
        revokedAt: new Date(),
      })
      .where(eq(refreshTokens.userId, ctx.user.id));

    return { success: true };
  }),

  // List active sessions
  sessions: protectedProcedure.query(async ({ ctx }) => {
    const tokens = await ctx.db
      .select({
        id: refreshTokens.id,
        userAgent: refreshTokens.userAgent,
        ipAddress: refreshTokens.ipAddress,
        createdAt: refreshTokens.createdAt,
        expiresAt: refreshTokens.expiresAt,
      })
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.userId, ctx.user.id),
          eq(refreshTokens.isRevoked, false),
          gt(refreshTokens.expiresAt, new Date()),
        ),
      );

    return tokens;
  }),

  // Get current user
  me: protectedProcedure.query(async ({ ctx }) => {
    return {
      id: ctx.user.id,
      email: ctx.user.email,
      name: ctx.user.name,
      avatarUrl: ctx.user.avatarUrl,
    };
  }),

  // Logout
  logout: protectedProcedure
    .input(z.object({ refreshToken: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (input.refreshToken) {
        const tokenHash = await hash(input.refreshToken);
        await ctx.db
          .update(refreshTokens)
          .set({
            isRevoked: true,
            revokedAt: new Date(),
          })
          .where(
            and(eq(refreshTokens.tokenHash, tokenHash), eq(refreshTokens.userId, ctx.user.id)),
          );
      }
      return { success: true };
    }),
});
