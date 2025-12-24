import { z } from "zod";
import { router, protectedProcedure } from "../../trpc/base";
import { createEmailSender } from "./client";
import type { EmailTemplate } from "./types";

export const emailRouter = router({
  // Send a templated email (internal use)
  sendTemplate: protectedProcedure
    .input(
      z.object({
        template: z.enum(["welcome", "usage_alert", "payment_failed", "subscription_canceled"]),
        to: z.string().email(),
        data: z.record(z.unknown()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const sender = createEmailSender(ctx.env);

      // Type-safe template sending
      const result = await sender.sendTemplate(
        input.template as EmailTemplate,
        input.to,
        input.data as never
      );

      return { messageId: result.messageId, success: result.success };
    }),

  // Send a custom email (admin only in future)
  send: protectedProcedure
    .input(
      z.object({
        to: z.string().email(),
        subject: z.string().min(1).max(200),
        html: z.string().min(1),
        text: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const sender = createEmailSender(ctx.env);
      const result = await sender.send(input);
      return { messageId: result.messageId, success: result.success };
    }),
});
