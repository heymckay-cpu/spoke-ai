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
  // Per-user auth means there is no single "system" user to scan for.
  // Scans are now on-demand: each user triggers POST /scan from the UI.
  // Per-user results are cached in memory (cacheByUser) and persisted to
  // scanSnapshotTable so the last result survives server restarts.
  // The background timer is therefore intentionally not started.
  logger.info(
    { refreshMinutes: refreshMinutes() },
    "scan scheduler: per-user mode — background sweep disabled, scans are user-triggered",
  );
}

export function stopScanScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
