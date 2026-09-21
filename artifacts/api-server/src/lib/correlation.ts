// Correlation risk overlay: rolling return correlations between the tickers
// a user is wheeling, computed from the same daily-close data the screener
// already fetches. This is a RISK tool, not a pricing edge — the options
// market prices correlation; we use it to catch the wheel's worst failure
// mode: several "different-looking" positions that are really one bet, all
// getting assigned together in a drawdown.
//
// Sector buckets (the existing concentration check) are a coarse proxy;
// realized correlation catches cross-sector traps (three high-beta momentum
// names in three sectors that move as one).

import { getDailyCloseSeries } from "./market";
import { logger } from "./logger";

export const CORRELATION_WINDOW_DAYS = 90; // trading-day window for returns
export const TRAP_THRESHOLD = 0.7; // pairs at/above this are flagged
export const MIN_SAMPLES = 40; // fewer overlapping days -> unreliable, skip

export interface CorrelationPairOut {
  a: string;
  b: string;
  rho: number;
  samples: number;
}

export interface CandidateCorrelationOut {
  ticker: string;
  /** Correlations of the candidate against each open-position ticker. */
  against: CorrelationPairOut[];
  /** Highest |rho| among `against`, or null when nothing computable. */
  maxRho: number | null;
  maxRhoTicker: string | null;
}

export interface PortfolioCorrelationOut {
  tickers: string[];
  windowDays: number;
  /** Pairs at/above TRAP_THRESHOLD, sorted by |rho| desc. */
  traps: CorrelationPairOut[];
  /** All computable pairs (for the matrix view / advisor context). */
  pairs: CorrelationPairOut[];
  /**
   * Diversification-adjusted position count: N_eff = (Σw)² / Σᵢⱼ wᵢwⱼρᵢⱼ
   * with ρᵢᵢ = 1, weights by collateral. Equal-weight uncorrelated
   * positions give N_eff = N; perfectly correlated give 1.
   */
  effectivePositions: number | null;
  candidate: CandidateCorrelationOut | null;
}

/** Pearson correlation of two aligned numeric arrays. */
export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i]!;
    sy += ys[i]!;
  }
  const mx = sx / n;
  const my = sy / n;
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    cov += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }
  if (vx <= 0 || vy <= 0) return null;
  return cov / Math.sqrt(vx * vy);
}

/** Log returns keyed by date, from a daily close series. */
export function toReturnsByDate(
  series: Array<{ date: string; close: number }>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1]!;
    const cur = series[i]!;
    if (prev.close > 0 && cur.close > 0) {
      out.set(cur.date, Math.log(cur.close / prev.close));
    }
  }
  return out;
}

/**
 * Correlation between two return maps over their overlapping dates,
 * restricted to the most recent `windowDays` shared observations.
 */
export function correlateReturns(
  a: Map<string, number>,
  b: Map<string, number>,
  windowDays = CORRELATION_WINDOW_DAYS,
): { rho: number; samples: number } | null {
  const sharedDates = [...a.keys()].filter((d) => b.has(d)).sort();
  const recent = sharedDates.slice(-windowDays);
  if (recent.length < MIN_SAMPLES) return null;
  const xs = recent.map((d) => a.get(d)!);
  const ys = recent.map((d) => b.get(d)!);
  const rho = pearson(xs, ys);
  if (rho == null) return null;
  return { rho, samples: recent.length };
}

/**
 * N_eff = (Σw)² / Σᵢⱼ wᵢwⱼρᵢⱼ. `rho` gives off-diagonal correlations via
 * lookup; missing pairs are treated as 0 (uncorrelated) — conservative in
 * neither direction, but honest about missing data.
 */
