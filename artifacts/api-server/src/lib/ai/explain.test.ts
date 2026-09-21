import { describe, expect, it } from "vitest";
import {
  buildExplainerPrompt,
  buildFallbackExplanation,
  parseExplainerResponse,
} from "./explain";
import type { CandidateOut } from "../screener";

const baseCandidate: CandidateOut = {
  ticker: "AAPL",
  spot: 200,
  expiry: "2025-06-20",
  dte: 30,
  strike: 190,
  delta: -0.25,
  bid: 2.5,
  ask: 2.6,
  iv: 0.32,
  openInterest: 4500,
  volume: 1200,
  premiumPerContract: 250,
  collateralPerContract: 19000,
  staticReturnPct: 1.32,
  annualizedPct: 16.07,
  breakeven: 187.5,
  pctOtm: 5.0,
  ivRank: 0.55,
  ivPercentile: 0.6,
  ivRankBasis: "real",
  hv30: 0.28,
  earningsDate: null,
  earningsInWindow: false,
  macroEvent: null,
};

describe("buildExplainerPrompt", () => {
  it("snapshots a candidate with no existing exposure", () => {
    const { system, user } = buildExplainerPrompt({
      candidate: baseCandidate,
      openPositions: [],
      shareHoldings: [],
    });
    expect(system).toMatchSnapshot("system");
    expect(user).toMatchSnapshot("user-no-exposure");
  });

  it("includes share holdings and open legs in the user message", () => {
    const { user } = buildExplainerPrompt({
      candidate: baseCandidate,
      openPositions: [
        { ticker: "AAPL", strike: 185, expiry: "2025-07-18", contracts: 2 },
        { ticker: "MSFT", strike: 400, expiry: "2025-06-20", contracts: 1 },
      ],
      shareHoldings: [{ ticker: "AAPL", shares: 200, avgCost: 175 }],
    });
    expect(user).toContain("Owns 200 shares of AAPL");
    expect(user).toContain("Open 2× AAPL $185.00P 2025-07-18");
    // Other tickers must not leak into the prompt.
    expect(user).not.toContain("MSFT");
  });

  it("flags earnings-in-window when set", () => {
    const { user } = buildExplainerPrompt({
      candidate: { ...baseCandidate, earningsInWindow: true, earningsDate: "2025-06-10" },
      openPositions: [],
      shareHoldings: [],
    });
    expect(user).toContain("Earnings inside the window on 2025-06-10");
  });
});

describe("parseExplainerResponse", () => {
  it("extracts JSON from a fenced code block", () => {
    const raw = "```json\n" + JSON.stringify({
      verdict: "good_fit",
      summary: "Looks fine.",
      bullets: ["one", "two"],
    }) + "\n```";
    const out = parseExplainerResponse(raw);
    expect(out.verdict).toBe("good_fit");
    expect(out.bullets).toEqual(["one", "two"]);
  });

  it("rejects unknown verdicts", () => {
    expect(() =>
      parseExplainerResponse(JSON.stringify({ verdict: "great", summary: "x", bullets: ["a"] })),
    ).toThrow(/invalid verdict/);
  });

  it("rejects empty bullets", () => {
    expect(() =>
      parseExplainerResponse(JSON.stringify({ verdict: "mixed", summary: "x", bullets: [] })),
    ).toThrow(/missing bullets/);
  });

  it("rejects missing summary", () => {
    expect(() =>
      parseExplainerResponse(JSON.stringify({ verdict: "mixed", bullets: ["a"] })),
    ).toThrow(/missing summary/);
  });
});

describe("buildFallbackExplanation", () => {
  it("flags 'avoid' when earnings are inside the window", () => {
    const r = buildFallbackExplanation({
      candidate: { ...baseCandidate, earningsInWindow: true, earningsDate: "2025-06-10" },
      openPositions: [],
      shareHoldings: [],
    });
    expect(r.verdict).toBe("avoid");
    expect(r.summary.toLowerCase()).toContain("earnings");
  });

  it("flags 'avoid' when the trader already owns 100+ shares", () => {
    const r = buildFallbackExplanation({
      candidate: baseCandidate,
      openPositions: [],
      shareHoldings: [{ ticker: "AAPL", shares: 200, avgCost: 175 }],
    });
    expect(r.verdict).toBe("avoid");
    expect(r.bullets.some((b) => b.includes("200 shares"))).toBe(true);
  });

  it("rates a high-yield clean setup as 'good_fit'", () => {
    const r = buildFallbackExplanation({
      candidate: { ...baseCandidate, annualizedPct: 32, ivRank: 0.7 },
      openPositions: [],
      shareHoldings: [],
    });
    expect(r.verdict).toBe("good_fit");
  });

  it("rates a mid-yield setup as 'mixed'", () => {
    const r = buildFallbackExplanation({
      candidate: { ...baseCandidate, annualizedPct: 18, ivRank: 0.3 },
      openPositions: [],
      shareHoldings: [],
    });
    expect(r.verdict).toBe("mixed");
  });
});
