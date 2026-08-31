import { Router, type IRouter } from "express";
import { db, positionsTable } from "@workspace/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getUserId } from "../middlewares/auth";
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
  RollPositionBody,
  RollPositionParams,
  RollPositionResponse,
  UndoRollBody,
  UndoRollResponse,
  GetRollSuggestionParams,
  GetRollSuggestionResponse,
  GetRollQuoteParams,
  GetRollQuoteResponse,
} from "@workspace/api-zod";
import { getExpirations, getOptionChain, getSpot } from "../lib/market";
import { clearAlertMarkers, deleteNotificationsForPosition } from "../lib/alerts";
import { getAdvisor } from "../lib/advisor";
import { GetPositionAdvisorParams, GetPositionAdvisorResponse } from "@workspace/api-zod";
import { requireCapability } from "../middlewares/tier";

const router: IRouter = Router();

interface RollSummary {
  id: number;
  ticker: string;
  strike: number;
  expiry: string;
}

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
  rolledFromId: number | null;
  rolledFrom: RollSummary | null;
  rolledTo: RollSummary | null;
}

function toRollSummary(row: typeof positionsTable.$inferSelect): RollSummary {
  return { id: row.id, ticker: row.ticker, strike: row.strike, expiry: row.expiry };
}

function dteFromIso(expiry: string): number {
  const exp = new Date(`${expiry}T00:00:00Z`).getTime();
  if (Number.isNaN(exp)) return 0;
  return Math.round((exp - Date.now()) / (24 * 60 * 60 * 1000));
}

interface RollContext {
  rolledFrom?: RollSummary | null;
  rolledTo?: RollSummary | null;
}

async function enrichPosition(
  row: typeof positionsTable.$inferSelect,
  rollContext: RollContext = {},
): Promise<EnrichedPosition> {
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
    rolledFromId: row.rolledFromId ?? null,
    rolledFrom: rollContext.rolledFrom ?? null,
    rolledTo: rollContext.rolledTo ?? null,
  };
}

async function buildRollContexts(
  rows: ReadonlyArray<typeof positionsTable.$inferSelect>,
  userId: string,
): Promise<Map<number, RollContext>> {
  const result = new Map<number, RollContext>();
  if (rows.length === 0) return result;

  const byId = new Map<number, typeof positionsTable.$inferSelect>();
  for (const r of rows) byId.set(r.id, r);

  const missingParentIds = new Set<number>();
  for (const r of rows) {
    if (r.rolledFromId != null && !byId.has(r.rolledFromId)) {
      missingParentIds.add(r.rolledFromId);
    }
  }
  if (missingParentIds.size > 0) {
    const parents = await db
      .select()
      .from(positionsTable)
      .where(and(eq(positionsTable.userId, userId), inArray(positionsTable.id, Array.from(missingParentIds))));
    for (const p of parents) byId.set(p.id, p);
  }

  const ourIds = rows.map((r) => r.id);
  const children = await db
    .select()
    .from(positionsTable)
    .where(and(eq(positionsTable.userId, userId), inArray(positionsTable.rolledFromId, ourIds)));
  const childByParentId = new Map<number, typeof positionsTable.$inferSelect>();
  for (const c of children) {
    if (c.rolledFromId != null) childByParentId.set(c.rolledFromId, c);
  }

  for (const r of rows) {
    const parent = r.rolledFromId != null ? byId.get(r.rolledFromId) : undefined;
    const child = childByParentId.get(r.id);
    result.set(r.id, {
      rolledFrom: parent ? toRollSummary(parent) : null,
      rolledTo: child ? toRollSummary(child) : null,
    });
  }
  return result;
}

async function enrichOne(row: typeof positionsTable.$inferSelect, userId: string): Promise<EnrichedPosition> {
  const ctxMap = await buildRollContexts([row], userId);
  return enrichPosition(row, ctxMap.get(row.id) ?? {});
}

