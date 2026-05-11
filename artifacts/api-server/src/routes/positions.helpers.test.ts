import { describe, expect, it } from "vitest";
import { nextThirdFridayOnOrAfter, snapToNearestStrike } from "./positions";

describe("nextThirdFridayOnOrAfter", () => {
  it("returns the same day when input is already a third Friday", () => {
    // 2025-01-17 is the third Friday of January 2025.
    expect(nextThirdFridayOnOrAfter("2025-01-17")).toBe("2025-01-17");
  });

  it("returns the third Friday of the same month when input is earlier in the month", () => {
    expect(nextThirdFridayOnOrAfter("2025-03-01")).toBe("2025-03-21");
    expect(nextThirdFridayOnOrAfter("2025-06-10")).toBe("2025-06-20");
  });

  it("rolls forward to the next month when input is after the current third Friday", () => {
    // Third Friday of Feb 2025 is the 21st; input is the 22nd.
    expect(nextThirdFridayOnOrAfter("2025-02-22")).toBe("2025-03-21");
    // Third Friday of Dec 2025 is the 19th; input late in the month rolls to Jan.
    expect(nextThirdFridayOnOrAfter("2025-12-31")).toBe("2026-01-16");
  });

  it("handles the year boundary cleanly", () => {
    expect(nextThirdFridayOnOrAfter("2025-12-20")).toBe("2026-01-16");
  });

  it("handles a month that begins on a Friday (first Friday is the 1st)", () => {
    // August 2025 starts on a Friday — third Friday is the 15th.
    expect(nextThirdFridayOnOrAfter("2025-08-01")).toBe("2025-08-15");
  });

  it("handles a month that begins on a Saturday (third Friday lands late)", () => {
    // February 2025 starts on a Saturday — third Friday is the 21st.
    expect(nextThirdFridayOnOrAfter("2025-02-01")).toBe("2025-02-21");
  });

  it("throws on a malformed ISO date", () => {
    expect(() => nextThirdFridayOnOrAfter("not-a-date")).toThrow(/invalid date/);
  });
});

describe("snapToNearestStrike", () => {
  const strikes = [90, 92.5, 95, 97.5, 100, 102.5, 105];

  it("returns null when there are no listed strikes", () => {
    expect(snapToNearestStrike(100, [])).toBeNull();
  });

  it("returns the exact strike when present", () => {
    expect(snapToNearestStrike(100, strikes)).toBe(100);
  });

  it("snaps to the nearest listed strike", () => {
    expect(snapToNearestStrike(96, strikes)).toBe(95);
    expect(snapToNearestStrike(96.3, strikes)).toBe(97.5);
  });

  it("snaps a -5% target to the closest listed strike", () => {
    // 100 * 0.95 = 95 → exactly listed
    expect(snapToNearestStrike(100 * 0.95, strikes)).toBe(95);
    // 102.5 * 0.95 = 97.375 → nearest is 97.5
    expect(snapToNearestStrike(102.5 * 0.95, strikes)).toBe(97.5);
  });

  it("returns the only strike when the chain has a single entry", () => {
    expect(snapToNearestStrike(50, [42])).toBe(42);
  });
});
