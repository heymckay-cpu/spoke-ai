import { pgTable, integer, doublePrecision, text, timestamp, serial } from "drizzle-orm/pg-core";

export const holdingsTable = pgTable("holdings", {
  id: serial("id").primaryKey(),
  ticker: text("ticker").notNull(),
  shares: integer("shares").notNull(),
  avgCost: doublePrecision("avg_cost").notNull(),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  notes: text("notes"),
});

export type HoldingRow = typeof holdingsTable.$inferSelect;
