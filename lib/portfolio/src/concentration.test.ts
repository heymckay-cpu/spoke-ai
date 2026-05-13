import { describe, expect, it } from "vitest";
import {
  buildBreakdown,
  carForPosition,
  describeOverlap,
  DEFAULT_CONCENTRATION,
  wouldExceedThreshold,
  type PositionLike,
} from "./concentration";

const open = (over: Partial<PositionLike> & { ticker: string; strike: number; contracts: number }): PositionLike => ({
  status: "open",
  ...over,
});

describe("carForPosition", () => {
  it("computes strike × 100 × contracts", () => {
    expect(carForPosition({ strike: 50, contracts: 2 })).toBe(10_000);
    expect(carForPosition({ strike: 12.5, contracts: 1 })).toBe(1_250);
  });
});

describe("buildBreakdown", () => {
  it("ignores closed positions", () => {
    const b = buildBreakdown([
      open({ ticker: "AAPL", strike: 200, contracts: 1 }),
      { ticker: "MSFT", strike: 400, contracts: 1, status: "closed" },
    ]);
    expect(b.totalCar).toBe(20_000);
    expect(b.byTicker.get("AAPL")).toBe(20_000);
    expect(b.byTicker.get("MSFT")).toBeUndefined();
  });

  it("aggregates per-ticker and per-sector CAR", () => {
    const b = buildBreakdown([
      open({ ticker: "AAPL", strike: 200, contracts: 1 }),
      open({ ticker: "MSFT", strike: 400, contracts: 1 }),
      open({ ticker: "JPM", strike: 200, contracts: 2 }),
    ]);
    expect(b.totalCar).toBe(20_000 + 40_000 + 40_000);
    expect(b.bySector.get("Information Technology")).toBe(60_000);
    expect(b.bySector.get("Financials")).toBe(40_000);
  });
});

describe("describeOverlap", () => {
  it("reports zero overlap when ticker is brand new", () => {
    const o = describeOverlap({ ticker: "AAPL", strike: 200 }, []);
    expect(o.openInTicker).toBe(0);
    expect(o.tickerCar).toBe(0);
    expect(o.sectorCar).toBe(0);
    expect(o.sectorKnown).toBe(true);
  });

  it("counts open positions on the same ticker", () => {
    const positions = [
      open({ ticker: "AAPL", strike: 200, contracts: 1 }),
      open({ ticker: "AAPL", strike: 190, contracts: 2 }),
      { ticker: "AAPL", strike: 180, contracts: 1, status: "closed" },
    ];
    const o = describeOverlap({ ticker: "AAPL", strike: 195 }, positions);
    expect(o.openInTicker).toBe(2);
    expect(o.tickerCar).toBe(20_000 + 38_000);
  });

  it("flags unclassified sectors so callers can skip the sector check", () => {
    const o = describeOverlap({ ticker: "ZZZZ", strike: 50 }, []);
    expect(o.sectorKnown).toBe(false);
  });
});

describe("wouldExceedThreshold", () => {
  it("returns ok when no overlap and small relative size", () => {
    const positions = [
      open({ ticker: "MSFT", strike: 400, contracts: 1 }),
      open({ ticker: "JPM", strike: 200, contracts: 1 }),
    ];
    const a = wouldExceedThreshold(
      { ticker: "XOM", strike: 100 },
      1,
      DEFAULT_CONCENTRATION,
      positions,
    );
    expect(a.level).toBe("ok");
    expect(a.tickerExceeds).toBe(false);
    expect(a.sectorExceeds).toBe(false);
  });

  it("flags ticker overload when stacking onto an existing position", () => {
    const positions = [
      open({ ticker: "AAPL", strike: 200, contracts: 2 }),
      open({ ticker: "MSFT", strike: 400, contracts: 1 }),
      open({ ticker: "JPM", strike: 200, contracts: 1 }),
    ];
    const a = wouldExceedThreshold(
      { ticker: "AAPL", strike: 200 },
      2,
      DEFAULT_CONCENTRATION,
      positions,
    );
    expect(a.tickerExceeds).toBe(true);
    expect(a.postTickerPct).toBeGreaterThan(DEFAULT_CONCENTRATION.tickerPct);
    expect(a.postTotalCar).toBe(40_000 + 40_000 + 20_000 + 40_000);
  });

  it("flags sector overload when adding into a heavy sector", () => {
    // All open positions are tech. Adding more tech tips the sector bucket.
    const positions = [
      open({ ticker: "AAPL", strike: 200, contracts: 1 }),
      open({ ticker: "MSFT", strike: 400, contracts: 1 }),
      open({ ticker: "NVDA", strike: 100, contracts: 1 }),
    ];
    const a = wouldExceedThreshold(
      { ticker: "AMD", strike: 150 },
      1,
      { tickerPct: 0.5, sectorPct: 0.3 },
      positions,
    );
    expect(a.sectorExceeds).toBe(true);
    expect(a.tickerExceeds).toBe(false);
    expect(a.level).toBe("sector");
  });

  it("skips sector check entirely for unclassified tickers", () => {
    const positions = [open({ ticker: "ZZZZ", strike: 100, contracts: 5 })];
    const a = wouldExceedThreshold(
      { ticker: "ZZZZ", strike: 100 },
      5,
      DEFAULT_CONCENTRATION,
      positions,
    );
    expect(a.sectorExceeds).toBe(false);
    // The ticker bucket still trips because everything is on ZZZZ.
    expect(a.tickerExceeds).toBe(true);
    expect(a.level).toBe("ticker");
  });

  it("reports both flags when ticker AND sector cross at once", () => {
    const positions = [open({ ticker: "AAPL", strike: 200, contracts: 1 })];
    const a = wouldExceedThreshold(
      { ticker: "AAPL", strike: 200 },
      1,
      DEFAULT_CONCENTRATION,
      positions,
    );
    expect(a.level).toBe("both");
  });
});
