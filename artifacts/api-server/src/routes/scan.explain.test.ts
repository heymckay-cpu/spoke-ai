import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// In-memory backing rows for the stubbed @workspace/db.
const snapshotRows: Array<{
  id: number;
  scannedAt: Date;
  candidates: Array<Record<string, unknown>>;
  errors: unknown[];
  tickersScanned: number;
  tickersWithCandidate: number;
  hiddenByEarningsCount: number;
}> = [];
const explanationRows: Array<{
  id: number;
  snapshotId: number;
  ticker: string;
  strike: number;
  expiry: string;
  verdict: string;
  summary: string;
  bullets: string[];
  model: string;
  source: string;
  createdAt: Date;
}> = [];
const positionRows: Array<{
  ticker: string;
  strike: number;
  expiry: string;
  contracts: number;
  closedAt: Date | null;
}> = [];
const holdingRows: Array<{ ticker: string; shares: number; avgCost: number }> = [];

let nextExplainId = 1;
let currentTier: "free" | "pro" | "ultra" = "ultra";

vi.mock("../middlewares/auth", () => ({
  requireUser: (_req: unknown, _res: unknown, next: () => void) => next(),
  getUserId: () => "test-user",
}));

vi.mock("@workspace/db", () => {
  // Tiny chainable query builder that ignores filter/order arguments and
  // resolves to the table's underlying row array. The route applies its own
  // post-query filtering for candidate matching, so stripping `where` is fine.
  function makeBuilder<T>(rows: T[]) {
    const builder: {
      where: (..._: unknown[]) => typeof builder;
      orderBy: (..._: unknown[]) => typeof builder;
      limit: (n: number) => Promise<T[]>;
      then: Promise<T[]>["then"];
      catch: Promise<T[]>["catch"];
    } = {
      where: () => builder,
      orderBy: () => builder,
      limit: (n: number) => Promise.resolve(rows.slice(0, n)),
      then: (...args) => Promise.resolve(rows).then(...(args as [never])),
      catch: (...args) => Promise.resolve(rows).catch(...(args as [never])),
    };
    return builder;
  }
  return {
    scanSnapshotTable: { __kind: "snapshots", id: "id", scannedAt: "scannedAt" },
    candidateExplanationsTable: {
      __kind: "explanations",
      id: "id",
      snapshotId: "snapshotId",
      ticker: "ticker",
      strike: "strike",
      expiry: "expiry",
    },
    positionsTable: {
      __kind: "positions",
      ticker: "ticker",
      strike: "strike",
      expiry: "expiry",
      contracts: "contracts",
      closedAt: "closedAt",
    },
    holdingsTable: {
      __kind: "holdings",
      ticker: "ticker",
      shares: "shares",
      avgCost: "avgCost",
    },
    db: {
      select: () => ({
        from: (table: { __kind: string }) => {
          switch (table.__kind) {
            case "snapshots":
              return makeBuilder(snapshotRows);
            case "explanations":
              return makeBuilder(
                explanationRows.filter(() => true) as unknown[],
              );
            case "positions":
              return makeBuilder(positionRows);
            case "holdings":
              return makeBuilder(holdingRows);
            default:
              return makeBuilder([] as unknown[]);
          }
        },
      }),
      insert: () => ({
        values: (v: Record<string, unknown>) => {
          const row = { id: nextExplainId++, ...v } as (typeof explanationRows)[number];
          return {
            onConflictDoUpdate: () => {
              const existing = explanationRows.find(
                (r) =>
                  r.snapshotId === row.snapshotId &&
                  r.ticker === row.ticker &&
                  r.strike === row.strike &&
                  r.expiry === row.expiry,
              );
              if (existing) Object.assign(existing, v);
              else explanationRows.push(row);
              return Promise.resolve();
            },
          };
        },
      }),
    },
  };
});

vi.mock("../lib/scanRunner", () => ({
  getCachedScan: () => null,
}));

