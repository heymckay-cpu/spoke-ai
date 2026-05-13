// Market data layer wrapping yahoo-finance2 with a disk-backed TTL cache.
// Mirrors the requests-cache behavior of the Python reference implementation:
// entries persist across restarts, so a fresh process avoids hammering Yahoo
// for option chains it already fetched within the TTL window.
import * as fs from "node:fs";
import * as path from "node:path";
import YahooFinance from "yahoo-finance2";
import { logger } from "./logger";

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey", "ripHistorical"],
});

// Provider abstraction: every market call in this file goes through the
// `provider` binding below. Methods are bound to their owner so consumers
// don't need to know about the underlying instance. To swap providers
// (e.g. polygon, tradier), implement an adapter exposing the same four
// methods and call `setMarketProvider(adapter)`. The disk cache layer below
// is provider-agnostic.
export interface MarketProvider {
  quote: (...args: Parameters<typeof yahooFinance.quote>) => ReturnType<typeof yahooFinance.quote>;
  quoteSummary: (
    ...args: Parameters<typeof yahooFinance.quoteSummary>
  ) => ReturnType<typeof yahooFinance.quoteSummary>;
  options: (
    ...args: Parameters<typeof yahooFinance.options>
  ) => ReturnType<typeof yahooFinance.options>;
  chart: (...args: Parameters<typeof yahooFinance.chart>) => ReturnType<typeof yahooFinance.chart>;
  // Optional: return the upstream provider's free-form sector string for
  // a given ticker (e.g. Yahoo's "Technology", Polygon's mapped SIC band).
  // The sectorResolver layer normalizes the result; providers that don't
  // expose this info simply omit the method.
  getSector?: (ticker: string) => Promise<string | null>;
}

async function yahooGetSector(yf: typeof yahooFinance, ticker: string): Promise<string | null> {
  try {
    const raw = await yf.quoteSummary(ticker, { modules: ["assetProfile"] });
    const profile = (raw as { assetProfile?: { sector?: string | null } }).assetProfile;
    return profile?.sector ?? null;
  } catch {
    return null;
  }
}

function adaptYahoo(yf: typeof yahooFinance): MarketProvider {
  return {
    quote: yf.quote.bind(yf),
    quoteSummary: yf.quoteSummary.bind(yf),
    options: yf.options.bind(yf),
    chart: yf.chart.bind(yf),
    getSector: (ticker) => yahooGetSector(yf, ticker),
  };
}

let provider: MarketProvider = adaptYahoo(yahooFinance);
// Tracks whether the active provider serves live (real-time or near-real-
// time) quotes. Yahoo zeros bid/ask after hours and is delayed during
// hours, so we treat it as non-live; adapters like Polygon/Tradier set
// this to true so the chain route can skip the bid/IV ratio heuristic
// during market hours.
let providerIsLive = false;
// Human-readable name of the active provider, surfaced via /healthz so
// the dashboard can show users which feed is powering their numbers.
let providerName = "yahoo";

export function setMarketProvider(
  p: MarketProvider,
  opts: { live?: boolean; name?: string } = {},
): void {
  provider = p;
  providerIsLive = Boolean(opts.live);
  if (opts.name) providerName = opts.name;
}

export function getMarketProvider(): MarketProvider {
  return provider;
}

export function isLiveProvider(): boolean {
  return providerIsLive;
}

export function getProviderName(): string {
  return providerName;
}

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
  // ISO timestamp captured when the chain was actually fetched from the
  // upstream provider. Surfaced to clients so the chain page can render a
  // "Data as of …" indicator and warn when bid/IV are likely stale.
  fetchedAt: string;
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

const CACHE_DIR = process.env.MARKET_CACHE_DIR ?? path.join(process.cwd(), ".cache");
const CACHE_FILE = path.join(CACHE_DIR, "market-cache.json");

const cache = new Map<string, CacheEntry<unknown>>();
let cacheTtlMs = 15 * 60 * 1000;
let flushTimer: NodeJS.Timeout | null = null;

function loadDiskCache(): void {
  try {
    if (!fs.existsSync(CACHE_FILE)) return;
    const raw = fs.readFileSync(CACHE_FILE, "utf-8");
    const obj = JSON.parse(raw) as Record<string, CacheEntry<unknown>>;
    const now = Date.now();
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v.expiresAt === "number" && v.expiresAt > now) {
        cache.set(k, v);
      }
    }
    logger.info({ entries: cache.size, file: CACHE_FILE }, "loaded market cache from disk");
  } catch (err) {
    logger.warn({ err }, "failed to load market cache from disk");
  }
}

function flushDiskCache(): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const obj: Record<string, CacheEntry<unknown>> = {};
    const now = Date.now();
    for (const [k, v] of cache.entries()) {
      if (v.expiresAt > now) obj[k] = v;
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(obj));
  } catch (err) {
    logger.warn({ err }, "failed to flush market cache to disk");
  }
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushDiskCache();
  }, 1000);
}

loadDiskCache();

export function setCacheTtlMinutes(min: number): void {
  cacheTtlMs = Math.max(1, min) * 60 * 1000;
}

export function clearMarketCache(): void {
  cache.clear();
  scheduleFlush();
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
  scheduleFlush();
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
    const qRaw = await provider.quote(ticker);
    const q = qRaw as {
      regularMarketPrice?: number;
      shortName?: string;
      longName?: string;
      currency?: string;
      regularMarketChange?: number;
      regularMarketChangePercent?: number;
    };
    if (!q || typeof q.regularMarketPrice !== "number") return null;
    let earningsDate: string | null = null;
    try {
      const summaryRaw = await provider.quoteSummary(ticker, {
        modules: ["calendarEvents"],
      });
      const summary = summaryRaw as {
        calendarEvents?: { earnings?: { earningsDate?: Date | Date[] } };
      };
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
    const resRaw = await provider.options(ticker);
    const res = resRaw as { expirationDates?: Array<Date | number> };
    const exps = (res.expirationDates ?? [])
      .map((d: Date | number) => {
        if (d instanceof Date) return toIsoDate(d);
        // Defensively handle epoch numbers (seconds or millis) in case the
        // provider returns raw timestamps in some environments.
        if (typeof d === "number" && Number.isFinite(d)) {
          const ms = d > 1e12 ? d : d * 1000;
          return toIsoDate(new Date(ms));
        }
        return null;
      })
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
    const [chainRaw, spot] = await Promise.all([
      provider.options(ticker, { date: expDate }),
      getSpot(ticker),
    ]);
    if (spot == null) return null;
    const chain = chainRaw as { options?: Array<{ puts?: unknown[]; calls?: unknown[] }> };
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
      fetchedAt: new Date().toISOString(),
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
    const resultRaw = await provider.chart(ticker, {
      period1: start,
      period2: today,
      interval: "1d",
    });
    const result = resultRaw as { quotes?: Array<{ close?: number | null }> };
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
