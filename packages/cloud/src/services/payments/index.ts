/**
 * Payments Service
 *
 * Stripe-powered billing with subscription management.
 *
 * Usage:
 *   cloud.payments.subscription()
 *   cloud.payments.checkout({ plan: "pro" })
 *   cloud.payments.portal()
 *   cloud.payments.plans()
 */

export * from "./client";
export { paymentsRouter } from "./router";
export * from "./types";
export { handleWebhook as paymentsWebhook } from "./webhook";
