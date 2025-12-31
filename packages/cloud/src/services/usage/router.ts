import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { PLANS, subscriptions } from "../../schema/subscriptions";
import { usageDaily } from "../../schema/usage";
import { protectedProcedure, router } from "../../trpc/base";

export const usageRouter = router({
  // Get usage summary for current month
  summary: protectedProcedure.query(async ({ ctx }) => {
    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const billingPeriod = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

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
          lte(usageDaily.date, monthEnd.toISOString().split("T")[0]),
        ),
      )
      .then((rows) => rows[0]);

    const subscription = await ctx.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, ctx.user.id))
      .limit(1)
      .then((rows) => rows[0]);

    const plan = subscription?.plan ?? "free";
    const planConfig = PLANS[plan as keyof typeof PLANS];

    return {
      billingPeriod,
      tokens: {
        used: usage?.totalTokens ?? 0,
        limit: planConfig.includedTokens,
        percentage: Math.min(
          100,
          Math.round(((usage?.totalTokens ?? 0) / planConfig.includedTokens) * 100),
        ),
      },
      requests: usage?.totalRequests ?? 0,
      cost: {
        cents: usage?.totalCost ?? 0,
        dollars: ((usage?.totalCost ?? 0) / 100).toFixed(2),
      },
      plan,
    };
  }),

  // Get daily usage for a period
  daily: protectedProcedure
    .input(z.object({ days: z.number().min(1).max(90).default(30) }))
    .query(async ({ ctx, input }) => {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - input.days);

      const daily = await ctx.db
        .select()
        .from(usageDaily)
        .where(
          and(
            eq(usageDaily.userId, ctx.user.id),
            gte(usageDaily.date, startDate.toISOString().split("T")[0]),
            lte(usageDaily.date, endDate.toISOString().split("T")[0]),
          ),
        )
        .orderBy(desc(usageDaily.date));

      return daily.map((d) => ({
        date: d.date,
        tokensInput: d.tokensInput,
        tokensOutput: d.tokensOutput,
        totalTokens: d.tokensInput + d.tokensOutput,
        requests: d.requests,
        costCents: d.costCents,
      }));
    }),

  // Get usage history by month
  history: protectedProcedure
    .input(z.object({ months: z.number().min(1).max(12).default(6) }))
    .query(async ({ ctx, input }) => {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - input.months + 1);
      startDate.setDate(1);

      const monthlyUsage = await ctx.db
        .select({
          period: sql<string>`TO_CHAR(${usageDaily.date}::date, 'YYYY-MM')`,
          totalTokens: sql<number>`COALESCE(SUM(${usageDaily.tokensInput} + ${usageDaily.tokensOutput}), 0)`,
          totalRequests: sql<number>`COALESCE(SUM(${usageDaily.requests}), 0)`,
          totalCost: sql<number>`COALESCE(SUM(${usageDaily.costCents}), 0)`,
        })
        .from(usageDaily)
        .where(
          and(
            eq(usageDaily.userId, ctx.user.id),
            gte(usageDaily.date, startDate.toISOString().split("T")[0]),
            lte(usageDaily.date, endDate.toISOString().split("T")[0]),
          ),
        )
        .groupBy(sql`TO_CHAR(${usageDaily.date}::date, 'YYYY-MM')`)
        .orderBy(desc(sql`TO_CHAR(${usageDaily.date}::date, 'YYYY-MM')`));

      const usageMap = new Map(monthlyUsage.map((u) => [u.period, u]));

      const results: Array<{
        period: string;
        tokens: number;
        requests: number;
        costDollars: string;
      }> = [];

      for (let i = 0; i < input.months; i++) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const period = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

        const usage = usageMap.get(period);
        results.push({
          period,
          tokens: usage?.totalTokens ?? 0,
          requests: usage?.totalRequests ?? 0,
          costDollars: ((usage?.totalCost ?? 0) / 100).toFixed(2),
        });
      }

      return results;
    }),
});
