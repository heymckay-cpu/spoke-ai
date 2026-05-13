import { pgTable, doublePrecision, text, timestamp } from "drizzle-orm/pg-core";

export const settingsTable = pgTable("settings", {
  userId: text("user_id").primaryKey(),
  tickers: text("tickers").array().notNull(),
  minDte: doublePrecision("min_dte").notNull(),
  maxDte: doublePrecision("max_dte").notNull(),
  targetDelta: doublePrecision("target_delta").notNull(),
  minDelta: doublePrecision("min_delta").notNull(),
  maxDelta: doublePrecision("max_delta").notNull(),
  minOpenInterest: doublePrecision("min_open_interest").notNull(),
  minBid: doublePrecision("min_bid").notNull(),
  minUnderlyingPrice: doublePrecision("min_underlying_price").notNull(),
  riskFreeRate: doublePrecision("risk_free_rate").notNull(),
  topN: doublePrecision("top_n").notNull(),
  cacheTtlMinutes: doublePrecision("cache_ttl_minutes").notNull(),
  concentrationTickerPct: doublePrecision("concentration_ticker_pct").notNull().default(0.15),
  concentrationSectorPct: doublePrecision("concentration_sector_pct").notNull().default(0.30),
  earningsInWindow: text("earnings_in_window").notNull().default("hide"),
  tier: text("tier").notNull().default("free"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type SettingsRow = typeof settingsTable.$inferSelect;
