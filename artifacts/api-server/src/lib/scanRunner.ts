// Per-user in-memory scan cache. Each userId gets its own TTL'd cache entry
// so scans don't bleed across users.
import type { ScanResultOut } from "./screener";

const cacheByUser = new Map<string, { result: ScanResultOut; expiresAt: number }>();

export function getCachedScanForUser(userId: string): { result: ScanResultOut; expiresAt: number } | null {
  const entry = cacheByUser.get(userId);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    cacheByUser.delete(userId);
    return null;
  }
  return entry;
}

export function setCachedScanForUser(userId: string, result: ScanResultOut, ttlMs: number): void {
  cacheByUser.set(userId, { result, expiresAt: Date.now() + ttlMs });
}

export function invalidateCachedScanForUser(userId: string): void {
  cacheByUser.delete(userId);
}

export function invalidateAllCachedScans(): void {
  cacheByUser.clear();
}

// Legacy helpers kept for backward compatibility (used by scheduler if needed).
export function getCachedScan() {
  return null;
}

export function setCachedScan(_result: ScanResultOut, _ttlMs: number): void {
  // no-op: per-user cache now used; call setCachedScanForUser instead
}

export function invalidateCachedScan(): void {
  // no-op: per-user cache now used; call invalidateCachedScanForUser instead
}
