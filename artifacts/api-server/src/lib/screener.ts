// Wheel screener — finds short-put candidates suitable for the wheel.
import { putDelta } from "./greeks";
import {
  getQuote,
  getExpirations,
  getOptionChain,
  getIvHistoryProxy,
  type OptionChainSnapshot,
  type OptionRow,
} from "./market";
import { logger } from "./logger";

export type EarningsFilterMode = "hide" | "only" | "include";

export interface ScreenerSettings {
  tickers: string[];
  minDte: number;
  maxDte: number;
  targetDelta: number;
  minDelta: number;
  maxDelta: number;
  minOpenInterest: number;
  minBid: number;
  minUnderlyingPrice: number;
  riskFreeRate: number;
  topN: number;
  cacheTtlMinutes: number;
  concentration: {
    tickerPct: number;
    sectorPct: number;
  };
  earningsInWindow: EarningsFilterMode;
}

export interface CandidateOut {
  ticker: string;
  spot: number;
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
  collateralPerContract: number;
  staticReturnPct: number;
  annualizedPct: number;
  breakeven: number;
  pctOtm: number;
  ivRank: number | null;
  hv30: number | null;
  earningsDate: string | null;
  earningsInWindow: boolean;
}

export interface ScanError {
  ticker: string;
  reason: string;
}

export interface ScanResultOut {
  scannedAt: string | null;
  candidates: CandidateOut[];
  errors: ScanError[];
  tickersScanned: number;
  tickersWithCandidate: number;
  cached: boolean;
  stale: boolean;
  hiddenByEarningsCount: number;
}

/**
 * Apply the user's earnings-in-window filter mode to a set of (already sorted)
 * candidates. Returned `kept` preserves the input ordering so downstream
 * topN slicing keeps the highest-ranked surviving candidates.
 */
export function applyEarningsFilter(
  candidates: CandidateOut[],
  mode: EarningsFilterMode,
): { kept: CandidateOut[]; hiddenByEarnings: number } {
  if (mode === "only") {
    return { kept: candidates.filter((c) => c.earningsInWindow), hiddenByEarnings: 0 };
  }
  if (mode === "hide") {
    const kept = candidates.filter((c) => !c.earningsInWindow);
    return { kept, hiddenByEarnings: candidates.length - kept.length };
  }
  return { kept: candidates, hiddenByEarnings: 0 };
}

function ivRank(
  current: number,
  min: number,
  max: number,
): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(min) || !Number.isFinite(max)) {
    return null;
  }
  if (max - min < 1e-9) return null;
  return Math.max(0, Math.min(1, (current - min) / (max - min)));
}

function pickShortPut(
  snap: OptionChainSnapshot,
  cfg: ScreenerSettings,
  hv30: number | null,
): {
  row: OptionRow;
  delta: number;
  iv: number;
} | null {
  if (snap.dte < cfg.minDte || snap.dte > cfg.maxDte) return null;

  const T = Math.max(snap.dte, 1) / 365;
  const candidates: { row: OptionRow; delta: number; iv: number; deltaDist: number }[] = [];

  for (const row of snap.puts) {
    // Outside market hours, yfinance bid/ask are often 0 — fall back to lastPrice.
    const effectiveBid = row.bid > 0 ? row.bid : row.lastPrice;
    if (effectiveBid < cfg.minBid) continue;
    // Accept either sufficient open interest OR recent volume — yahoo
    // sometimes returns 0 OI outside market hours even on liquid contracts.
    const oi = row.openInterest ?? 0;
    const vol = row.volume ?? 0;
    if (oi < cfg.minOpenInterest && vol < Math.max(10, cfg.minOpenInterest / 10)) continue;
    if (row.strike >= snap.spot) continue; // OTM puts only
    // Yahoo IVs are sometimes quantized garbage (e.g. 0.031 for a 280-strike
    // when the underlying is at 293). Fall back to HV30 when IV is implausibly low.
    const rawIv = row.impliedVolatility ?? 0;
    const iv = rawIv > 0.05 ? rawIv : hv30 && hv30 > 0.05 ? hv30 : rawIv;
    if (iv <= 0.01) continue;
    const d = putDelta(snap.spot, row.strike, cfg.riskFreeRate, iv, T);
    if (!Number.isFinite(d)) continue;
    if (d < cfg.minDelta || d > cfg.maxDelta) continue;
    candidates.push({ row, delta: d, iv, deltaDist: Math.abs(d - cfg.targetDelta) });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.deltaDist - b.deltaDist);
  return candidates[0]!;
}

