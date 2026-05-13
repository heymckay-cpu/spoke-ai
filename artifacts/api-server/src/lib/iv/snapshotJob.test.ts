import { describe, expect, it } from "vitest";
import { atmIvFromChain, isTradingDay, pickTargetExpiry } from "./snapshotJob";
import type { OptionChainSnapshot } from "../market";

describe("pickTargetExpiry", () => {
  const today = new Date("2025-06-01T00:00:00Z");

  it("picks the expiration closest to 30 DTE", () => {
    const exps = ["2025-06-06", "2025-06-20", "2025-07-03", "2025-08-15"];
    // 5d / 19d / 32d / 75d → 32d wins.
    expect(pickTargetExpiry(exps, today)).toBe("2025-07-03");
  });

  it("skips expirations less than a week out", () => {
    const exps = ["2025-06-04", "2025-07-03"];
    expect(pickTargetExpiry(exps, today)).toBe("2025-07-03");
  });

  it("returns null when every expiration is too close", () => {
    expect(pickTargetExpiry(["2025-06-02"], today)).toBeNull();
  });

  it("returns null on empty input", () => {
    expect(pickTargetExpiry([], today)).toBeNull();
  });
});

function row(strike: number, iv: number) {
  return {
    strike,
    bid: 1,
    ask: 1.1,
    lastPrice: 1.05,
    impliedVolatility: iv,
    openInterest: 100,
    volume: 10,
    inTheMoney: false,
  };
}

describe("isTradingDay", () => {
  it("returns false on Sat/Sun, true Mon-Fri", () => {
    // 2025-06-01 is a Sunday, 2025-06-02 Monday, ..., 2025-06-07 Saturday.
    expect(isTradingDay(new Date("2025-06-01T00:00:00Z"))).toBe(false);
    expect(isTradingDay(new Date("2025-06-02T00:00:00Z"))).toBe(true);
    expect(isTradingDay(new Date("2025-06-06T00:00:00Z"))).toBe(true);
    expect(isTradingDay(new Date("2025-06-07T00:00:00Z"))).toBe(false);
  });
});

describe("atmIvFromChain", () => {
  it("averages the IV of the call and put nearest the spot", () => {
    const snap: OptionChainSnapshot = {
      ticker: "AAA",
      spot: 100,
      expiry: "2025-07-03",
      dte: 32,
      puts: [row(95, 0.30), row(100, 0.40), row(105, 0.50)],
      calls: [row(95, 0.20), row(100, 0.28), row(105, 0.35)],
      fetchedAt: new Date().toISOString(),
    };
    expect(atmIvFromChain(snap)).toBeCloseTo((0.40 + 0.28) / 2, 6);
  });

  it("falls back to one side when the other has no usable IV", () => {
    const snap: OptionChainSnapshot = {
      ticker: "AAA",
      spot: 50,
      expiry: "2025-07-03",
      dte: 32,
      puts: [row(48, 0.0), row(50, 0.005)], // both filtered out (<= 0.01)
      calls: [row(50, 0.45)],
      fetchedAt: new Date().toISOString(),
    };
    expect(atmIvFromChain(snap)).toBeCloseTo(0.45, 6);
  });

  it("returns null when no usable IV exists on either side", () => {
    const snap: OptionChainSnapshot = {
      ticker: "AAA",
      spot: 50,
      expiry: "2025-07-03",
      dte: 32,
      puts: [row(50, 0)],
      calls: [row(50, 0)],
      fetchedAt: new Date().toISOString(),
    };
    expect(atmIvFromChain(snap)).toBeNull();
  });
});
