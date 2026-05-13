import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { ScreenerSettings } from "./screener";
import { setCacheTtlMinutes, clearMarketCache } from "./market";

// Listeners notified whenever settings are saved. The /scan route registers
// here to drop its in-memory cached snapshot so the next call rebuilds with
// the new parameters.
type SettingsListener = (s: ScreenerSettings) => void;
const listeners = new Set<SettingsListener>();
export function onSettingsSaved(fn: SettingsListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const DEFAULT_SETTINGS: ScreenerSettings = {
  tickers: [
    "AAPL", "MSFT", "GOOGL", "AMZN", "META",
    "NVDA", "AMD", "INTC", "TSLA",
    "JPM", "BAC", "WFC",
    "KO", "PEP", "WMT", "COST",
    "F", "GM",
    "XOM", "CVX",
    "PFE", "JNJ", "MRK",
    "DIS", "NFLX",
    "T", "VZ",
    "SOFI", "PLTR", "SNAP",
  ],
  minDte: 25,
  maxDte: 50,
  targetDelta: 0.25,
  minDelta: 0.15,
  maxDelta: 0.35,
  minOpenInterest: 100,
  minBid: 0.1,
  minUnderlyingPrice: 5.0,
  riskFreeRate: 0.045,
  topN: 20,
  cacheTtlMinutes: 15,
  concentration: {
    tickerPct: 0.15,
    sectorPct: 0.30,
  },
  earningsInWindow: "hide",
};

export async function getSettings(): Promise<ScreenerSettings> {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.id, 1));
  const row = rows[0];
  if (!row) {
    await db.insert(settingsTable).values({ id: 1, ...flatten(DEFAULT_SETTINGS) });
    setCacheTtlMinutes(DEFAULT_SETTINGS.cacheTtlMinutes);
    return DEFAULT_SETTINGS;
  }
  const settings: ScreenerSettings = {
    tickers: row.tickers,
    minDte: row.minDte,
    maxDte: row.maxDte,
    targetDelta: row.targetDelta,
    minDelta: row.minDelta,
    maxDelta: row.maxDelta,
    minOpenInterest: row.minOpenInterest,
    minBid: row.minBid,
    minUnderlyingPrice: row.minUnderlyingPrice,
    riskFreeRate: row.riskFreeRate,
    topN: row.topN,
    cacheTtlMinutes: row.cacheTtlMinutes,
    concentration: {
      tickerPct: row.concentrationTickerPct,
      sectorPct: row.concentrationSectorPct,
    },
    earningsInWindow:
      row.earningsInWindow === "only" || row.earningsInWindow === "include"
        ? row.earningsInWindow
        : "hide",
  };
  setCacheTtlMinutes(settings.cacheTtlMinutes);
  return settings;
}

function flatten(s: ScreenerSettings) {
  const { concentration, ...rest } = s;
  return {
    ...rest,
    concentrationTickerPct: concentration.tickerPct,
    concentrationSectorPct: concentration.sectorPct,
  };
}

export async function saveSettings(s: ScreenerSettings): Promise<ScreenerSettings> {
  const flat = flatten(s);
  await db
    .insert(settingsTable)
    .values({ id: 1, ...flat })
    .onConflictDoUpdate({
      target: settingsTable.id,
      set: { ...flat, updatedAt: new Date() },
    });
  setCacheTtlMinutes(s.cacheTtlMinutes);
  // Settings changed → invalidate market & scan caches so subsequent scans
  // reflect the new parameters immediately.
  clearMarketCache();
  for (const fn of listeners) {
    try {
      fn(s);
    } catch {
      /* listener errors must not break saves */
    }
  }
  return s;
}
