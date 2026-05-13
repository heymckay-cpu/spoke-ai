import { pgTable, doublePrecision, text, date, uniqueIndex } from "drizzle-orm/pg-core";

// Daily snapshot of the at-the-money 30-day implied volatility for a
// tracked ticker. Used to build a real (52-week) IV Rank / IV Percentile
// once we have enough history. The unique (ticker, date) index makes the
// snapshot job idempotent — re-running on the same day overwrites that
// day's row instead of duplicating.
export const ivSnapshotsTable = pgTable(
  "iv_snapshots",
  {
    ticker: text("ticker").notNull(),
    date: date("date").notNull(),
    iv30d: doublePrecision("iv_30d").notNull(),
  },
  (t) => ({
    tickerDateUnique: uniqueIndex("iv_snapshots_ticker_date_uniq").on(t.ticker, t.date),
  }),
);

export type IvSnapshotRow = typeof ivSnapshotsTable.$inferSelect;