function isInDateWindow(
  iso: string | null,
  fromDays: number,
  toDays: number,
): boolean {
  if (!iso) return false;
  const d = new Date(`${iso}T00:00:00Z`).getTime();
  if (Number.isNaN(d)) return false;
  const today = Date.now();
  const days = (d - today) / (24 * 60 * 60 * 1000);
  return days >= fromDays - 1 && days <= toDays + 1;
}

async function scanTicker(
  ticker: string,
  cfg: ScreenerSettings,
  errors: ScanError[],
): Promise<CandidateOut | null> {
  const quote = await getQuote(ticker);
  if (!quote || quote.spot < cfg.minUnderlyingPrice) {
    errors.push({ ticker, reason: !quote ? "no quote" : "spot below min" });
    return null;
  }
  const hvStat = await getIvHistoryProxy(ticker);
  const rank = hvStat ? ivRank(hvStat.current, hvStat.min, hvStat.max) : null;
  const hv30 = hvStat?.current ?? null;

  const expirations = await getExpirations(ticker);
  if (expirations.length === 0) {
    errors.push({ ticker, reason: "no expirations" });
    return null;
  }

  const today = new Date();
  let best: CandidateOut | null = null;

  // Limit how many expirations we fetch per ticker to keep scans reasonable.
  const eligible = expirations.filter((exp) => {
    const expDate = new Date(`${exp}T00:00:00Z`);
    const dte = Math.max(0, Math.round((expDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)));
    return dte >= cfg.minDte && dte <= cfg.maxDte;
  });

  for (const exp of eligible) {
    const snap = await getOptionChain(ticker, exp);
    if (!snap) continue;
    const pick = pickShortPut(snap, cfg, hv30);
    if (!pick) continue;
    const strike = pick.row.strike;
    const bid = pick.row.bid > 0 ? pick.row.bid : pick.row.lastPrice;
    const premium = bid;
    const collateral = strike;
    const staticReturn = premium / collateral;
    const annualized = staticReturn * (365 / Math.max(snap.dte, 1));
    const breakeven = strike - premium;
    const pctOtm = (snap.spot - strike) / snap.spot;
    const cand: CandidateOut = {
      ticker,
      spot: snap.spot,
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
      collateralPerContract: collateral * 100,
      staticReturnPct: staticReturn * 100,
      annualizedPct: annualized * 100,
      breakeven,
      pctOtm: pctOtm * 100,
      ivRank: rank,
      hv30,
      earningsDate: quote.earningsDate,
      earningsInWindow: isInDateWindow(quote.earningsDate, cfg.minDte, cfg.maxDte),
    };
    if (best === null || cand.annualizedPct > best.annualizedPct) {
      best = cand;
    }
  }

  if (best === null) {
    errors.push({ ticker, reason: "no qualifying strike" });
  }
  return best;
}

export async function runScreener(cfg: ScreenerSettings): Promise<ScanResultOut> {
  const errors: ScanError[] = [];
  // Scan with bounded concurrency to stay polite.
  const concurrency = 4;
  const queue = [...cfg.tickers];
  const candidates: CandidateOut[] = [];

  async function worker() {
    while (queue.length > 0) {
      const ticker = queue.shift();
      if (!ticker) return;
      try {
        const c = await scanTicker(ticker, cfg, errors);
        if (c) candidates.push(c);
      } catch (err) {
        logger.warn({ err, ticker }, "scan failed");
        errors.push({ ticker, reason: (err as Error).message ?? "unknown error" });
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));

  candidates.sort((a, b) => b.annualizedPct - a.annualizedPct);

  // Apply the earnings-in-window filter BEFORE topN slicing so the result
  // count and ranking reflect the user's choice (rather than just hiding rows
  // client-side, which would silently shift the top-N composition).
  const { kept, hiddenByEarnings } = applyEarningsFilter(
    candidates,
    cfg.earningsInWindow,
  );

  return {
    scannedAt: new Date().toISOString(),
    candidates: kept.slice(0, cfg.topN),
    errors,
    tickersScanned: cfg.tickers.length,
    tickersWithCandidate: kept.length,
    cached: false,
    stale: false,
    hiddenByEarningsCount: hiddenByEarnings,
  };
}
