// Background scheduler that re-runs the wheel screener on a fixed cadence
// during US market hours. Outside RTH the screener still serves the most
// recent persisted snapshot, but the chain/quote endpoints will mark the
// data as stale so the UI can warn users.
//
// NOTE: With per-user auth, the scheduler no longer runs scans automatically
// (there's no single "system" user). It is kept here as a stub so the
// startScanScheduler / stopScanScheduler surface remains importable by
// index.ts without changes.
import { logger } from "./logger";

let timer: NodeJS.Timeout | null = null;

function refreshMinutes(): number {
  const raw = process.env.SCAN_REFRESH_MINUTES;
  const n = raw ? Number(raw) : 15;
  return Number.isFinite(n) && n > 0 ? n : 15;
}

export function startScanScheduler(): void {
  if (timer) return;
  if (process.env.SCAN_REFRESH_DISABLED === "1") {
    logger.info("scan scheduler disabled via SCAN_REFRESH_DISABLED");
    return;
  }
  logger.info(
    { refreshMinutes: refreshMinutes() },
    "alert scheduler started",
  );
  // No-op tick: with multi-user auth scans are user-triggered only.
  timer = setInterval(() => {
    // intentionally empty — per-user scans are triggered via POST /scan
  }, 60 * 1000);
  if (typeof timer.unref === "function") timer.unref();
}

export function stopScanScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
