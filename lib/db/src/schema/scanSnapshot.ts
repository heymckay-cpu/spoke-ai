import { pgTable, integer, jsonb, timestamp, serial, text, index } from "drizzle-orm/pg-core";

export const scanSnapshotTable = pgTable("scan_snapshots", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  scannedAt: timestamp("scanned_at", { withTimezone: true }).notNull().defaultNow(),
  candidates: jsonb("candidates").notNull(),
  errors: jsonb("errors").notNull(),
  tickersScanned: integer("tickers_scanned").notNull(),
  tickersWithCandidate: integer("tickers_with_candidate").notNull(),
  hiddenByEarningsCount: integer("hidden_by_earnings_count").notNull().default(0),
}, (t) => ({
  userIdx: index("scan_snapshots_user_idx").on(t.userId),
}));

export type ScanSnapshotRow = typeof scanSnapshotTable.$inferSelect;
