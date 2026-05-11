import { Router, type IRouter } from "express";
import {
  GetQuoteParams,
  GetQuoteResponse,
  GetChainExpirationsParams,
  GetChainExpirationsResponse,
  GetChainParams,
  GetChainResponse,
} from "@workspace/api-zod";
import { getQuote, getExpirations, getOptionChain, getSpot, isLiveProvider } from "../lib/market";
import { putGreeks, callGreeks } from "../lib/greeks";
import { getSettings } from "../lib/settingsStore";
import { isUsMarketOpen } from "../lib/marketHours";

const router: IRouter = Router();

function isInDateWindow(iso: string | null, fromDays: number, toDays: number): boolean {
  if (!iso) return false;
  const d = new Date(`${iso}T00:00:00Z`).getTime();
  if (Number.isNaN(d)) return false;
  const days = (d - Date.now()) / (24 * 60 * 60 * 1000);
  return days >= fromDays - 1 && days <= toDays + 1;
}

router.get("/quote/:ticker", async (req, res): Promise<void> => {
  const params = GetQuoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const ticker = params.data.ticker.toUpperCase();
  const q = await getQuote(ticker);
  if (!q) {
    res.status(404).json({ error: "Ticker not found" });
    return;
  }
  const settings = await getSettings();
  res.json(
    GetQuoteResponse.parse({
      ticker: q.ticker,
      spot: q.spot,
      asOf: q.asOf,
      earningsDate: q.earningsDate,
      earningsInWindow: isInDateWindow(q.earningsDate, settings.minDte, settings.maxDte),
      name: q.name,
      currency: q.currency,
      dayChange: q.dayChange,
      dayChangePct: q.dayChangePct,
      marketOpen: isUsMarketOpen(),
    }),
  );
});

router.get("/chain/:ticker", async (req, res): Promise<void> => {
  const params = GetChainExpirationsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const ticker = params.data.ticker.toUpperCase();
  const [exps, spot] = await Promise.all([getExpirations(ticker), getSpot(ticker)]);
  if (spot == null) {
    res.status(404).json({ error: "Ticker not found" });
    return;
  }
  res.json(GetChainExpirationsResponse.parse({ ticker, spot, expirations: exps }));
});

router.get("/chain/:ticker/:expiry", async (req, res): Promise<void> => {
  const params = GetChainParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const ticker = params.data.ticker.toUpperCase();
  const expiry = params.data.expiry;
  const settings = await getSettings();
  const snap = await getOptionChain(ticker, expiry);
  if (!snap) {
    res.status(404).json({ error: "Chain not found" });
    return;
  }
  const marketOpen = isUsMarketOpen();
  // Yahoo zeroes bid/ask outside market hours and frequently quantizes IV
  // to suspicious flat values. Compute simple ratios so the chain page can
  // surface a clear warning rather than silently presenting bad numbers.
  const allRows = [...snap.puts, ...snap.calls];
  const zeroBid = allRows.filter((r) => !(r.bid > 0)).length;
  const lowIv = allRows.filter((r) => !(r.impliedVolatility > 0.05)).length;
  const total = Math.max(allRows.length, 1);
  // With a real-time provider configured, trust the data while the market
  // is open and only flag stale when the market is genuinely closed. With
  // the default delayed provider (Yahoo) we additionally flag chains
  // where >50% of rows look bad, since that usually means the feed is
  // returning previous-close placeholders.
  const live = isLiveProvider();
  const staleBid = !marketOpen || (!live && zeroBid / total > 0.5);
  const staleIv = !marketOpen || (!live && lowIv / total > 0.5);
  const T = Math.max(snap.dte, 1) / 365;
  const r = settings.riskFreeRate;
  const puts = snap.puts.map((row) => {
    const g = putGreeks(snap.spot, row.strike, r, row.impliedVolatility, T);
    return {
      strike: row.strike,
      bid: row.bid,
      ask: row.ask,
      lastPrice: row.lastPrice,
      iv: row.impliedVolatility,
      delta: Number.isFinite(g.delta) ? g.delta : 0,
      gamma: Number.isFinite(g.gamma) ? g.gamma : 0,
      theta: Number.isFinite(g.theta) ? g.theta : 0,
      vega: Number.isFinite(g.vega) ? g.vega : 0,
      openInterest: row.openInterest,
      volume: row.volume,
      inTheMoney: row.inTheMoney,
    };
  });
  const calls = snap.calls.map((row) => {
    const g = callGreeks(snap.spot, row.strike, r, row.impliedVolatility, T);
    return {
      strike: row.strike,
      bid: row.bid,
      ask: row.ask,
      lastPrice: row.lastPrice,
      iv: row.impliedVolatility,
      delta: Number.isFinite(g.delta) ? g.delta : 0,
      gamma: Number.isFinite(g.gamma) ? g.gamma : 0,
      theta: Number.isFinite(g.theta) ? g.theta : 0,
      vega: Number.isFinite(g.vega) ? g.vega : 0,
      openInterest: row.openInterest,
      volume: row.volume,
      inTheMoney: row.inTheMoney,
    };
  });
  res.json(
    GetChainResponse.parse({
      ticker,
      spot: snap.spot,
      expiry: snap.expiry,
      dte: snap.dte,
      puts,
      calls,
      fetchedAt: snap.fetchedAt,
      marketOpen,
      staleBid,
      staleIv,
    }),
  );
});

export default router;