router.get("/positions", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const rows = await db
    .select()
    .from(positionsTable)
    .where(eq(positionsTable.userId, userId))
    .orderBy(desc(positionsTable.openedAt));

  const ctxMap = await buildRollContexts(rows, userId);
  const enriched = await Promise.all(
    rows.map((r) => enrichPosition(r, ctxMap.get(r.id) ?? {})),
  );

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

router.get("/positions/stats", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const rows = await db
    .select()
    .from(positionsTable)
    .where(eq(positionsTable.userId, userId))
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

  // Roll chains — group positions linked via rolledFromId into chronological
  // chains. We surface only chains with 2+ legs (i.e. at least one roll).
  const rowsAsc = [...rows].sort(
    (a, b) => a.openedAt.getTime() - b.openedAt.getTime(),
  );
  const childByParent = new Map<number, typeof rowsAsc[number]>();
  for (const r of rowsAsc) {
    if (r.rolledFromId != null) childByParent.set(r.rolledFromId, r);
  }
  const validIds = new Set(rowsAsc.map((r) => r.id));

  type ChainLeg = {
    id: number;
    ticker: string;
    strike: number;
    expiry: string;
    premium: number;
    contracts: number;
    openedAt: string;
    closedAt: string | null;
    closePrice: number | null;
    status: "open" | "closed";
    realizedPnl: number | null;
    premiumCollected: number;
  };

  const toLeg = (r: typeof rowsAsc[number]): ChainLeg => {
    const status: "open" | "closed" = r.closedAt ? "closed" : "open";
    const realizedPnl =
      status === "closed" && r.closePrice != null
        ? (r.premium - r.closePrice) * 100 * r.contracts
        : null;
    return {
      id: r.id,
      ticker: r.ticker,
      strike: r.strike,
      expiry: r.expiry,
      premium: r.premium,
      contracts: r.contracts,
      openedAt: r.openedAt.toISOString(),
      closedAt: r.closedAt ? r.closedAt.toISOString() : null,
      closePrice: r.closePrice,
      status,
      realizedPnl,
      premiumCollected: r.premium * 100 * r.contracts,
    };
  };

  const rollChains = rowsAsc
    .filter(
      // Roots: no parent, or parent missing (e.g. set-null after delete).
      (r) => r.rolledFromId == null || !validIds.has(r.rolledFromId),
    )
    .map((root) => {
      const legs: ChainLeg[] = [toLeg(root)];
      let cur = childByParent.get(root.id);
      const seen = new Set<number>([root.id]);
      while (cur && !seen.has(cur.id)) {
        seen.add(cur.id);
        legs.push(toLeg(cur));
        cur = childByParent.get(cur.id);
      }
      return legs;
    })
    .filter((legs) => legs.length >= 2)
    .map((legs) => {
      const last = legs[legs.length - 1]!;
      const closedLegCount = legs.filter((l) => l.status === "closed").length;
      return {
        rootId: legs[0]!.id,
        ticker: legs[0]!.ticker,
        legCount: legs.length,
        closedLegCount,
        openedAt: legs[0]!.openedAt,
        latestStatus: last.status,
        latestExpiry: last.expiry,
        totalRealizedPnl: legs.reduce((s, l) => s + (l.realizedPnl ?? 0), 0),
        totalPremiumCollected: legs.reduce((s, l) => s + l.premiumCollected, 0),
        legs,
      };
    })
    // Most recent activity first.
    .sort((a, b) => b.openedAt.localeCompare(a.openedAt));

  res.json(
    GetPositionsStatsResponse.parse({
      summary,
      cumulativePnl,
      premiumByMonth,
      rollChains,
    }),
  );
});

router.post("/positions", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const parsed = CreatePositionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const v = parsed.data;
  if (v.rolledFromId != null) {
    const [parent] = await db
      .select({ id: positionsTable.id })
      .from(positionsTable)
      .where(and(eq(positionsTable.id, v.rolledFromId), eq(positionsTable.userId, userId)));
    if (!parent) {
      res.status(400).json({ error: `rolledFromId ${v.rolledFromId} does not exist` });
      return;
    }
  }
  const [inserted] = await db
    .insert(positionsTable)
    .values({
      userId,
      ticker: v.ticker.toUpperCase(),
      strike: v.strike,
      expiry: v.expiry,
      premium: v.premium,
      contracts: v.contracts,
      notes: v.notes ?? null,
      rolledFromId: v.rolledFromId ?? null,
    })
    .returning();
  if (!inserted) {
    res.status(500).json({ error: "failed to insert" });
    return;
  }
  const enriched = await enrichOne(inserted, userId);
  res.json(CreatePositionResponse.parse(enriched));
});

router.patch("/positions/:id", async (req, res): Promise<void> => {
  const userId = getUserId(req);
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
    .where(and(eq(positionsTable.id, params.data.id), eq(positionsTable.userId, userId)))
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
  const enriched = await enrichOne(updated, userId);
  res.json(UpdatePositionResponse.parse(enriched));
});

