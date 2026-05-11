import { Router, type IRouter } from "express";
import { db, scanSnapshotTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import {
  RunScanBody,
  RunScanResponse,
  GetLatestScanResponse,
  GetScanSummaryResponse,
} from "@workspace/api-zod";
import { getSettings } from "../lib/settingsStore";
import { runScreener, type CandidateOut, type ScanError, type ScanResultOut } from "../lib/screener";
import { clearMarketCache } from "../lib/market";
import {
  getCachedScan,
  setCachedScan,
  invalidateCachedScan,
} from "../lib/scanRunner";

const router: IRouter = Router();

async function loadLatestFromDb(): Promise<ScanResultOut> {
  const [row] = await db
    .select()
    .from(scanSnapshotTable)
    .orderBy(desc(scanSnapshotTable.scannedAt))
    .limit(1);
  if (!row) {
    return {
      scannedAt: null,
      candidates: [],
      errors: [],
      tickersScanned: 0,
      tickersWithCandidate: 0,
      cached: false,
      stale: false,
    };
  }
  // Mirror the in-memory cache TTL when serving DB-backed snapshots: if the
  // stored snapshot is older than `cacheTtlMinutes`, treat it as stale (the
  // scannedAt timestamp still flows through so the UI's freshness indicator
  // is honest).
  const settings = await getSettings();
  const ageMs = Date.now() - row.scannedAt.getTime();
  const isStale = ageMs > settings.cacheTtlMinutes * 60 * 1000;
  return {
    scannedAt: row.scannedAt.toISOString(),
    candidates: row.candidates as CandidateOut[],
    errors: row.errors as ScanError[],
    tickersScanned: row.tickersScanned,
    tickersWithCandidate: row.tickersWithCandidate,
    cached: !isStale,
    stale: isStale,
  };
}

router.post("/scan", async (req, res): Promise<void> => {
  const parsed = RunScanBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const overrides = parsed.data;
  const baseSettings = await getSettings();
  const cfg = {
    ...baseSettings,
    ...(overrides.tickers ? { tickers: overrides.tickers.map((t) => t.toUpperCase()) } : {}),
    ...(overrides.minDte != null ? { minDte: overrides.minDte } : {}),
    ...(overrides.maxDte != null ? { maxDte: overrides.maxDte } : {}),
    ...(overrides.targetDelta != null ? { targetDelta: overrides.targetDelta } : {}),
    ...(overrides.minDelta != null ? { minDelta: overrides.minDelta } : {}),
    ...(overrides.maxDelta != null ? { maxDelta: overrides.maxDelta } : {}),
    ...(overrides.minOpenInterest != null ? { minOpenInterest: overrides.minOpenInterest } : {}),
    ...(overrides.minBid != null ? { minBid: overrides.minBid } : {}),
    ...(overrides.minUnderlyingPrice != null ? { minUnderlyingPrice: overrides.minUnderlyingPrice } : {}),
    ...(overrides.riskFreeRate != null ? { riskFreeRate: overrides.riskFreeRate } : {}),
    ...(overrides.topN != null ? { topN: overrides.topN } : {}),
  };

  // Cross-field invariants when overrides are supplied.
  if (cfg.minDte > cfg.maxDte) {
    res.status(400).json({ error: "minDte must be <= maxDte" });
    return;
  }
  if (cfg.minDelta > cfg.maxDelta) {
    res.status(400).json({ error: "minDelta must be <= maxDelta" });
    return;
  }
  if (cfg.targetDelta < cfg.minDelta || cfg.targetDelta > cfg.maxDelta) {
    res.status(400).json({ error: "targetDelta must be within [minDelta, maxDelta]" });
    return;
  }

  if (overrides.forceRefresh) clearMarketCache();

  // Use in-memory TTL when no overrides and not forced.
  const isPlain =
    !overrides.tickers &&
    overrides.minDte == null &&
    overrides.maxDte == null &&
    overrides.targetDelta == null &&
    overrides.minDelta == null &&
    overrides.maxDelta == null &&
    overrides.minOpenInterest == null &&
    overrides.minBid == null &&
    overrides.minUnderlyingPrice == null &&
    overrides.riskFreeRate == null &&
    overrides.topN == null;
  const cached = getCachedScan();
  if (isPlain && !overrides.forceRefresh && cached) {
    res.json(RunScanResponse.parse({ ...cached.result, cached: true, stale: false }));
    return;
  }

  const result = await runScreener(cfg);

  if (isPlain) {
    setCachedScan(result, cfg.cacheTtlMinutes * 60 * 1000);
    // Best-effort persistence — do not fail the response if the DB hiccups.
    try {
      await db.insert(scanSnapshotTable).values({
        scannedAt: result.scannedAt ? new Date(result.scannedAt) : new Date(),
        candidates: result.candidates,
        errors: result.errors,
        tickersScanned: result.tickersScanned,
        tickersWithCandidate: result.tickersWithCandidate,
      });
    } catch (err) {
      req.log.warn({ err }, "failed to persist scan snapshot");
    }
  } else if (overrides.forceRefresh) {
    // A forced refresh on a custom-config scan still invalidates any stale
    // cached plain-config snapshot to avoid serving outdated data afterward.
    invalidateCachedScan();
  }

  res.json(RunScanResponse.parse(result));
});

router.get("/scan/latest", async (_req, res): Promise<void> => {
  const cached = getCachedScan();
  if (cached) {
    res.json(GetLatestScanResponse.parse({ ...cached.result, cached: true, stale: false }));
    return;
  }
  const latest = await loadLatestFromDb();
  res.json(GetLatestScanResponse.parse(latest));
});

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1]! + s[m]!) / 2 : s[m]!;
}

router.get("/scan/summary", async (_req, res): Promise<void> => {
  const cached = getCachedScan();
  const latest = cached?.result ?? (await loadLatestFromDb());
  const cands = latest.candidates;
  const annualized = cands.map((c) => c.annualizedPct);
  const buckets = [
    { label: "0-20", count: 0 },
    { label: "20-40", count: 0 },
    { label: "40-60", count: 0 },
    { label: "60-80", count: 0 },
    { label: "80-100", count: 0 },
  ];
  for (const c of cands) {
    if (c.ivRank == null) continue;
    const pct = c.ivRank * 100;
    const idx = Math.min(4, Math.floor(pct / 20));
    buckets[idx]!.count += 1;
  }
  const summary = {
    scannedAt: cands.length > 0 ? latest.scannedAt : null,
    candidateCount: cands.length,
    earningsFlaggedCount: cands.filter((c) => c.earningsInWindow).length,
    avgAnnualizedPct: annualized.length
      ? annualized.reduce((a, b) => a + b, 0) / annualized.length
      : 0,
    medianAnnualizedPct: median(annualized),
    maxAnnualizedPct: annualized.length ? Math.max(...annualized) : 0,
    totalCollateral: cands.reduce((s, c) => s + c.collateralPerContract, 0),
    totalPremium: cands.reduce((s, c) => s + c.premiumPerContract, 0),
    ivRankBuckets: buckets,
    topTickers: [...cands].sort((a, b) => b.annualizedPct - a.annualizedPct).slice(0, 5),
  };
  res.json(GetScanSummaryResponse.parse(summary));
});

export default router;
