import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// In-memory stores driving a minimal drizzle shim: enough for the assign /
// called-away transactions plus the enrichment reads they trigger.

interface PositionRow {
  id: number;
  userId: string;
  ticker: string;
  strike: number;
  expiry: string;
  premium: number;
  contracts: number;
  kind: string;
  outcome: string | null;
  holdingId: number | null;
  openedAt: Date;
  closedAt: Date | null;
  closePrice: number | null;
  notes: string | null;
  lastAlertedItmAt: Date | null;
  lastAlertedExpiringSoonAt: Date | null;
  rolledFromId: number | null;
}

interface HoldingRow {
  id: number;
  userId: string;
  ticker: string;
  shares: number;
  avgCost: number;
  openedAt: Date;
  notes: string | null;
  sourcePositionId: number | null;
}

const stores = {
  positions: [] as PositionRow[],
  holdings: [] as HoldingRow[],
  nextHoldingId: 100,
};

vi.mock("@workspace/db", () => {
  const proxy = (name: string) =>
    new Proxy({ __t: name } as Record<string, unknown>, {
      get(t, prop: string) {
        if (prop === "__t") return t.__t;
        return { __c: prop };
      },
    });
  const positionsTable = proxy("positions");
  const holdingsTable = proxy("holdings");

  type Pred = (r: Record<string, unknown>) => boolean;
  const rowsOf = (t: { __t: string }): Array<Record<string, unknown>> =>
    t.__t === "positions"
      ? (stores.positions as unknown as Array<Record<string, unknown>>)
      : (stores.holdings as unknown as Array<Record<string, unknown>>);

  const makeDb = () => ({
    select: (_proj?: unknown) => {
      let table: { __t: string } = { __t: "" };
      let predicate: Pred | null = null;
      const exec = async () =>
        predicate ? rowsOf(table).filter(predicate) : [...rowsOf(table)];
      const chain: Record<string, unknown> = {};
      chain.from = (t: { __t: string }) => ((table = t), chain);
      chain.where = (p?: Pred) => {
        if (typeof p === "function") predicate = p;
        return chain;
      };
      chain.orderBy = () => chain;
      chain.then = (res: (r: unknown[]) => unknown, rej?: (e: unknown) => unknown) =>
        exec().then(res, rej);
      return chain;
    },
    update: (t: { __t: string }) => ({
      set: (patch: Record<string, unknown>) => ({
        where: (p: Pred) => ({
          returning: async () => {
            const updated: Array<Record<string, unknown>> = [];
            for (const r of rowsOf(t)) {
              if (p(r)) {
                Object.assign(r, patch);
                updated.push(r);
              }
            }
            return updated;
          },
        }),
      }),
    }),
    insert: (t: { __t: string }) => ({
      values: (vals: Record<string, unknown>) => ({
        returning: async () => {
          if (t.__t === "holdings") {
            const row: HoldingRow = {
              id: stores.nextHoldingId++,
              userId: vals.userId as string,
              ticker: vals.ticker as string,
              shares: vals.shares as number,
              avgCost: vals.avgCost as number,
              openedAt: new Date(),
              notes: (vals.notes as string) ?? null,
              sourcePositionId: (vals.sourcePositionId as number) ?? null,
            };
            stores.holdings.push(row);
            return [row];
          }
          throw new Error("unexpected insert");
        },
      }),
    }),
    delete: (t: { __t: string }) => ({
      where: (p: Pred) => {
        const exec = async () => {
          const removed: Array<Record<string, unknown>> = [];
          const rows = rowsOf(t);
          for (let i = rows.length - 1; i >= 0; i -= 1) {
            if (p(rows[i])) removed.push(...rows.splice(i, 1));
          }
          return removed;
        };
        return {
          returning: exec,
          then: (res: (r: unknown) => unknown, rej?: (e: unknown) => unknown) =>
            exec().then(res, rej),
        };
      },
    }),
  });

  const db = {
    ...makeDb(),
    transaction: async <T,>(fn: (tx: ReturnType<typeof makeDb>) => Promise<T>): Promise<T> =>
      fn(makeDb()),
  };

  return { db, positionsTable, holdingsTable };
});

vi.mock("drizzle-orm", () => ({
  eq: (col: { __c?: string }, val: unknown) => (r: Record<string, unknown>) =>
    r[col.__c ?? ""] === val,
  and:
    (...preds: Array<(r: Record<string, unknown>) => boolean>) =>
    (r: Record<string, unknown>) =>
      preds.every((p) => p(r)),
  inArray: (col: { __c?: string }, vals: unknown[]) => (r: Record<string, unknown>) =>
    vals.includes(r[col.__c ?? ""]),
  desc: (col: unknown) => col,
  asc: (col: unknown) => col,
  isNull: (col: { __c?: string }) => (r: Record<string, unknown>) => r[col.__c ?? ""] == null,
}));

vi.mock("../middlewares/auth", () => ({
  requireUser: (_req: unknown, _res: unknown, next: () => void) => next(),
  getUserId: () => "test-user",
}));

vi.mock("../lib/market", () => ({
  getSpot: vi.fn(async () => null),
  getOptionChain: vi.fn(async () => null),
  getExpirations: vi.fn(async () => []),
}));

vi.mock("../lib/alerts", () => ({
  clearAlertMarkers: vi.fn(async () => {}),
  deleteNotificationsForPosition: vi.fn(async () => {}),
}));

