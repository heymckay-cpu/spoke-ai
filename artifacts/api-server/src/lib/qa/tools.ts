import { db, holdingsTable, positionsTable, scanSnapshotTable } from "@workspace/db";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getQuote } from "../market";

// Read-only "tool" implementations the LLM can invoke. Each takes a plain
// object and returns plain JSON-serialisable data — kept deliberately small
// and side-effect-free so the agent loop can pass them through to Claude
// untouched. The tools never mutate state; the route layer additionally
// guards against any tool name outside this allowlist.

export interface PositionLite {
  id: number;
  ticker: string;
  strike: number;
  expiry: string;
  premium: number;
  contracts: number;
  status: "open" | "closed";
  openedAt: string;
  closedAt: string | null;
  closePrice: number | null;
  realizedPnl: number | null;
  premiumCollected: number;
  daysHeld: number | null;
  rolledFromId: number | null;
}

function rowToLite(row: typeof positionsTable.$inferSelect): PositionLite {
  const status: "open" | "closed" = row.closedAt ? "closed" : "open";
  const realizedPnl =
    status === "closed" && row.closePrice != null
      ? (row.premium - row.closePrice) * 100 * row.contracts
      : null;
  const daysHeld =
    row.closedAt != null
      ? Math.max(
          0,
          Math.round(
            (row.closedAt.getTime() - row.openedAt.getTime()) /
              (24 * 60 * 60 * 1000),
          ),
        )
      : null;
  return {
    id: row.id,
    ticker: row.ticker,
    strike: row.strike,
    expiry: row.expiry,
    premium: row.premium,
    contracts: row.contracts,
    status,
    openedAt: row.openedAt.toISOString(),
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
    closePrice: row.closePrice,
    realizedPnl,
    premiumCollected: row.premium * 100 * row.contracts,
    daysHeld,
    rolledFromId: row.rolledFromId ?? null,
  };
}

export interface ListPositionsArgs {
  status?: "open" | "closed" | "all";
  ticker?: string | null;
  sinceDays?: number | null;
  sortBy?: "openedAt" | "closedAt" | "realizedPnl" | "premium";
  order?: "asc" | "desc";
  limit?: number | null;
}

export async function listPositions(
  args: ListPositionsArgs = {},
): Promise<{ positions: PositionLite[]; total: number }> {
  const status = args.status ?? "all";
  const ticker = args.ticker ? args.ticker.toUpperCase() : null;
  const sinceDays = args.sinceDays && args.sinceDays > 0 ? args.sinceDays : null;
  const sortBy = args.sortBy ?? "openedAt";
  const order = args.order ?? "desc";
  const limit = args.limit && args.limit > 0 ? Math.min(args.limit, 200) : 50;

  const filters = [];
  if (ticker) filters.push(eq(positionsTable.ticker, ticker));
  if (sinceDays) {
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
    filters.push(gte(positionsTable.openedAt, since));
  }

  const rows = await db
    .select()
    .from(positionsTable)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(positionsTable.openedAt));

  let lite = rows.map(rowToLite);
  if (status !== "all") lite = lite.filter((p) => p.status === status);

  lite.sort((a, b) => {
    const va = sortValue(a, sortBy);
    const vb = sortValue(b, sortBy);
    if (va === vb) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return order === "asc" ? (va < vb ? -1 : 1) : va < vb ? 1 : -1;
  });

  const total = lite.length;
  return { positions: lite.slice(0, limit), total };
}

function sortValue(p: PositionLite, key: ListPositionsArgs["sortBy"]): number | string | null {
  switch (key) {
    case "realizedPnl":
      return p.realizedPnl;
    case "premium":
      return p.premiumCollected;
    case "closedAt":
      return p.closedAt;
    case "openedAt":
    default:
      return p.openedAt;
  }
}

export interface PositionStatsArgs {
  ticker?: string | null;
  sinceDays?: number | null;
}