export function effectivePositions(
  tickers: string[],
  weights: number[],
  rhoLookup: (a: string, b: string) => number | null,
): number | null {
  const n = tickers.length;
  if (n === 0) return null;
  if (n === 1) return 1;
  const totalW = weights.reduce((s, w) => s + w, 0);
  if (totalW <= 0) return null;
  let denom = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const rho = i === j ? 1 : (rhoLookup(tickers[i]!, tickers[j]!) ?? 0);
      denom += weights[i]! * weights[j]! * rho;
    }
  }
  if (denom <= 0) return n; // degenerate (net-negative correlation soup)
  return Math.min(n, (totalW * totalW) / denom);
}

const pairKey = (a: string, b: string): string => [a, b].sort().join("|");

/**
 * Full portfolio correlation report for a set of open-position tickers
 * (weighted by collateral) plus an optional candidate ticker.
 */
export async function getPortfolioCorrelation(args: {
  positions: Array<{ ticker: string; collateral: number }>;
  candidateTicker?: string | null;
}): Promise<PortfolioCorrelationOut> {
  // Merge duplicate tickers, summing collateral.
  const byTicker = new Map<string, number>();
  for (const p of args.positions) {
    const t = p.ticker.toUpperCase();
    byTicker.set(t, (byTicker.get(t) ?? 0) + Math.max(0, p.collateral));
  }
  const tickers = [...byTicker.keys()];
  const candidate = args.candidateTicker?.toUpperCase() || null;
  const allTickers = candidate && !byTicker.has(candidate) ? [...tickers, candidate] : tickers;

  // Fetch return series for every ticker involved (cached; parallel).
  const returnsByTicker = new Map<string, Map<string, number>>();
  await Promise.all(
    allTickers.map(async (t) => {
      try {
        const series = await getDailyCloseSeries(t);
        returnsByTicker.set(t, toReturnsByDate(series));
      } catch (err) {
        logger.warn({ err, ticker: t }, "correlation: failed to load closes");
        returnsByTicker.set(t, new Map());
      }
    }),
  );

  const pairCache = new Map<string, { rho: number; samples: number } | null>();
  const pairOf = (a: string, b: string): { rho: number; samples: number } | null => {
    const key = pairKey(a, b);
    if (!pairCache.has(key)) {
      const ra = returnsByTicker.get(a);
      const rb = returnsByTicker.get(b);
      pairCache.set(key, ra && rb ? correlateReturns(ra, rb) : null);
    }
    return pairCache.get(key) ?? null;
  };

  const pairs: CorrelationPairOut[] = [];
  for (let i = 0; i < tickers.length; i++) {
    for (let j = i + 1; j < tickers.length; j++) {
      const r = pairOf(tickers[i]!, tickers[j]!);
      if (r) pairs.push({ a: tickers[i]!, b: tickers[j]!, rho: r.rho, samples: r.samples });
    }
  }
  pairs.sort((x, y) => Math.abs(y.rho) - Math.abs(x.rho));
  const traps = pairs.filter((p) => p.rho >= TRAP_THRESHOLD);

  const nEff = effectivePositions(
    tickers,
    tickers.map((t) => byTicker.get(t) ?? 0),
    (a, b) => pairOf(a, b)?.rho ?? null,
  );

  let candidateOut: CandidateCorrelationOut | null = null;
  if (candidate) {
    const against: CorrelationPairOut[] = [];
    for (const t of tickers) {
      if (t === candidate) continue;
      const r = pairOf(candidate, t);
      if (r) against.push({ a: candidate, b: t, rho: r.rho, samples: r.samples });
    }
    against.sort((x, y) => Math.abs(y.rho) - Math.abs(x.rho));
    const top = against[0] ?? null;
    candidateOut = {
      ticker: candidate,
      against,
      maxRho: top ? top.rho : null,
      maxRhoTicker: top ? top.b : null,
    };
  }

  return {
    tickers,
    windowDays: CORRELATION_WINDOW_DAYS,
    traps,
    pairs,
    effectivePositions: nEff != null ? Math.round(nEff * 10) / 10 : null,
    candidate: candidateOut,
  };
}
