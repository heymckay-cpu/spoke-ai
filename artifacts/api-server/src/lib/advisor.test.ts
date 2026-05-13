import { describe, expect, it, vi, beforeEach } from "vitest";
import { parseLlmJson, runAdvisor, type AdvisorContext } from "./advisor";

function makeContext(overrides: Partial<AdvisorContext> = {}): AdvisorContext {
  const base: AdvisorContext = {
    position: {
      id: 1,
      ticker: "AAPL",
      strike: 200,
      expiry: "2025-05-16",
      premium: 2.5,
      contracts: 1,
      dte: 5,
    },
    costBasisPerShare: 197.5,
    netPremiumPerShare: 2.5,
    totalPremiumCollected: 250,
    chainLegs: [
      {
        id: 1,
        strike: 200,
        expiry: "2025-05-16",
        premium: 2.5,
        contracts: 1,
        closePrice: null,
        status: "open",
      },
    ],
    quote: {
      spot: 195,
      currentBid: 6.5,
      intrinsic: 5,
      extrinsic: 1.5,
      fetchedAt: "2025-05-13T10:00:00Z",
    },
    rollTargets: [
      {
        expiry: "2025-06-20",
        strike: 200,
        premium: 7.0,
        netCredit: 50,
        newAnnualizedYield: 0.32,
        dteFromNow: 38,
      },
    ],
    concentration: {
      totalCar: 100_000,
      tickerCar: 20_000,
      tickerPct: 0.2,
      sector: "Technology",
      sectorCar: 30_000,
      sectorPct: 0.3,
      openPositionsInTicker: 1,
    },
    assignmentCostPerShare: 200,
    assignmentCostTotal: 20_000,
  };
  return { ...base, ...overrides };
}

describe("parseLlmJson", () => {
  it("parses a clean roll verdict with recommendedRoll", () => {
    const raw = JSON.stringify({
      verdict: "roll",
      summary: "Roll out 35d for $50 net credit at the same strike.",
      bullets: [
        "Net credit of $50 keeps premium flowing.",
        "New 32% annualized yield beats taking assignment.",
      ],
      recommendedRoll: { expiry: "2025-06-20", strike: 200 },
    });
    const out = parseLlmJson(raw);
    expect(out.verdict).toBe("roll");
    expect(out.bullets.length).toBe(2);
    expect(out.recommendedRoll).toEqual({
      expiry: "2025-06-20",
      strike: 200,
    });
  });

  it("strips ```json fences when models add them", () => {
    const raw = "```json\n" + JSON.stringify({
      verdict: "close",
      summary: "Best to bail now.",
      bullets: ["Roll yield is poor.", "Concentration too high."],
    }) + "\n```";
    const out = parseLlmJson(raw);
    expect(out.verdict).toBe("close");
    expect(out.recommendedRoll).toBeUndefined();
  });

  it("rejects invalid verdict values", () => {
    expect(() =>
      parseLlmJson(
        JSON.stringify({
          verdict: "panic",
          summary: "x",
          bullets: ["y"],
        }),
      ),
    ).toThrow(/unknown verdict/);
  });

  it("rejects roll verdict missing recommendedRoll", () => {
    expect(() =>
      parseLlmJson(
        JSON.stringify({
          verdict: "roll",
          summary: "x",
          bullets: ["y"],
        }),
      ),
    ).toThrow(/recommendedRoll/);
  });

  it("rejects recommendedRoll with malformed expiry", () => {
    expect(() =>
      parseLlmJson(
        JSON.stringify({
          verdict: "roll",
          summary: "x",
          bullets: ["y"],
          recommendedRoll: { expiry: "next-month", strike: 100 },
        }),
      ),
    ).toThrow(/YYYY-MM-DD/);
  });

  it("rejects empty bullets array", () => {
    expect(() =>
      parseLlmJson(
        JSON.stringify({
          verdict: "assign",
          summary: "x",
          bullets: [],
        }),
      ),
    ).toThrow(/bullets/);
  });

  it("filters non-string bullets but keeps the rest", () => {
    const out = parseLlmJson(
      JSON.stringify({
        verdict: "assign",
        summary: "Take it.",
        bullets: ["Cost basis below spot.", 42, "Sector exposure modest."],
      }),
    );
    expect(out.bullets).toEqual([
      "Cost basis below spot.",
      "Sector exposure modest.",
    ]);
  });
});

describe("runAdvisor", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the injected llmCall and returns the parsed verdict", async () => {
    const llmCall = vi.fn(async (_ctx: AdvisorContext) =>
      JSON.stringify({
        verdict: "assign",
        summary: "Take assignment — cost basis is below spot.",
        bullets: ["Cost basis $195 vs spot $195.", "Concentration well below thresholds."],
      }),
    );
    const out = await runAdvisor(makeContext(), { llmCall });
    expect(llmCall).toHaveBeenCalledTimes(1);
    expect(out.verdict).toBe("assign");
    expect(out.recommendedRoll).toBeUndefined();
  });

  it("propagates parse errors from malformed JSON", async () => {
    const llmCall = vi.fn(async () => "not json at all");
    await expect(runAdvisor(makeContext(), { llmCall })).rejects.toThrow();
  });

  it("rejects roll verdicts whose recommendedRoll isn't in rollTargets", async () => {
    const llmCall = vi.fn(async () =>
      JSON.stringify({
        verdict: "roll",
        summary: "Roll to a strike we never offered.",
        bullets: ["Made-up strike $180.", "DTE 60."],
        recommendedRoll: { expiry: "2025-06-20", strike: 180 },
      }),
    );
    await expect(runAdvisor(makeContext(), { llmCall })).rejects.toThrow(
      /not in rollTargets/,
    );
  });

  it("accepts roll verdicts whose recommendedRoll matches a rollTarget", async () => {
    const llmCall = vi.fn(async () =>
      JSON.stringify({
        verdict: "roll",
        summary: "Roll out 35d at the same strike.",
        bullets: ["Net credit $50.", "Yield 32% annualized."],
        recommendedRoll: { expiry: "2025-06-20", strike: 200 },
      }),
    );
    const out = await runAdvisor(makeContext(), { llmCall });
    expect(out.verdict).toBe("roll");
    expect(out.recommendedRoll).toEqual({
      expiry: "2025-06-20",
      strike: 200,
    });
  });
});
