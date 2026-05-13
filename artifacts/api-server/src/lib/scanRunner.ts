// Shared "run the screener with current settings, cache the result, and
// persist a snapshot" helper. Used both by the POST /scan route and by the
// background scheduler so the in-memory cache stays consistent regardless
// of who triggered the refresh.
import { db, scanSnapshotTable } from "@workspace/db";
import { getSettings, onSettingsSaved } from "./settingsStore";
import { runScreener, type ScanResultOut } from "./screener";
import { clearMarketCache } from "./market";
import { logger } from "./logger";

let cachedScan: { result: ScanResultOut; expiresAt: number } | null = null;

// Drop the cached scan whenever settings change so the next call recomputes
// with the updated parameters.
onSettingsSaved(() => {
  cachedScan = null;
});

export function getCachedScan(): { result: ScanResultOut; expiresAt: number } | null {
  if (cachedScan && Date.now() >= cachedScan.expiresAt) {
    cachedScan = null;
  }
  return cachedScan;
}

export function setCachedScan(result: ScanResultOut, ttlMs: number): void {
  cachedScan = { result, expiresAt: Date.now() + ttlMs };
}

export function invalidateCachedScan(): void {
  cachedScan = null;
}

export interface RunAndCacheOptions {
  forceRefresh?: boolean;
}

export async function runAndCacheLatestScan(
  opts: RunAndCacheOptions = {},
): Promise<ScanResultOut> {
  const settings = await getSettings();
  if (opts.forceRefresh) clearMarketCache();
  const result = await runScreener(settings);
  setCachedScan(result, settings.cacheTtlMinutes * 60 * 1000);
  try {
    await db.insert(scanSnapshotTable).values({
      scannedAt: result.scannedAt ? new Date(result.scannedAt) : new Date(),
      candidates: result.candidates,
      errors: result.errors,
      tickersScanned: result.tickersScanned,
      tickersWithCandidate: result.tickersWithCandidate,
      hiddenByEarningsCount: result.hiddenByEarningsCount,
    });
  } catch (err) {
    logger.warn({ err }, "failed to persist scan snapshot");
  }
  return result;
}
