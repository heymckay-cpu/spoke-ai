import { describe, expect, it, vi } from "vitest";

// The engine's math is pure; only getDailyCloseSeries touches the market
// layer, mocked here with synthetic price paths.
const seriesByTicker = new Map<string, Array<{ date: string; close: number }>>();
vi.mock("./market", () => ({
  getDailyCloseSeries: vi.fn(async (t: string) => seriesByTicker.get(t) ?? []),
}));

import {
  correlateReturns,
  effectivePositions,
  getPortfolioCorrelation,
  pearson,
  toReturnsByDate,
  MIN_SAMPLES,
} from "./correlation";

/** Build a synthetic daily close series from a return generator. */
function makeSeries(
  days: number,
  ret: (i: number) => number,
  start = 100,
): Array<{ date: string; close: number }> {
  const out: Array<{ date: string; close: number }> = [];
  let close = start;
  const d0 = new Date("2026-01-02T00:00:00Z");
  for (let i = 0; i < days; i++) {
    const d = new Date(d0);
    d.setUTCDate(d.getUTCDate() + i);
    close *= 1 + ret(i);
    out.push({ date: d.toISOString().slice(0, 10), close });
  }
  return out;
}

// A deterministic pseudo-random walk.
const noise = (seed: number) => (i: number) =>
  0.01 * Math.sin(seed * 7.31 + i * 1.37) + 0.005 * Math.cos(seed * 3.7 + i * 2.1);

describe("pearson", () => {
  it("is 1 for identical series, -1 for negated, ~0 for orthogonal", () => {
    const xs = [1, 2, 3, 4, 5].map((v) => v / 100);
    expect(pearson(xs, xs)).toBeCloseTo(1);
    expect(pearson(xs, xs.map((v) => -v))).toBeCloseTo(-1);
    const a = [1, -1, 1, -1, 1, -1];
    const b = [1, 1, -1, -1, 1, 1];
    expect(Math.abs(pearson(a, b)!)).toBeLessThan(0.5);
  });

  it("returns null for degenerate inputs", () => {
    expect(pearson([1], [1])).toBeNull();
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull(); // zero variance
  });
});

describe("correlateReturns", () => {
  it("finds high correlation between series driven by the same factor", () => {
    const base = noise(1);
    const a = toReturnsByDate(makeSeries(120, base));
    const b = toReturnsByDate(makeSeries(120, (i) => base(i) * 0.9 + noise(9)(i) * 0.1));
    const r = correlateReturns(a, b);
    expect(r).not.toBeNull();
    expect(r!.rho).toBeGreaterThan(0.9);
  });

  it("finds low correlation between independent series", () => {
    const a = toReturnsByDate(makeSeries(120, noise(1)));
    const b = toReturnsByDate(makeSeries(120, noise(2)));
    const r = correlateReturns(a, b);
    expect(r).not.toBeNull();
    expect(Math.abs(r!.rho)).toBeLessThan(0.6);
  });

  it("refuses to correlate with too little overlap", () => {
    const a = toReturnsByDate(makeSeries(MIN_SAMPLES - 5, noise(1)));
    const b = toReturnsByDate(makeSeries(MIN_SAMPLES - 5, noise(1)));
    expect(correlateReturns(a, b)).toBeNull();
  });
});

describe("effectivePositions", () => {
  const rho = (m: Record<string, number>) => (a: string, b: string) =>
    m[[a, b].sort().join("|")] ?? null;

  it("equals N for equal-weight uncorrelated positions", () => {
    const n = effectivePositions(["A", "B", "C"], [1, 1, 1], () => 0);
    expect(n).toBeCloseTo(3);
  });

  it("collapses toward 1 for perfectly correlated positions", () => {
    const n = effectivePositions(["A", "B", "C"], [1, 1, 1], () => 1);
    expect(n).toBeCloseTo(1);
  });

  it("lands in between for partial correlation and respects weights", () => {
    const n = effectivePositions(
      ["A", "B"],
      [1, 1],
      rho({ "A|B": 0.5 }),
    );
    // (2)^2 / (1 + 1 + 2*0.5) = 4/3
    expect(n).toBeCloseTo(4 / 3);
    expect(effectivePositions(["A"], [1], () => 0)).toBe(1);
    expect(effectivePositions([], [], () => 0)).toBeNull();
  });
});

describe("getPortfolioCorrelation", () => {
  it("flags correlated pairs as traps and reports candidate overlap", async () => {
    const base = noise(4);
    seriesByTicker.clear();
    seriesByTicker.set("NVDA", makeSeries(150, base));
    seriesByTicker.set("AMD", makeSeries(150, (i) => base(i) * 0.95 + noise(11)(i) * 0.05));
    seriesByTicker.set("KO", makeSeries(150, noise(23)));
    seriesByTicker.set("PLTR", makeSeries(150, (i) => base(i) * 0.9 + noise(31)(i) * 0.1));

    const report = await getPortfolioCorrelation({
      positions: [
        { ticker: "NVDA", collateral: 50000 },
        { ticker: "AMD", collateral: 20000 },
        { ticker: "KO", collateral: 10000 },
      ],
      candidateTicker: "PLTR",
    });

    expect(report.tickers.sort()).toEqual(["AMD", "KO", "NVDA"]);
    expect(report.traps.some((t) => [t.a, t.b].sort().join() === "AMD,NVDA")).toBe(true);
    expect(report.effectivePositions).not.toBeNull();
    expect(report.effectivePositions!).toBeLessThan(3);
    expect(report.candidate?.ticker).toBe("PLTR");
    expect(report.candidate?.maxRho).toBeGreaterThan(0.7);
    expect(["NVDA", "AMD"]).toContain(report.candidate?.maxRhoTicker);
  });

  it("handles an empty portfolio", async () => {
    seriesByTicker.clear();
    const report = await getPortfolioCorrelation({ positions: [] });
    expect(report.tickers).toEqual([]);
    expect(report.traps).toEqual([]);
    expect(report.effectivePositions).toBeNull();
    expect(report.candidate).toBeNull();
  });
});
