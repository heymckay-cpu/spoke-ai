import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Minimal in-memory shim for the slice of `@workspace/db` the tools use.
// We intercept .select().from(table).where(...).orderBy(...) etc by inspecting
// the table reference returned from the import — simpler to just mock the
// query builder methods we care about.

interface PositionRow {
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
}

interface HoldingRow {
  id: number;
  ticker: string;
  shares: number;
  avgCost: number;
  openedAt: Date;
  notes: string | null;
}

interface ScanRow {
  id: number;
  scannedAt: Date;
  candidates: Array<Record<string, unknown>>;
  errors: unknown[];
  tickersScanned: number;
  tickersWithCandidate: number;
  hiddenByEarningsCount: number;
}

const stores = {
  positions: [] as PositionRow[],
  holdings: [] as HoldingRow[],
  scans: [] as ScanRow[],
};

vi.mock("@workspace/db", () => {
  // Sentinels so the tools can reference *Table without us caring about shape.
  // Each property access returns a `{ __c: <name> }` column sentinel that the
  // mocked drizzle predicate factories below (`eq`, `gte`) destructure.
  const tableProxy = (name: string) =>
    new Proxy({ __t: name } as Record<string, unknown>, {
      get(target, prop: string) {
        if (prop === "__t") return target.__t;
        return { __c: prop };
      },
    });
  const positionsTable = tableProxy("positions") as { __t: string };
  const holdingsTable = tableProxy("holdings") as { __t: string };
  const scanSnapshotTable = tableProxy("scans") as { __t: string };

  function selectAll(table: { __t: string }) {
    if (table.__t === "positions") return [...stores.positions];
    if (table.__t === "holdings") return [...stores.holdings];
    if (table.__t === "scans") return [...stores.scans];
    return [];
  }

  return {
    positionsTable,
    holdingsTable,
    scanSnapshotTable,
    db: {
      select: () => {
        let rows: unknown[] = [];
        const chain: Record<string, unknown> = {};
        chain.from = (table: { __t: string }) => {
          rows = selectAll(table);
          return chain;
        };
        chain.where = (predicate?: ((r: unknown) => boolean) | undefined) => {
          if (typeof predicate === "function") rows = rows.filter(predicate);
          return chain;
        };
        chain.orderBy = () => chain;
        chain.limit = (n: number) => Promise.resolve(rows.slice(0, n));
        chain.then = (resolve: (rows: unknown[]) => unknown) => resolve(rows);
        return chain;
      },
    },
  };
});

vi.mock("drizzle-orm", () => ({
  // Predicate factories return functions our shim's `where` calls.
  eq: (col: { __c?: string }, val: unknown) => (r: Record<string, unknown>) =>
    r[col.__c ?? ""] === val,
  and:
    (...preds: Array<(r: Record<string, unknown>) => boolean>) =>
    (r: Record<string, unknown>) =>
      preds.every((p) => p(r)),
  desc: (col: unknown) => col,
  asc: (col: unknown) => col,
  gte: (col: { __c?: string }, val: Date) => (r: Record<string, unknown>) =>
    (r[col.__c ?? ""] as Date) >= val,
  sql: () => undefined,
}));

vi.mock("../market", () => ({
  getQuote: vi.fn(async (ticker: string) =>
    ticker === "AAPL"
      ? { ticker, spot: 200.5, earningsDate: "2026-07-15", asOf: "2026-05-13T00:00:00Z" }
      : null,
  ),
}));

beforeEach(() => {
  stores.positions = [];
  stores.holdings = [];
  stores.scans = [];
});

afterEach(() => {
  vi.clearAllMocks();
});

const day = (s: string): Date => new Date(`${s}T00:00:00Z`);

const pos = (over: Partial<PositionRow> & { id: number; ticker: string }): PositionRow => ({
  id: over.id,
  ticker: over.ticker,
  strike: over.strike ?? 100,
  expiry: over.expiry ?? "2026-06-19",
  premium: over.premium ?? 1.5,
  contracts: over.contracts ?? 1,
  openedAt: over.openedAt ?? day("2026-04-01"),
  closedAt: over.closedAt ?? null,
  closePrice: over.closePrice ?? null,
  notes: over.notes ?? null,
  lastAlertedItmAt: null,
  lastAlertedExpiringSoonAt: null,
  rolledFromId: over.rolledFromId ?? null,
});

describe("listPositions tool", () => {
  it("returns open positions only when status='open' is requested", async () => {
    stores.positions = [
      pos({ id: 1, ticker: "AAPL" }),
      pos({ id: 2, ticker: "MSFT", closedAt: day("2026-05-01"), closePrice: 0.5 }),
    ];
    const { listPositions } = await import("./tools");
    const out = await listPositions({ status: "open" });
    expect(out.positions.map((p) => p.id)).toEqual([1]);
    expect(out.positions[0].status).toBe("open");
  });

  it("computes realizedPnl for closed positions", async () => {
    stores.positions = [
      pos({ id: 1, ticker: "PLTR", premium: 2.0, contracts: 2, closedAt: day("2026-05-01"), closePrice: 0.5 }),
    ];
    const { listPositions } = await import("./tools");
    const out = await listPositions({ status: "closed" });
    expect(out.positions[0].realizedPnl).toBeCloseTo((2.0 - 0.5) * 100 * 2);
    expect(out.positions[0].premiumCollected).toBeCloseTo(400);
  });

  it("respects the limit (capped at 200)", async () => {
    stores.positions = Array.from({ length: 5 }, (_, i) => pos({ id: i + 1, ticker: "AAPL" }));
    const { listPositions } = await import("./tools");
    const out = await listPositions({ limit: 3 });
    expect(out.positions).toHaveLength(3);
    expect(out.total).toBe(5);
  });
});

