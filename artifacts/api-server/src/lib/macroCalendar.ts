// Macro event calendar: FOMC rate decisions and CPI releases that fall
// inside a candidate's expiry window. Same idea as the earnings flag —
// "premium is rich for a reason" — applied to market-wide binary events.
//
// Dates are the officially published schedules, hardcoded on purpose: they
// are known a year ahead, never change without months of notice, and a
// static table beats an API dependency for reliability. UPDATE ANNUALLY:
// the Fed publishes next year's calendar at federalreserve.gov, and the
// BLS publishes CPI release dates at bls.gov/schedule. When a window
// extends past the table, we simply don't flag (fail quiet, never guess).

export interface MacroEvent {
  date: string; // YYYY-MM-DD — the decision/release day
  label: string; // e.g. "FOMC decision", "CPI release"
}

// FOMC decision days (second day of each two-day meeting).
// 2026: official. 2027: Fed's published tentative schedule.
const FOMC_DECISION_DATES: string[] = [
  "2026-01-28",
  "2026-03-18",
  "2026-04-29",
  "2026-06-17",
  "2026-07-29",
  "2026-09-16",
  "2026-10-28",
  "2026-12-09",
  "2027-01-27",
  "2027-03-17",
  "2027-04-28",
  "2027-06-09",
  "2027-07-28",
  "2027-09-15",
  "2027-10-27",
  "2027-12-08",
];

// CPI release days (8:30am ET). Known published dates; extend when the
// BLS publishes the 2027 schedule.
const CPI_RELEASE_DATES: string[] = [
  "2026-10-14",
  "2026-11-10",
  "2026-12-10",
];

const ALL_EVENTS: MacroEvent[] = [
  ...FOMC_DECISION_DATES.map((date) => ({ date, label: "FOMC decision" })),
  ...CPI_RELEASE_DATES.map((date) => ({ date, label: "CPI release" })),
].sort((a, b) => a.date.localeCompare(b.date));

/**
 * Macro events strictly after `fromIso` and on or before `toIso`
 * (YYYY-MM-DD both). Used with fromIso = today, toIso = option expiry.
 */
export function macroEventsInWindow(fromIso: string, toIso: string): MacroEvent[] {
  if (!fromIso || !toIso || toIso < fromIso) return [];
  return ALL_EVENTS.filter((e) => e.date > fromIso && e.date <= toIso);
}

/**
 * Compact single-string flag for a candidate row, or null when the window
 * is clear. e.g. "FOMC decision 2026-10-28" or
 * "FOMC decision 2026-10-28 · CPI release 2026-10-14".
 */
export function macroEventLabel(fromIso: string, toIso: string): string | null {
  const events = macroEventsInWindow(fromIso, toIso);
  if (events.length === 0) return null;
  return events.map((e) => `${e.label} ${e.date}`).join(" · ");
}