export async function getPositionStats(args: PositionStatsArgs = {}): Promise<{
  closedCount: number;
  openCount: number;
  totalRealizedPnl: number;
  totalPremiumCollected: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  avgDaysHeld: number;
  bestTrade: PositionLite | null;
  worstTrade: PositionLite | null;
  byTicker: Array<{ ticker: string; closedCount: number; realizedPnl: number; premiumCollected: number }>;
}> {
  const ticker = args.ticker ? args.ticker.toUpperCase() : null;
  const sinceDays = args.sinceDays && args.sinceDays > 0 ? args.sinceDays : null;

  const filters = [];
  if (ticker) filters.push(eq(positionsTable.ticker, ticker));
  if (sinceDays) {
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
    filters.push(gte(positionsTable.openedAt, since));
  }

  const rows = await db
    .select()
    .from(positionsTable)
    .where(filters.length > 0 ? and(...filters) : undefined);
  const lite = rows.map(rowToLite);

  const open = lite.filter((p) => p.status === "open");
  const closed = lite.filter((p) => p.status === "closed");
  const totalRealizedPnl = closed.reduce((s, p) => s + (p.realizedPnl ?? 0), 0);
  const totalPremiumCollected = closed.reduce((s, p) => s + p.premiumCollected, 0);
  const winCount = closed.filter((p) => (p.realizedPnl ?? 0) >= 0).length;
  const lossCount = closed.length - winCount;
  const avgDaysHeld =
    closed.length > 0
      ? closed.reduce((s, p) => s + (p.daysHeld ?? 0), 0) / closed.length
      : 0;

  let bestTrade: PositionLite | null = null;
  let worstTrade: PositionLite | null = null;
  for (const p of closed) {
    if (p.realizedPnl == null) continue;
    if (bestTrade == null || (p.realizedPnl > (bestTrade.realizedPnl ?? -Infinity)))
      bestTrade = p;
    if (worstTrade == null || (p.realizedPnl < (worstTrade.realizedPnl ?? Infinity)))
      worstTrade = p;
  }

  const byTickerMap = new Map<string, { closedCount: number; realizedPnl: number; premiumCollected: number }>();
  for (const p of closed) {
    const cur = byTickerMap.get(p.ticker) ?? { closedCount: 0, realizedPnl: 0, premiumCollected: 0 };
    cur.closedCount += 1;
    cur.realizedPnl += p.realizedPnl ?? 0;
    cur.premiumCollected += p.premiumCollected;
    byTickerMap.set(p.ticker, cur);
  }
  const byTicker = Array.from(byTickerMap.entries())
    .map(([t, v]) => ({ ticker: t, ...v }))
    .sort((a, b) => b.realizedPnl - a.realizedPnl);

  return {
    closedCount: closed.length,
    openCount: open.length,
    totalRealizedPnl,
    totalPremiumCollected,
    winCount,
    lossCount,
    winRate: closed.length > 0 ? winCount / closed.length : 0,
    avgDaysHeld,
    bestTrade,
    worstTrade,
    byTicker,
  };
}

export interface LatestScanArgs {
  ticker?: string | null;
  withEarnings?: "include" | "exclude" | "only";
  minIvRank?: number | null;
  limit?: number | null;
}

export async function latestScan(args: LatestScanArgs = {}): Promise<{
  scannedAt: string | null;
  candidates: Array<Record<string, unknown>>;
  totalCandidates: number;
}> {
  const ticker = args.ticker ? args.ticker.toUpperCase() : null;
  const withEarnings = args.withEarnings ?? "include";
  const minIvRank = args.minIvRank ?? null;
  const limit = args.limit && args.limit > 0 ? Math.min(args.limit, 100) : 25;

  const [row] = await db
    .select()
    .from(scanSnapshotTable)
    .orderBy(desc(scanSnapshotTable.scannedAt))
    .limit(1);
  if (!row) return { scannedAt: null, candidates: [], totalCandidates: 0 };

  const all = (row.candidates as Array<Record<string, unknown>>) ?? [];
  let filtered = all;
  if (ticker) filtered = filtered.filter((c) => String(c.ticker).toUpperCase() === ticker);
  if (withEarnings === "exclude") filtered = filtered.filter((c) => !c.earningsInWindow);
  if (withEarnings === "only") filtered = filtered.filter((c) => Boolean(c.earningsInWindow));
  if (minIvRank != null) {
    filtered = filtered.filter((c) => {
      const ivr = typeof c.ivRank === "number" ? c.ivRank : null;
      return ivr != null && ivr >= minIvRank;
    });
  }
  return {
    scannedAt: row.scannedAt.toISOString(),
    candidates: filtered.slice(0, limit),
    totalCandidates: filtered.length,
  };
}

export interface ListHoldingsArgs {
  ticker?: string | null;
}

export async function listHoldings(args: ListHoldingsArgs = {}): Promise<{
  holdings: Array<{ id: number; ticker: string; shares: number; avgCost: number; openedAt: string }>;
}> {
  const ticker = args.ticker ? args.ticker.toUpperCase() : null;
  const rows = await db
    .select()
    .from(holdingsTable)
    .where(ticker ? eq(holdingsTable.ticker, ticker) : undefined)
    .orderBy(desc(holdingsTable.openedAt));
  return {
    holdings: rows.map((r) => ({
      id: r.id,
      ticker: r.ticker,
      shares: r.shares,
      avgCost: r.avgCost,
      openedAt: r.openedAt.toISOString(),
    })),
  };
}

export interface GetQuoteArgs {
  ticker: string;
}

export async function quoteTicker(args: GetQuoteArgs): Promise<{
  ticker: string;
  spot: number | null;
  earningsDate: string | null;
  asOf: string | null;
} | { error: string }> {
  if (!args?.ticker) return { error: "ticker is required" };
  try {
    const q = await getQuote(args.ticker.toUpperCase());
    if (!q) return { error: "Ticker not found" };
    return {
      ticker: q.ticker,
      spot: q.spot,
      earningsDate: q.earningsDate ?? null,
      asOf: q.asOf ?? null,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "quote unavailable" };
  }
}

