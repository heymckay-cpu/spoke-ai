import { pgTable, text, timestamp, serial, jsonb, doublePrecision, integer, index, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Cached AI-generated explanations for individual screener candidates.
 *
 * The cache key is the (ticker, strike, expiry, scanSnapshotId) tuple — a
 * candidate is uniquely identified by those three fields within a given scan
 * snapshot. Reusing an explanation only makes sense while the underlying
 * snapshot is unchanged; once a fresh scan runs the snapshot id rolls and the
 * row simply ages out (we keep history for analytics / debug).
 */
export const candidateExplanationsTable = pgTable(
  "candidate_explanations",
  {
    id: serial("id").primaryKey(),
    snapshotId: integer("snapshot_id").notNull(),
    ticker: text("ticker").notNull(),
    strike: doublePrecision("strike").notNull(),
    expiry: text("expiry").notNull(),
    verdict: text("verdict").notNull(),
    summary: text("summary").notNull(),
    bullets: jsonb("bullets").notNull(),
    model: text("model").notNull(),
    source: text("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqByCandidate: uniqueIndex("candidate_explanations_uniq").on(
      t.snapshotId,
      t.ticker,
      t.strike,
      t.expiry,
    ),
    bySnapshot: index("candidate_explanations_snapshot_idx").on(t.snapshotId),
  }),
);

export type CandidateExplanationRow = typeof candidateExplanationsTable.$inferSelect;
