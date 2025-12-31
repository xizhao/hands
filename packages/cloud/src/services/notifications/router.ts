import { z } from "zod";
import { protectedProcedure, router } from "../../trpc/base";
import { createNotificationSender } from "./client";

export const notificationsRouter = router({
  // Send an alert (internal/admin use)
  alert: protectedProcedure
    .input(
      z.object({
        level: z.enum(["info", "warning", "error", "success"]),
        title: z.string().min(1).max(100),
        message: z.string().min(1).max(1000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sender = createNotificationSender(ctx.env);
      const result = await sender.alert(input.level, input.title, input.message);
      return { success: result.ok, error: result.error };
    }),

  // Notify about a user event
  userEvent: protectedProcedure
    .input(
      z.object({
        event: z.string().min(1).max(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sender = createNotificationSender(ctx.env);
      const result = await sender.userEvent(input.event, {
        email: ctx.user.email,
        name: ctx.user.name ?? undefined,
      });
      return { success: result.ok };
    }),

  // System alert (for monitoring)
  systemAlert: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(100),
        details: z.record(z.string()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sender = createNotificationSender(ctx.env);
      const result = await sender.systemAlert(input.title, input.details);
      return { success: result.ok };
    }),
});