export interface GetRollChainArgs {
  rootId: number;
}

export async function getRollChain(args: GetRollChainArgs): Promise<{
  legs: PositionLite[];
} | { error: string }> {
  if (!args?.rootId) return { error: "rootId is required" };
  // Walk from root forward; rolledFromId points at parent.
  const all = await db.select().from(positionsTable);
  const byId = new Map<number, typeof positionsTable.$inferSelect>();
  for (const r of all) byId.set(r.id, r);
  const childByParent = new Map<number, typeof positionsTable.$inferSelect>();
  for (const r of all) {
    if (r.rolledFromId != null) childByParent.set(r.rolledFromId, r);
  }
  const root = byId.get(args.rootId);
  if (!root) return { error: "rootId not found" };
  const legs: PositionLite[] = [rowToLite(root)];
  const seen = new Set<number>([root.id]);
  let cur = childByParent.get(root.id);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    legs.push(rowToLite(cur));
    cur = childByParent.get(cur.id);
  }
  return { legs };
}

// Allowlist of tool names — the agent loop refuses any tool_use whose name
// is not in this map. Adding a tool means adding an entry here AND in
// `TOOL_DEFINITIONS` below.
export const TOOL_HANDLERS: Record<string, (args: unknown) => Promise<unknown>> = {
  listPositions: (a) => listPositions((a ?? {}) as ListPositionsArgs),
  getPositionStats: (a) => getPositionStats((a ?? {}) as PositionStatsArgs),
  latestScan: (a) => latestScan((a ?? {}) as LatestScanArgs),
  listHoldings: (a) => listHoldings((a ?? {}) as ListHoldingsArgs),
  getQuote: (a) => quoteTicker((a ?? {}) as GetQuoteArgs),
  getRollChain: (a) => getRollChain((a ?? {}) as GetRollChainArgs),
};

// Tool definitions in the shape Claude expects (`tools` array on
// `messages.create`). Schemas are deliberately minimal — Claude is good at
// inferring usage from descriptions.
export const TOOL_DEFINITIONS = [
  {
    name: "listPositions",
    description:
      "List the user's tracked sold-put positions (open and/or closed). Filter by ticker, status, or recency. Each row includes realized P/L, premium collected, days held, and roll lineage. Use this to answer 'show me X positions' style questions.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["open", "closed", "all"], description: "Filter by lifecycle stage. Defaults to 'all'." },
        ticker: { type: "string", description: "Optional ticker filter (case-insensitive)." },
        sinceDays: { type: "integer", description: "Only positions opened within the last N days." },
        sortBy: { type: "string", enum: ["openedAt", "closedAt", "realizedPnl", "premium"] },
        order: { type: "string", enum: ["asc", "desc"] },
        limit: { type: "integer", description: "Maximum rows to return (default 50, max 200)." },
      },
    },
  },
  {
    name: "getPositionStats",
    description:
      "Aggregate performance stats over the user's positions: realized P/L total, premium collected, win rate, average days held, best/worst trade, and a per-ticker breakdown. Optionally filtered by ticker or recency.",
    input_schema: {
      type: "object",
      properties: {
        ticker: { type: "string" },
        sinceDays: { type: "integer", description: "Only include positions opened within the last N days." },
      },
    },
  },
  {
    name: "latestScan",
    description:
      "The most recent wheel screener scan results. Each candidate is a short-put opportunity with strike, delta, premium, IV rank, earnings flag, etc. Use to answer 'what's a good wheel today' / 'high IV candidates' / 'candidates with earnings' style questions.",
    input_schema: {
      type: "object",
      properties: {
        ticker: { type: "string" },
        withEarnings: { type: "string", enum: ["include", "exclude", "only"], description: "How to treat candidates whose earnings fall inside the DTE window." },
        minIvRank: { type: "number", description: "Minimum IV rank (0..100)." },
        limit: { type: "integer" },
      },
    },
  },
  {
    name: "listHoldings",
    description: "List the user's long-stock holdings (ticker, share count, average cost). Useful for covered-call eligibility questions.",
    input_schema: {
      type: "object",
      properties: { ticker: { type: "string" } },
    },
  },
  {
    name: "getQuote",
    description: "Live quote for a ticker — spot price, next earnings date. Use sparingly; prefer pulling stats from positions/scan first.",
    input_schema: {
      type: "object",
      required: ["ticker"],
      properties: { ticker: { type: "string" } },
    },
  },
  {
    name: "getRollChain",
    description: "Full chain of legs in a roll lineage starting at the given root position id. Use when the user asks about a specific roll history.",
    input_schema: {
      type: "object",
      required: ["rootId"],
      properties: { rootId: { type: "integer" } },
    },
  },
] as const;

// Suppress unused-import warnings — `sql` is reserved for future tools that
// need raw aggregations. Removing it now would force re-add when those land.
void sql;
