// "What should I do today?" — per-user action items for the daily digest:
// open positions that need a decision (expired, ITM, expiring, profit
// target hit), holdings eligible for covered calls, and portfolio-level
// correlation warnings. Pure classification lives in classifyPosition so
// the rules are unit-testable without a database or market data.

import { db, positionsTable, holdingsTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { getSpot, getOptionChain } from "./market";
import { getPortfolioCorrelation, TRAP_THRESHOLD } from "./correlation";
import { logger } from "./logger";

export type ActionSeverity = "action" | "watch" | "info";

export interface ActionItem {
  severity: ActionSeverity;
  text: string;
}

export interface PositionFacts {
  ticker: string;
  strike: number;
  expiry: string;
  premium: number;
  contracts: number;
  kind: "csp" | "cc";
  dte: number;
  spot: number | null;
  currentBid: number | null;
}

export const PROFIT_CAPTURE_THRESHOLD = 0.6; // 60% of max premium captured
export const EXPIRING_SOON_DTE = 7;

const money = (n: number): string => `$${n.toFixed(2)}`;

/** Pure decision rules for one open position. Returns null when no action. */
export function classifyPosition(p: PositionFacts): ActionItem | null {
  const label = `${p.ticker} ${money(p.strike)}${p.kind === "cc" ? "C" : "P"} ${p.expiry}`;

  if (p.dte < 0) {
    return {
      severity: "action",
      text: `${label} expired ${Math.abs(p.dte)}d ago — reconcile it (mark assigned/called away, or closed) so tracking stays accurate.`,
    };
  }

  const itm =
    p.spot != null && (p.kind === "cc" ? p.spot > p.strike : p.spot < p.strike);
  if (itm) {
    return {
      severity: "action",
      text:
        p.kind === "cc"
          ? `${label} is in the money (spot ${money(p.spot!)}) — roll the call up/out or let ${p.contracts * 100} shares be called away.`
          : `${label} is in the money (spot ${money(p.spot!)}) — roll down/out for credit or plan to take assignment of ${p.contracts * 100} shares.`,
    };
  }

  const captured =
    p.currentBid != null && p.premium > 0
      ? (p.premium - p.currentBid) / p.premium
      : null;
  if (captured != null && captured >= PROFIT_CAPTURE_THRESHOLD) {
    return {
      severity: "watch",
      text: `${label} has captured ${Math.round(captured * 100)}% of max premium — closing early frees ${money(p.strike * 100 * p.contracts)} collateral and removes tail risk for the last ${p.dte}d.`,
    };
  }

  if (p.dte <= EXPIRING_SOON_DTE) {
    return {
      severity: "watch",
      text: `${label} expires in ${p.dte}d and is out of the money — let theta finish, or plan the roll now while spreads are calm.`,
    };
  }

  return null;
}

/** Gather everything the digest's action section needs for one user. */
export async function buildActionItems(userId: string): Promise<{
  items: ActionItem[];
  effectiveLine: string | null;
}> {
  const items: ActionItem[] = [];

  const open = await db
    .select()
    .from(positionsTable)
    .where(and(eq(positionsTable.userId, userId), isNull(positionsTable.closedAt)));

  for (const row of open) {
    const dte = Math.round(
      (new Date(`${row.expiry}T00:00:00Z`).getTime() - Date.now()) /
        (24 * 60 * 60 * 1000),
    );
    let spot: number | null = null;
    try {
      spot = await getSpot(row.ticker);
    } catch {
      /* best-effort */
    }
    let currentBid: number | null = null;
    if (dte >= 0) {
      try {
        const chain = await getOptionChain(row.ticker, row.expiry);
        const side = (row.kind ?? "csp") === "cc" ? chain?.calls : chain?.puts;
        let best: { bid: number; dist: number } | null = null;
        for (const r of side ?? []) {
          const d = Math.abs(r.strike - row.strike);
          if (best == null || d < best.dist) {
            best = { bid: r.bid > 0 ? r.bid : r.lastPrice, dist: d };
          }
        }
        if (best && best.dist < 0.01 && best.bid > 0) currentBid = best.bid;
      } catch {
        /* best-effort */
      }
    }
    const item = classifyPosition({
      ticker: row.ticker,
      strike: row.strike,
      expiry: row.expiry,
      premium: row.premium,
      contracts: row.contracts,
      kind: (row.kind ?? "csp") === "cc" ? "cc" : "csp",
      dte,
      spot,
      currentBid,
    });
    if (item) items.push(item);
  }

  // Holdings with >=100 shares and no open covered call against them.
  try {
    const holdings = await db
      .select()
      .from(holdingsTable)
      .where(eq(holdingsTable.userId, userId));
    const coveredHoldingIds = new Set(
      open
        .filter((p) => (p.kind ?? "csp") === "cc" && p.holdingId != null)
        .map((p) => p.holdingId as number),
    );
    for (const h of holdings) {
      if (h.shares >= 100 && !coveredHoldingIds.has(h.id)) {
        items.push({
          severity: "info",
          text: `${h.ticker}: ${h.shares} uncovered shares (basis ${money(h.avgCost)}) — run the covered-call scan on Holdings to put them to work.`,
        });
      }
    }
  } catch (err) {
    logger.warn({ err, userId }, "digest actions: holdings check failed");
  }

  // Portfolio correlation: traps + effective-position line.
  let effectiveLine: string | null = null;
  try {
    const uniqueTickers = new Set(open.map((p) => p.ticker));
    if (uniqueTickers.size >= 2) {
      const report = await getPortfolioCorrelation({
        positions: open.map((p) => ({
          ticker: p.ticker,
          collateral: p.strike * 100 * p.contracts,
        })),
      });
      for (const t of report.traps.slice(0, 3)) {
        items.push({
          severity: "watch",
          text: `${t.a} and ${t.b} have moved together (ρ ${t.rho.toFixed(2)} over ${report.windowDays} trading days) — treat them as one position when sizing; a drawdown could assign both.`,
        });
      }
      if (report.effectivePositions != null) {
        effectiveLine = `${report.tickers.length} open position tickers ≈ ${report.effectivePositions} effective after correlation${report.traps.length > 0 ? ` (${report.traps.length} pair${report.traps.length === 1 ? "" : "s"} above ρ ${TRAP_THRESHOLD})` : ""}.`;
      }
    }
  } catch (err) {
    logger.warn({ err, userId }, "digest actions: correlation check failed");
  }

  // Actions first, then watches, then info.
  const rank: Record<ActionSeverity, number> = { action: 0, watch: 1, info: 2 };
  items.sort((a, b) => rank[a.severity] - rank[b.severity]);
  return { items, effectiveLine };
}
