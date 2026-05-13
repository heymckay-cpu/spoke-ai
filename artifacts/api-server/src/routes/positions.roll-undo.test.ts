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
const deletedNotificationsFor: number[] = [];
const clearedAlertMarkersFor: number[] = [];

function buildDb() {
  const select = (cols?: Record<string, unknown>) => {
    let mode: "all" | "byIds" | "byParent" = "all";
    let ids: number[] = [];
    let parentId: number | null = null;
    const chain: Record<string, unknown> = {};
    chain.from = () => chain;
    chain.where = (clause: unknown) => {
      const c = clause as { __kind?: string; ids?: number[]; id?: number };
      if (c?.__kind === "inArray") {
        mode = "byIds";
        ids = c.ids ?? [];
      } else if (c?.__kind === "eq-rolledFromId") {
        mode = "byParent";
        parentId = c.id ?? null;
      }
      let rows = positionsStore.rows;
      if (mode === "byIds") rows = rows.filter((r) => ids.includes(r.id));
      if (mode === "byParent")
        rows = rows.filter((r) => r.rolledFromId === parentId);
      if (cols) return Promise.resolve(rows.map((r) => ({ id: r.id })));
      return Promise.resolve(rows);
    };
    chain.orderBy = chain.where;
    return chain;
  };

  const update = () => ({
    set: (patch: Partial<PositionRow>) => ({
      where: (clause: { __kind?: string; id?: number }) => ({
        returning: () => {
          const id = clause.id;
          const idx = positionsStore.rows.findIndex((r) => r.id === id);
          if (idx < 0) return Promise.resolve([]);
          positionsStore.rows[idx] = {
            ...positionsStore.rows[idx]!,
            ...patch,
          } as PositionRow;
          return Promise.resolve([positionsStore.rows[idx]]);
        },
      }),
    }),
  });

  const del = () => ({
    where: (clause: { __kind?: string; id?: number }) => ({
      returning: () => {
        const id = clause.id;
        const idx = positionsStore.rows.findIndex((r) => r.id === id);
        if (idx < 0) return Promise.resolve([]);
        const removed = positionsStore.rows.splice(idx, 1)[0]!;
        return Promise.resolve([{ id: removed.id }]);
      },
    }),
  });

  const db: Record<string, unknown> = {
    select,
    update,
    delete: del,
    insert: () => ({ values: () => ({ returning: () => Promise.resolve([]) }) }),
  };
  db.transaction = async <T,>(fn: (tx: typeof db) => Promise<T>): Promise<T> =>
    fn(db);
  return db;
}

vi.mock("../middlewares/auth", () => ({
  requireUser: (_req: unknown, _res: unknown, next: () => void) => next(),
  getUserId: () => "test-user",
}));

vi.mock("@workspace/db", () => {
  const positionsTable = {
    id: { _name: "id" },
    rolledFromId: { _name: "rolledFromId" },
  };
  return { db: buildDb(), positionsTable };
});

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    // Tag the where-clauses so our buildDb stub can interpret them.
    eq: (col: { _name?: string }, val: unknown) => {
      if (col?._name === "rolledFromId") {
        return { __kind: "eq-rolledFromId", id: val as number };
      }
      return { __kind: "eq", id: val as number };
    },
    inArray: (_col: unknown, ids: number[]) => ({ __kind: "inArray", ids }),
  };
});

vi.mock("../lib/market", () => ({
  getOptionChain: async () => null,
  getExpirations: async () => [],
  getSpot: async () => null,
}));

vi.mock("../lib/alerts", () => ({
  clearAlertMarkers: vi.fn(async (id: number) => {
    clearedAlertMarkersFor.push(id);
  }),
  deleteNotificationsForPosition: vi.fn(async (id: number) => {
    deletedNotificationsFor.push(id);
  }),
}));

let app: Express;

beforeEach(async () => {
  positionsStore.rows = [];
  deletedNotificationsFor.length = 0;
  clearedAlertMarkersFor.length = 0;
  vi.resetModules();
  const { default: positionsRouter } = await import("./positions");
  app = express();
  app.use(express.json());
  app.use("/api", positionsRouter);
}, 30000);

afterEach(() => {
  vi.clearAllMocks();
});

