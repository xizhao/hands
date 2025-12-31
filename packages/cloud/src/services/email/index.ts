/**
 * Email Service
 *
 * AWS SES-powered transactional email.
 *
 * Usage:
 *   cloud.email.send({ to, subject, html })
 *   cloud.email.sendTemplate("welcome", to, { name })
 *
 * Templates:
 *   - welcome: New user onboarding
 *   - usage_alert: Quota warning (80%, 100%)
 *   - payment_failed: Failed payment notification
 *   - subscription_canceled: Cancellation confirmation
 */

export { createEmailSender, createSESClient, sendEmail } from "./client";
export { emailRouter } from "./router";
export { templates } from "./templates";
export * from "./types";
