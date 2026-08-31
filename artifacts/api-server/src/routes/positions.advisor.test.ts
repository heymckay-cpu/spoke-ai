import express from "express";
import request from "supertest";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const positionsRows: Array<{
  id: number;
  ticker: string;
  strike: number;
  expiry: string;
  premium: number;
  contracts: number;
  closedAt: Date | null;
  closePrice: number | null;
  rolledFromId: number | null;
}> = [];

vi.mock("@workspace/db", () => {
  const positionsTable = { id: "id", rolledFromId: "rolledFromId" } as const;
  // The select chain is invoked in two shapes:
  //   db.select().from(...).where(eq/inArray) -> returns rows that satisfy
  //   db.select(...projection).from(...)       -> returns full rows
  // We make the chain itself thenable so awaiting either shape resolves to
  // the same backing array. For these tests we don't need to honor projections
  // or the where clause — the route slices what it cares about.
  function makeChain() {
    const chain: Record<string, unknown> = {
      from: () => makeChain(),
      where: () => Promise.resolve(positionsRows),
      then: (resolve: (rows: typeof positionsRows) => unknown) =>
        resolve(positionsRows),
    };
    return chain;
  }
  const db = {
    select: () => makeChain(),
  };
  return { db, positionsTable };
});

vi.mock("../lib/alerts", () => ({
  clearAlertMarkers: vi.fn(async () => {}),
  deleteNotificationsForPosition: vi.fn(async () => {}),
}));

// Stub the market layer so the advisor never reaches Yahoo. Each test sets
// these via setMarketStub() so they reflect that scenario's chain shape.
let chainStub: {
  spot: number;
  fetchedAt: string;
  puts: Array<{ strike: number; bid: number; ask: number; lastPrice: number }>;
} | null = null;

vi.mock("../lib/market", () => ({
  getOptionChain: vi.fn(async () => chainStub),
  getExpirations: vi.fn(async () => ["2025-06-20"]),
  getSpot: vi.fn(async () => chainStub?.spot ?? null),
}));

// The advisor module imports `anthropic` at module load. We control its
// behavior per-test by mutating `anthropicResponse` below; that lets us
// exercise both the success path and the LLM-failure / fallback path
// without monkey-patching internal module bindings.
let anthropicResponse: {
  shouldThrow?: boolean;
  text?: string;
} = { shouldThrow: true };

vi.mock("../middlewares/auth", () => ({
  requireUser: (_req: unknown, _res: unknown, next: () => void) => next(),
  getUserId: () => "test-user",
}));

// The advisor route is tier-gated (ai.advisor → ultra). Default every test
// to an ultra user; the 403 test below flips this to "pro".
const tierMock = vi.fn();
vi.mock("../lib/tierStore", () => ({
  getCurrentTierForUser: () => tierMock(),
  setUserTier: vi.fn(),
  defaultTier: () => "free",
}));

vi.mock("@workspace/integrations-anthropic-ai", () => ({
  anthropic: {
    messages: {
      create: async () => {
        if (anthropicResponse.shouldThrow) {
          throw new Error("LLM unavailable");
        }
        return {
          content: [{ type: "text", text: anthropicResponse.text ?? "" }],
        };
      },
    },
  },
}));

import positionsRouter from "./positions";
import { clearAdvisorCache } from "../lib/advisor";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(positionsRouter);
  return app;
}

beforeEach(() => {
  positionsRows.length = 0;
  chainStub = null;
  anthropicResponse = { shouldThrow: true };
  tierMock.mockReset();
  tierMock.mockResolvedValue("ultra");
  clearAdvisorCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /positions/:id/advisor", () => {
  it("returns 403 with a tier_required payload when the user lacks ai.advisor", async () => {
    tierMock.mockResolvedValue("pro");
    const res = await request(buildApp()).get("/positions/1/advisor");
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      code: "tier_required",
      capability: "ai.advisor",
      required: "ultra",
      current: "pro",
    });
  });

  it("returns 404 when the position does not exist", async () => {
    const res = await request(buildApp()).get("/positions/999/advisor");
    expect(res.status).toBe(404);
  });

  it("returns the LLM verdict with the assembled context", async () => {
    positionsRows.push({
      id: 1,
      ticker: "AAPL",
      strike: 200,
      expiry: "2025-05-16",
      premium: 2.5,
      contracts: 1,
      closedAt: null,
      closePrice: null,
      rolledFromId: null,
    });
    chainStub = {
      spot: 195,
      fetchedAt: "2025-05-13T10:00:00Z",
      puts: [
        { strike: 180, bid: 2.0, ask: 2.2, lastPrice: 2.1 },
        { strike: 190, bid: 4.0, ask: 4.2, lastPrice: 4.1 },
        { strike: 200, bid: 6.5, ask: 6.7, lastPrice: 6.6 },
      ],
    };

    anthropicResponse = {
      shouldThrow: false,
      text: JSON.stringify({
        verdict: "roll",
        summary: "Roll out 30d for $50 net credit at the same strike.",
        bullets: [
          "Net credit of $50 keeps premium flowing.",
          "Cost basis of $197.50 still below current spot.",
        ],
        recommendedRoll: { expiry: "2025-06-20", strike: 200 },
      }),
    };

    const res = await request(buildApp()).get("/positions/1/advisor");
    expect(res.status).toBe(200);
    expect(res.body.available).toBe(true);
    expect(res.body.verdict.verdict).toBe("roll");
    expect(res.body.verdict.recommendedRoll).toEqual({
      expiry: "2025-06-20",
      strike: 200,
    });
    expect(res.body.context.position.ticker).toBe("AAPL");
    expect(res.body.context.quote.intrinsic).toBeCloseTo(5, 5);
    // Top roll targets — same/-5%/-10% strikes snapped to chain.
    expect(res.body.context.rollTargets.length).toBeGreaterThanOrEqual(1);
  });

  it("falls back to raw numbers when the LLM throws", async () => {
    positionsRows.push({
      id: 2,
      ticker: "MSFT",
      strike: 400,
      expiry: "2025-05-16",
      premium: 4.0,
      contracts: 2,
      closedAt: null,
      closePrice: null,
      rolledFromId: null,
    });
    chainStub = {
      spot: 410,
      fetchedAt: "2025-05-13T10:05:00Z",
      puts: [
        { strike: 380, bid: 1.0, ask: 1.2, lastPrice: 1.1 },
        { strike: 400, bid: 3.0, ask: 3.2, lastPrice: 3.1 },
      ],
    };

    anthropicResponse = { shouldThrow: true };

    const res = await request(buildApp()).get("/positions/2/advisor");
    expect(res.status).toBe(200);
    expect(res.body.available).toBe(false);
    expect(res.body.verdict).toBeNull();
    expect(res.body.unavailableReason).toMatch(/LLM unavailable/);
    // Even on fallback the context has the actionable raw numbers.
    expect(res.body.context.position.strike).toBe(400);
    expect(res.body.context.quote.spot).toBe(410);
    expect(res.body.context.assignmentCostTotal).toBe(80_000);
  });
});
