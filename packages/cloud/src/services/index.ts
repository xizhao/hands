/**
 * Services Index
 *
 * All cloud services are exported from here for easy imports.
 *
 * Usage:
 *   import { paymentsRouter, emailRouter } from './services';
 *   import { createEmailSender, createStripeClient } from './services';
 */

// AI Gateway (Hono app, not tRPC)
export { aiGateway } from "./ai";
// Re-export types
export type { AuthEnv, AuthResult, TokenPayload } from "./auth";
// Routers
export { authRouter } from "./auth";
export type { EmailEnv, SendEmailOptions } from "./email";
export { createEmailSender, emailRouter } from "./email";
export type { OAuthConnection, OAuthProviderType } from "./integrations";
export { integrationsRouter } from "./integrations";
export type { AlertLevel, NotificationsEnv } from "./notifications";
export { createNotificationSender, notificationsRouter } from "./notifications";
export type { PaymentsEnv, Subscription } from "./payments";
export { paymentsRouter, paymentsWebhook } from "./payments";
export type { DailyUsage, MonthlyUsage, UsageSummary } from "./usage";
export { aggregateUsage, usageRouter } from "./usage";
