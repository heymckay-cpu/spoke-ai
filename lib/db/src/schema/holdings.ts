import { pgTable, integer, doublePrecision, text, timestamp, serial, index } from "drizzle-orm/pg-core";

export const holdingsTable = pgTable("holdings", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  ticker: text("ticker").notNull(),
  shares: integer("shares").notNull(),
  avgCost: doublePrecision("avg_cost").notNull(),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  notes: text("notes"),
}, (t) => ({
  userIdx: index("holdings_user_idx").on(t.userId),
}));

export type HoldingRow = typeof holdingsTable.$inferSelect;
