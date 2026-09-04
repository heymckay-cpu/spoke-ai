import { Router, type IRouter } from "express";
import { db, journalEntriesTable, positionsTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import {
  CreateJournalEntryBody,
  CreateJournalEntryResponse,
  DeleteJournalEntryParams,
  DeleteJournalEntryResponse,
  ListJournalQueryParams,
  ListJournalResponse,
  UpdateJournalEntryBody,
  UpdateJournalEntryParams,
  UpdateJournalEntryResponse,
} from "@workspace/api-zod";
import { getUserId } from "../middlewares/auth";

const router: IRouter = Router();

function serializeEntry(row: typeof journalEntriesTable.$inferSelect): Record<string, unknown> {
  return {
    id: row.id,
    decision: row.decision === "taken" ? "taken" : "passed",
    ticker: row.ticker,
    strike: row.strike,
    expiry: row.expiry,
    bid: row.bid,
    annualizedPct: row.annualizedPct ?? null,
    delta: row.delta ?? null,
    ivRank: row.ivRank ?? null,
    quiverScore: row.quiverScore ?? null,
    snapshot: (row.snapshot as Record<string, unknown>) ?? {},
    positionId: row.positionId ?? null,
    decidedAt: row.decidedAt.toISOString(),
    notes: row.notes ?? null,
    evaluatedAt: row.evaluatedAt ? row.evaluatedAt.toISOString() : null,
    outcomePnl: row.outcomePnl ?? null,
    outcomeNote: row.outcomeNote ?? null,
  };
}

router.get("/journal", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const parsed = ListJournalQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const decision = parsed.data.decision ?? null;

  // Stats always cover the full journal, whatever the list filter shows —
  // the taken-vs-passed split is the point of the page.
  const all = await db
    .select()
    .from(journalEntriesTable)
    .where(eq(journalEntriesTable.userId, userId))
    .orderBy(desc(journalEntriesTable.decidedAt), desc(journalEntriesTable.id));

  const entries = decision ? all.filter((e) => e.decision === decision) : all;
  const stats = {
    taken: all.filter((e) => e.decision === "taken").length,
    passed: all.filter((e) => e.decision === "passed").length,
  };

  res.json(
    ListJournalResponse.parse({
      entries: entries.map(serializeEntry),
      stats,
    }),
  );
});

router.post("/journal", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const parsed = CreateJournalEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const v = parsed.data;

  if (v.positionId != null) {
    const [pos] = await db
      .select({ id: positionsTable.id })
      .from(positionsTable)
      .where(and(eq(positionsTable.id, v.positionId), eq(positionsTable.userId, userId)));
    if (!pos) {
      res.status(400).json({ error: `positionId ${v.positionId} does not exist` });
      return;
    }
  }

  const [inserted] = await db
    .insert(journalEntriesTable)
    .values({
      userId,
      decision: v.decision,
      ticker: v.ticker.toUpperCase(),
      strike: v.strike,
      expiry: v.expiry,
      bid: v.bid,
      annualizedPct: v.annualizedPct ?? null,
      delta: v.delta ?? null,
      ivRank: v.ivRank ?? null,
      quiverScore: v.quiverScore ?? null,
      snapshot: v.snapshot ?? {},
      positionId: v.positionId ?? null,
      notes: v.notes ?? null,
    })
    .returning();
  if (!inserted) {
    res.status(500).json({ error: "failed to insert journal entry" });
    return;
  }
  res.json(CreateJournalEntryResponse.parse(serializeEntry(inserted)));
});

router.patch("/journal/:id", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const params = UpdateJournalEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateJournalEntryBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const v = parsed.data;

  const updates: Partial<typeof journalEntriesTable.$inferInsert> = {};
  if (v.decision != null) updates.decision = v.decision;
  if ("positionId" in v) {
    if (v.positionId != null) {
      const [pos] = await db
        .select({ id: positionsTable.id })
        .from(positionsTable)
        .where(and(eq(positionsTable.id, v.positionId), eq(positionsTable.userId, userId)));
      if (!pos) {
        res.status(400).json({ error: `positionId ${v.positionId} does not exist` });
        return;
      }
    }
    updates.positionId = v.positionId ?? null;
  }
  if ("notes" in v) updates.notes = v.notes ?? null;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "nothing to update" });
    return;
  }

  const [updated] = await db
    .update(journalEntriesTable)
    .set(updates)
    .where(and(eq(journalEntriesTable.id, params.data.id), eq(journalEntriesTable.userId, userId)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Journal entry not found" });
    return;
  }
  res.json(UpdateJournalEntryResponse.parse(serializeEntry(updated)));
});

router.delete("/journal/:id", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const params = DeleteJournalEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const deleted = await db
    .delete(journalEntriesTable)
    .where(and(eq(journalEntriesTable.id, params.data.id), eq(journalEntriesTable.userId, userId)))
    .returning();
  if (deleted.length === 0) {
    res.status(404).json({ error: "Journal entry not found" });
    return;
  }
  res.json(DeleteJournalEntryResponse.parse({ ok: true }));
});

export default router;
