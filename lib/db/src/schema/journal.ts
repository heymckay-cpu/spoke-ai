import {
  pgTable,
  integer,
  doublePrecision,
  jsonb,
  text,
  timestamp,
  serial,
  index,
} from "drizzle-orm/pg-core";
import { positionsTable } from "./positions";

// Decision journal: every screener recommendation the user explicitly acted
// on — taken (opened a position) or passed (deliberately skipped). Passed
// entries are the control group for the forward test: over time they answer
// "do the trades I take outperform the ones I skip?".
//
// The full candidate row is frozen in `snapshot` (JSONB) at decision time so
// the journal stays truthful even as screener logic evolves; the hot fields
// used for listing/aggregation are denormalized into real columns.
export const journalEntriesTable = pgTable("journal_entries", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  decision: text("decision").notNull(), // "taken" | "passed"
  ticker: text("ticker").notNull(),
  strike: doublePrecision("strike").notNull(),
  expiry: text("expiry").notNull(), // YYYY-MM-DD
  bid: doublePrecision("bid").notNull(), // premium/share at decision time
  annualizedPct: doublePrecision("annualized_pct"),
  delta: doublePrecision("delta"),
  ivRank: doublePrecision("iv_rank"),
  quiverScore: doublePrecision("quiver_score"),
  snapshot: jsonb("snapshot").notNull(),
  // Set when decision = "taken" and the position row exists.
  positionId: integer("position_id").references(() => positionsTable.id, {
    onDelete: "set null",
  }),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
  notes: text("notes"),
  // Filled in by the (future) outcome evaluator after expiry: what the
  // recommendation would have returned per contract had it been taken.
  evaluatedAt: timestamp("evaluated_at", { withTimezone: true }),
  outcomePnl: doublePrecision("outcome_pnl"),
  outcomeNote: text("outcome_note"),
}, (t) => ({
  userIdx: index("journal_entries_user_idx").on(t.userId),
}));

export type JournalEntryRow = typeof journalEntriesTable.$inferSelect;
