import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { ScreenerSettings } from "./screener";
import { setCacheTtlMinutes } from "./market";

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
};

export async function getSettings(): Promise<ScreenerSettings> {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.id, 1));
  const row = rows[0];
  if (!row) {
    await db.insert(settingsTable).values({ id: 1, ...DEFAULT_SETTINGS });
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
  };
  setCacheTtlMinutes(settings.cacheTtlMinutes);
  return settings;
}

export async function saveSettings(s: ScreenerSettings): Promise<ScreenerSettings> {
  await db
    .insert(settingsTable)
    .values({ id: 1, ...s })
    .onConflictDoUpdate({
      target: settingsTable.id,
      set: { ...s, updatedAt: new Date() },
    });
  setCacheTtlMinutes(s.cacheTtlMinutes);
  return s;
}
