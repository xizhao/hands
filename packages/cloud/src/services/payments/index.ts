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

export { paymentsRouter } from "./router";
export { handleWebhook as paymentsWebhook } from "./webhook";
export * from "./client";
export * from "./types";
