import { jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

export const oauthConnections = pgTable(
  "oauth_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // google, slack, github, salesforce, etc.

    // Tokens (should be encrypted at rest)
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),

    // Metadata
    scopes: jsonb("scopes").$type<string[]>(),
    accountEmail: text("account_email"),
    accountId: text("account_id"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("oauth_connections_unique").on(table.userId, table.provider)],
);

export type OAuthConnectionRecord = typeof oauthConnections.$inferSelect;
export type NewOAuthConnection = typeof oauthConnections.$inferInsert;

// Supported OAuth providers
export const OAUTH_PROVIDERS = {
  google: {
    name: "Google",
    scopes: [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/spreadsheets",
    ],
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
  },
  slack: {
    name: "Slack",
    scopes: ["chat:write", "channels:read", "users:read"],
    authUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
  },
  github: {
    name: "GitHub",
    scopes: ["repo", "read:user", "read:org"],
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
  },
  salesforce: {
    name: "Salesforce",
    scopes: ["api", "refresh_token"],
    authUrl: "https://login.salesforce.com/services/oauth2/authorize",
    tokenUrl: "https://login.salesforce.com/services/oauth2/token",
  },
  quickbooks: {
    name: "QuickBooks",
    scopes: ["com.intuit.quickbooks.accounting"],
    authUrl: "https://appcenter.intuit.com/connect/oauth2",
    tokenUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
  },
  shopify: {
    name: "Shopify",
    scopes: ["read_products", "read_orders", "read_customers"],
    authUrl: "https://{shop}.myshopify.com/admin/oauth/authorize",
    tokenUrl: "https://{shop}.myshopify.com/admin/oauth/access_token",
  },
} as const;

export type OAuthProviderType = keyof typeof OAUTH_PROVIDERS;
