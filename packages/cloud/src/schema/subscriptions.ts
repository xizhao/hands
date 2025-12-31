import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  stripeSubscriptionId: text("stripe_subscription_id").notNull().unique(),
  status: text("status").notNull(), // active, canceled, past_due, trialing
  plan: text("plan").notNull(), // free, pro, team
  includedTokens: integer("included_tokens").notNull().default(500000),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }).notNull(),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SubscriptionRecord = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;

// Plan definitions
export const PLANS = {
  free: {
    name: "Free",
    priceId: null,
    monthlyPrice: 0,
    includedTokens: 50_000,
    features: ["50K tokens/month", "Basic AI access", "Local-first workbooks"],
  },
  pro: {
    name: "Pro",
    priceId: "price_pro_monthly",
    monthlyPrice: 2000, // $20 in cents
    includedTokens: 2_000_000,
    features: [
      "2M tokens/month",
      "Unlimited AI (metered overage)",
      "Cloud sync",
      "Published projects",
      "OAuth integrations",
    ],
  },
  team: {
    name: "Team",
    priceId: "price_team_monthly",
    monthlyPrice: 5000, // $50 per seat
    includedTokens: 10_000_000,
    features: [
      "10M tokens/month",
      "Everything in Pro",
      "Team workspaces",
      "SSO",
      "Priority support",
    ],
  },
} as const;

export type PlanType = keyof typeof PLANS;
