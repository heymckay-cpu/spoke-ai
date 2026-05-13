// Server-side ticker → sector lookup.
//
// Strategy (in order):
//   1. In-memory LRU-ish Map keyed by uppercased ticker.
//   2. Postgres `ticker_sectors` row (so a fresh process doesn't re-hit
//      the upstream provider for every ticker the user trades).
//   3. Active market provider's `getSector` adapter (Yahoo's
//      `quoteSummary.assetProfile.sector`, Polygon's reference endpoint).
//   4. The static curated table in `@workspace/data/sectors` — the same
//      hand-maintained map this module replaces, kept as a fallback so
//      offline / no-provider deploys keep working.
//
// Misses (provider returns null and the static table doesn't know the
// ticker either) are also memoized for a short window so we don't hammer
// the provider on every page render.

import { db, tickerSectorsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  normalizeProviderSector,
  sectorForTicker,
  UNCLASSIFIED_SECTOR,
  type Sector,
} from "@workspace/data";
import { getMarketProvider } from "./market";
import { logger } from "./logger";

interface MemEntry {
  sector: Sector;
  source: SectorSource;
  expiresAt: number;
}

export type SectorSource = "memory" | "db" | "yahoo" | "polygon" | "provider" | "static";

const HIT_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const MISS_TTL_MS = 15 * 60 * 1000; // 15m: re-try unknowns periodically

const memCache = new Map<string, MemEntry>();

function normalizeTicker(t: string): string {
  return t.trim().toUpperCase();
}

function rememberInMemory(
  ticker: string,
  sector: Sector,
  source: SectorSource,
  ttlMs: number,
): void {
  memCache.set(ticker, { sector, source, expiresAt: Date.now() + ttlMs });
}

async function readDbCache(ticker: string): Promise<Sector | null> {
  try {
    const rows = await db
      .select()
      .from(tickerSectorsTable)
      .where(eq(tickerSectorsTable.ticker, ticker));
    const row = rows[0];
    if (!row) return null;
    return row.sector as Sector;
  } catch (err) {
    logger.warn({ err, ticker }, "sectorResolver: db read failed");
    return null;
  }
}

async function writeDbCache(ticker: string, sector: Sector, source: SectorSource): Promise<void> {
  try {
    await db
      .insert(tickerSectorsTable)
      .values({ ticker, sector, source, fetchedAt: new Date() })
      .onConflictDoUpdate({
        target: tickerSectorsTable.ticker,
        set: { sector, source, fetchedAt: new Date() },
      });
  } catch (err) {
    logger.warn({ err, ticker }, "sectorResolver: db write failed");
  }
}

/**
 * Resolve the sector for a single ticker. Always returns a Sector — when
 * the provider doesn't know and the static table is also a miss, returns
 * `UNCLASSIFIED_SECTOR` so concentration callers can skip the sector
 * check (matching pre-existing behavior).
 */
export async function getSector(rawTicker: string): Promise<Sector> {
  const ticker = normalizeTicker(rawTicker);
  if (!ticker) return UNCLASSIFIED_SECTOR;

  const cached = memCache.get(ticker);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.sector;
  }

  const dbHit = await readDbCache(ticker);
  if (dbHit) {
    rememberInMemory(ticker, dbHit, "db", HIT_TTL_MS);
    return dbHit;
  }

  const provider = getMarketProvider();
  let resolved: Sector | null = null;
  let source: SectorSource = "static";
  if (provider.getSector) {
    try {
      const raw = await provider.getSector(ticker);
      const normalized = normalizeProviderSector(raw);
      if (normalized) {
        resolved = normalized;
        source = "provider";
      }
    } catch (err) {
      logger.warn({ err, ticker }, "sectorResolver: provider getSector failed");
    }
  }

  if (!resolved) {
    const staticHit = sectorForTicker(ticker);
    if (staticHit !== UNCLASSIFIED_SECTOR) {
      resolved = staticHit;
      source = "static";
    }
  }

  if (resolved) {
    rememberInMemory(ticker, resolved, source, HIT_TTL_MS);
    // Persist non-static hits so the DB cache can serve future cold starts;
    // skip writes for static fallbacks since the static table is always
    // available without a round-trip.
    if (source !== "static") {
      void writeDbCache(ticker, resolved, source);
    }
    return resolved;
  }

  // Genuine miss — memoize briefly so we don't re-poll the provider on
  // every render, but use a shorter TTL than hits so newly-listed tickers
  // get re-tried within the day.
  rememberInMemory(ticker, UNCLASSIFIED_SECTOR, "static", MISS_TTL_MS);
  return UNCLASSIFIED_SECTOR;
}

/**
 * Resolve sectors for a batch of tickers in parallel. The returned record
 * is keyed by the *uppercased* ticker so callers can look up using the
 * same normalization the rest of the code uses.
 */
export async function getSectors(tickers: readonly string[]): Promise<Record<string, Sector>> {
  const out: Record<string, Sector> = {};
  const unique = Array.from(new Set(tickers.map(normalizeTicker).filter(Boolean)));
  await Promise.all(
    unique.map(async (t) => {
      out[t] = await getSector(t);
    }),
  );
  return out;
}

/** Test helper — drop the in-memory cache. */
export function _clearSectorCacheForTesting(): void {
  memCache.clear();
}
