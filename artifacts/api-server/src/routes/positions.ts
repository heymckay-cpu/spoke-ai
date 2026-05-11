import { Router, type IRouter } from "express";
import { db, positionsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import {
  CreatePositionBody,
  UpdatePositionBody,
  ListPositionsResponse,
  CreatePositionResponse,
  UpdatePositionResponse,
  DeletePositionParams,
  UpdatePositionParams,
  DeletePositionResponse,
  GetPositionsStatsResponse,
} from "@workspace/api-zod";
import { getOptionChain, getSpot } from "../lib/market";
import { clearAlertMarkers, deleteNotificationsForPosition } from "../lib/alerts";

const router: IRouter = Router();

interface EnrichedPosition {
  id: number;
  ticker: string;
  strike: number;
  expiry: string;
  premium: number;
  contracts: number;
  openedAt: string;
  closedAt: string | null;
  closePrice: number | null;
  notes: string | null;
  status: "open" | "closed";
  dte: number;
  spot: number | null;
  currentBid: number | null;
  unrealizedPnl: number | null;
  realizedPnl: number | null;
  assignmentRisk: boolean;
  expiringSoon: boolean;
}

function dteFromIso(expiry: string): number {
  const exp = new Date(`${expiry}T00:00:00Z`).getTime();
  if (Number.isNaN(exp)) return 0;
  return Math.round((exp - Date.now()) / (24 * 60 * 60 * 1000));
}

async function enrichPosition(row: typeof positionsTable.$inferSelect): Promise<EnrichedPosition> {
  const status: "open" | "closed" = row.closedAt ? "closed" : "open";
  const dte = dteFromIso(row.expiry);
  let spot: number | null = null;
  let currentBid: number | null = null;
  let unrealizedPnl: number | null = null;
  let realizedPnl: number | null = null;

  if (status === "closed" && row.closePrice != null) {
    realizedPnl = (row.premium - row.closePrice) * 100 * row.contracts;
  }

  if (status === "open") {
    // Best-effort live data — never fail the list because Yahoo had a hiccup.
    try {
      spot = await getSpot(row.ticker);
    } catch {
      /* ignore */
    }
    if (dte >= 0) {
      try {
        const chain = await getOptionChain(row.ticker, row.expiry);
        if (chain) {
          // Match on the closest strike (handles tiny float drift).
          let best: { row: typeof chain.puts[number]; dist: number } | null = null;
          for (const p of chain.puts) {
            const d = Math.abs(p.strike - row.strike);
            if (best == null || d < best.dist) best = { row: p, dist: d };
          }
          if (best && best.dist < 0.01) {
            const bid = best.row.bid > 0 ? best.row.bid : best.row.lastPrice;
            if (bid > 0) {
              currentBid = bid;
              unrealizedPnl = (row.premium - currentBid) * 100 * row.contracts;
            }
          }
        }
      } catch {
        /* ignore */
      }
    }
  }

  const assignmentRisk = status === "open" && spot != null && spot < row.strike;
  const expiringSoon = status === "open" && dte >= 0 && dte <= 7;

  return {
    id: row.id,
    ticker: row.ticker,
    strike: row.strike,
    expiry: row.expiry,
    premium: row.premium,
    contracts: row.contracts,
    openedAt: row.openedAt.toISOString(),
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
    closePrice: row.closePrice,
    notes: row.notes,
    status,
    dte,
    spot,
    currentBid,
    unrealizedPnl,
    realizedPnl,
    assignmentRisk,
    expiringSoon,
  };
}

router.get("/positions", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(positionsTable)
    .orderBy(desc(positionsTable.openedAt));

  const enriched = await Promise.all(rows.map(enrichPosition));

  const open = enriched.filter((p) => p.status === "open");
  const closed = enriched.filter((p) => p.status === "closed");
  const totals = {
    openCount: open.length,
    closedCount: closed.length,
    totalPremium: open.reduce((s, p) => s + p.premium * 100 * p.contracts, 0),
    totalCollateral: open.reduce((s, p) => s + p.strike * 100 * p.contracts, 0),
    openUnrealizedPnl: open.reduce((s, p) => s + (p.unrealizedPnl ?? 0), 0),
    closedRealizedPnl: closed.reduce((s, p) => s + (p.realizedPnl ?? 0), 0),
  };

  res.json(ListPositionsResponse.parse({ positions: enriched, totals }));
});

