import { bigint, date, integer, pgTable, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

// Daily usage aggregates (from CF AI Gateway analytics)
export const usageDaily = pgTable(
  "usage_daily",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    tokensInput: bigint("tokens_input", { mode: "number" }).notNull().default(0),
    tokensOutput: bigint("tokens_output", { mode: "number" }).notNull().default(0),
    requests: integer("requests").notNull().default(0),
    costCents: integer("cost_cents").notNull().default(0), // estimated cost in cents
  },
  (table) => [unique("usage_daily_user_date").on(table.userId, table.date)],
);

export type UsageDailyRecord = typeof usageDaily.$inferSelect;
export type NewUsageDaily = typeof usageDaily.$inferInsert;
