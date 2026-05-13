import { pgTable, integer, doublePrecision, text, timestamp } from "drizzle-orm/pg-core";

export const settingsTable = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  tickers: text("tickers").array().notNull(),
  minDte: integer("min_dte").notNull(),
  maxDte: integer("max_dte").notNull(),
  targetDelta: doublePrecision("target_delta").notNull(),
  minDelta: doublePrecision("min_delta").notNull(),
  maxDelta: doublePrecision("max_delta").notNull(),
  minOpenInterest: integer("min_open_interest").notNull(),
  minBid: doublePrecision("min_bid").notNull(),
  minUnderlyingPrice: doublePrecision("min_underlying_price").notNull(),
  riskFreeRate: doublePrecision("risk_free_rate").notNull(),
  topN: integer("top_n").notNull(),
  cacheTtlMinutes: integer("cache_ttl_minutes").notNull(),
  concentrationTickerPct: doublePrecision("concentration_ticker_pct").notNull().default(0.15),
  concentrationSectorPct: doublePrecision("concentration_sector_pct").notNull().default(0.30),
  // Earnings-in-window filter mode: "hide" | "only" | "include".
  // Default "hide" because earnings inside the DTE window is the single
  // biggest avoidable source of assignment surprise on wheel trades.
  earningsInWindow: text("earnings_in_window").notNull().default("hide"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type SettingsRow = typeof settingsTable.$inferSelect;