vi.mock("../middlewares/tier", () => ({
  getCurrentTier: async () => currentTier,
}));

const anthropicCreate = vi.fn();
vi.mock("@workspace/integrations-anthropic-ai", () => ({
  get anthropic() {
    return { messages: { create: anthropicCreate } };
  },
}));

import scanExplainRouter from "./scan.explain";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(scanExplainRouter);
  return app;
}

const baseCandidate = {
  ticker: "AAPL",
  spot: 200,
  expiry: "2025-06-20",
  dte: 30,
  strike: 190,
  delta: -0.25,
  bid: 2.5,
  ask: 2.6,
  iv: 0.32,
  openInterest: 4500,
  volume: 1200,
  premiumPerContract: 250,
  collateralPerContract: 19000,
  staticReturnPct: 1.32,
  annualizedPct: 16.07,
  breakeven: 187.5,
  pctOtm: 5.0,
  ivRank: 0.55,
  ivPercentile: 0.6,
  ivRankBasis: "real",
  hv30: 0.28,
  earningsDate: null,
  earningsInWindow: false,
};

beforeEach(() => {
  snapshotRows.length = 0;
  explanationRows.length = 0;
  positionRows.length = 0;
  holdingRows.length = 0;
  nextExplainId = 1;
  currentTier = "ultra";
  anthropicCreate.mockReset();
  snapshotRows.push({
    id: 1,
    scannedAt: new Date("2025-05-13T12:00:00Z"),
    candidates: [baseCandidate],
    errors: [],
    tickersScanned: 1,
    tickersWithCandidate: 1,
    hiddenByEarningsCount: 0,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /scan/explain", () => {
  it("404s when the candidate is not in the latest snapshot", async () => {
    const res = await request(buildApp()).post("/scan/explain").send({
      ticker: "AAPL",
      strike: 999,
      expiry: "2025-06-20",
    });
    expect(res.status).toBe(404);
  });

  it("returns the LLM explanation and caches it", async () => {
    anthropicCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            verdict: "good_fit",
            summary: "Looks great.",
            bullets: ["High annualized yield.", "OTM cushion is healthy."],
          }),
        },
      ],
    });
    const app = buildApp();
    const first = await request(app).post("/scan/explain").send({
      ticker: "AAPL",
      strike: 190,
      expiry: "2025-06-20",
    });
    expect(first.status).toBe(200);
    expect(first.body.source).toBe("llm");
    expect(first.body.verdict).toBe("good_fit");
    expect(anthropicCreate).toHaveBeenCalledTimes(1);

    // Second call hits the cache and does not invoke the model again.
    const second = await request(app).post("/scan/explain").send({
      ticker: "AAPL",
      strike: 190,
      expiry: "2025-06-20",
    });
    expect(second.status).toBe(200);
    expect(second.body.source).toBe("cache");
    expect(second.body.cached).toBe(true);
    expect(anthropicCreate).toHaveBeenCalledTimes(1);
  });

  it("falls back to the deterministic summary when the model errors", async () => {
    anthropicCreate.mockRejectedValueOnce(new Error("upstream rate limit"));
    const res = await request(buildApp()).post("/scan/explain").send({
      ticker: "AAPL",
      strike: 190,
      expiry: "2025-06-20",
    });
    expect(res.status).toBe(200);
    expect(res.body.source).toBe("fallback");
    expect(res.body.model).toBe("fallback");
    expect(["good_fit", "mixed", "avoid"]).toContain(res.body.verdict);
    expect(res.body.bullets.length).toBeGreaterThan(0);
  });

  it("uses the deterministic fallback when the tier lacks the AI explainer", async () => {
    currentTier = "free";
    const res = await request(buildApp()).post("/scan/explain").send({
      ticker: "AAPL",
      strike: 190,
      expiry: "2025-06-20",
    });
    expect(res.status).toBe(200);
    expect(res.body.source).toBe("fallback");
    expect(anthropicCreate).not.toHaveBeenCalled();
  });
});
