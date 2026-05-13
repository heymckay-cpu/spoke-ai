// Polygon.io adapter for the MarketProvider interface defined in market.ts.
//
// Polygon offers live (or near-live, depending on plan) US options bids,
// asks, and IV — addressing the "stale data" warning that fires when
// Yahoo zeroes bids after hours. Only the four MarketProvider methods are
// implemented, returning the minimal shape that the consumers in market.ts
// actually read. Types are cast through `unknown` because the interface is
// declared in terms of yahoo-finance2's much larger return shape.
//
// Enable by setting:
//   MARKET_PROVIDER=polygon
//   POLYGON_API_KEY=<your key>
//
// Free-tier rate limit is 5 req/min; we do not throttle here because the
// disk cache layer in market.ts already coalesces duplicate requests.

import { sectorFromSicCode } from "@workspace/data";
import { logger } from "./logger";
import type { MarketProvider } from "./market";

const POLYGON_BASE = "https://api.polygon.io";

interface PolygonError {
  status?: string;
  error?: string;
  message?: string;
}

async function polygonGet<T>(apiKey: string, pathAndQuery: string): Promise<T> {
  const sep = pathAndQuery.includes("?") ? "&" : "?";
  const url = `${POLYGON_BASE}${pathAndQuery}${sep}apiKey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`polygon ${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as T & PolygonError;
  if (json.status && json.status !== "OK" && json.status !== "DELAYED") {
    throw new Error(`polygon error: ${json.error ?? json.message ?? json.status}`);
  }
  return json;
}

async function polygonGetByUrl<T>(apiKey: string, fullUrl: string): Promise<T> {
  const sep = fullUrl.includes("?") ? "&" : "?";
  const url = `${fullUrl}${sep}apiKey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`polygon ${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

interface SnapshotTickerResponse {
  ticker?: {
    lastTrade?: { p?: number };
    lastQuote?: { P?: number; p?: number };
    day?: { c?: number };
    prevDay?: { c?: number };
    todaysChange?: number;
    todaysChangePerc?: number;
    updated?: number;
  };
}

interface ReferenceTickerResponse {
  results?: {
    name?: string;
    currency_name?: string;
    sic_code?: string;
    sic_description?: string;
    type?: string;
  };
}

interface OptionContractRef {
  ticker: string;
  expiration_date: string;
  strike_price: number;
  contract_type: "call" | "put";
}

interface ContractsListResponse {
  results?: OptionContractRef[];
  next_url?: string;
}

interface OptionSnapshot {
  details?: {
    strike_price?: number;
    contract_type?: "call" | "put";
    expiration_date?: string;
  };
  last_quote?: { bid?: number; ask?: number };
  last_trade?: { price?: number };
  day?: { close?: number; volume?: number };
  implied_volatility?: number;
  open_interest?: number;
  underlying_asset?: { price?: number };
}

interface OptionChainSnapshotResponse {
  results?: OptionSnapshot[];
  next_url?: string;
}

interface AggsResponse {
  results?: Array<{ c?: number; t?: number }>;
  next_url?: string;
}

async function fetchSpot(apiKey: string, ticker: string): Promise<number | null> {
  try {
    const snap = await polygonGet<SnapshotTickerResponse>(
      apiKey,
      `/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(ticker)}`,
    );
    const t = snap.ticker;
    return (
      t?.lastTrade?.p ??
      t?.day?.c ??
      t?.prevDay?.c ??
      null
    );
  } catch (err) {
    logger.warn({ err, ticker }, "polygon: failed to fetch snapshot");
    return null;
  }
}

function makeQuote(apiKey: string) {
  return async (...args: unknown[]): Promise<unknown> => {
    const ticker = String(args[0] ?? "").toUpperCase();
    const [snap, ref] = await Promise.all([
      polygonGet<SnapshotTickerResponse>(
        apiKey,
        `/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(ticker)}`,
      ).catch((err) => {
        logger.warn({ err, ticker }, "polygon: snapshot failed");
        return null;
      }),
      polygonGet<ReferenceTickerResponse>(
        apiKey,
        `/v3/reference/tickers/${encodeURIComponent(ticker)}`,
      ).catch(() => null),
    ]);
    const t = snap?.ticker;
    const price = t?.lastTrade?.p ?? t?.day?.c ?? t?.prevDay?.c;
    if (typeof price !== "number") return null;
    return {
      regularMarketPrice: price,
      shortName: ref?.results?.name ?? null,
      longName: ref?.results?.name ?? null,
      currency: (ref?.results?.currency_name ?? "usd").toUpperCase(),
      regularMarketChange: t?.todaysChange ?? null,
      regularMarketChangePercent: t?.todaysChangePerc ?? null,
    };
  };
}

function makeQuoteSummary() {
  // Earnings calendar is not exposed on Polygon's free/options tiers in a
  // shape we can portably consume. Return an empty calendarEvents block so
  // downstream code falls through to its `null` branch.
  return async (..._args: unknown[]): Promise<unknown> => {
    return { calendarEvents: { earnings: { earningsDate: undefined } } };
  };
}

interface OptionsCallOpts {
  date?: Date;
}

function makeOptions(apiKey: string) {
  return async (...args: unknown[]): Promise<unknown> => {
    const ticker = String(args[0] ?? "").toUpperCase();
    const opts = (args[1] ?? {}) as OptionsCallOpts;

    if (!opts.date) {
      // Expirations: list contracts and collect unique expiration_date values.
      const seen = new Set<string>();
      let url: string | null =
        `/v3/reference/options/contracts?underlying_ticker=${encodeURIComponent(
          ticker,
        )}&expired=false&limit=1000`;
      let pages = 0;
      while (url && pages < 5) {
        pages++;
        const page: ContractsListResponse = url.startsWith("http")
          ? await polygonGetByUrl<ContractsListResponse>(apiKey, url)
          : await polygonGet<ContractsListResponse>(apiKey, url);
        for (const c of page.results ?? []) {
          if (c.expiration_date) seen.add(c.expiration_date);
        }
        url = page.next_url ?? null;
      }
      const expirationDates = [...seen]
        .sort()
        .map((d) => new Date(`${d}T00:00:00Z`));
      return { expirationDates };
    }

    // Chain for a specific expiry.
    const yyyyMmDd = opts.date.toISOString().slice(0, 10);
    const puts: Array<Record<string, unknown>> = [];
    const calls: Array<Record<string, unknown>> = [];
    let spot: number | null = null;

    let url: string | null =
      `/v3/snapshot/options/${encodeURIComponent(
        ticker,
      )}?expiration_date=${yyyyMmDd}&limit=250`;
    let pages = 0;
    while (url && pages < 10) {
      pages++;
      const page: OptionChainSnapshotResponse = url.startsWith("http")
        ? await polygonGetByUrl<OptionChainSnapshotResponse>(apiKey, url)
        : await polygonGet<OptionChainSnapshotResponse>(apiKey, url);
      for (const r of page.results ?? []) {
        if (typeof r.underlying_asset?.price === "number") {
          spot = r.underlying_asset.price;
        }
        const strike = r.details?.strike_price;
        const ctype = r.details?.contract_type;
        if (typeof strike !== "number" || (ctype !== "call" && ctype !== "put")) {
          continue;
        }
        const row = {
          strike,
          bid: r.last_quote?.bid ?? 0,
          ask: r.last_quote?.ask ?? 0,
          lastPrice: r.last_trade?.price ?? r.day?.close ?? 0,
          impliedVolatility: r.implied_volatility ?? 0,
          openInterest: r.open_interest ?? 0,
          volume: r.day?.volume ?? 0,
          inTheMoney:
            typeof spot === "number"
              ? ctype === "call"
                ? spot > strike
                : spot < strike
              : false,
        };
        if (ctype === "put") puts.push(row);
        else calls.push(row);
      }
      url = page.next_url ?? null;
    }

    puts.sort((a, b) => Number(a.strike) - Number(b.strike));
    calls.sort((a, b) => Number(a.strike) - Number(b.strike));

    return {
      options: [{ puts, calls }],
      // The market.ts consumer doesn't read these but include for parity.
      underlyingSymbol: ticker,
      expirationDates: [opts.date],
    };
  };
}

interface ChartCallOpts {
  period1?: Date | number | string;
  period2?: Date | number | string;
  interval?: string;
}

function toDateString(v: Date | number | string | undefined, fallback: Date): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return new Date(v).toISOString().slice(0, 10);
  if (typeof v === "string") return v.slice(0, 10);
  return fallback.toISOString().slice(0, 10);
}

function makeChart(apiKey: string) {
  return async (...args: unknown[]): Promise<unknown> => {
    const ticker = String(args[0] ?? "").toUpperCase();
    const opts = (args[1] ?? {}) as ChartCallOpts;
    const today = new Date();
    const twoYearsAgo = new Date(today);
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    const from = toDateString(opts.period1, twoYearsAgo);
    const to = toDateString(opts.period2, today);

    const quotes: Array<{ close: number | null; date: Date }> = [];
    let url: string | null =
      `/v2/aggs/ticker/${encodeURIComponent(
        ticker,
      )}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=50000`;
    let pages = 0;
    while (url && pages < 5) {
      pages++;
      const page: AggsResponse = url.startsWith("http")
        ? await polygonGetByUrl<AggsResponse>(apiKey, url)
        : await polygonGet<AggsResponse>(apiKey, url);
      for (const bar of page.results ?? []) {
        quotes.push({
          close: typeof bar.c === "number" ? bar.c : null,
          date: new Date(bar.t ?? Date.now()),
        });
      }
      url = page.next_url ?? null;
    }
    return { quotes };
  };
}

function makeGetSector(apiKey: string) {
  return async (ticker: string): Promise<string | null> => {
    try {
      const ref = await polygonGet<ReferenceTickerResponse>(
        apiKey,
        `/v3/reference/tickers/${encodeURIComponent(ticker.toUpperCase())}`,
      );
      const r = ref.results;
      if (!r) return null;
      // ETFs are exposed via `type=ETF` (or similar variants); surface
      // them as the dashboard's dedicated bucket so the static fallback
      // doesn't have to be consulted.
      const t = (r.type ?? "").toUpperCase();
      if (t === "ETF" || t === "ETN" || t === "ETV") return "ETF / Index";
      const mapped = sectorFromSicCode(r.sic_code);
      return mapped ?? null;
    } catch (err) {
      logger.warn({ err, ticker }, "polygon: failed to fetch sector");
      return null;
    }
  };
}

export function createPolygonProvider(apiKey: string): MarketProvider {
  // Cast through unknown: the MarketProvider interface is declared in
  // terms of yahoo-finance2's overload signatures, but consumers only read
  // the narrow subset of fields shaped above.
  return {
    quote: makeQuote(apiKey) as unknown as MarketProvider["quote"],
    quoteSummary: makeQuoteSummary() as unknown as MarketProvider["quoteSummary"],
    options: makeOptions(apiKey) as unknown as MarketProvider["options"],
    chart: makeChart(apiKey) as unknown as MarketProvider["chart"],
    getSector: makeGetSector(apiKey),
  };
}

export { fetchSpot as _fetchSpotForTesting };
