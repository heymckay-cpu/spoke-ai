// Market data layer wrapping yahoo-finance2 with an in-memory TTL cache.
import YahooFinance from "yahoo-finance2";
import { logger } from "./logger";

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey", "ripHistorical"],
});

export interface OptionRow {
  strike: number;
  bid: number;
  ask: number;
  lastPrice: number;
  impliedVolatility: number;
  openInterest: number;
  volume: number;
  inTheMoney: boolean;
}

export interface OptionChainSnapshot {
  ticker: string;
  spot: number;
  expiry: string; // YYYY-MM-DD
  dte: number;
  puts: OptionRow[];
  calls: OptionRow[];
}

export interface QuoteInfo {
  ticker: string;
  spot: number;
  asOf: string;
  earningsDate: string | null;
  name: string | null;
  currency: string | null;
  dayChange: number | null;
  dayChangePct: number | null;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
let cacheTtlMs = 15 * 60 * 1000;

export function setCacheTtlMinutes(min: number): void {
  cacheTtlMs = Math.max(1, min) * 60 * 1000;
}

export function clearMarketCache(): void {
  cache.clear();
}

function getCached<T>(key: string): T | null {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() > e.expiresAt) {
    cache.delete(key);
    return null;
  }
  return e.value as T;
}

function setCached<T>(key: string, value: T, ttlMs = cacheTtlMs): void {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function toIsoDate(d: Date): string {
  // YYYY-MM-DD in UTC (yahoo expirations are at UTC midnight)
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

export async function getQuote(ticker: string): Promise<QuoteInfo | null> {
  const key = `quote_${ticker}`;
  const cached = getCached<QuoteInfo>(key);
  if (cached) return cached;
  try {
    const q = await yahooFinance.quote(ticker);
    if (!q || typeof q.regularMarketPrice !== "number") return null;
    let earningsDate: string | null = null;
    try {
      const summary = await yahooFinance.quoteSummary(ticker, {
        modules: ["calendarEvents"],
      });
      const eRaw = summary.calendarEvents?.earnings?.earningsDate;
      const first = Array.isArray(eRaw) ? eRaw[0] : eRaw;
      if (first instanceof Date) earningsDate = toIsoDate(first);
    } catch {
      /* earnings optional */
    }
    const info: QuoteInfo = {
      ticker,
      spot: q.regularMarketPrice,
      asOf: new Date().toISOString(),
      earningsDate,
      name: q.shortName ?? q.longName ?? null,
      currency: q.currency ?? null,
      dayChange: q.regularMarketChange ?? null,
      dayChangePct: q.regularMarketChangePercent ?? null,
    };
    setCached(key, info);
    return info;
  } catch (err) {
    logger.warn({ err, ticker }, "failed to fetch quote");
    return null;
  }
}

export async function getSpot(ticker: string): Promise<number | null> {
  const q = await getQuote(ticker);
  return q?.spot ?? null;
}

interface OptionContract {
  strike: number;
  bid?: number;
  ask?: number;
  lastPrice?: number;
  impliedVolatility?: number;
  openInterest?: number;
  volume?: number;
  inTheMoney?: boolean;
}

function normalizeRows(rows: OptionContract[] | undefined): OptionRow[] {
  if (!rows) return [];
  return rows.map((r) => ({
    strike: Number(r.strike),
    bid: Number(r.bid ?? 0),
    ask: Number(r.ask ?? 0),
    lastPrice: Number(r.lastPrice ?? 0),
    impliedVolatility: Number(r.impliedVolatility ?? 0),
    openInterest: Number(r.openInterest ?? 0),
    volume: Number(r.volume ?? 0),
    inTheMoney: Boolean(r.inTheMoney),
  }));
}

export async function getExpirations(ticker: string): Promise<string[]> {
  const key = `exp_${ticker}`;
  const cached = getCached<string[]>(key);
  if (cached) return cached;
  try {
    const res = await yahooFinance.options(ticker);
    const exps = (res.expirationDates ?? [])
      .map((d) => (d instanceof Date ? toIsoDate(d) : null))
      .filter((d): d is string => d !== null);
    setCached(key, exps);
    return exps;
  } catch (err) {
    logger.warn({ err, ticker }, "failed to fetch expirations");
    return [];
  }
}

export async function getOptionChain(
  ticker: string,
  expiry: string,
): Promise<OptionChainSnapshot | null> {
  const key = `chain_${ticker}_${expiry}`;
  const cached = getCached<OptionChainSnapshot>(key);
  if (cached) return cached;
  try {
    const expDate = new Date(`${expiry}T00:00:00Z`);
    const [chain, spot] = await Promise.all([
      yahooFinance.options(ticker, { date: expDate }),
      getSpot(ticker),
    ]);
    if (spot == null) return null;
    const first = chain.options?.[0];
    if (!first) return null;
    const today = new Date();
    const dte = Math.max(0, daysBetween(today, expDate));
    const snap: OptionChainSnapshot = {
      ticker,
      spot,
      expiry,
      dte,
      puts: normalizeRows(first.puts as OptionContract[] | undefined),
      calls: normalizeRows(first.calls as OptionContract[] | undefined),
    };
    setCached(key, snap);
    return snap;
  } catch (err) {
    logger.warn({ err, ticker, expiry }, "failed to fetch option chain");
    return null;
  }
}

export async function getIvHistoryProxy(
  ticker: string,
): Promise<{ current: number; min: number; max: number } | null> {
  const key = `hv_${ticker}`;
  const cached = getCached<{ current: number; min: number; max: number }>(key);
  if (cached) return cached;
  try {
    const today = new Date();
    const start = new Date(today);
    start.setFullYear(start.getFullYear() - 2);
    const result = await yahooFinance.chart(ticker, {
      period1: start,
      period2: today,
      interval: "1d",
    });
    const closes = (result.quotes ?? [])
      .map((q) => q.close)
      .filter((c): c is number => typeof c === "number" && Number.isFinite(c));
    if (closes.length < 60) return null;
    const returns: number[] = [];
    for (let i = 1; i < closes.length; i++) {
      returns.push(closes[i]! / closes[i - 1]! - 1);
    }
    // 30-day rolling annualized realized vol.
    const window = 30;
    const hv: number[] = [];
    for (let i = window; i <= returns.length; i++) {
      const slice = returns.slice(i - window, i);
      const mean = slice.reduce((a, b) => a + b, 0) / window;
      const variance =
        slice.reduce((a, b) => a + (b - mean) ** 2, 0) / (window - 1);
      hv.push(Math.sqrt(variance) * Math.sqrt(252));
    }
    if (hv.length === 0) return null;
    // Last 252 trading days.
    const tail = hv.slice(-252);
    const stat = {
      current: tail[tail.length - 1]!,
      min: Math.min(...tail),
      max: Math.max(...tail),
    };
    setCached(key, stat, 60 * 60 * 1000); // hv cached for 1h
    return stat;
  } catch (err) {
    logger.warn({ err, ticker }, "failed to fetch HV");
    return null;
  }
}
