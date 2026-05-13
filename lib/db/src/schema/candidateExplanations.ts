import { pgTable, text, timestamp, serial, jsonb, doublePrecision, integer, index, uniqueIndex } from "drizzle-orm/pg-core";

export const candidateExplanationsTable = pgTable(
  "candidate_explanations",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
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
      t.userId,
      t.snapshotId,
      t.ticker,
      t.strike,
      t.expiry,
    ),
    bySnapshot: index("candidate_explanations_snapshot_idx").on(t.snapshotId),
    userIdx: index("candidate_explanations_user_idx").on(t.userId),
  }),
);

export type CandidateExplanationRow = typeof candidateExplanationsTable.$inferSelect;
