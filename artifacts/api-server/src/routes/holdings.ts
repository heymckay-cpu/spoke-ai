import { Router, type IRouter } from "express";
import { db, holdingsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import {
  CreateHoldingBody,
  UpdateHoldingBody,
  ListHoldingsResponse,
  CreateHoldingResponse,
  UpdateHoldingResponse,
  UpdateHoldingParams,
  DeleteHoldingParams,
  DeleteHoldingResponse,
} from "@workspace/api-zod";
import { getSpot } from "../lib/market";

const router: IRouter = Router();

interface EnrichedHolding {
  id: number;
  ticker: string;
  shares: number;
  avgCost: number;
  openedAt: string;
  notes: string | null;
  spot: number | null;
  marketValue: number | null;
  unrealizedPnl: number | null;
  unrealizedPnlPct: number | null;
}

async function enrichHolding(row: typeof holdingsTable.$inferSelect): Promise<EnrichedHolding> {
  let spot: number | null = null;
  try {
    spot = await getSpot(row.ticker);
  } catch {
    /* ignore — never fail the list because of a quote hiccup */
  }
  const marketValue = spot != null ? spot * row.shares : null;
  const cost = row.avgCost * row.shares;
  const unrealizedPnl = marketValue != null ? marketValue - cost : null;
  const unrealizedPnlPct = unrealizedPnl != null && cost > 0 ? unrealizedPnl / cost : null;
  return {
    id: row.id,
    ticker: row.ticker,
    shares: row.shares,
    avgCost: row.avgCost,
    openedAt: row.openedAt.toISOString(),
    notes: row.notes,
    spot,
    marketValue,
    unrealizedPnl,
    unrealizedPnlPct,
  };
}

router.get("/holdings", async (_req, res): Promise<void> => {
  const rows = await db.select().from(holdingsTable).orderBy(desc(holdingsTable.openedAt));
  const enriched = await Promise.all(rows.map(enrichHolding));
  const totals = {
    holdingsCount: enriched.length,
    totalCost: enriched.reduce((s, h) => s + h.avgCost * h.shares, 0),
    totalMarketValue: enriched.reduce((s, h) => s + (h.marketValue ?? 0), 0),
    totalUnrealizedPnl: enriched.reduce((s, h) => s + (h.unrealizedPnl ?? 0), 0),
  };
  res.json(ListHoldingsResponse.parse({ holdings: enriched, totals }));
});

router.post("/holdings", async (req, res): Promise<void> => {
  const parsed = CreateHoldingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const v = parsed.data;
  const [inserted] = await db
    .insert(holdingsTable)
    .values({
      ticker: v.ticker.toUpperCase(),
      shares: v.shares,
      avgCost: v.avgCost,
      notes: v.notes ?? null,
    })
    .returning();
  if (!inserted) {
    res.status(500).json({ error: "failed to insert" });
    return;
  }
  res.json(CreateHoldingResponse.parse(await enrichHolding(inserted)));
});

router.patch("/holdings/:id", async (req, res): Promise<void> => {
  const params = UpdateHoldingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateHoldingBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const v = parsed.data;
  const updates: Partial<typeof holdingsTable.$inferInsert> = {};
  if (v.shares != null) updates.shares = v.shares;
  if (v.avgCost != null) updates.avgCost = v.avgCost;
  if ("notes" in v) updates.notes = v.notes ?? null;
  const [updated] = await db
    .update(holdingsTable)
    .set(updates)
    .where(eq(holdingsTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Holding not found" });
    return;
  }
  res.json(UpdateHoldingResponse.parse(await enrichHolding(updated)));
});

router.delete("/holdings/:id", async (req, res): Promise<void> => {
  const params = DeleteHoldingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const result = await db
    .delete(holdingsTable)
    .where(eq(holdingsTable.id, params.data.id))
    .returning({ id: holdingsTable.id });
  if (result.length === 0) {
    res.status(404).json({ error: "Holding not found" });
    return;
  }
  res.json(DeleteHoldingResponse.parse({ ok: true }));
});

export default router;
