import { pgTable, text, timestamp, uuid, boolean, index } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Refresh tokens stored in DB for revocation support.
 * We store a hash of the token, not the token itself.
 */
export const refreshTokens = pgTable("refresh_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  // Hash of the refresh token (we never store the actual token)
  tokenHash: text("token_hash").notNull().unique(),

  // Token metadata
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),

  // Expiration and revocation
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  isRevoked: boolean("is_revoked").notNull().default(false),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // Index for listing sessions by user
  index("refresh_tokens_user_id_idx").on(table.userId),
]);

export type RefreshTokenRecord = typeof refreshTokens.$inferSelect;
export type NewRefreshToken = typeof refreshTokens.$inferInsert;
