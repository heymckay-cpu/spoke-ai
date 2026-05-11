// US equity market hours detector. Used by the chain freshness banner and
// the background refresh scheduler so we only re-scan when quotes are
// actually moving.
//
// Limitations: weekday/RTH check only (09:30–16:00 America/New_York,
// Mon–Fri). Holidays and half-days are not modeled — on those days the
// scheduler will still attempt refreshes but Yahoo will return the
// previous close, which the "stale data" indicator already surfaces.

const NY_TZ = "America/New_York";

interface NyParts {
  weekday: number; // 0 = Sunday … 6 = Saturday
  hour: number;
  minute: number;
}

function nyParts(d: Date): NyParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: NY_TZ,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const weekdayStr = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekdayStr);
  return {
    weekday: weekday < 0 ? 0 : weekday,
    // Intl returns "24" instead of "00" at midnight in some Node builds.
    hour: hour === 24 ? 0 : hour,
    minute,
  };
}

export function isUsMarketOpen(now: Date = new Date()): boolean {
  const { weekday, hour, minute } = nyParts(now);
  if (weekday < 1 || weekday > 5) return false;
  const minutes = hour * 60 + minute;
  const open = 9 * 60 + 30;
  const close = 16 * 60;
  return minutes >= open && minutes < close;
}
