import { pgTable, integer, doublePrecision, text, timestamp, serial } from "drizzle-orm/pg-core";

export const positionsTable = pgTable("positions", {
  id: serial("id").primaryKey(),
  ticker: text("ticker").notNull(),
  strike: doublePrecision("strike").notNull(),
  expiry: text("expiry").notNull(),
  premium: doublePrecision("premium").notNull(),
  contracts: integer("contracts").notNull(),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  closePrice: doublePrecision("close_price"),
  notes: text("notes"),
  lastAlertedItmAt: timestamp("last_alerted_itm_at", { withTimezone: true }),
  lastAlertedExpiringSoonAt: timestamp("last_alerted_expiring_soon_at", { withTimezone: true }),
});

export type PositionRow = typeof positionsTable.$inferSelect;