function seedPostRollPair() {
  // Mirrors the post-roll DB shape: a closed parent (id=10) and a freshly
  // opened child (id=11) linked back via rolledFromId.
  positionsStore.rows = [
    {
      id: 10,
      ticker: "AAPL",
      strike: 150,
      expiry: "2026-06-19",
      premium: 2.5,
      contracts: 1,
      openedAt: new Date("2026-05-01T00:00:00Z"),
      closedAt: new Date("2026-05-12T00:00:00Z"),
      closePrice: 1.0,
      notes: null,
      lastAlertedItmAt: null,
      lastAlertedExpiringSoonAt: null,
      rolledFromId: null,
    },
    {
      id: 11,
      ticker: "AAPL",
      strike: 145,
      expiry: "2026-07-17",
      premium: 3.2,
      contracts: 1,
      openedAt: new Date("2026-05-12T00:00:00Z"),
      closedAt: null,
      closePrice: null,
      notes: null,
      lastAlertedItmAt: null,
      lastAlertedExpiringSoonAt: null,
      rolledFromId: 10,
    },
  ];
}

describe("POST /positions/roll/undo", () => {
  it("deletes the opened leg, re-opens the closed leg, and returns the reopened position", async () => {
    seedPostRollPair();
    const res = await request(app)
      .post("/api/positions/roll/undo")
      .send({ closedId: 10, openedId: 11 });

    expect(res.status).toBe(200);
    expect(res.body.deletedId).toBe(11);
    expect(res.body.reopened).toMatchObject({
      id: 10,
      status: "open",
      closedAt: null,
      closePrice: null,
      premium: 2.5,
    });
    // Opened leg row is gone; closed leg is back to open.
    expect(positionsStore.rows.find((r) => r.id === 11)).toBeUndefined();
    const reopened = positionsStore.rows.find((r) => r.id === 10);
    expect(reopened?.closedAt).toBeNull();
    expect(reopened?.closePrice).toBeNull();
    // Notifications for the deleted leg were cleaned up; alert markers for
    // the reopened leg were reset so re-alerts can fire fresh.
    expect(deletedNotificationsFor).toContain(11);
    expect(clearedAlertMarkersFor).toContain(10);
  });

  it("returns 400 when closedId === openedId", async () => {
    seedPostRollPair();
    const res = await request(app)
      .post("/api/positions/roll/undo")
      .send({ closedId: 10, openedId: 10 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/must differ/i);
  });

  it("returns 400 on a malformed payload", async () => {
    const res = await request(app)
      .post("/api/positions/roll/undo")
      .send({ closedId: "ten" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 404 when either leg is missing", async () => {
    seedPostRollPair();
    positionsStore.rows = positionsStore.rows.filter((r) => r.id !== 11);
    const res = await request(app)
      .post("/api/positions/roll/undo")
      .send({ closedId: 10, openedId: 11 });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it("returns 409 when the opened leg is not linked to the closed leg", async () => {
    seedPostRollPair();
    // Break the link.
    const opened = positionsStore.rows.find((r) => r.id === 11)!;
    opened.rolledFromId = null;
    const res = await request(app)
      .post("/api/positions/roll/undo")
      .send({ closedId: 10, openedId: 11 });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/not linked/i);
  });

  it("returns 409 when the opened leg has itself been rolled again", async () => {
    seedPostRollPair();
    // Add a child of the opened leg to simulate a follow-up roll.
    positionsStore.rows.push({
      id: 12,
      ticker: "AAPL",
      strike: 140,
      expiry: "2026-08-21",
      premium: 4.0,
      contracts: 1,
      openedAt: new Date("2026-05-13T00:00:00Z"),
      closedAt: null,
      closePrice: null,
      notes: null,
      lastAlertedItmAt: null,
      lastAlertedExpiringSoonAt: null,
      rolledFromId: 11,
    });
    const res = await request(app)
      .post("/api/positions/roll/undo")
      .send({ closedId: 10, openedId: 11 });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/rolled again/i);
    // Nothing was mutated.
    expect(positionsStore.rows.length).toBe(3);
    expect(positionsStore.rows.find((r) => r.id === 10)?.closedAt).not.toBeNull();
  });

  it("returns 409 when the closed leg is already open", async () => {
    seedPostRollPair();
    const closed = positionsStore.rows.find((r) => r.id === 10)!;
    closed.closedAt = null;
    closed.closePrice = null;
    const res = await request(app)
      .post("/api/positions/roll/undo")
      .send({ closedId: 10, openedId: 11 });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already open/i);
  });

  it("returns 409 when the opened leg has been closed separately", async () => {
    seedPostRollPair();
    const opened = positionsStore.rows.find((r) => r.id === 11)!;
    opened.closedAt = new Date("2026-05-13T00:00:00Z");
    opened.closePrice = 2.0;
    const res = await request(app)
      .post("/api/positions/roll/undo")
      .send({ closedId: 10, openedId: 11 });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already been closed/i);
  });
});
