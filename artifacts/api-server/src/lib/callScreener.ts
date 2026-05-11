// Covered-call screener — mirrors the put screener for tickers the user
// already owns at least 100 shares of. Filters strikes above max(spot,
// avgCost) so a covered call would never lock in a loss on the underlying.
// Scored by premium / share_price (since shares — not cash — are the collateral).
import { callDelta } from "./greeks";
import {
  getQuote,
  getExpirations,
  getOptionChain,
  getIvHistoryProxy,
  type OptionChainSnapshot,
  type OptionRow,
} from "./market";
import { logger } from "./logger";
import type { ScreenerSettings } from "./screener";

export interface CallCandidateOut {
  ticker: string;
  spot: number;
  shares: number;
  avgCost: number;
  contractsAvailable: number;
  expiry: string;
  dte: number;
  strike: number;
  delta: number;
  bid: number;
  ask: number | null;
  iv: number;
  openInterest: number;
  volume: number | null;
  premiumPerContract: number;
  premiumTotal: number;
  staticReturnPct: number;
  annualizedPct: number;
  pctOtm: number;
  ivRank: number | null;
  hv30: number | null;
  earningsDate: string | null;
  earningsInWindow: boolean;
  aboveBasis: boolean;
}

export interface CallScanError {
  ticker: string;
  reason: string;
}

export interface CallScanResultOut {
  scannedAt: string;
  candidates: CallCandidateOut[];
  errors: CallScanError[];
  holdingsScanned: number;
  holdingsWithCandidate: number;
}

interface HoldingInput {
  ticker: string;
  shares: number;
  avgCost: number;
}

function ivRank(current: number, min: number, max: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(min) || !Number.isFinite(max)) {
    return null;
  }
  if (max - min < 1e-9) return null;
  return Math.max(0, Math.min(1, (current - min) / (max - min)));
}

function isInDateWindow(iso: string | null, fromDays: number, toDays: number): boolean {
  if (!iso) return false;
  const d = new Date(`${iso}T00:00:00Z`).getTime();
  if (Number.isNaN(d)) return false;
  const today = Date.now();
  const days = (d - today) / (24 * 60 * 60 * 1000);
  return days >= fromDays - 1 && days <= toDays + 1;
}

function pickShortCall(
  snap: OptionChainSnapshot,
  cfg: ScreenerSettings,
  hv30: number | null,
  minStrike: number,
): { row: OptionRow; delta: number; iv: number } | null {
  if (snap.dte < cfg.minDte || snap.dte > cfg.maxDte) return null;

  const T = Math.max(snap.dte, 1) / 365;
  const candidates: { row: OptionRow; delta: number; iv: number; deltaDist: number }[] = [];

  for (const row of snap.calls) {
    const effectiveBid = row.bid > 0 ? row.bid : row.lastPrice;
    if (effectiveBid < cfg.minBid) continue;
    const oi = row.openInterest ?? 0;
    const vol = row.volume ?? 0;
    if (oi < cfg.minOpenInterest && vol < Math.max(10, cfg.minOpenInterest / 10)) continue;
    // Strikes must be strictly above min (max of spot and avg cost) — otherwise
    // a covered call would lock in a loss on the underlying if assigned.
    if (row.strike <= minStrike) continue;
    const rawIv = row.impliedVolatility ?? 0;
    const iv = rawIv > 0.05 ? rawIv : hv30 && hv30 > 0.05 ? hv30 : rawIv;
    if (iv <= 0.01) continue;
    const d = callDelta(snap.spot, row.strike, cfg.riskFreeRate, iv, T);
    if (!Number.isFinite(d)) continue;
    if (d < cfg.minDelta || d > cfg.maxDelta) continue;
    candidates.push({ row, delta: d, iv, deltaDist: Math.abs(d - cfg.targetDelta) });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.deltaDist - b.deltaDist);
  return candidates[0]!;
}

