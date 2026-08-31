import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signalsMock = vi.fn();
vi.mock("../lib/quiver/signals", () => ({
  getQuiverSignals: (ticker: string) => signalsMock(ticker),
}));

vi.mock("../middlewares/auth", () => ({
  requireUser: (_req: unknown, _res: unknown, next: () => void) => next(),
  getUserId: () => "test-user",
}));

import quiverRouter from "./quiver";

function buildApp() {
  const app = express();
  app.use(quiverRouter);
  return app;
}

const UNCONFIGURED = {
  ticker: "AAPL",
  configured: false,
  fetchedAt: null,
  windowDays: 90,
  congress: null,
  insiders: null,
  govContracts: null,
  lobbying: null,
  score: null,
  scoreComponents: [],
  notes: [],
};

beforeEach(() => {
  signalsMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /quiver/:ticker", () => {
  it("returns the signals payload and uppercases the ticker", async () => {
    signalsMock.mockResolvedValue({
      ...UNCONFIGURED,
      configured: true,
      fetchedAt: "2026-08-31T12:00:00.000Z",
      congress: {
        buys: 2,
        sells: 0,
        lastTradeDate: "2026-08-20",
        medianLagDays: 12,
        recent: [
          {
            name: "Jane Doe",
            chamber: "Representatives",
            party: "D",
            transaction: "buy",
            amountRange: "$1,001 - $15,000",
            tradeDate: "2026-08-20",
            disclosedDate: "2026-08-28",
            lagDays: 8,
          },
        ],
      },
      insiders: { buys: 1, sells: 0, boughtValue: 50000, soldValue: 0, lastActivityDate: "2026-08-25" },
      score: 63,
      scoreComponents: [
        { key: "congress", label: "Congressional trading", contribution: 10, detail: "2 buys vs 0 sells" },
      ],
      notes: ["Congressional trades are disclosed up to 45 days late."],
    });

    const res = await request(buildApp()).get("/quiver/aapl");
    expect(res.status).toBe(200);
    expect(signalsMock).toHaveBeenCalledWith("AAPL");
    expect(res.body.configured).toBe(true);
    expect(res.body.congress.recent[0].lagDays).toBe(8);
    expect(res.body.score).toBe(63);
  });

  it("passes through the unconfigured shape", async () => {
    signalsMock.mockResolvedValue(UNCONFIGURED);
    const res = await request(buildApp()).get("/quiver/AAPL");
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(false);
    expect(res.body.score).toBeNull();
  });

  it("rejects malformed tickers without calling the signals layer", async () => {
    const res = await request(buildApp()).get(`/quiver/${encodeURIComponent("bad ticker!!")}`);
    expect(res.status).toBe(400);
    expect(signalsMock).not.toHaveBeenCalled();
  });

  it("maps signal-layer failures to a 502", async () => {
    signalsMock.mockRejectedValue(new Error("quiver 500"));
    const res = await request(buildApp()).get("/quiver/AAPL");
    expect(res.status).toBe(502);
  });
});
