import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../trpc/base";
import { users } from "../../schema/users";
import { subscriptions, PLANS, type PlanType } from "../../schema/subscriptions";
import { usageDaily } from "../../schema/usage";
import { eq, and, sql, gte, lte } from "drizzle-orm";
import { createStripeClient, createCheckoutSession, createPortalSession, listActiveSubscriptions, cancelSubscription } from "./client";

export const paymentsRouter = router({
  // Get current subscription
  subscription: protectedProcedure.query(async ({ ctx }) => {
    const subscription = await ctx.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, ctx.user.id))
      .limit(1)
      .then((rows) => rows[0]);

    if (!subscription) {
      return {
        plan: "free" as PlanType,
        status: "active",
        includedTokens: PLANS.free.includedTokens,
        currentPeriodEnd: null,
      };
    }

    return {
      plan: subscription.plan as PlanType,
      status: subscription.status,
      includedTokens: subscription.includedTokens,
      currentPeriodEnd: subscription.currentPeriodEnd,
    };
  }),

  // Get current usage for billing
  currentUsage: protectedProcedure.query(async ({ ctx }) => {
    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const usage = await ctx.db
      .select({
        totalTokens: sql<number>`COALESCE(SUM(${usageDaily.tokensInput} + ${usageDaily.tokensOutput}), 0)`,
        totalRequests: sql<number>`COALESCE(SUM(${usageDaily.requests}), 0)`,
        totalCost: sql<number>`COALESCE(SUM(${usageDaily.costCents}), 0)`,
      })
      .from(usageDaily)
      .where(
        and(
          eq(usageDaily.userId, ctx.user.id),
          gte(usageDaily.date, monthStart.toISOString().split("T")[0]),
          lte(usageDaily.date, monthEnd.toISOString().split("T")[0])
        )
      )
      .then((rows) => rows[0]);

    const subscription = await ctx.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, ctx.user.id))
      .limit(1)
      .then((rows) => rows[0]);

    const includedTokens = subscription?.includedTokens ?? PLANS.free.includedTokens;
    const plan = subscription?.plan ?? "free";

    const usedTokens = usage?.totalTokens ?? 0;
    const overageTokens = Math.max(0, usedTokens - includedTokens);

    return {
      tokens: {
        used: usedTokens,
        included: includedTokens,
        overage: overageTokens,
        percentage: Math.min(100, Math.round((usedTokens / includedTokens) * 100)),
      },
      requests: usage?.totalRequests ?? 0,
      cost: {
        included: plan === "free" ? 0 : PLANS[plan as PlanType]?.monthlyPrice ?? 0,
        overage: overageTokens > 0 ? Math.round(overageTokens / 1000) : 0,
        total: 0,
      },
      billingPeriod: {
        start: monthStart,
        end: monthEnd,
      },
    };
  }),

  // Create checkout session
  checkout: protectedProcedure
    .input(z.object({ plan: z.enum(["pro", "team"]) }))
    .mutation(async ({ ctx, input }) => {
      const stripe = createStripeClient(ctx.env);
      const planConfig = PLANS[input.plan];

      if (!planConfig.priceId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid plan",
        });
      }

      let customerId = ctx.user.stripeCustomerId ?? undefined;

      // Create customer if needed
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: ctx.user.email,
          name: ctx.user.name ?? undefined,
          metadata: { userId: ctx.user.id },
        });

        customerId = customer.id;

        await ctx.db
          .update(users)
          .set({ stripeCustomerId: customerId, updatedAt: new Date() })
          .where(eq(users.id, ctx.user.id));
      }

      const session = await createCheckoutSession(stripe, {
        plan: input.plan,
        customerId,
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        userName: ctx.user.name ?? undefined,
        priceId: planConfig.priceId,
        appUrl: ctx.env.APP_URL,
      });

      return { url: session.url };
    }),

  // Get billing portal URL
  portal: protectedProcedure.mutation(async ({ ctx }) => {
    if (!ctx.user.stripeCustomerId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "No billing account",
      });
    }

    const stripe = createStripeClient(ctx.env);

    const session = await createPortalSession(stripe, {
      customerId: ctx.user.stripeCustomerId,
      returnUrl: `${ctx.env.APP_URL}/settings/billing`,
    });

    return { url: session.url };
  }),

  // Cancel subscription
  cancel: protectedProcedure.mutation(async ({ ctx }) => {
    if (!ctx.user.stripeCustomerId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "No billing account",
      });
    }

    const stripe = createStripeClient(ctx.env);
    const activeSubs = await listActiveSubscriptions(stripe, ctx.user.stripeCustomerId);

    for (const sub of activeSubs) {
      await cancelSubscription(stripe, sub.id);
    }

    await ctx.db
      .update(subscriptions)
      .set({ status: "canceled" })
      .where(eq(subscriptions.userId, ctx.user.id));

    return { success: true };
  }),

  // Get available plans
  plans: protectedProcedure.query(async () => {
    return Object.entries(PLANS).map(([key, plan]) => ({
      id: key,
      name: plan.name,
      price: plan.monthlyPrice / 100,
      includedTokens: plan.includedTokens,
      features: plan.features,
    }));
  }),
});