async function scanHolding(
  h: HoldingInput,
  cfg: ScreenerSettings,
  errors: CallScanError[],
): Promise<CallCandidateOut | null> {
  const quote = await getQuote(h.ticker);
  if (!quote) {
    errors.push({ ticker: h.ticker, reason: "no quote" });
    return null;
  }

  const hvStat = await getIvHistoryProxy(h.ticker);
  const rank = hvStat ? ivRank(hvStat.current, hvStat.min, hvStat.max) : null;
  const hv30 = hvStat?.current ?? null;

  const expirations = await getExpirations(h.ticker);
  if (expirations.length === 0) {
    errors.push({ ticker: h.ticker, reason: "no expirations" });
    return null;
  }

  const today = new Date();
  const eligible = expirations.filter((exp) => {
    const expDate = new Date(`${exp}T00:00:00Z`);
    const dte = Math.max(
      0,
      Math.round((expDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)),
    );
    return dte >= cfg.minDte && dte <= cfg.maxDte;
  });

  const minStrike = Math.max(quote.spot, h.avgCost);
  const contractsAvailable = Math.floor(h.shares / 100);
  let best: CallCandidateOut | null = null;

  for (const exp of eligible) {
    const snap = await getOptionChain(h.ticker, exp);
    if (!snap) continue;
    const pick = pickShortCall(snap, cfg, hv30, minStrike);
    if (!pick) continue;
    const strike = pick.row.strike;
    const bid = pick.row.bid > 0 ? pick.row.bid : pick.row.lastPrice;
    const premium = bid;
    // Score by premium / share_price — shares are the collateral, not cash.
    const staticReturn = premium / snap.spot;
    const annualized = staticReturn * (365 / Math.max(snap.dte, 1));
    const pctOtm = (strike - snap.spot) / snap.spot;
    const cand: CallCandidateOut = {
      ticker: h.ticker,
      spot: snap.spot,
      shares: h.shares,
      avgCost: h.avgCost,
      contractsAvailable,
      expiry: snap.expiry,
      dte: snap.dte,
      strike,
      delta: pick.delta,
      bid,
      ask: Number.isFinite(pick.row.ask) ? pick.row.ask : null,
      iv: pick.iv,
      openInterest: pick.row.openInterest ?? 0,
      volume: pick.row.volume ?? null,
      premiumPerContract: premium * 100,
      premiumTotal: premium * 100 * contractsAvailable,
      staticReturnPct: staticReturn * 100,
      annualizedPct: annualized * 100,
      pctOtm: pctOtm * 100,
      ivRank: rank,
      hv30,
      earningsDate: quote.earningsDate,
      earningsInWindow: isInDateWindow(quote.earningsDate, cfg.minDte, cfg.maxDte),
      aboveBasis: strike > h.avgCost,
    };
    if (best === null || cand.annualizedPct > best.annualizedPct) {
      best = cand;
    }
  }

  if (best === null) {
    errors.push({ ticker: h.ticker, reason: "no qualifying call" });
  }
  return best;
}

export async function runCallScreener(
  holdings: HoldingInput[],
  cfg: ScreenerSettings,
): Promise<CallScanResultOut> {
  // Only holdings with at least 100 shares can sell a single covered call.
  const eligible = holdings.filter((h) => h.shares >= 100);
  const errors: CallScanError[] = [];
  const candidates: CallCandidateOut[] = [];
  const concurrency = 4;
  const queue = [...eligible];

  async function worker() {
    while (queue.length > 0) {
      const h = queue.shift();
      if (!h) return;
      try {
        const c = await scanHolding(h, cfg, errors);
        if (c) candidates.push(c);
      } catch (err) {
        logger.warn({ err, ticker: h.ticker }, "covered-call scan failed");
        errors.push({ ticker: h.ticker, reason: (err as Error).message ?? "unknown error" });
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  candidates.sort((a, b) => b.annualizedPct - a.annualizedPct);

  return {
    scannedAt: new Date().toISOString(),
    candidates,
    errors,
    holdingsScanned: eligible.length,
    holdingsWithCandidate: candidates.length,
  };
}