describe("getPositionStats tool", () => {
  it("aggregates win-rate, totals, best/worst, and per-ticker breakdown", async () => {
    stores.positions = [
      pos({ id: 1, ticker: "AAPL", premium: 2.0, contracts: 1, closedAt: day("2026-05-01"), closePrice: 0.5 }),
      pos({ id: 2, ticker: "AAPL", premium: 1.0, contracts: 1, closedAt: day("2026-05-02"), closePrice: 1.5 }),
      pos({ id: 3, ticker: "PLTR", premium: 1.2, contracts: 2, closedAt: day("2026-05-03"), closePrice: 0.2 }),
      pos({ id: 4, ticker: "AAPL" }),
    ];
    const { getPositionStats } = await import("./tools");
    const stats = await getPositionStats({});
    expect(stats.closedCount).toBe(3);
    expect(stats.openCount).toBe(1);
    expect(stats.winCount).toBe(2);
    expect(stats.lossCount).toBe(1);
    expect(stats.winRate).toBeCloseTo(2 / 3);
    expect(stats.bestTrade?.id).toBe(3);
    expect(stats.worstTrade?.id).toBe(2);
    const aapl = stats.byTicker.find((t) => t.ticker === "AAPL");
    expect(aapl?.closedCount).toBe(2);
  });

  it("filters by ticker", async () => {
    stores.positions = [
      pos({ id: 1, ticker: "AAPL", closedAt: day("2026-05-01"), closePrice: 0.5 }),
      pos({ id: 2, ticker: "PLTR", closedAt: day("2026-05-01"), closePrice: 0.5 }),
    ];
    const { getPositionStats } = await import("./tools");
    const stats = await getPositionStats({ ticker: "pltr" });
    expect(stats.closedCount).toBe(1);
    expect(stats.byTicker.map((t) => t.ticker)).toEqual(["PLTR"]);
  });
});

describe("latestScan tool", () => {
  it("returns empty when no snapshot exists", async () => {
    const { latestScan } = await import("./tools");
    const out = await latestScan({});
    expect(out.scannedAt).toBeNull();
    expect(out.candidates).toEqual([]);
  });

  it("filters by ticker, IV rank and earnings flag", async () => {
    stores.scans = [
      {
        id: 1,
        scannedAt: day("2026-05-13"),
        errors: [],
        tickersScanned: 3,
        tickersWithCandidate: 3,
        hiddenByEarningsCount: 0,
        candidates: [
          { ticker: "AAPL", ivRank: 60, earningsInWindow: false },
          { ticker: "AAPL", ivRank: 30, earningsInWindow: true },
          { ticker: "MSFT", ivRank: 70, earningsInWindow: false },
        ],
      },
    ];
    const { latestScan } = await import("./tools");
    const out = await latestScan({ ticker: "aapl", minIvRank: 50, withEarnings: "exclude" });
    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0].ticker).toBe("AAPL");
  });
});

describe("getRollChain tool", () => {
  it("walks the chain from the supplied root forward", async () => {
    stores.positions = [
      pos({ id: 1, ticker: "AAPL" }),
      pos({ id: 2, ticker: "AAPL", rolledFromId: 1 }),
      pos({ id: 3, ticker: "AAPL", rolledFromId: 2 }),
      pos({ id: 99, ticker: "MSFT" }),
    ];
    const { getRollChain } = await import("./tools");
    const out = await getRollChain({ rootId: 1 });
    expect("legs" in out).toBe(true);
    if ("legs" in out) {
      expect(out.legs.map((l) => l.id)).toEqual([1, 2, 3]);
    }
  });

  it("returns an error for a missing root", async () => {
    const { getRollChain } = await import("./tools");
    const out = await getRollChain({ rootId: 999 });
    expect("error" in out).toBe(true);
  });
});

describe("TOOL_HANDLERS allowlist", () => {
  it("exposes only the documented read-only tools", async () => {
    const { TOOL_HANDLERS, TOOL_DEFINITIONS } = await import("./tools");
    const allowed = new Set(Object.keys(TOOL_HANDLERS));
    const documented = new Set(TOOL_DEFINITIONS.map((t) => t.name));
    expect(allowed).toEqual(documented);
    // Sanity: every name is an obviously read-only verb.
    for (const name of allowed) {
      expect(name).toMatch(/^(list|get|latest|quote)/);
    }
  });
});
