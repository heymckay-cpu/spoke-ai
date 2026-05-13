// Shared roll-suggestion helper used by both the /positions/:id/roll-suggestion
// route and the advisor (which needs the same candidate list when reasoning
// about whether to roll). Keeping a single implementation guarantees that the
// strikes/expiry the advisor recommends are exactly what the user sees in the
// roll dialog's "smart suggestions".
import type { PositionRow } from "@workspace/db";
import { getExpirations, getOptionChain } from "./market";

/** Returns the next standard monthly equity-options expiry (third Friday of
 *  the month) on or after the given ISO date. */
export function nextThirdFridayOnOrAfter(iso: string): string {
  const start = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) {
    throw new Error(`invalid date: ${iso}`);
  }
  for (let i = 0; i < 24; i++) {
    const year = start.getUTCFullYear();
    const month = start.getUTCMonth() + i;
    const first = new Date(Date.UTC(year, month, 1));
    const dow = first.getUTCDay();
    const offset = (5 - dow + 7) % 7;
    const thirdFriday = new Date(first);
    thirdFriday.setUTCDate(1 + offset + 14);
    if (thirdFriday.getTime() >= start.getTime()) {
      return thirdFriday.toISOString().slice(0, 10);
    }
  }
  return iso;
}

export function snapToNearestStrike(
  target: number,
  strikes: number[],
): number | null {
  if (strikes.length === 0) return null;
  let best = strikes[0]!;
  let bestDist = Math.abs(best - target);
  for (const s of strikes) {
    const d = Math.abs(s - target);
    if (d < bestDist) {
      best = s;
      bestDist = d;
    }
  }
  return best;
}

export type RollOptionKind = "same" | "down5" | "down10";

export interface RollOption {
  kind: RollOptionKind;
  strike: number;
  premium: number;
  bid: number;
  ask: number;
  mid: number;
  lastPrice: number;
}

export interface RollSuggestion {
  ticker: string;
  currentExpiry: string;
  currentStrike: number;
  suggestedExpiry: string;
  dteFromNow: number;
  dteFromCurrent: number;
  spot: number;
  fetchedAt: string;
  options: RollOption[];
}

export class RollSuggestionUnavailable extends Error {
  status: 400 | 404;
  constructor(status: 400 | 404, message: string) {
    super(message);
    this.status = status;
  }
}

export interface ComputeRollSuggestionOptions {
  /** Which strike candidates to include. Defaults to ["same","down5"] for the
   *  user-facing roll dialog. The advisor passes ["same","down5","down10"] so
   *  the LLM has the requested top-3 candidate roll targets to reason over. */
  kinds?: RollOptionKind[];
}

/**
 * Compute the smart roll suggestion for a position: pick the next listed
 * monthly expiry on/after currentExpiry+21d and quote the requested strike
 * candidates on it. Throws `RollSuggestionUnavailable` when the chain
 * or expirations aren't available — callers map to either an HTTP error or
 * an empty advisor target list.
 */
export async function computeRollSuggestion(
  row: Pick<PositionRow, "ticker" | "expiry" | "strike">,
  opts: ComputeRollSuggestionOptions = {},
): Promise<RollSuggestion> {
  const kinds = opts.kinds ?? ["same", "down5"];
  const anchor = new Date(`${row.expiry}T00:00:00Z`);
  if (Number.isNaN(anchor.getTime())) {
    throw new RollSuggestionUnavailable(400, "Position has invalid expiry");
  }
  anchor.setUTCDate(anchor.getUTCDate() + 21);
  const idealMonthly = nextThirdFridayOnOrAfter(
    anchor.toISOString().slice(0, 10),
  );

  const expirationsRaw = await getExpirations(row.ticker);
  if (expirationsRaw.length === 0) {
    throw new RollSuggestionUnavailable(
      404,
      "No expirations available for ticker",
    );
  }
  const expirations = [...expirationsRaw].sort((a, b) => a.localeCompare(b));
  const onOrAfter = expirations.filter((e) => e >= idealMonthly);
  const suggestedExpiry =
    onOrAfter[0] ?? expirations[expirations.length - 1]!;

  const chain = await getOptionChain(row.ticker, suggestedExpiry);
  if (!chain) {
    throw new RollSuggestionUnavailable(
      404,
      "Option chain unavailable for suggested expiry",
    );
  }

  const strikes = chain.puts.map((p) => p.strike).sort((a, b) => a - b);

  const targetForKind = (kind: RollOptionKind): number => {
    switch (kind) {
      case "same":
        return row.strike;
      case "down5":
        return row.strike * 0.95;
      case "down10":
        return row.strike * 0.9;
    }
  };

  const buildOption = (
    kind: RollOptionKind,
    strike: number | null,
  ): RollOption | null => {
    if (strike == null) return null;
    const r = chain.puts.find((p) => Math.abs(p.strike - strike) < 0.0001);
    if (!r) return null;
    const bid = r.bid > 0 ? r.bid : 0;
    const ask = r.ask > 0 ? r.ask : 0;
    const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : ask > 0 ? ask : 0;
    const lastPrice = r.lastPrice > 0 ? r.lastPrice : 0;
    const premium = bid > 0 ? bid : mid > 0 ? mid : lastPrice;
    return { kind, strike, premium, bid, ask, mid, lastPrice };
  };

  const options: RollOption[] = [];
  const seenStrikes: number[] = [];
  for (const kind of kinds) {
    const snapped = snapToNearestStrike(targetForKind(kind), strikes);
    const opt = buildOption(kind, snapped);
    if (!opt) continue;
    // De-dupe: when consecutive candidates snap to the same strike (e.g.
    // strikes are coarse and -5% / -10% land on the same listing) keep
    // only the first.
    if (seenStrikes.some((s) => Math.abs(s - opt.strike) < 0.0001)) continue;
    seenStrikes.push(opt.strike);
    options.push(opt);
  }

  const dteFromNow = Math.round(
    (new Date(`${suggestedExpiry}T00:00:00Z`).getTime() - Date.now()) /
      (24 * 60 * 60 * 1000),
  );
  const dteFromCurrent = Math.round(
    (new Date(`${suggestedExpiry}T00:00:00Z`).getTime() -
      new Date(`${row.expiry}T00:00:00Z`).getTime()) /
      (24 * 60 * 60 * 1000),
  );

  return {
    ticker: row.ticker,
    currentExpiry: row.expiry,
    currentStrike: row.strike,
    suggestedExpiry,
    dteFromNow,
    dteFromCurrent,
    spot: chain.spot,
    fetchedAt: chain.fetchedAt,
    options,
  };
}
