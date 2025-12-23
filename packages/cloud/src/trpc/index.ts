import { initTRPC, TRPCError } from "@trpc/server";
import type { Context } from "./context";
import { authRouter } from "./routers/auth";
import { usersRouter } from "./routers/users";
import { billingRouter } from "./routers/billing";
import { usageRouter } from "./routers/usage";
import { workbooksRouter } from "./routers/workbooks";
import { oauthRouter } from "./routers/oauth";

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

// Middleware to require authentication
const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(isAuthed);

// Combined router
export const appRouter = router({
  auth: authRouter,
  users: usersRouter,
  billing: billingRouter,
  usage: usageRouter,
  workbooks: workbooksRouter,
  oauth: oauthRouter,
});

export type AppRouter = typeof appRouter;
