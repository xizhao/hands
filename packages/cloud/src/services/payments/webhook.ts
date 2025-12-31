import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { getDb } from "../../lib/db";
import { PLANS, type PlanType, subscriptions } from "../../schema/subscriptions";
import { users } from "../../schema/users";
import type { Env } from "../../types";

const TIMESTAMP_TOLERANCE = 300; // 5 minutes

export async function handleWebhook(c: Context<{ Bindings: Env }>) {
  const signature = c.req.header("stripe-signature");
  if (!signature) {
    return c.json({ error: "Missing signature" }, 400);
  }

  const rawBody = await c.req.text();

  const verification = await verifyStripeSignature(rawBody, signature, c.env.STRIPE_WEBHOOK_SECRET);

  if (!verification.valid) {
    console.error(`Webhook signature verification failed: ${verification.error}`);
    return c.json({ error: "Invalid signature" }, 400);
  }

  const event = JSON.parse(rawBody);
  const db = getDb(c.env.DB);

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        const user = await db
          .select()
          .from(users)
          .where(eq(users.stripeCustomerId, customerId))
          .limit(1)
          .then((rows) => rows[0]);

        if (!user) {
          console.error(`User not found for customer ${customerId}`);
          return c.json({ received: true });
        }

        const priceId = subscription.items.data[0]?.price?.id;
        const plan = getPlanFromPriceId(priceId);
        const planConfig = PLANS[plan];

        await db
          .insert(subscriptions)
          .values({
            userId: user.id,
            stripeSubscriptionId: subscription.id,
            status: subscription.status,
            plan,
            includedTokens: planConfig.includedTokens,
            currentPeriodStart: new Date(subscription.current_period_start * 1000),
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          })
          .onConflictDoUpdate({
            target: subscriptions.stripeSubscriptionId,
            set: {
              status: subscription.status,
              plan,
              includedTokens: planConfig.includedTokens,
              currentPeriodStart: new Date(subscription.current_period_start * 1000),
              currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            },
          });

        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;

        await db
          .update(subscriptions)
          .set({ status: "canceled" })
          .where(eq(subscriptions.stripeSubscriptionId, subscription.id));

        break;
      }

      case "invoice.payment_succeeded": {
        console.log(`Payment succeeded for invoice ${event.data.object.id}`);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;

        if (invoice.subscription) {
          await db
            .update(subscriptions)
            .set({ status: "past_due" })
            .where(eq(subscriptions.stripeSubscriptionId, invoice.subscription as string));
        }

        console.warn(`Payment failed for invoice ${invoice.id}`);
        break;
      }

      default:
        console.log(`Unhandled webhook event: ${event.type}`);
    }

    return c.json({ received: true });
  } catch (error) {
    console.error(`Webhook processing error: ${error}`);
    return c.json({ error: "Webhook processing failed" }, 500);
  }
}

function getPlanFromPriceId(priceId: string): PlanType {
  for (const [planKey, planConfig] of Object.entries(PLANS)) {
    if (planConfig.priceId === priceId) {
      return planKey as PlanType;
    }
  }
  return "free";
}

interface SignatureVerificationResult {
  valid: boolean;
  error?: string;
}

async function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string,
): Promise<SignatureVerificationResult> {
  const parts: Record<string, string> = {};
  for (const part of signature.split(",")) {
    const [key, value] = part.split("=");
    if (key && value) {
      parts[key] = value;
    }
  }

  const timestamp = parts.t;
  const expectedSig = parts.v1;

  if (!timestamp || !expectedSig) {
    return { valid: false, error: "Missing timestamp or signature" };
  }

  const now = Math.floor(Date.now() / 1000);
  const timestampNum = parseInt(timestamp, 10);

  if (Number.isNaN(timestampNum)) {
    return { valid: false, error: "Invalid timestamp" };
  }

  if (Math.abs(now - timestampNum) > TIMESTAMP_TOLERANCE) {
    return { valid: false, error: "Timestamp outside tolerance window" };
  }

  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));

  const computedHex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (!constantTimeEqual(computedHex, expectedSig)) {
    return { valid: false, error: "Signature mismatch" };
  }

  return { valid: true };
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}
