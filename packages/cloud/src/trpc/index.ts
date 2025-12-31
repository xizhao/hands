/**
 * Main tRPC Router
 *
 * Merges all service routers into a single API.
 *
 * Client usage:
 *   cloud.auth.startOAuth()
 *   cloud.auth.me()
 *   cloud.payments.checkout({ plan: "pro" })
 *   cloud.payments.subscription()
 *   cloud.email.send({ to, subject, html })
 *   cloud.notifications.alert({ level, title, message })
 *   cloud.integrations.connect({ provider: "google" })
 *   cloud.usage.summary()
 */

// Import service routers
import { authRouter } from "../services/auth";
import { emailRouter } from "../services/email";
import { integrationsRouter } from "../services/integrations";
import { notificationsRouter } from "../services/notifications";
import { paymentsRouter } from "../services/payments";
import { usageRouter } from "../services/usage";
import { router } from "./base";

// Re-export base utilities
export { protectedProcedure, publicProcedure, router } from "./base";

// Combined router with service namespaces
export const appRouter = router({
  auth: authRouter,
  payments: paymentsRouter,
  email: emailRouter,
  notifications: notificationsRouter,
  integrations: integrationsRouter,
  usage: usageRouter,
});

export type AppRouter = typeof appRouter;