class RollError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Roll-suggestion math (next-monthly + same/-5% strikes) lives in
// ./lib/roll-suggestion so the advisor can reuse the exact same candidate
// set the user sees in the smart-roll dialog.
import {
  computeRollSuggestion,
  nextThirdFridayOnOrAfter,
  RollSuggestionUnavailable,
  snapToNearestStrike,
} from "../lib/roll-suggestion";

export { nextThirdFridayOnOrAfter, snapToNearestStrike };

router.post("/positions/:id/roll", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const params = RollPositionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = RollPositionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const v = parsed.data;

  let closedRow: typeof positionsTable.$inferSelect;
  let openedRow: typeof positionsTable.$inferSelect;
  try {
    const result = await db.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(positionsTable)
        .where(and(eq(positionsTable.id, params.data.id), eq(positionsTable.userId, userId)));
      const current = existing[0];
      if (!current) {
        throw new RollError(404, "Position not found");
      }
      if (current.closedAt != null) {
        throw new RollError(409, "Position is already closed");
      }

      const [closed] = await tx
        .update(positionsTable)
        .set({ closedAt: new Date(), closePrice: v.closePrice })
        .where(and(eq(positionsTable.id, params.data.id), eq(positionsTable.userId, userId)))
        .returning();
      if (!closed) {
        throw new RollError(500, "Failed to close position");
      }

      const [opened] = await tx
        .insert(positionsTable)
        .values({
          userId,
          ticker: current.ticker,
          strike: v.strike,
          expiry: v.expiry,
          premium: v.premium,
          contracts: v.contracts,
          notes: v.notes ?? null,
          rolledFromId: current.id,
        })
        .returning();
      if (!opened) {
        throw new RollError(500, "Failed to open rolled position");
      }

      return { closed, opened };
    });
    closedRow = result.closed;
    openedRow = result.opened;
  } catch (err) {
    if (err instanceof RollError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }

  // Closing the original should clear its alert markers so a future re-open
  // can alert fresh; mirrors the PATCH-close behavior. Best-effort — the
  // roll itself already committed, so a stale marker shouldn't fail the call.
  try {
    await clearAlertMarkers(closedRow.id);
  } catch {
    /* ignore */
  }

  const ctxMap = await buildRollContexts([closedRow, openedRow], userId);
  const [closedEnriched, openedEnriched] = await Promise.all([
    enrichPosition(closedRow, ctxMap.get(closedRow.id) ?? {}),
    enrichPosition(openedRow, ctxMap.get(openedRow.id) ?? {}),
  ]);

  res.json(
    RollPositionResponse.parse({
      closed: closedEnriched,
      opened: openedEnriched,
    }),
  );
});

router.post("/positions/roll/undo", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const parsed = UndoRollBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { closedId, openedId } = parsed.data;
  if (closedId === openedId) {
    res.status(400).json({ error: "closedId and openedId must differ" });
    return;
  }

  let reopenedRow: typeof positionsTable.$inferSelect;
  try {
    reopenedRow = await db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(positionsTable)
        .where(and(inArray(positionsTable.id, [closedId, openedId]), eq(positionsTable.userId, userId)));
      const closed = rows.find((r) => r.id === closedId);
      const opened = rows.find((r) => r.id === openedId);
      if (!closed || !opened) {
        throw new RollError(404, "Roll legs not found");
      }
      // The opened leg must still link back to the closed one — guards against
      // races (e.g. someone rolled it again) and against arbitrary id pairs.
      if (opened.rolledFromId !== closed.id) {
        throw new RollError(
          409,
          "Opened leg is not linked to the closed leg via rolledFromId",
        );
      }
      // If the opened leg has itself been rolled into a child, undoing would
      // orphan that child — refuse rather than silently break the chain.
      const children = await tx
        .select({ id: positionsTable.id })
        .from(positionsTable)
        .where(and(eq(positionsTable.rolledFromId, opened.id), eq(positionsTable.userId, userId)));
      if (children.length > 0) {
        throw new RollError(
          409,
          "Opened leg has already been rolled again; undo is no longer safe",
        );
      }
      if (closed.closedAt == null) {
        throw new RollError(409, "Closed leg is already open");
      }
      // Constrain undo to the immediate-post-roll state — the opened leg
      // should still be open. If it has been closed/rolled separately, the
      // user is past the point where undo is the right tool.
      if (opened.closedAt != null) {
        throw new RollError(409, "Opened leg has already been closed");
      }

      // Notifications carry no FK so we must clean them up explicitly before
      // deleting the row to avoid orphaned alerts referencing a missing id.
      // Pass tx so the cleanup participates in the same transaction.
      await deleteNotificationsForPosition(opened.id, tx);
      const deleted = await tx
        .delete(positionsTable)
        .where(and(eq(positionsTable.id, opened.id), eq(positionsTable.userId, userId)))
        .returning({ id: positionsTable.id });
      if (deleted.length === 0) {
        throw new RollError(500, "Failed to delete opened leg");
      }

      const [reopened] = await tx
        .update(positionsTable)
        .set({ closedAt: null, closePrice: null })
        .where(and(eq(positionsTable.id, closed.id), eq(positionsTable.userId, userId)))
        .returning();
      if (!reopened) {
        throw new RollError(500, "Failed to re-open closed leg");
      }
      return reopened;
    });
  } catch (err) {
    if (err instanceof RollError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }

  // Re-opening should reset alert markers so a future ITM/expiring-soon
  // crossing alerts fresh — same behavior as PATCH-reopen.
  try {
    await clearAlertMarkers(reopenedRow.id);
  } catch {
    /* ignore */
  }

  const enriched = await enrichOne(reopenedRow, userId);
  res.json(UndoRollResponse.parse({ reopened: enriched, deletedId: openedId }));
});

