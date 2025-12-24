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

import { router } from "./base";

// Import service routers
import { authRouter } from "../services/auth";
import { paymentsRouter } from "../services/payments";
import { emailRouter } from "../services/email";
import { notificationsRouter } from "../services/notifications";
import { integrationsRouter } from "../services/integrations";
import { usageRouter } from "../services/usage";

// Re-export base utilities
export { router, publicProcedure, protectedProcedure } from "./base";

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
