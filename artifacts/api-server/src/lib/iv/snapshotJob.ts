// Daily ATM-IV snapshot job. Pulls the at-the-money 30-day implied
// volatility for every ticker that's relevant to the user (recent scans,
// open positions, current holdings) and upserts one row per ticker per
// day into iv_snapshots. The unique (ticker, date) index makes
// re-running on the same day idempotent.
import { desc, isNull } from "drizzle-orm";
import {
  db,
  scanSnapshotTable,
  positionsTable,
  holdingsTable,
} from "@workspace/db";
import {
  getExpirations,
  getOptionChain,
  type OptionChainSnapshot,
  type OptionRow,
} from "../market";
import { logger } from "../logger";
import { upsertIvSnapshot } from "./rank";

const RECENT_SCAN_COUNT = 10;

interface CandidateTickerLite {
  ticker?: string;
}

export async function collectTrackedTickers(): Promise<string[]> {
  const set = new Set<string>();
  try {
    const recent = await db
      .select({ candidates: scanSnapshotTable.candidates })
      .from(scanSnapshotTable)
      .orderBy(desc(scanSnapshotTable.scannedAt))
      .limit(RECENT_SCAN_COUNT);
    for (const row of recent) {
      const cs = (row.candidates ?? []) as CandidateTickerLite[];
      for (const c of cs) {
        if (c?.ticker) set.add(c.ticker.toUpperCase());
      }
    }
  } catch (err) {
    logger.warn({ err }, "iv-snapshot: failed to load recent scan tickers");
  }
  try {
    const open = await db
      .select({ ticker: positionsTable.ticker })
      .from(positionsTable)
      .where(isNull(positionsTable.closedAt));
    for (const r of open) set.add(r.ticker.toUpperCase());
  } catch (err) {
    logger.warn({ err }, "iv-snapshot: failed to load open positions");
  }
  try {
    const hs = await db.select({ ticker: holdingsTable.ticker }).from(holdingsTable);
    for (const r of hs) set.add(r.ticker.toUpperCase());
  } catch (err) {
    logger.warn({ err }, "iv-snapshot: failed to load holdings");
  }
  // Include the full configured screener universe so we collect history for
  // every ticker that gets scanned, not only those that yielded a candidate.
  // Per-user screener tickers are not available here; the set above is sufficient.
  return Array.from(set);
}

/**
 * Find the option-chain expiration whose DTE is closest to 30 days.
 */
export function pickTargetExpiry(expirations: string[], today: Date = new Date()): string | null {
  if (expirations.length === 0) return null;
  const todayMs = today.getTime();
  let best: { exp: string; diff: number } | null = null;
  for (const exp of expirations) {
    const t = Date.parse(`${exp}T00:00:00Z`);
    if (!Number.isFinite(t)) continue;
    const dte = (t - todayMs) / (24 * 60 * 60 * 1000);
    if (dte < 7) continue; // skip expirations that are too close to expiry
    const diff = Math.abs(dte - 30);
    if (best === null || diff < best.diff) best = { exp, diff };
  }
  return best?.exp ?? null;
}

/**
 * Average the IV of the call and put nearest the spot, weighted nothing
 * fancy. Returns null if neither side yields a usable IV.
 */
export function atmIvFromChain(snap: OptionChainSnapshot): number | null {
  const pickNearest = (rows: OptionRow[]): OptionRow | null => {
    let best: { row: OptionRow; dist: number } | null = null;
    for (const row of rows) {
      const iv = row.impliedVolatility ?? 0;
      if (!Number.isFinite(iv) || iv <= 0.01) continue;
      const dist = Math.abs(row.strike - snap.spot);
      if (best === null || dist < best.dist) best = { row, dist };
    }
    return best?.row ?? null;
  };
  const call = pickNearest(snap.calls);
  const put = pickNearest(snap.puts);
  const ivs: number[] = [];
  if (call) ivs.push(call.impliedVolatility);
  if (put) ivs.push(put.impliedVolatility);
  if (ivs.length === 0) return null;
  return ivs.reduce((a, b) => a + b, 0) / ivs.length;
}

/**
 * Skip weekends so the trailing snapshot history only contains
 * trading-day rows — important so the `real` IV-rank threshold of 20
 * snapshots equals ~20 trading days, not ~20 calendar days.
 */
export function isTradingDay(d: Date): boolean {
  const day = d.getUTCDay();
  return day !== 0 && day !== 6;
}

export async function snapshotTicker(ticker: string, today: Date = new Date()): Promise<boolean> {
  if (!isTradingDay(today)) return false;
  try {
    const exps = await getExpirations(ticker);
    const exp = pickTargetExpiry(exps, today);
    if (!exp) return false;
    const snap = await getOptionChain(ticker, exp);
    if (!snap) return false;
    const iv = atmIvFromChain(snap);
    if (iv == null) return false;
    await upsertIvSnapshot(ticker, iv, today);
    return true;
  } catch (err) {
    logger.warn({ err, ticker }, "iv-snapshot: failed to snapshot ticker");
    return false;
  }
}

export interface RunIvSnapshotResult {
  attempted: number;
  succeeded: number;
}

export async function runIvSnapshotJob(): Promise<RunIvSnapshotResult> {
  const tickers = await collectTrackedTickers();
  let succeeded = 0;
  // Bounded concurrency so we don't blast the upstream provider.
  const concurrency = 3;
  let idx = 0;
  async function worker() {
    while (idx < tickers.length) {
      const i = idx++;
      const t = tickers[i];
      if (!t) continue;
      const ok = await snapshotTicker(t);
      if (ok) succeeded += 1;
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  logger.info({ attempted: tickers.length, succeeded }, "iv-snapshot job complete");
  return { attempted: tickers.length, succeeded };
}

let timer: NodeJS.Timeout | null = null;
let running = false;

function intervalMinutes(): number {
  // Default to once a day — the upsert is idempotent so repeated runs are
  // safe, but we don't need to hammer the upstream provider hourly.
  // Override with IV_SNAPSHOT_INTERVAL_MIN for tests / on-demand cadence.
  const raw = process.env["IV_SNAPSHOT_INTERVAL_MIN"];
  const n = raw ? Number(raw) : 60 * 24;
  return Number.isFinite(n) && n > 0 ? n : 60 * 24;
}

export function startIvSnapshotScheduler(): void {
  if (timer) return;
  if (process.env["IV_SNAPSHOT_DISABLED"] === "1") {
    logger.info("iv-snapshot scheduler disabled via IV_SNAPSHOT_DISABLED");
    return;
  }
  const min = intervalMinutes();
  timer = setInterval(() => {
    if (running) return;
    running = true;
    void runIvSnapshotJob()
      .catch((err) => logger.warn({ err }, "iv-snapshot job threw"))
      .finally(() => {
        running = false;
      });
  }, min * 60 * 1000);
  if (typeof timer.unref === "function") timer.unref();
  logger.info({ intervalMinutes: min }, "iv-snapshot scheduler started");
  // Kick off an immediate run so a fresh process gets today's row promptly.
  setTimeout(() => {
    if (running) return;
    running = true;
    void runIvSnapshotJob()
      .catch((err) => logger.warn({ err }, "iv-snapshot job threw"))
      .finally(() => {
        running = false;
      });
  }, 5_000).unref?.();
}

export function stopIvSnapshotScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
