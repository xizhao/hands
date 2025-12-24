import Stripe from "stripe";
import type { PaymentsEnv, CheckoutOptions, PortalOptions } from "./types";

export function createStripeClient(env: PaymentsEnv): Stripe {
  return new Stripe(env.STRIPE_SECRET_KEY);
}

export async function createCheckoutSession(
  stripe: Stripe,
  options: CheckoutOptions & { priceId: string; appUrl: string }
): Promise<{ url: string | null; sessionId: string }> {
  let customerId = options.customerId;

  // Create customer if needed
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: options.userEmail,
      name: options.userName,
      metadata: { userId: options.userId },
    });
    customerId = customer.id;
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: options.priceId, quantity: 1 }],
    success_url: `${options.appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${options.appUrl}/billing`,
    subscription_data: {
      metadata: { userId: options.userId },
    },
  });

  return { url: session.url, sessionId: session.id };
}

export async function createPortalSession(
  stripe: Stripe,
  options: PortalOptions
): Promise<{ url: string }> {
  const session = await stripe.billingPortal.sessions.create({
    customer: options.customerId,
    return_url: options.returnUrl,
  });

  return { url: session.url };
}

export async function cancelSubscription(
  stripe: Stripe,
  subscriptionId: string
): Promise<void> {
  await stripe.subscriptions.cancel(subscriptionId);
}

export async function listActiveSubscriptions(
  stripe: Stripe,
  customerId: string
): Promise<Stripe.Subscription[]> {
  const active = await stripe.subscriptions.list({
    customer: customerId,
    status: "active",
  });

  const pastDue = await stripe.subscriptions.list({
    customer: customerId,
    status: "past_due",
  });

  return [...active.data, ...pastDue.data];
}
