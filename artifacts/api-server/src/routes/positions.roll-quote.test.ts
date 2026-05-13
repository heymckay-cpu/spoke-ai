import express, { type Express } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type PositionRow = {
  id: number;
  ticker: string;
  strike: number;
  expiry: string;
  premium: number;
  contracts: number;
  openedAt: Date;
  closedAt: Date | null;
  closePrice: number | null;
  notes: string | null;
  lastAlertedItmAt: Date | null;
  lastAlertedExpiringSoonAt: Date | null;
  rolledFromId: number | null;
};

const positionsStore: { rows: PositionRow[] } = { rows: [] };

vi.mock("@workspace/db", () => {
  // Minimal chainable stub matching the call sites used by the route under
  // test: db.select().from(table).where(eq(table.id, n)) returning a Promise<rows[]>.
  const positionsTable = {
    id: { _name: "id" },
    ticker: { _name: "ticker" },
    rolledFromId: { _name: "rolledFromId" },
  };
  const makeChain = () => {
    const chain: Record<string, unknown> = {};
    chain.from = () => chain;
    chain.where = () => Promise.resolve(positionsStore.rows);
    chain.orderBy = () => Promise.resolve(positionsStore.rows);
    return chain;
  };
  const db = {
    select: () => makeChain(),
    insert: () => ({ values: () => ({ returning: () => Promise.resolve([]) }) }),
    update: () => ({ set: () => ({ where: () => ({ returning: () => Promise.resolve([]) }) }) }),
    delete: () => ({ where: () => ({ returning: () => Promise.resolve([]) }) }),
    transaction: async <T,>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(db),
  };
  return { db, positionsTable };
});

const marketState: {
  chains: Map<string, {
    spot: number;
    fetchedAt: string;
    puts: Array<{ strike: number; bid: number; ask: number; lastPrice: number }>;
  } | null>;
} = { chains: new Map() };

vi.mock("../lib/market", () => ({
  getOptionChain: async (ticker: string, expiry: string) =>
    marketState.chains.get(`${ticker}|${expiry}`) ?? null,
  getExpirations: async () => [],
  getSpot: async () => null,
}));

vi.mock("../lib/alerts", () => ({
  clearAlertMarkers: async () => {},
  deleteNotificationsForPosition: async () => {},
}));

vi.mock("../middlewares/auth", () => ({
  requireUser: (_req: unknown, _res: unknown, next: () => void) => next(),
  getUserId: () => "test-user",
}));

let app: Express;

beforeEach(async () => {
  positionsStore.rows = [];
  marketState.chains.clear();
  vi.resetModules();
  const { default: positionsRouter } = await import("./positions");
  app = express();
  app.use(express.json());
  app.use("/api", positionsRouter);
});

afterEach(() => {
  vi.clearAllMocks();
});

function seedPosition(overrides: Partial<PositionRow> = {}): PositionRow {
  const row: PositionRow = {
    id: 1,
    ticker: "AAPL",
    strike: 150,
    expiry: "2026-06-19",
    premium: 2.5,
    contracts: 1,
    openedAt: new Date("2026-05-01T00:00:00Z"),
    closedAt: null,
    closePrice: null,
    notes: null,
    lastAlertedItmAt: null,
    lastAlertedExpiringSoonAt: null,
    rolledFromId: null,
    ...overrides,
  };
  positionsStore.rows = [row];
  return row;
}

describe("GET /positions/:id/roll-quote/:expiry/:strike", () => {
  it("returns snapped strike + bid/ask/mid/last/premium for a valid request", async () => {
    seedPosition();
    marketState.chains.set("AAPL|2026-07-17", {
      spot: 152.34,
      fetchedAt: "2026-05-11T12:00:00Z",
      puts: [
        { strike: 145, bid: 1.0, ask: 1.2, lastPrice: 1.1 },
        // 149.5 is the closest listed strike to a 150 request → snap target.
        { strike: 149.5, bid: 1.8, ask: 2.0, lastPrice: 1.9 },
        { strike: 155, bid: 3.0, ask: 3.4, lastPrice: 3.2 },
      ],
    });

    const res = await request(app).get("/api/positions/1/roll-quote/2026-07-17/150");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ticker: "AAPL",
      expiry: "2026-07-17",
      strike: 149.5,
      requestedStrike: 150,
      bid: 1.8,
      ask: 2.0,
      mid: 1.9,
      lastPrice: 1.9,
      // bid > 0 wins, so premium === bid
      premium: 1.8,
      spot: 152.34,
    });
  });

  it("falls back to mid when bid is missing, then to lastPrice", async () => {
    seedPosition();
    marketState.chains.set("AAPL|2026-07-17", {
      spot: 152,
      fetchedAt: "2026-05-11T12:00:00Z",
      puts: [{ strike: 150, bid: 0, ask: 2.4, lastPrice: 2.0 }],
    });
    // bid === 0, ask > 0 but mid requires both bid+ask > 0 → 0 → premium = lastPrice
    const res = await request(app).get("/api/positions/1/roll-quote/2026-07-17/150");
    expect(res.status).toBe(200);
    expect(res.body.bid).toBe(0);
    expect(res.body.mid).toBe(0);
    expect(res.body.lastPrice).toBe(2);
    expect(res.body.premium).toBe(2);
  });

  it("returns 400 on a malformed expiry (not YYYY-MM-DD)", async () => {
    seedPosition();
    const res = await request(app).get("/api/positions/1/roll-quote/not-a-date/150");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 on a non-positive strike", async () => {
    seedPosition();
    const res = await request(app).get("/api/positions/1/roll-quote/2026-07-17/0");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 404 when the position does not exist", async () => {
    positionsStore.rows = [];
    const res = await request(app).get("/api/positions/9999/roll-quote/2026-07-17/150");
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Position not found/i);
  });

  it("returns 404 when the option chain is unavailable for the expiry", async () => {
    seedPosition();
    // No chain seeded for this expiry → getOptionChain resolves to null.
    const res = await request(app).get("/api/positions/1/roll-quote/2026-07-17/150");
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/chain unavailable/i);
  });
});
