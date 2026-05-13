import { sectorForTicker, UNCLASSIFIED_SECTOR, type Sector } from "@workspace/data/sectors";

// Minimal shapes — kept local so this lib stays UI/server agnostic and
// doesn't pull a runtime dependency on the API client types.
export interface PositionLike {
  ticker: string;
  strike: number;
  contracts: number;
  status: string;
}

export interface CandidateLike {
  ticker: string;
  strike: number;
}

export interface ConcentrationSettings {
  /** Per-ticker cash-at-risk threshold as a fraction of total open CAR (0..1). */
  tickerPct: number;
  /** Per-sector cash-at-risk threshold as a fraction of total open CAR (0..1). */
  sectorPct: number;
}

export const DEFAULT_CONCENTRATION: ConcentrationSettings = {
  tickerPct: 0.15,
  sectorPct: 0.3,
};

/** Cash-at-risk for a short put = strike × 100 × contracts (full-cash-secured). */
export function carForPosition(p: Pick<PositionLike, "strike" | "contracts">): number {
  return p.strike * 100 * p.contracts;
}

export function carForCandidate(c: CandidateLike, contracts: number): number {
  return c.strike * 100 * Math.max(0, Math.floor(contracts));
}

export interface ConcentrationBreakdown {
  totalCar: number;
  byTicker: Map<string, number>;
  bySector: Map<string, number>;
}

function isOpen(p: PositionLike): boolean {
  return p.status === "open";
}

export function buildBreakdown(positions: readonly PositionLike[]): ConcentrationBreakdown {
  const byTicker = new Map<string, number>();
  const bySector = new Map<string, number>();
  let totalCar = 0;
  for (const p of positions) {
    if (!isOpen(p)) continue;
    const car = carForPosition(p);
    if (car <= 0) continue;
    totalCar += car;
    const t = p.ticker.toUpperCase();
    byTicker.set(t, (byTicker.get(t) ?? 0) + car);
    const sector = sectorForTicker(t);
    bySector.set(sector, (bySector.get(sector) ?? 0) + car);
  }
  return { totalCar, byTicker, bySector };
}

export interface OverlapInfo {
  ticker: string;
  sector: Sector;
  /** Number of currently-open positions that share the candidate's ticker. */
  openInTicker: number;
  /** Existing CAR on this ticker (before adding the candidate). */
  tickerCar: number;
  /** Existing CAR in this sector (before adding the candidate). */
  sectorCar: number;
  /** Total open CAR across the portfolio (before adding the candidate). */
  totalCar: number;
  /** Whether the sector is "Unclassified" — sector check is skipped. */
  sectorKnown: boolean;
}

export function describeOverlap(
  candidate: CandidateLike,
  positions: readonly PositionLike[],
  breakdown?: ConcentrationBreakdown,
): OverlapInfo {
  const b = breakdown ?? buildBreakdown(positions);
  const t = candidate.ticker.toUpperCase();
  const sector = sectorForTicker(t);
  const openInTicker = positions.filter((p) => isOpen(p) && p.ticker.toUpperCase() === t).length;
  return {
    ticker: t,
    sector,
    openInTicker,
    tickerCar: b.byTicker.get(t) ?? 0,
    sectorCar: b.bySector.get(sector) ?? 0,
    totalCar: b.totalCar,
    sectorKnown: sector !== UNCLASSIFIED_SECTOR,
  };
}

export type ThresholdLevel = "ok" | "ticker" | "sector" | "both";

export interface ThresholdAssessment {
  level: ThresholdLevel;
  /** CAR added by the prospective trade. */
  addedCar: number;
  /** Post-trade CAR concentrated on this ticker. */
  postTickerCar: number;
  /** Post-trade share of portfolio CAR for this ticker (0..1). */
  postTickerPct: number;
  /** Post-trade CAR concentrated in this sector. */
  postSectorCar: number;
  /** Post-trade share of portfolio CAR for this sector (0..1). */
  postSectorPct: number;
  /** Post-trade total CAR. */
  postTotalCar: number;
  tickerExceeds: boolean;
  sectorExceeds: boolean;
}

/**
 * Compute the post-trade concentration picture for a candidate at a given
 * contract count and decide whether the configured thresholds would be
 * crossed. Returns a structured assessment so callers can render either a
 * subtle chip (candidates row) or a banner (log dialog).
 */
export function wouldExceedThreshold(
  candidate: CandidateLike,
  contracts: number,
  settings: ConcentrationSettings,
  positions: readonly PositionLike[],
  breakdown?: ConcentrationBreakdown,
): ThresholdAssessment {
  const b = breakdown ?? buildBreakdown(positions);
  const overlap = describeOverlap(candidate, positions, b);
  const addedCar = carForCandidate(candidate, contracts);
  const postTotalCar = b.totalCar + addedCar;
  const postTickerCar = overlap.tickerCar + addedCar;
  const postSectorCar = overlap.sectorCar + addedCar;
  const postTickerPct = postTotalCar > 0 ? postTickerCar / postTotalCar : 0;
  const postSectorPct = postTotalCar > 0 ? postSectorCar / postTotalCar : 0;

  const tickerExceeds = postTickerPct > settings.tickerPct;
  const sectorExceeds = overlap.sectorKnown && postSectorPct > settings.sectorPct;

  let level: ThresholdLevel = "ok";
  if (tickerExceeds && sectorExceeds) level = "both";
  else if (tickerExceeds) level = "ticker";
  else if (sectorExceeds) level = "sector";

  return {
    level,
    addedCar,
    postTickerCar,
    postTickerPct,
    postSectorCar,
    postSectorPct,
    postTotalCar,
    tickerExceeds,
    sectorExceeds,
  };
}
