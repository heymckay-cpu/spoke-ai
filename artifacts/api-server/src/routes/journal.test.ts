import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface EntryRow {
  id: number;
  userId: string;
  decision: string;
  ticker: string;
  strike: number;
  expiry: string;
  bid: number;
  annualizedPct: number | null;
  delta: number | null;
  ivRank: number | null;
  quiverScore: number | null;
  snapshot: Record<string, unknown>;
  positionId: number | null;
  decidedAt: Date;
  notes: string | null;
  evaluatedAt: Date | null;
  outcomePnl: number | null;
  outcomeNote: string | null;
}

const stores = {
  entries: [] as EntryRow[],
  positions: [] as Array<{ id: number; userId: string }>,
  nextId: 1,
};

vi.mock("@workspace/db", () => {
  const proxy = (name: string) =>
    new Proxy({ __t: name } as Record<string, unknown>, {
      get(t, prop: string) {
        if (prop === "__t") return t.__t;
        return { __c: prop };
      },
    });
  const journalEntriesTable = proxy("entries");
  const positionsTable = proxy("positions");

  type Pred = (r: Record<string, unknown>) => boolean;
  const rowsOf = (t: { __t: string }): Array<Record<string, unknown>> =>
    t.__t === "entries"
      ? (stores.entries as unknown as Array<Record<string, unknown>>)
      : (stores.positions as unknown as Array<Record<string, unknown>>);

  const db = {
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
    insert: (_t: { __t: string }) => ({
      values: (vals: Record<string, unknown>) => ({
        returning: async () => {
          const row: EntryRow = {
            id: stores.nextId++,
            userId: vals.userId as string,
            decision: vals.decision as string,
            ticker: vals.ticker as string,
            strike: vals.strike as number,
            expiry: vals.expiry as string,
            bid: vals.bid as number,
            annualizedPct: (vals.annualizedPct as number) ?? null,
            delta: (vals.delta as number) ?? null,
            ivRank: (vals.ivRank as number) ?? null,
            quiverScore: (vals.quiverScore as number) ?? null,
            snapshot: (vals.snapshot as Record<string, unknown>) ?? {},
            positionId: (vals.positionId as number) ?? null,
            decidedAt: new Date(),
            notes: (vals.notes as string) ?? null,
            evaluatedAt: null,
            outcomePnl: null,
            outcomeNote: null,
          };
          stores.entries.push(row);
          return [row];
        },
      }),
    }),
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
    delete: (t: { __t: string }) => ({
      where: (p: Pred) => ({
        returning: async () => {
          const removed: Array<Record<string, unknown>> = [];
          const rows = rowsOf(t);
          for (let i = rows.length - 1; i >= 0; i -= 1) {
            if (p(rows[i])) removed.push(...rows.splice(i, 1));
          }
          return removed;
        },
      }),
    }),
  };

  return { db, journalEntriesTable, positionsTable };
});

vi.mock("drizzle-orm", () => ({
  eq: (col: { __c?: string }, val: unknown) => (r: Record<string, unknown>) =>
    r[col.__c ?? ""] === val,
  and:
    (...preds: Array<(r: Record<string, unknown>) => boolean>) =>
    (r: Record<string, unknown>) =>
      preds.every((p) => p(r)),
  desc: (col: unknown) => col,
  asc: (col: unknown) => col,
}));

vi.mock("../middlewares/auth", () => ({
  requireUser: (_req: unknown, _res: unknown, next: () => void) => next(),
  getUserId: () => "test-user",
}));

import journalRouter from "./journal";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(journalRouter);
  return app;
}

const entryBody = (over: Record<string, unknown> = {}) => ({
  decision: "taken",
  ticker: "aapl",
  strike: 175,
  expiry: "2026-10-16",
  bid: 2.45,
  annualizedPct: 0.128,
  delta: -0.25,
  ivRank: 0.6,
  quiverScore: 63,
  snapshot: { ticker: "AAPL", strike: 175, anything: "goes" },
  ...over,
});

beforeEach(() => {
  stores.entries = [];
  stores.positions = [];
  stores.nextId = 1;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /journal", () => {
  it("records a decision, uppercases the ticker, and freezes the snapshot", async () => {
    const res = await request(buildApp()).post("/journal").send(entryBody());
    expect(res.status).toBe(200);
    expect(res.body.ticker).toBe("AAPL");
    expect(res.body.decision).toBe("taken");
    expect(res.body.snapshot.anything).toBe("goes");
    expect(stores.entries[0].userId).toBe("test-user");
  });

  it("validates positionId ownership", async () => {
    stores.positions = [{ id: 9, userId: "someone-else" }];
    const bad = await request(buildApp())
      .post("/journal")
      .send(entryBody({ positionId: 9 }));
    expect(bad.status).toBe(400);

    stores.positions.push({ id: 10, userId: "test-user" });
    const ok = await request(buildApp())
      .post("/journal")
      .send(entryBody({ positionId: 10 }));
    expect(ok.status).toBe(200);
    expect(ok.body.positionId).toBe(10);
  });

  it("rejects an invalid decision", async () => {
    const res = await request(buildApp())
      .post("/journal")
      .send(entryBody({ decision: "maybe" }));
    expect(res.status).toBe(400);
  });
});

describe("GET /journal", () => {
  it("lists only the requesting user's entries with full-journal stats", async () => {
    await request(buildApp()).post("/journal").send(entryBody());
    await request(buildApp()).post("/journal").send(entryBody({ decision: "passed", ticker: "MSFT" }));
    // Another user's entry, injected directly.
    stores.entries.push({
      ...stores.entries[0],
      id: 99,
      userId: "someone-else",
      ticker: "SECRET",
    });

    const res = await request(buildApp()).get("/journal");
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(2);
    expect(JSON.stringify(res.body)).not.toContain("SECRET");
    expect(res.body.stats).toEqual({ taken: 1, passed: 1 });
  });

  it("filters by decision while keeping overall stats", async () => {
    await request(buildApp()).post("/journal").send(entryBody());
    await request(buildApp()).post("/journal").send(entryBody({ decision: "passed" }));
    const res = await request(buildApp()).get("/journal?decision=passed");
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].decision).toBe("passed");
    expect(res.body.stats).toEqual({ taken: 1, passed: 1 });
  });
});

describe("PATCH /journal/:id", () => {
  it("updates decision and notes", async () => {
    await request(buildApp()).post("/journal").send(entryBody());
    const res = await request(buildApp())
      .patch("/journal/1")
      .send({ decision: "passed", notes: "changed my mind" });
    expect(res.status).toBe(200);
    expect(res.body.decision).toBe("passed");
    expect(res.body.notes).toBe("changed my mind");
  });

  it("404s on another user's entry", async () => {
    await request(buildApp()).post("/journal").send(entryBody());
    stores.entries[0].userId = "someone-else";
    const res = await request(buildApp()).patch("/journal/1").send({ notes: "x" });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /journal/:id", () => {
  it("deletes own entries and 404s on others'", async () => {
    await request(buildApp()).post("/journal").send(entryBody());
    stores.entries.push({ ...stores.entries[0], id: 2, userId: "someone-else" });

    expect((await request(buildApp()).delete("/journal/2")).status).toBe(404);
    expect((await request(buildApp()).delete("/journal/1")).status).toBe(200);
    expect(stores.entries.map((e) => e.id)).toEqual([2]);
  });
});
