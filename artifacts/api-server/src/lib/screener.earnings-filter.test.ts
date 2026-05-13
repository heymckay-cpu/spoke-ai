import { describe, it, expect } from "vitest";
import { applyEarningsFilter, type CandidateOut } from "./screener";

function mk(ticker: string, annualized: number, earnings: boolean): CandidateOut {
  return {
    ticker,
    spot: 100,
    expiry: "2026-01-16",
    dte: 30,
    strike: 95,
    delta: -0.25,
    bid: 1,
    ask: 1.05,
    iv: 0.3,
    openInterest: 500,
    volume: 100,
    premiumPerContract: 100,
    collateralPerContract: 9500,
    staticReturnPct: 1.05,
    annualizedPct: annualized,
    breakeven: 94,
    pctOtm: 5,
    ivRank: 0.5,
    ivRankBasis: "provisional",
    ivPercentile: null,
    hv30: 0.3,
    earningsDate: earnings ? "2026-01-10" : null,
    earningsInWindow: earnings,
  };
}

describe("applyEarningsFilter", () => {
  const candidates: CandidateOut[] = [
    mk("AAPL", 90, false),
    mk("MSFT", 80, true),
    mk("NVDA", 70, true),
    mk("GOOG", 60, false),
  ];

  it("hide: drops candidates with earnings in window and reports the count", () => {
    const { kept, hiddenByEarnings } = applyEarningsFilter(candidates, "hide");
    expect(kept.map((c) => c.ticker)).toEqual(["AAPL", "GOOG"]);
    expect(hiddenByEarnings).toBe(2);
  });

  it("only: keeps just the earnings-in-window candidates", () => {
    const { kept, hiddenByEarnings } = applyEarningsFilter(candidates, "only");
    expect(kept.map((c) => c.ticker)).toEqual(["MSFT", "NVDA"]);
    expect(hiddenByEarnings).toBe(0);
  });

  it("include: keeps every candidate untouched", () => {
    const { kept, hiddenByEarnings } = applyEarningsFilter(candidates, "include");
    expect(kept).toBe(candidates);
    expect(hiddenByEarnings).toBe(0);
  });

  it("preserves input ordering so downstream topN keeps the highest-ranked survivors", () => {
    const { kept } = applyEarningsFilter(candidates, "hide");
    // candidates were ranked by annualized desc; filtering must not reshuffle.
    expect(kept.map((c) => c.annualizedPct)).toEqual([90, 60]);
  });

  it("returns zero hidden count when nothing has earnings in window", () => {
    const clean = candidates.filter((c) => !c.earningsInWindow);
    const { kept, hiddenByEarnings } = applyEarningsFilter(clean, "hide");
    expect(kept).toEqual(clean);
    expect(hiddenByEarnings).toBe(0);
  });
});
