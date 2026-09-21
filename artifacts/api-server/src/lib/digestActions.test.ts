import { describe, expect, it, vi } from "vitest";

// classifyPosition is pure; the orchestrator's collaborators are mocked so
// importing the module never touches a real database.
vi.mock("@workspace/db", () => ({
  db: {},
  positionsTable: {},
  holdingsTable: {},
}));
vi.mock("drizzle-orm", () => ({ and: vi.fn(), eq: vi.fn(), isNull: vi.fn() }));
vi.mock("./market", () => ({ getSpot: vi.fn(), getOptionChain: vi.fn() }));
vi.mock("./correlation", () => ({
  getPortfolioCorrelation: vi.fn(),
  TRAP_THRESHOLD: 0.7,
}));

import { classifyPosition, type PositionFacts } from "./digestActions";

const facts = (over: Partial<PositionFacts> = {}): PositionFacts => ({
  ticker: "AAPL",
  strike: 190,
  expiry: "2026-10-16",
  premium: 2.5,
  contracts: 1,
  kind: "csp",
  dte: 25,
  spot: 210,
  currentBid: 2.0,
  ...over,
});

describe("classifyPosition", () => {
  it("flags expired positions for reconciliation first", () => {
    const item = classifyPosition(facts({ dte: -3 }));
    expect(item?.severity).toBe("action");
    expect(item?.text).toContain("expired 3d ago");
  });

  it("flags ITM puts (spot below strike) with assignment guidance", () => {
    const item = classifyPosition(facts({ spot: 180 }));
    expect(item?.severity).toBe("action");
    expect(item?.text).toContain("in the money");
    expect(item?.text).toContain("assignment of 100 shares");
  });

  it("flags ITM covered calls in the other direction", () => {
    const item = classifyPosition(facts({ kind: "cc", spot: 200, strike: 195 }));
    expect(item?.severity).toBe("action");
    expect(item?.text).toContain("called away");
  });

  it("suggests early close at 60%+ premium capture", () => {
    const item = classifyPosition(facts({ premium: 2.5, currentBid: 0.8 }));
    expect(item?.severity).toBe("watch");
    expect(item?.text).toContain("68% of max premium");
  });

  it("watches OTM positions expiring within a week", () => {
    const item = classifyPosition(facts({ dte: 4, currentBid: 2.4 }));
    expect(item?.severity).toBe("watch");
    expect(item?.text).toContain("expires in 4d");
  });

  it("stays quiet for a healthy mid-cycle position", () => {
    expect(classifyPosition(facts())).toBeNull();
  });
});
