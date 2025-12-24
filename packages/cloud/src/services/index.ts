/**
 * Services Index
 *
 * All cloud services are exported from here for easy imports.
 *
 * Usage:
 *   import { paymentsRouter, emailRouter } from './services';
 *   import { createEmailSender, createStripeClient } from './services';
 */

// Routers
export { authRouter } from "./auth";
export { paymentsRouter, paymentsWebhook } from "./payments";
export { emailRouter, createEmailSender } from "./email";
export { notificationsRouter, createNotificationSender } from "./notifications";
export { integrationsRouter } from "./integrations";
export { usageRouter, aggregateUsage } from "./usage";

// AI Gateway (Hono app, not tRPC)
export { aiGateway } from "./ai";

// Re-export types
export type { AuthEnv, TokenPayload, AuthResult } from "./auth";
export type { PaymentsEnv, Subscription } from "./payments";
export type { EmailEnv, SendEmailOptions } from "./email";
export type { NotificationsEnv, AlertLevel } from "./notifications";
export type { OAuthProviderType, OAuthConnection } from "./integrations";
export type { UsageSummary, DailyUsage, MonthlyUsage } from "./usage";
