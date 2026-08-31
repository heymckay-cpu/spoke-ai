// Aggregates Quiver's raw alternative-data feeds into a compact per-ticker
// "signals" summary for the candidate drawer and (later) the AI explainer.
//
// Honesty rules baked into this module:
//  - Congressional trades are disclosed up to 45 days after the trade
//    (STOCK Act), and insider filings ~2 business days after. Every trade we
//    surface carries its disclosure lag so the UI can say "traded X, we
//    learned about it Y days later". These are confirmation/filter signals,
//    not real-time alpha.
//  - The composite score is a transparent activity tilt (0..100, 50 =
//    neutral) computed from counts and dollar-weighted activity in the
//    lookback window. The formula lives in `computeScore` below and each
//    component's contribution is returned so the UI can show its work.
//
// Raw Quiver rows vary in field naming across datasets and over time, so
// every extractor reads defensively from a list of known key spellings and
// drops rows it cannot interpret.

import * as fs from "node:fs";
import * as path from "node:path";
import { logger } from "../logger";
import { isQuiverConfigured, quiverGetOrNull } from "./client";

export const CONGRESS_WINDOW_DAYS = 90;
export const CONTRACTS_WINDOW_DAYS = 365;
export const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // Quiver data is slow-moving.

export interface QuiverCongressTrade {
  name: string;
  chamber: string | null;
  party: string | null;
  transaction: "buy" | "sell";
  amountRange: string | null;
  tradeDate: string | null; // YYYY-MM-DD
  disclosedDate: string | null; // YYYY-MM-DD
  lagDays: number | null; // disclosedDate - tradeDate
}

export interface QuiverCongressSummary {
  buys: number;
  sells: number;
  lastTradeDate: string | null;
  medianLagDays: number | null;
  recent: QuiverCongressTrade[]; // newest first, capped
}

export interface QuiverInsiderSummary {
  buys: number;
  sells: number;
  boughtValue: number; // shares * price, USD, best-effort
  soldValue: number;
  lastActivityDate: string | null;
}

export interface QuiverAmountSummary {
  count: number;
  totalAmount: number;
  lastDate: string | null;
}

export interface QuiverScoreComponent {
  key: string;
  label: string;
  contribution: number; // signed points applied to the 50-neutral baseline
  detail: string;
}

export interface QuiverSignals {
  ticker: string;
  configured: boolean;
  fetchedAt: string | null;
  windowDays: number;
  congress: QuiverCongressSummary | null;
  insiders: QuiverInsiderSummary | null;
  govContracts: QuiverAmountSummary | null;
  lobbying: QuiverAmountSummary | null;
  score: number | null; // 0..100, 50 neutral; null when nothing loaded
  scoreComponents: QuiverScoreComponent[];
  notes: string[];
}

// ---------------------------------------------------------------------------
// Cache: memory + disk, mirroring the market.ts pattern so signals survive
// restarts without a DB migration. Keyed by ticker.

interface CacheEntry {
  value: QuiverSignals;
  expiresAt: number;
}

const CACHE_DIR = process.env.MARKET_CACHE_DIR ?? path.join(process.cwd(), ".cache");
const CACHE_FILE = path.join(CACHE_DIR, "quiver-cache.json");
const cache = new Map<string, CacheEntry>();
let flushTimer: NodeJS.Timeout | null = null;
let diskLoaded = false;

function loadDiskCache(): void {
  if (diskLoaded) return;
  diskLoaded = true;
  try {
    if (!fs.existsSync(CACHE_FILE)) return;
    const obj = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8")) as Record<
      string,
      CacheEntry
    >;
    const now = Date.now();
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v.expiresAt === "number" && v.expiresAt > now) cache.set(k, v);
    }
  } catch (err) {
    logger.warn({ err }, "quiver: failed to load cache from disk");
  }
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    try {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      const obj: Record<string, CacheEntry> = {};
      const now = Date.now();
      for (const [k, v] of cache.entries()) {
        if (v.expiresAt > now) obj[k] = v;
      }
      fs.writeFileSync(CACHE_FILE, JSON.stringify(obj));
    } catch (err) {
      logger.warn({ err }, "quiver: failed to flush cache to disk");
    }
  }, 1000);
}

export function clearQuiverCache(): void {
  cache.clear();
  scheduleFlush();
}

// ---------------------------------------------------------------------------
// Defensive field extraction

type Row = Record<string, unknown>;

function str(row: Row, keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return null;
}

function num(row: Row, keys: string[]): number | null {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const parsed = Number(v.replace(/[$,]/g, ""));
      if (Number.isFinite(parsed) && v.trim() !== "") return parsed;
    }
  }
  return null;
}

/** Normalize a date-ish string to YYYY-MM-DD, else null. */
function isoDate(raw: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b).getTime() - new Date(a).getTime()) / (24 * 60 * 60 * 1000),
  );
}

