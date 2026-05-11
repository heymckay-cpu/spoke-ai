import { pgTable, integer, jsonb, timestamp, serial } from "drizzle-orm/pg-core";

export const scanSnapshotTable = pgTable("scan_snapshots", {
  id: serial("id").primaryKey(),
  scannedAt: timestamp("scanned_at", { withTimezone: true }).notNull().defaultNow(),
  candidates: jsonb("candidates").notNull(),
  errors: jsonb("errors").notNull(),
  tickersScanned: integer("tickers_scanned").notNull(),
  tickersWithCandidate: integer("tickers_with_candidate").notNull(),
});

export type ScanSnapshotRow = typeof scanSnapshotTable.$inferSelect;
