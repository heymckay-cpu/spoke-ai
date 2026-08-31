import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeScore,
  normalizeAmounts,
  normalizeCongress,
  normalizeInsiders,
  CONGRESS_WINDOW_DAYS,
} from "./signals";

// Fixed "now" so window math is deterministic.
const NOW = new Date("2026-08-31T12:00:00Z");

const daysAgo = (n: number): string => {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("normalizeCongress", () => {
  it("classifies purchases and sales, computes disclosure lag, and sorts newest first", () => {
    const rows = [
      {
        Representative: "Jane Doe",
        Transaction: "Purchase",
        TransactionDate: daysAgo(10),
        ReportDate: daysAgo(3),
        Range: "$1,001 - $15,000",
        Party: "D",
        House: "Representatives",
      },
      {
        Representative: "John Roe",
        Transaction: "Sale (Full)",
        TransactionDate: daysAgo(30),
        ReportDate: daysAgo(2),
        Range: "$15,001 - $50,000",
      },
    ];
    const out = normalizeCongress(rows, NOW);
    expect(out.buys).toBe(1);
    expect(out.sells).toBe(1);
    expect(out.recent[0].name).toBe("Jane Doe");
    expect(out.recent[0].lagDays).toBe(7);
    expect(out.recent[1].lagDays).toBe(28);
    expect(out.lastTradeDate).toBe(daysAgo(10));
    expect(out.medianLagDays).toBe(Math.round((7 + 28) / 2));
  });

  it("drops trades outside the lookback window and rows it cannot interpret", () => {
    const rows = [
      {
        Representative: "Old Trade",
        Transaction: "Purchase",
        TransactionDate: daysAgo(CONGRESS_WINDOW_DAYS + 10),
        ReportDate: daysAgo(CONGRESS_WINDOW_DAYS + 1),
      },
      { Representative: "No transaction type", TransactionDate: daysAgo(5) },
      { Transaction: "Exchange", TransactionDate: daysAgo(5) },
    ];
    const out = normalizeCongress(rows, NOW);
    expect(out.buys).toBe(0);
    expect(out.sells).toBe(0);
    expect(out.recent).toHaveLength(0);
  });

  it("caps the recent list at 5", () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({
      Representative: `Member ${i}`,
      Transaction: "Purchase",
      TransactionDate: daysAgo(i + 1),
      ReportDate: daysAgo(0),
    }));
    const out = normalizeCongress(rows, NOW);
    expect(out.buys).toBe(8);
    expect(out.recent).toHaveLength(5);
  });
});

describe("normalizeInsiders", () => {
  it("splits P/S codes and dollar-weights activity", () => {
    const rows = [
      { TransactionCode: "P", Shares: 1000, PricePerShare: 50, Date: daysAgo(5) },
      { TransactionCode: "S", Shares: 200, PricePerShare: 40, Date: daysAgo(9) },
      { TransactionCode: "M", Shares: 999, PricePerShare: 1, Date: daysAgo(2) }, // option exercise — ignored
    ];
    const out = normalizeInsiders(rows, NOW);
    expect(out.buys).toBe(1);
    expect(out.sells).toBe(1);
    expect(out.boughtValue).toBe(50_000);
    expect(out.soldValue).toBe(8_000);
    expect(out.lastActivityDate).toBe(daysAgo(5));
  });

  it("parses numeric strings with currency formatting", () => {
    const rows = [
      { TransactionCode: "P", Shares: "1,500", PricePerShare: "$12.50", Date: daysAgo(1) },
    ];
    const out = normalizeInsiders(rows, NOW);
    expect(out.boughtValue).toBe(18_750);
  });
});

describe("normalizeAmounts", () => {
  it("sums amounts inside the window and tracks the latest date", () => {
    const rows = [
      { Date: daysAgo(30), Amount: 1_000_000 },
      { Date: daysAgo(400), Amount: 9_000_000 }, // outside 365d window
      { Date: daysAgo(10), Amount: "2,500,000" },
    ];
    const out = normalizeAmounts(rows, NOW, 365);
    expect(out.count).toBe(2);
    expect(out.totalAmount).toBe(3_500_000);
    expect(out.lastDate).toBe(daysAgo(10));
  });
});

describe("computeScore", () => {
  const emptyCongress = { buys: 0, sells: 0, lastTradeDate: null, medianLagDays: null, recent: [] };
  const emptyInsiders = { buys: 0, sells: 0, boughtValue: 0, soldValue: 0, lastActivityDate: null };

  it("returns null when no dataset loaded", () => {
    const { score, components } = computeScore(null, null, null);
    expect(score).toBeNull();
    expect(components).toEqual([]);
  });

  it("is 50-neutral with no activity", () => {
    const { score } = computeScore(emptyCongress, emptyInsiders, {
      count: 0,
      totalAmount: 0,
      lastDate: null,
    });
    expect(score).toBe(50);
  });

  it("tilts up on net congressional buying, capped at +20", () => {
    const { score, components } = computeScore(
      { ...emptyCongress, buys: 10, sells: 0 },
      null,
      null,
    );
    expect(score).toBe(70);
    expect(components[0].contribution).toBe(20);
  });

  it("tilts down on net selling and clamps to the 0..100 range", () => {
    const { score } = computeScore(
      { ...emptyCongress, buys: 0, sells: 10 },
      { ...emptyInsiders, buys: 0, sells: 20, soldValue: 1_000_000 },
      null,
    );
    expect(score).toBe(50 - 20 - 15);
  });

  it("weighs insider buys double and adds gov-contract presence", () => {
    const { score, components } = computeScore(
      null,
      { ...emptyInsiders, buys: 2, sells: 1, boughtValue: 100_000, soldValue: 10_000 },
      { count: 3, totalAmount: 5_000_000, lastDate: daysAgo(20) },
    );
    // insiders: (2*2 - 1) * 3 = +9; contracts: min(10, 3*2) = +6
    expect(score).toBe(50 + 9 + 6);
    expect(components.map((c) => c.key)).toEqual(["insiders", "govContracts"]);
  });
});

describe("getQuiverSignals without a key", () => {
  it("returns configured:false and never touches the network", async () => {
    vi.stubEnv("QUIVER_API_KEY", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { getQuiverSignals } = await import("./signals");
    const out = await getQuiverSignals("aapl");
    expect(out.configured).toBe(false);
    expect(out.ticker).toBe("AAPL");
    expect(out.score).toBeNull();
    expect(out.congress).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
