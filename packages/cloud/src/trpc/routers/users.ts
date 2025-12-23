import { z } from "zod";
import { router, protectedProcedure } from "../index";
import { users } from "../../schema/users";
import { subscriptions } from "../../schema/subscriptions";
import { eq } from "drizzle-orm";
import Stripe from "stripe";

export const usersRouter = router({
  // Get current user profile
  profile: protectedProcedure.query(async ({ ctx }) => {
    return {
      id: ctx.user.id,
      email: ctx.user.email,
      name: ctx.user.name,
      avatarUrl: ctx.user.avatarUrl,
      createdAt: ctx.user.createdAt,
    };
  }),

  // Update profile
  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(users)
        .set({
          name: input.name,
          updatedAt: new Date(),
        })
        .where(eq(users.id, ctx.user.id));

      return { success: true };
    }),

  // Delete account
  deleteAccount: protectedProcedure.mutation(async ({ ctx }) => {
    // Cancel Stripe subscription if exists
    if (ctx.user.stripeCustomerId) {
      const stripe = new Stripe(ctx.env.STRIPE_SECRET_KEY);

      // Get active subscriptions for this customer
      const customerSubscriptions = await stripe.subscriptions.list({
        customer: ctx.user.stripeCustomerId,
        status: "active",
      });

      // Cancel all active subscriptions
      for (const sub of customerSubscriptions.data) {
        await stripe.subscriptions.cancel(sub.id);
      }

      // Also cancel any past_due subscriptions
      const pastDueSubscriptions = await stripe.subscriptions.list({
        customer: ctx.user.stripeCustomerId,
        status: "past_due",
      });

      for (const sub of pastDueSubscriptions.data) {
        await stripe.subscriptions.cancel(sub.id);
      }
    }

    // Update our DB subscription status
    await ctx.db
      .update(subscriptions)
      .set({ status: "canceled" })
      .where(eq(subscriptions.userId, ctx.user.id));

    // Delete user (cascades to subscriptions, refresh_tokens, etc.)
    await ctx.db.delete(users).where(eq(users.id, ctx.user.id));

    return { success: true };
  }),
});