router.get("/positions/:id/roll-suggestion", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const params = GetRollSuggestionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select()
    .from(positionsTable)
    .where(and(eq(positionsTable.id, params.data.id), eq(positionsTable.userId, userId)));
  if (!row) {
    res.status(404).json({ error: "Position not found" });
    return;
  }

  try {
    const suggestion = await computeRollSuggestion(row);
    res.json(GetRollSuggestionResponse.parse(suggestion));
  } catch (err) {
    if (err instanceof RollSuggestionUnavailable) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.get(
  "/positions/:id/roll-quote/:expiry/:strike",
  async (req, res): Promise<void> => {
    const userId = getUserId(req);
    const params = GetRollQuoteParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const { id, expiry, strike } = params.data;
    const [row] = await db
      .select()
      .from(positionsTable)
      .where(and(eq(positionsTable.id, id), eq(positionsTable.userId, userId)));
    if (!row) {
      res.status(404).json({ error: "Position not found" });
      return;
    }

    const chain = await getOptionChain(row.ticker, expiry);
    if (!chain) {
      res
        .status(404)
        .json({ error: "Option chain unavailable for requested expiry" });
      return;
    }

    // Snap to the nearest listed strike — same forgiving behavior the
    // suggestion endpoint uses, so a user typing "150" still gets a quote
    // when the chain is listed as 149.5/150.5.
    const strikes = chain.puts.map((p) => p.strike).sort((a, b) => a - b);
    const snapped = snapToNearestStrike(strike, strikes);
    if (snapped == null) {
      res.status(404).json({ error: "No strikes listed for this expiry" });
      return;
    }
    const r = chain.puts.find((p) => Math.abs(p.strike - snapped) < 0.0001);
    if (!r) {
      res.status(404).json({ error: "Strike not found in chain" });
      return;
    }
    const bid = r.bid > 0 ? r.bid : 0;
    const ask = r.ask > 0 ? r.ask : 0;
    const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : 0;
    const lastPrice = r.lastPrice > 0 ? r.lastPrice : 0;
    const premium = bid > 0 ? bid : mid > 0 ? mid : lastPrice;

    res.json(
      GetRollQuoteResponse.parse({
        ticker: row.ticker,
        expiry,
        strike: snapped,
        requestedStrike: strike,
        bid,
        ask,
        mid,
        lastPrice,
        premium,
        spot: chain.spot,
        fetchedAt: chain.fetchedAt,
      }),
    );
  },
);

router.get("/positions/:id/advisor", requireCapability("ai.advisor"), async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const params = GetPositionAdvisorParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const advisor = await getAdvisor(params.data.id, userId);
  if (!advisor) {
    res.status(404).json({ error: "Position not found" });
    return;
  }
  res.json(GetPositionAdvisorResponse.parse(advisor));
});

router.delete("/positions/:id", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const params = DeletePositionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  // Verify ownership before touching notifications (prevent cross-user data leakage)
  const result = await db
    .delete(positionsTable)
    .where(and(eq(positionsTable.id, params.data.id), eq(positionsTable.userId, userId)))
    .returning({ id: positionsTable.id });
  if (result.length === 0) {
    res.status(404).json({ error: "Position not found" });
    return;
  }
  // Only delete notifications after confirming this position belonged to the caller
  await deleteNotificationsForPosition(params.data.id);
  res.json(DeletePositionResponse.parse({ ok: true }));
});

export default router;
