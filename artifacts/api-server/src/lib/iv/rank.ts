// Real IV Rank / IV Percentile from a stored 52-week IV snapshot history.
//
// IV Rank      = (currentIv - minIv) / (maxIv - minIv) over the trailing 52 weeks
// IV Percentile = share of days in the trailing 52 weeks where iv <= currentIv
//
// We need at least `MIN_HISTORY_DAYS` snapshots before we trust the result;
// below that threshold callers should fall back to the realized-vol proxy and
// label the value as "provisional" in the UI.
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, ivSnapshotsTable } from "@workspace/db";

export const MIN_HISTORY_DAYS = 20;
// 52 calendar weeks. Snapshots only land on days the job runs (typically
// trading days), so capping at MAX_HISTORY_ROWS prevents an unusually dense
// backfill from blowing past ~252 trading days.
export const WINDOW_DAYS = 365;
export const MAX_HISTORY_ROWS = 252;

export type IvBasis = "real" | "provisional";

export interface IvRankResult {
  value: number | null;
  basis: IvBasis;
  sampleSize: number;
}

function isoDateNDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export async function loadIvHistory(
  ticker: string,
  windowDays: number = WINDOW_DAYS,
): Promise<number[]> {
  const cutoff = isoDateNDaysAgo(windowDays);
  const rows = await db
    .select({ iv30d: ivSnapshotsTable.iv30d })
    .from(ivSnapshotsTable)
    .where(and(eq(ivSnapshotsTable.ticker, ticker), gte(ivSnapshotsTable.date, cutoff)))
    .orderBy(desc(ivSnapshotsTable.date))
    .limit(MAX_HISTORY_ROWS);
  return rows
    .map((r) => Number(r.iv30d))
    .filter((v) => Number.isFinite(v) && v > 0);
}

export function rankFromHistory(history: number[], currentIv: number): number | null {
  if (!Number.isFinite(currentIv) || history.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const v of history) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  // Make sure currentIv participates so a fresh outlier still produces a
  // sensible 0 or 1 rather than NaN / >1.
  if (currentIv < min) min = currentIv;
  if (currentIv > max) max = currentIv;
  if (max - min < 1e-9) return null;
  return Math.max(0, Math.min(1, (currentIv - min) / (max - min)));
}

export function percentileFromHistory(history: number[], currentIv: number): number | null {
  if (!Number.isFinite(currentIv) || history.length === 0) return null;
  let leq = 0;
  for (const v of history) if (v <= currentIv) leq += 1;
  return leq / history.length;
}

export async function computeIvRank(
  ticker: string,
  currentIv: number,
): Promise<IvRankResult> {
  const history = await loadIvHistory(ticker);
  if (history.length < MIN_HISTORY_DAYS) {
    return { value: null, basis: "provisional", sampleSize: history.length };
  }
  return {
    value: rankFromHistory(history, currentIv),
    basis: "real",
    sampleSize: history.length,
  };
}

export async function computeIvPercentile(
  ticker: string,
  currentIv: number,
): Promise<IvRankResult> {
  const history = await loadIvHistory(ticker);
  if (history.length < MIN_HISTORY_DAYS) {
    return { value: null, basis: "provisional", sampleSize: history.length };
  }
  return {
    value: percentileFromHistory(history, currentIv),
    basis: "real",
    sampleSize: history.length,
  };
}

export interface IvSnapshotPoint {
  date: string;
  iv: number;
}

export async function loadIvSeries(
  ticker: string,
  windowDays: number = WINDOW_DAYS,
): Promise<IvSnapshotPoint[]> {
  const cutoff = isoDateNDaysAgo(windowDays);
  // Pull the most recent MAX_HISTORY_ROWS rows within the calendar window,
  // then sort ascending for plotting.
  const rows = await db
    .select({ date: ivSnapshotsTable.date, iv30d: ivSnapshotsTable.iv30d })
    .from(ivSnapshotsTable)
    .where(and(eq(ivSnapshotsTable.ticker, ticker), gte(ivSnapshotsTable.date, cutoff)))
    .orderBy(desc(ivSnapshotsTable.date))
    .limit(MAX_HISTORY_ROWS);
  return rows
    .map((r) => ({ date: String(r.date), iv: Number(r.iv30d) }))
    .filter((p) => Number.isFinite(p.iv) && p.iv > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Idempotent upsert keyed on (ticker, date) — re-running on the same day
 * overwrites that row instead of duplicating.
 */
export async function upsertIvSnapshot(
  ticker: string,
  iv30d: number,
  date: Date = new Date(),
): Promise<void> {
  if (!Number.isFinite(iv30d) || iv30d <= 0) return;
  const isoDate = date.toISOString().slice(0, 10);
  await db
    .insert(ivSnapshotsTable)
    .values({ ticker, date: isoDate, iv30d })
    .onConflictDoUpdate({
      target: [ivSnapshotsTable.ticker, ivSnapshotsTable.date],
      set: { iv30d: sql`excluded.iv_30d` },
    });
}