router.get("/positions/stats", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(positionsTable)
    .orderBy(desc(positionsTable.openedAt));

  const closed = rows.filter(
    (r): r is typeof r & { closedAt: Date; closePrice: number } =>
      r.closedAt != null && r.closePrice != null,
  );

  const closedSorted = [...closed].sort(
    (a, b) => a.closedAt.getTime() - b.closedAt.getTime(),
  );

  let cumulative = 0;
  const cumulativePnl = closedSorted.map((r) => {
    const pnl = (r.premium - r.closePrice) * 100 * r.contracts;
    cumulative += pnl;
    return {
      date: r.closedAt.toISOString(),
      pnl,
      cumulative,
    };
  });

  const monthBuckets = new Map<string, { premium: number; count: number }>();
  for (const r of closedSorted) {
    const month = r.closedAt.toISOString().slice(0, 7);
    const premium = r.premium * 100 * r.contracts;
    const cur = monthBuckets.get(month) ?? { premium: 0, count: 0 };
    cur.premium += premium;
    cur.count += 1;
    monthBuckets.set(month, cur);
  }
  const premiumByMonth = Array.from(monthBuckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, premium: v.premium, count: v.count }));

  const closedCount = closedSorted.length;
  const totalRealizedPnl = closedSorted.reduce(
    (s, r) => s + (r.premium - r.closePrice) * 100 * r.contracts,
    0,
  );
  const totalPremiumCollected = closedSorted.reduce(
    (s, r) => s + r.premium * 100 * r.contracts,
    0,
  );
  const winCount = closedSorted.filter(
    (r) => (r.premium - r.closePrice) * 100 * r.contracts >= 0,
  ).length;
  const lossCount = closedCount - winCount;

  const daysHeldTotal = closedSorted.reduce((s, r) => {
    const ms = r.closedAt.getTime() - r.openedAt.getTime();
    return s + Math.max(0, ms / (24 * 60 * 60 * 1000));
  }, 0);

  type TradeBest = {
    id: number;
    ticker: string;
    strike: number;
    expiry: string;
    contracts: number;
    realizedPnl: number;
    closedAt: string;
  };
  const toBest = (
    r: (typeof closedSorted)[number],
    pnl: number,
  ): TradeBest => ({
    id: r.id,
    ticker: r.ticker,
    strike: r.strike,
    expiry: r.expiry,
    contracts: r.contracts,
    realizedPnl: pnl,
    closedAt: r.closedAt.toISOString(),
  });

  let bestTrade: TradeBest | null = null;
  let worstTrade: TradeBest | null = null;
  for (const r of closedSorted) {
    const pnl = (r.premium - r.closePrice) * 100 * r.contracts;
    if (bestTrade == null || pnl > bestTrade.realizedPnl) bestTrade = toBest(r, pnl);
    if (worstTrade == null || pnl < worstTrade.realizedPnl) worstTrade = toBest(r, pnl);
  }

  const summary = {
    closedCount,
    winCount,
    lossCount,
    winRate: closedCount > 0 ? winCount / closedCount : 0,
    totalRealizedPnl,
    totalPremiumCollected,
    avgPremiumPerTrade: closedCount > 0 ? totalPremiumCollected / closedCount : 0,
    avgDaysHeld: closedCount > 0 ? daysHeldTotal / closedCount : 0,
    bestTrade,
    worstTrade,
  };

  res.json(
    GetPositionsStatsResponse.parse({
      summary,
      cumulativePnl,
      premiumByMonth,
    }),
  );
});

router.post("/positions", async (req, res): Promise<void> => {
  const parsed = CreatePositionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const v = parsed.data;
  const [inserted] = await db
    .insert(positionsTable)
    .values({
      ticker: v.ticker.toUpperCase(),
      strike: v.strike,
      expiry: v.expiry,
      premium: v.premium,
      contracts: v.contracts,
      notes: v.notes ?? null,
    })
    .returning();
  if (!inserted) {
    res.status(500).json({ error: "failed to insert" });
    return;
  }
  const enriched = await enrichPosition(inserted);
  res.json(CreatePositionResponse.parse(enriched));
});

router.patch("/positions/:id", async (req, res): Promise<void> => {
  const params = UpdatePositionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdatePositionBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const v = parsed.data;
  const updates: Partial<typeof positionsTable.$inferInsert> = {};
  if ("closePrice" in v) {
    if (v.closePrice == null) {
      updates.closedAt = null;
      updates.closePrice = null;
    } else {
      updates.closedAt = new Date();
      updates.closePrice = v.closePrice;
    }
  }
  if ("notes" in v) {
    updates.notes = v.notes ?? null;
  }
  const [updated] = await db
    .update(positionsTable)
    .set(updates)
    .where(eq(positionsTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Position not found" });
    return;
  }
  // Closing or re-opening should reset alert markers so a re-opened position
  // can alert fresh next time it crosses a threshold.
  if ("closePrice" in v) {
    await clearAlertMarkers(updated.id);
  }
  const enriched = await enrichPosition(updated);
  res.json(UpdatePositionResponse.parse(enriched));
});

router.delete("/positions/:id", async (req, res): Promise<void> => {
  const params = DeletePositionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  // Notifications carry no FK constraint to positions, so clean up explicitly
  // before deleting the row to avoid orphaned alerts referencing a missing id.
  await deleteNotificationsForPosition(params.data.id);
  const result = await db
    .delete(positionsTable)
    .where(eq(positionsTable.id, params.data.id))
    .returning({ id: positionsTable.id });
  if (result.length === 0) {
    res.status(404).json({ error: "Position not found" });
    return;
  }
  res.json(DeletePositionResponse.parse({ ok: true }));
});

export default router;