vi.mock("@workspace/integrations-anthropic-ai", () => ({
  anthropic: { messages: { create: vi.fn() } },
  AnthropicNotConfiguredError: class extends Error {},
}));

import positionsRouter from "./positions";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(positionsRouter);
  return app;
}

const day = (s: string): Date => new Date(`${s}T00:00:00Z`);

const pos = (over: Partial<PositionRow> & { id: number }): PositionRow => ({
  id: over.id,
  userId: over.userId ?? "test-user",
  ticker: over.ticker ?? "AAPL",
  strike: over.strike ?? 100,
  expiry: over.expiry ?? "2026-10-16",
  premium: over.premium ?? 2,
  contracts: over.contracts ?? 1,
  kind: over.kind ?? "csp",
  outcome: over.outcome ?? null,
  holdingId: over.holdingId ?? null,
  openedAt: over.openedAt ?? day("2026-08-01"),
  closedAt: over.closedAt ?? null,
  closePrice: over.closePrice ?? null,
  notes: over.notes ?? null,
  lastAlertedItmAt: null,
  lastAlertedExpiringSoonAt: null,
  rolledFromId: over.rolledFromId ?? null,
});

beforeEach(() => {
  stores.positions = [];
  stores.holdings = [];
  stores.nextHoldingId = 100;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /positions/:id/assign", () => {
  it("closes the put with outcome assigned and creates a holding at chain net cost basis", async () => {
    // Roll chain: leg 1 (premium 2, bought back at 0.5) → leg 2 (premium 1.5, assigned).
    stores.positions = [
      pos({ id: 1, premium: 2, closedAt: day("2026-08-15"), closePrice: 0.5 }),
      pos({ id: 2, premium: 1.5, strike: 100, rolledFromId: 1 }),
    ];
    const res = await request(buildApp()).post("/positions/2/assign").send({ notes: "confirm #123" });
    expect(res.status).toBe(200);
    // Net premium = 1.5 (kept) + (2 - 0.5) = 3 → cost basis 100 - 3 = 97.
    expect(res.body.costBasisPerShare).toBe(97);
    expect(res.body.position.status).toBe("closed");
    expect(res.body.position.outcome).toBe("assigned");
    expect(res.body.position.closePrice).toBe(0);
    expect(res.body.holding.shares).toBe(100);
    expect(res.body.holding.avgCost).toBe(97);
    expect(res.body.holding.ticker).toBe("AAPL");
    expect(stores.holdings[0].sourcePositionId).toBe(2);
    expect(stores.holdings[0].notes).toContain("confirm #123");
  });

  it("rejects covered calls, closed positions, and other users' positions", async () => {
    stores.positions = [
      pos({ id: 1, kind: "cc", holdingId: 5 }),
      pos({ id: 2, closedAt: day("2026-08-20"), closePrice: 0.2 }),
      pos({ id: 3, userId: "someone-else" }),
    ];
    expect((await request(buildApp()).post("/positions/1/assign").send({})).status).toBe(409);
    expect((await request(buildApp()).post("/positions/2/assign").send({})).status).toBe(409);
    expect((await request(buildApp()).post("/positions/3/assign").send({})).status).toBe(404);
    expect(stores.holdings).toHaveLength(0);
  });
});

describe("POST /positions/:id/called-away", () => {
  it("closes the call, sells shares at strike, and reports stock P/L", async () => {
    stores.holdings = [
      {
        id: 5,
        userId: "test-user",
        ticker: "AAPL",
        shares: 200,
        avgCost: 97,
        openedAt: day("2026-08-16"),
        notes: null,
        sourcePositionId: null,
      },
    ];
    stores.positions = [pos({ id: 1, kind: "cc", holdingId: 5, strike: 105, contracts: 1 })];

    const res = await request(buildApp()).post("/positions/1/called-away");
    expect(res.status).toBe(200);
    expect(res.body.position.outcome).toBe("called_away");
    expect(res.body.sharesSold).toBe(100);
    expect(res.body.saleProceeds).toBe(10500);
    expect(res.body.stockPnl).toBe((105 - 97) * 100);
    expect(res.body.holding.shares).toBe(100); // 200 - 100 remain
    expect(stores.holdings[0].shares).toBe(100);
  });

  it("deletes the holding when every share is called away", async () => {
    stores.holdings = [
      {
        id: 5,
        userId: "test-user",
        ticker: "AAPL",
        shares: 100,
        avgCost: 97,
        openedAt: day("2026-08-16"),
        notes: null,
        sourcePositionId: null,
      },
    ];
    stores.positions = [pos({ id: 1, kind: "cc", holdingId: 5, strike: 105 })];

    const res = await request(buildApp()).post("/positions/1/called-away");
    expect(res.status).toBe(200);
    expect(res.body.holding).toBeNull();
    expect(stores.holdings).toHaveLength(0);
  });

  it("rejects puts and calls without a linked holding", async () => {
    stores.positions = [
      pos({ id: 1, kind: "csp" }),
      pos({ id: 2, kind: "cc", holdingId: null }),
      pos({ id: 3, kind: "cc", holdingId: 999 }),
    ];
    expect((await request(buildApp()).post("/positions/1/called-away")).status).toBe(409);
    expect((await request(buildApp()).post("/positions/2/called-away")).status).toBe(409);
    expect((await request(buildApp()).post("/positions/3/called-away")).status).toBe(409);
  });
});
