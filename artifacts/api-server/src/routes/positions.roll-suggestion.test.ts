import express from "express";
import request from "supertest";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Stub @workspace/db before importing the router so the route handler reads
// from our in-memory rows rather than a real Postgres pool.
const positionsRows: Array<{
  id: number;
  ticker: string;
  strike: number;
  expiry: string;
  closedAt: Date | null;
}> = [];

vi.mock("../middlewares/auth", () => ({
  requireUser: (_req: unknown, _res: unknown, next: () => void) => next(),
  getUserId: () => "test-user",
}));

vi.mock("@workspace/db", () => {
  const positionsTable = { id: "id", userId: "userId" } as const;
  const db = {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(positionsRows),
      }),
    }),
  };
  return { db, positionsTable };
});

// alerts.ts also imports @workspace/db; stub the two helpers the router uses
// so we don't pull the real DB in transitively.
vi.mock("../lib/alerts", () => ({
  clearAlertMarkers: vi.fn(async () => {}),
  deleteNotificationsForPosition: vi.fn(async () => {}),
}));

import positionsRouter from "./positions";
import {
  clearMarketCache,
  setMarketProvider,
  type MarketProvider,
} from "../lib/market";

interface ChainContract {
  strike: number;
  bid?: number;
  ask?: number;
  lastPrice?: number;
  impliedVolatility?: number;
  openInterest?: number;
  volume?: number;
  inTheMoney?: boolean;
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(positionsRouter);
  return app;
}

function makeProvider(opts: {
  expirations: string[];
  spot?: number;
  puts: ChainContract[];
}): MarketProvider {
  return {
    quote: vi.fn(async () => ({ regularMarketPrice: opts.spot ?? 100 })) as unknown as MarketProvider["quote"],
    quoteSummary: vi.fn(async () => ({ calendarEvents: {} })) as unknown as MarketProvider["quoteSummary"],
    options: vi.fn(async (_ticker: string, args?: { date?: Date }) => {
      // No date arg → expirations list call.
      if (!args || !args.date) {
        return {
          expirationDates: opts.expirations.map((e) => new Date(`${e}T00:00:00Z`)),
        } as unknown as ReturnType<MarketProvider["options"]>;
      }
      // With a date → option chain call.
      return {
        options: [{ puts: opts.puts, calls: [] }],
      } as unknown as ReturnType<MarketProvider["options"]>;
    }) as unknown as MarketProvider["options"],
    chart: vi.fn(async () => ({ quotes: [] })) as unknown as MarketProvider["chart"],
  };
}

beforeAll(() => {
  // Pin "now" to a deterministic point so the suggestion picks a stable
  // monthly. 2025-04-15 → +21d = 2025-05-06, next monthly = 2025-05-16.
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2025-04-15T15:00:00Z"));
});