function withinDays(dateIso: string | null, days: number, now: Date): boolean {
  if (!dateIso) return false;
  const t = new Date(dateIso).getTime();
  return now.getTime() - t <= days * 24 * 60 * 60 * 1000 && t <= now.getTime() + 24 * 60 * 60 * 1000;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

// ---------------------------------------------------------------------------
// Per-dataset normalizers (exported for tests)

export function normalizeCongress(rows: Row[], now: Date): QuiverCongressSummary {
  const trades: QuiverCongressTrade[] = [];
  for (const row of rows) {
    const txRaw = str(row, ["Transaction", "transaction", "Type", "type"]);
    if (!txRaw) continue;
    const lower = txRaw.toLowerCase();
    const transaction: "buy" | "sell" | null = lower.includes("purchase")
      ? "buy"
      : lower.includes("sale") || lower.includes("sell")
        ? "sell"
        : null;
    if (!transaction) continue;

    const tradeDate = isoDate(
      str(row, ["TransactionDate", "Traded", "transaction_date", "Date"]),
    );
    const disclosedDate = isoDate(
      str(row, ["ReportDate", "Filed", "report_date", "last_modified"]),
    );
    if (!withinDays(tradeDate, CONGRESS_WINDOW_DAYS, now)) continue;

    trades.push({
      name:
        str(row, ["Representative", "Name", "representative", "Politician"]) ??
        "Unknown member",
      chamber: str(row, ["House", "Chamber", "chamber"]),
      party: str(row, ["Party", "party"]),
      transaction,
      amountRange: str(row, ["Range", "Amount", "range", "amount", "Trade_Size_USD"]),
      tradeDate,
      disclosedDate,
      lagDays:
        tradeDate && disclosedDate ? Math.max(0, daysBetween(tradeDate, disclosedDate)) : null,
    });
  }
  trades.sort((a, b) => (b.tradeDate ?? "").localeCompare(a.tradeDate ?? ""));
  return {
    buys: trades.filter((t) => t.transaction === "buy").length,
    sells: trades.filter((t) => t.transaction === "sell").length,
    lastTradeDate: trades[0]?.tradeDate ?? null,
    medianLagDays: median(
      trades.map((t) => t.lagDays).filter((l): l is number => l != null),
    ),
    recent: trades.slice(0, 5),
  };
}

export function normalizeInsiders(rows: Row[], now: Date): QuiverInsiderSummary {
  let buys = 0;
  let sells = 0;
  let boughtValue = 0;
  let soldValue = 0;
  let lastActivityDate: string | null = null;
  for (const row of rows) {
    const code = (str(row, ["TransactionCode", "transaction_code", "Code"]) ?? "").toUpperCase();
    const acqDisp = (str(row, ["AcquiredDisposedCode", "acquired_disposed"]) ?? "").toUpperCase();
    const isBuy = code === "P" || (code === "" && acqDisp === "A");
    const isSell = code === "S" || (code === "" && acqDisp === "D");
    if (!isBuy && !isSell) continue;

    const date = isoDate(str(row, ["Date", "TransactionDate", "date", "fileDate"]));
    if (!withinDays(date, CONGRESS_WINDOW_DAYS, now)) continue;

    const shares = num(row, ["Shares", "shares", "SharesTraded"]) ?? 0;
    const price = num(row, ["PricePerShare", "price", "Price"]) ?? 0;
    const value = shares * price;
    if (isBuy) {
      buys += 1;
      boughtValue += value;
    } else {
      sells += 1;
      soldValue += value;
    }
    if (date && (!lastActivityDate || date > lastActivityDate)) lastActivityDate = date;
  }
  return { buys, sells, boughtValue, soldValue, lastActivityDate };
}

export function normalizeAmounts(
  rows: Row[],
  now: Date,
  windowDays: number,
): QuiverAmountSummary {
  let count = 0;
  let totalAmount = 0;
  let lastDate: string | null = null;
  for (const row of rows) {
    const date = isoDate(str(row, ["Date", "date", "ReportDate"])) ??
      // Gov contracts are often keyed by Year/Quarter rather than a date.
      (num(row, ["Year", "year"]) != null
        ? `${num(row, ["Year", "year"])}-01-01`
        : null);
    if (!withinDays(date, windowDays, now)) continue;
    count += 1;
    totalAmount += num(row, ["Amount", "amount", "Spend", "TotalAmount"]) ?? 0;
    if (date && (!lastDate || date > lastDate)) lastDate = date;
  }
  return { count, totalAmount, lastDate };
}

// ---------------------------------------------------------------------------
// Composite score — a transparent activity tilt, not an alpha claim.

export function computeScore(
  congress: QuiverCongressSummary | null,
  insiders: QuiverInsiderSummary | null,
  govContracts: QuiverAmountSummary | null,
): { score: number | null; components: QuiverScoreComponent[] } {
  if (!congress && !insiders && !govContracts) {
    return { score: null, components: [] };
  }
  const components: QuiverScoreComponent[] = [];
  let score = 50;

  if (congress) {
    const net = congress.buys - congress.sells;
    const contribution = Math.max(-20, Math.min(20, net * 5));
    score += contribution;
    components.push({
      key: "congress",
      label: "Congressional trading",
      contribution,
      detail: `${congress.buys} buy${congress.buys === 1 ? "" : "s"} vs ${congress.sells} sell${congress.sells === 1 ? "" : "s"} in the last ${CONGRESS_WINDOW_DAYS} days (±5 pts per net trade, capped ±20)`,
    });
  }

  if (insiders) {
    const netValue = insiders.boughtValue - insiders.soldValue;
    // Insider buying is a stronger signal than selling (sales are often
    // scheduled/diversification), so buys weigh double.
    const netTilt = insiders.buys * 2 - insiders.sells;
    const contribution = Math.max(-15, Math.min(20, netTilt * 3));
    score += contribution;
    components.push({
      key: "insiders",
      label: "Insider activity",
      contribution,
      detail: `${insiders.buys} open-market buy${insiders.buys === 1 ? "" : "s"}, ${insiders.sells} sell${insiders.sells === 1 ? "" : "s"} (net ~$${Math.round(Math.abs(netValue)).toLocaleString()} ${netValue >= 0 ? "bought" : "sold"}); buys weigh double`,
    });
  }

  if (govContracts && govContracts.count > 0) {
    const contribution = Math.min(10, govContracts.count * 2);
    score += contribution;
    components.push({
      key: "govContracts",
      label: "Government contracts",
      contribution,
      detail: `${govContracts.count} award${govContracts.count === 1 ? "" : "s"} totalling ~$${Math.round(govContracts.totalAmount).toLocaleString()} in the last ${CONTRACTS_WINDOW_DAYS} days (+2 pts each, capped +10)`,
    });
  }

  return { score: Math.max(0, Math.min(100, score)), components };
}

// ---------------------------------------------------------------------------
// Public entry point

const STANDARD_NOTES = [
  `Congressional trades are disclosed up to 45 days after the trade date (STOCK Act) — treat them as confirmation, not real-time signals.`,
  `The score is a transparent activity tilt (50 = neutral), not a prediction of returns.`,
];

function unconfigured(ticker: string): QuiverSignals {
  return {
    ticker,
    configured: false,
    fetchedAt: null,
    windowDays: CONGRESS_WINDOW_DAYS,
    congress: null,
    insiders: null,
    govContracts: null,
    lobbying: null,
    score: null,
    scoreComponents: [],
    notes: [],
  };
}

export async function getQuiverSignals(tickerRaw: string): Promise<QuiverSignals> {
  const ticker = tickerRaw.toUpperCase();
  if (!isQuiverConfigured()) return unconfigured(ticker);

  loadDiskCache();
  const hit = cache.get(ticker);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const now = new Date();
  const [congressRows, insiderRows, contractRows, lobbyRows] = await Promise.all([
    quiverGetOrNull<Row[]>(`/historical/congresstrading/${encodeURIComponent(ticker)}`, "congress"),
    quiverGetOrNull<Row[]>(`/live/insiders?ticker=${encodeURIComponent(ticker)}`, "insiders"),
    quiverGetOrNull<Row[]>(`/historical/govcontractsall/${encodeURIComponent(ticker)}`, "govcontracts"),
    quiverGetOrNull<Row[]>(`/historical/lobbying/${encodeURIComponent(ticker)}`, "lobbying"),
  ]);

  const congress = Array.isArray(congressRows) ? normalizeCongress(congressRows, now) : null;
  const insiders = Array.isArray(insiderRows) ? normalizeInsiders(insiderRows, now) : null;
  const govContracts = Array.isArray(contractRows)
    ? normalizeAmounts(contractRows, now, CONTRACTS_WINDOW_DAYS)
    : null;
  const lobbying = Array.isArray(lobbyRows)
    ? normalizeAmounts(lobbyRows, now, CONTRACTS_WINDOW_DAYS)
    : null;

  const { score, components } = computeScore(congress, insiders, govContracts);

  const signals: QuiverSignals = {
    ticker,
    configured: true,
    fetchedAt: now.toISOString(),
    windowDays: CONGRESS_WINDOW_DAYS,
    congress,
    insiders,
    govContracts,
    lobbying,
    score,
    scoreComponents: components,
    notes: STANDARD_NOTES,
  };

  cache.set(ticker, { value: signals, expiresAt: Date.now() + CACHE_TTL_MS });
  scheduleFlush();
  return signals;
}
