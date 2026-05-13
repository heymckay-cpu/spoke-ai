import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { ScreenerSettings } from "./screener";
import { setCacheTtlMinutes, clearMarketCache } from "./market";
import { defaultTier } from "./tierStore";

type SettingsListener = (s: ScreenerSettings, userId: string) => void;
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

export async function getSettings(userId: string): Promise<ScreenerSettings> {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.userId, userId));
  const row = rows[0];
  if (!row) {
    // Lazy-seed the user's row with defaults on first read.
    await db
      .insert(settingsTable)
      .values({ userId, ...flatten(DEFAULT_SETTINGS), tier: defaultTier() });
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

export async function saveSettings(userId: string, s: ScreenerSettings): Promise<ScreenerSettings> {
  const flat = flatten(s);
  await db
    .insert(settingsTable)
    .values({ userId, ...flat, tier: defaultTier() })
    .onConflictDoUpdate({
      target: settingsTable.userId,
      set: { ...flat, updatedAt: new Date() },
    });
  setCacheTtlMinutes(s.cacheTtlMinutes);
  clearMarketCache();
  for (const fn of listeners) {
    try {
      fn(s, userId);
    } catch {
      /* listener errors must not break saves */
    }
  }
  return s;
}
