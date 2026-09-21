import { describe, expect, it } from "vitest";
import { macroEventLabel, macroEventsInWindow } from "./macroCalendar";

describe("macroEventsInWindow", () => {
  it("finds the FOMC decision inside an expiry window", () => {
    const events = macroEventsInWindow("2026-09-21", "2026-10-30");
    expect(events.map((e) => e.date)).toContain("2026-10-28");
    expect(events.some((e) => e.label === "FOMC decision")).toBe(true);
  });

  it("includes CPI releases and sorts ascending", () => {
    const events = macroEventsInWindow("2026-10-01", "2026-11-15");
    expect(events.map((e) => e.date)).toEqual(["2026-10-14", "2026-10-28", "2026-11-10"]);
  });

  it("excludes the start day and includes the end day", () => {
    expect(macroEventsInWindow("2026-10-28", "2026-11-01")).toHaveLength(0);
    expect(macroEventsInWindow("2026-10-27", "2026-10-28").map((e) => e.date)).toEqual([
      "2026-10-28",
    ]);
  });

  it("is empty for clear or invalid windows", () => {
    expect(macroEventsInWindow("2026-10-29", "2026-11-05")).toHaveLength(0);
    expect(macroEventsInWindow("2026-11-01", "2026-10-01")).toHaveLength(0);
    expect(macroEventsInWindow("", "2026-10-01")).toHaveLength(0);
  });
});

describe("macroEventLabel", () => {
  it("renders a compact label or null", () => {
    expect(macroEventLabel("2026-09-21", "2026-10-30")).toContain("FOMC decision 2026-10-28");
    expect(macroEventLabel("2026-10-29", "2026-11-05")).toBeNull();
  });
});
