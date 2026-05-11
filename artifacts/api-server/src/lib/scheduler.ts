// Background scheduler that re-runs the wheel screener on a fixed cadence
// during US market hours. Outside RTH the screener still serves the most
// recent persisted snapshot, but the chain/quote endpoints will mark the
// data as stale so the UI can warn users.
//
// Configuration:
//   SCAN_REFRESH_MINUTES   default 15  — gap between refreshes during RTH
//   SCAN_REFRESH_DISABLED  default ""  — set to "1" to disable entirely
//                                        (handy for tests / CI)
import { isUsMarketOpen } from "./marketHours";
import { getCachedScan, runAndCacheLatestScan } from "./scanRunner";
import { logger } from "./logger";

let timer: NodeJS.Timeout | null = null;
let running = false;

function refreshMinutes(): number {
  const raw = process.env.SCAN_REFRESH_MINUTES;
  const n = raw ? Number(raw) : 15;
  return Number.isFinite(n) && n > 0 ? n : 15;
}

async function tick(): Promise<void> {
  if (running) return;
  if (!isUsMarketOpen()) return;
  const cached = getCachedScan();
  const minMs = refreshMinutes() * 60 * 1000;
  if (cached) {
    const scannedAt = cached.result.scannedAt ? Date.parse(cached.result.scannedAt) : 0;
    if (Number.isFinite(scannedAt) && Date.now() - scannedAt < minMs) return;
  }
  running = true;
  try {
    logger.info("scheduled scan refresh starting");
    const result = await runAndCacheLatestScan({ forceRefresh: true });
    logger.info(
      { tickers: result.tickersScanned, candidates: result.candidates.length },
      "scheduled scan refresh complete",
    );
  } catch (err) {
    logger.warn({ err }, "scheduled scan refresh failed");
  } finally {
    running = false;
  }
}

export function startScanScheduler(): void {
  if (timer) return;
  if (process.env.SCAN_REFRESH_DISABLED === "1") {
    logger.info("scan scheduler disabled via SCAN_REFRESH_DISABLED");
    return;
  }
  // Poll once a minute; tick() decides whether to actually run a scan.
  timer = setInterval(() => {
    void tick();
  }, 60 * 1000);
  // Don't keep the process alive just for the scheduler.
  if (typeof timer.unref === "function") timer.unref();
  logger.info(
    { refreshMinutes: refreshMinutes() },
    "scan scheduler started (US market hours)",
  );
  // Kick off an immediate check so a fresh process refreshes right away if
  // the market is currently open and the last snapshot is too old.
  void tick();
}

export function stopScanScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
