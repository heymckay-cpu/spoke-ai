import { pgTable, integer, doublePrecision, text, timestamp, serial, index, type AnyPgColumn } from "drizzle-orm/pg-core";
import { holdingsTable } from "./holdings";

export const positionsTable = pgTable("positions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  ticker: text("ticker").notNull(),
  strike: doublePrecision("strike").notNull(),
  expiry: text("expiry").notNull(),
  premium: doublePrecision("premium").notNull(),
  contracts: integer("contracts").notNull(),
  // Wheel leg type: "csp" (cash-secured put, the default) or "cc"
  // (covered call written against a holding).
  kind: text("kind").notNull().default("csp"),
  // How a closed position ended: "closed" (bought back), "expired"
  // (worthless), "assigned" (CSP → shares), "called_away" (CC → shares
  // sold). Null while the position is open, and for rows closed before
  // outcomes were tracked.
  outcome: text("outcome"),
  // For covered calls: the holding the call is written against. Set null
  // if the holding is deleted out from under it.
  holdingId: integer("holding_id").references(() => holdingsTable.id, {
    onDelete: "set null",
  }),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  closePrice: doublePrecision("close_price"),
  notes: text("notes"),
  lastAlertedItmAt: timestamp("last_alerted_itm_at", { withTimezone: true }),
  lastAlertedExpiringSoonAt: timestamp("last_alerted_expiring_soon_at", { withTimezone: true }),
  rolledFromId: integer("rolled_from_id").references((): AnyPgColumn => positionsTable.id, {
    onDelete: "set null",
  }),
}, (t) => ({
  userIdx: index("positions_user_idx").on(t.userId),
}));

export type PositionRow = typeof positionsTable.$inferSelect;