beforeEach(() => {
  positionsRows.length = 0;
  clearMarketCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /positions/:id/roll-suggestion", () => {
  it("returns the next standard monthly snapped to the nearest listed expiry", async () => {
    positionsRows.push({
      id: 1,
      ticker: "AAPL",
      strike: 200,
      expiry: "2025-04-18",
      closedAt: null,
    });

    setMarketProvider(
      makeProvider({
        expirations: ["2025-04-25", "2025-05-02", "2025-05-16", "2025-06-20"],
        spot: 205,
        puts: [
          { strike: 190, bid: 1.0, ask: 1.2, lastPrice: 1.05 },
          { strike: 195, bid: 1.5, ask: 1.7, lastPrice: 1.6 },
          { strike: 200, bid: 2.5, ask: 2.7, lastPrice: 2.6 },
          { strike: 205, bid: 3.5, ask: 3.7, lastPrice: 3.6 },
        ],
      }),
    );

    const res = await request(buildApp()).get("/positions/1/roll-suggestion");
    expect(res.status).toBe(200);
    // Anchor 2025-04-18 + 21d = 2025-05-09; next 3rd Friday is 2025-05-16,
    // which exists in the listed expirations.
    expect(res.body.suggestedExpiry).toBe("2025-05-16");
    expect(res.body.ticker).toBe("AAPL");
    expect(res.body.currentExpiry).toBe("2025-04-18");
    expect(res.body.currentStrike).toBe(200);
    // Lock down the date math the dialog relies on: 2025-05-16 minus the
    // current expiry (2025-04-18) is 28 days. dteFromNow uses Date.now(), so
    // with the system clock pinned at 2025-04-15T15:00Z it rounds to 30.
    expect(res.body.dteFromCurrent).toBe(28);
    expect(res.body.dteFromNow).toBe(30);

    const sameStrike = res.body.options.find((o: { kind: string }) => o.kind === "same");
    const downStrike = res.body.options.find((o: { kind: string }) => o.kind === "down5");
    expect(sameStrike?.strike).toBe(200);
    // 200 * 0.95 = 190 → exact listed strike.
    expect(downStrike?.strike).toBe(190);
    // mid is computed as (bid + ask) / 2 whenever both sides are positive,
    // and exposed on each option even when premium prefers bid.
    expect(sameStrike?.mid).toBeCloseTo((2.5 + 2.7) / 2, 5);
    expect(downStrike?.mid).toBeCloseTo((1.0 + 1.2) / 2, 5);
  });

  it("snaps the down5 strike to the nearest listed put when no exact match exists", async () => {
    positionsRows.push({
      id: 2,
      ticker: "TSLA",
      strike: 100,
      expiry: "2025-04-18",
      closedAt: null,
    });
    setMarketProvider(
      makeProvider({
        // Only one available expiry — the route should snap forward to it.
        expirations: ["2025-05-16"],
        spot: 100,
        // 100 * 0.95 = 95 (exact). Use 92.5/97.5 spacing so 95 isn't listed
        // and the snap picks one of the two equidistant strikes.
        puts: [
          { strike: 90, bid: 0.5, ask: 0.6, lastPrice: 0.55 },
          { strike: 92.5, bid: 0.8, ask: 0.9, lastPrice: 0.85 },
          { strike: 97.5, bid: 1.4, ask: 1.5, lastPrice: 1.45 },
          { strike: 100, bid: 2.0, ask: 2.1, lastPrice: 2.05 },
        ],
      }),
    );

    const res = await request(buildApp()).get("/positions/2/roll-suggestion");
    expect(res.status).toBe(200);
    const same = res.body.options.find((o: { kind: string }) => o.kind === "same");
    const down = res.body.options.find((o: { kind: string }) => o.kind === "down5");
    expect(same?.strike).toBe(100);
    // Snap to nearest listed: from 95, equidistant to 92.5 and 97.5; the
    // helper takes the first encountered nearest, which is 92.5 in our
    // sorted ascending strike list.
    expect(down?.strike).toBe(92.5);
  });

  it("falls back from bid to mid to lastPrice when populating premium", async () => {
    positionsRows.push({
      id: 3,
      ticker: "MSFT",
      strike: 400,
      expiry: "2025-04-18",
      closedAt: null,
    });
    setMarketProvider(
      makeProvider({
        expirations: ["2025-05-16"],
        spot: 410,
        puts: [
          // "same" strike: bid present → premium = bid.
          { strike: 400, bid: 4.0, ask: 4.4, lastPrice: 3.5 },
          // "down5" target = 380: no bid, but ask present → premium = mid
          // (one-sided mid = ask when bid is missing).
          { strike: 380, bid: 0, ask: 3.0, lastPrice: 2.9 },
        ],
      }),
    );
    const res = await request(buildApp()).get("/positions/3/roll-suggestion");
    expect(res.status).toBe(200);
    const same = res.body.options.find((o: { kind: string }) => o.kind === "same");
    const down = res.body.options.find((o: { kind: string }) => o.kind === "down5");
    // bid available → premium falls back to bid.
    expect(same?.premium).toBe(4.0);
    // bid==0, ask>0 → middle rung of the chain: premium = mid (= ask).
    expect(down?.mid).toBe(3.0);
    expect(down?.premium).toBe(3.0);

    // Now flip down5 to have both bid=0 and ask=0 with only lastPrice → premium = lastPrice.
    positionsRows.length = 0;
    positionsRows.push({
      id: 4,
      ticker: "MSFT",
      strike: 400,
      expiry: "2025-04-18",
      closedAt: null,
    });
    setMarketProvider(
      makeProvider({
        expirations: ["2025-05-16"],
        spot: 410,
        puts: [
          { strike: 400, bid: 0, ask: 0, lastPrice: 3.25 },
          { strike: 380, bid: 1.0, ask: 1.4, lastPrice: 2.0 },
        ],
      }),
    );
    clearMarketCache();
    const res2 = await request(buildApp()).get("/positions/4/roll-suggestion");
    expect(res2.status).toBe(200);
    const same2 = res2.body.options.find((o: { kind: string }) => o.kind === "same");
    const down2 = res2.body.options.find((o: { kind: string }) => o.kind === "down5");
    // bid=0, ask=0 → falls back to lastPrice.
    expect(same2?.premium).toBe(3.25);
    // bid>0 → premium = bid.
    expect(down2?.premium).toBe(1.0);
  });

  it("returns 404 when the position does not exist", async () => {
    setMarketProvider(makeProvider({ expirations: ["2025-05-16"], puts: [] }));
    const res = await request(buildApp()).get("/positions/999/roll-suggestion");
    expect(res.status).toBe(404);
  });
});
