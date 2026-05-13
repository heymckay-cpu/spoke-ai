import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Provider-resolved ticker → GICS sector cache. Refreshed lazily by the
// API server's sector resolver and persisted so a fresh process doesn't
// have to re-hit Yahoo / Polygon for every ticker the user trades.
export const tickerSectorsTable = pgTable("ticker_sectors", {
  ticker: text("ticker").primaryKey(),
  sector: text("sector").notNull(),
  // "yahoo" | "polygon" | "static" — useful for debugging and for
  // forcing a re-resolve if a provider's mapping later improves.
  source: text("source").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TickerSectorRow = typeof tickerSectorsTable.$inferSelect;
