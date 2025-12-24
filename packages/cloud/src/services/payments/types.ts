import type Stripe from "stripe";

export interface PaymentsEnv {
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  APP_URL: string;
}

export interface CheckoutOptions {
  plan: "pro" | "team";
  customerId?: string;
  userId: string;
  userEmail: string;
  userName?: string;
}

export interface PortalOptions {
  customerId: string;
  returnUrl: string;
}

export interface WebhookEvent {
  type: string;
  data: {
    object: Stripe.Subscription | Stripe.Invoice;
  };
}

export type SubscriptionStatus = "active" | "canceled" | "past_due" | "trialing";

export interface Subscription {
  id: string;
  status: SubscriptionStatus;
  plan: string;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
}
