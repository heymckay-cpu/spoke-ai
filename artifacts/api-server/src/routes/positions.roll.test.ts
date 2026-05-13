import express, { type Express } from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { sql, eq } from "drizzle-orm";

// Stub market data so the post-roll enrichment never hits Yahoo and the test
// stays deterministic. The route's enrichment is best-effort, but we'd still
// rather not flake on network conditions.
vi.mock("../lib/market", () => ({
  getOptionChain: async () => null,
  getExpirations: async () => [],
  getSpot: async () => null,
}));

// Same reasoning for alerts: clearAlertMarkers reads/writes the DB; we don't
// need that side effect for these tests and it would noisily touch other rows.
vi.mock("../lib/alerts", () => ({
  clearAlertMarkers: vi.fn(async () => {}),
  deleteNotificationsForPosition: vi.fn(async () => {}),
}));

vi.mock("../middlewares/auth", () => ({
  requireUser: (_req: unknown, _res: unknown, next: () => void) => next(),
  getUserId: () => "test-user",
}));

import { db, positionsTable } from "@workspace/db";
import positionsRouter from "./positions";

// Sentinel ticker prefix so every row this suite creates is trivially
// identifiable (and removable) without disturbing real user data.
const TICKER = "__ROLLTEST_AAA";
const FAIL_TICKER = "__ROLLTEST_FAIL";

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(positionsRouter);
  return app;
}

async function insertOpen(ticker: string): Promise<typeof positionsTable.$inferSelect> {
  const [row] = await db
    .insert(positionsTable)
    .values({
      userId: "test-user",
      ticker,
      strike: 100,
      expiry: "2099-01-16",
      premium: 1.5,
      contracts: 1,
    })
    .returning();
  if (!row) throw new Error("seed insert failed");
  return row;
}

async function deleteByTicker(ticker: string): Promise<void> {
  // Children first so the FK doesn't block deletion of the parents.
  await db.execute(
    sql`DELETE FROM positions WHERE rolled_from_id IN (SELECT id FROM positions WHERE ticker = ${ticker})`,
  );
  await db.delete(positionsTable).where(eq(positionsTable.ticker, ticker));
}

async function deleteAllRolltestRows(): Promise<void> {
  await deleteByTicker(TICKER);
  await deleteByTicker(FAIL_TICKER);
}

beforeAll(async () => {
  // Clear any leftovers from a previous aborted run.
  await deleteByTicker(TICKER);
  await deleteByTicker(FAIL_TICKER);
});

afterEach(async () => {
  await deleteByTicker(TICKER);
  await deleteByTicker(FAIL_TICKER);
});

afterAll(async () => {
  await deleteAllRolltestRows();
});

describe("POST /positions/:id/roll (integration)", () => {
  it("atomically closes the original and opens the rolled replacement", async () => {
    const seed = await insertOpen(TICKER);

    const res = await request(buildApp())
      .post(`/positions/${seed.id}/roll`)
      .send({
        closePrice: 0.5,
        strike: 95,
        expiry: "2099-02-20",
        premium: 2.0,
        contracts: 1,
        notes: "rolled down + out",
      });

    expect(res.status).toBe(200);
    expect(res.body.closed?.id).toBe(seed.id);
    expect(res.body.closed?.status).toBe("closed");
    expect(res.body.closed?.closePrice).toBe(0.5);
    expect(res.body.opened?.status).toBe("open");
    expect(res.body.opened?.strike).toBe(95);
    expect(res.body.opened?.expiry).toBe("2099-02-20");
    expect(res.body.opened?.premium).toBe(2.0);
    expect(res.body.opened?.notes).toBe("rolled down + out");
    expect(res.body.opened?.rolledFromId).toBe(seed.id);
    // The closed leg should report the rolled-to child via enrichment.
    expect(res.body.closed?.rolledTo?.id).toBe(res.body.opened.id);
    expect(res.body.opened?.rolledFrom?.id).toBe(seed.id);

    // And the DB should reflect both writes.
    const rows = await db
      .select()
      .from(positionsTable)
      .where(eq(positionsTable.ticker, TICKER));
    expect(rows.length).toBe(2);
    const closed = rows.find((r) => r.id === seed.id);
    const opened = rows.find((r) => r.id !== seed.id);
    expect(closed?.closedAt).not.toBeNull();
    expect(closed?.closePrice).toBe(0.5);
    expect(opened?.closedAt).toBeNull();
    expect(opened?.rolledFromId).toBe(seed.id);
  });

  it("returns 404 when the position does not exist", async () => {
    // Seed a row, capture its id, then delete it — so the id is guaranteed
    // to be missing at request time without depending on luck or the state
    // of the shared DB.
    const seed = await insertOpen(TICKER);
    await db.delete(positionsTable).where(eq(positionsTable.id, seed.id));

    const res = await request(buildApp())
      .post(`/positions/${seed.id}/roll`)
      .send({
        closePrice: 0.5,
        strike: 95,
        expiry: "2099-02-20",
        premium: 2.0,
        contracts: 1,
      });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it("returns 409 when the position is already closed", async () => {
    const seed = await insertOpen(TICKER);
    await db
      .update(positionsTable)
      .set({ closedAt: new Date(), closePrice: 0.25 })
      .where(eq(positionsTable.id, seed.id));

    const res = await request(buildApp())
      .post(`/positions/${seed.id}/roll`)
      .send({
        closePrice: 0.5,
        strike: 95,
        expiry: "2099-02-20",
        premium: 2.0,
        contracts: 1,
      });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already closed/i);
  });

  it("returns 400 on an invalid body", async () => {
    const seed = await insertOpen(TICKER);

    // Missing required fields + a negative premium.
    const res = await request(buildApp())
      .post(`/positions/${seed.id}/roll`)
      .send({ closePrice: -1 });
    expect(res.status).toBe(400);

    // Original row is untouched.
    const [row] = await db
      .select()
      .from(positionsTable)
      .where(eq(positionsTable.id, seed.id));
    expect(row?.closedAt).toBeNull();
    expect(row?.closePrice).toBeNull();
  });

  it("rolls back both writes when the open insert fails mid-transaction", async () => {
    // Install a BEFORE INSERT trigger that rejects only the rolled child
    // (matched by the sentinel ticker + non-null rolled_from_id), so the
    // close UPDATE on the parent succeeds inside the txn but the subsequent
    // INSERT throws — exercising the rollback path end-to-end.
    await db.execute(sql.raw(`
      CREATE OR REPLACE FUNCTION __rolltest_block_insert() RETURNS trigger AS $$
      BEGIN
        IF NEW.ticker = '${FAIL_TICKER}' AND NEW.rolled_from_id IS NOT NULL THEN
          RAISE EXCEPTION 'forced rolltest failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `));
    await db.execute(sql`DROP TRIGGER IF EXISTS __rolltest_block_trg ON positions;`);
    await db.execute(sql`
      CREATE TRIGGER __rolltest_block_trg
      BEFORE INSERT ON positions
      FOR EACH ROW EXECUTE FUNCTION __rolltest_block_insert();
    `);

    try {
      const seed = await insertOpen(FAIL_TICKER);

      let threw = false;
      let status = 0;
      try {
        const res = await request(buildApp())
          .post(`/positions/${seed.id}/roll`)
          .send({
            closePrice: 0.5,
            strike: 95,
            expiry: "2099-02-20",
            premium: 2.0,
            contracts: 1,
          });
        status = res.status;
      } catch {
        threw = true;
      }
      // Either the express default error handler returns 500, or supertest
      // surfaces a socket error — in both cases, what matters is that no
      // 2xx slipped through.
      expect(threw || (status >= 500 && status < 600)).toBe(true);

      // Critically: both writes must have been rolled back together. The
      // parent should still be open, and no child row should exist.
      const rows = await db
        .select()
        .from(positionsTable)
        .where(eq(positionsTable.ticker, FAIL_TICKER));
      expect(rows.length).toBe(1);
      expect(rows[0]?.id).toBe(seed.id);
      expect(rows[0]?.closedAt).toBeNull();
      expect(rows[0]?.closePrice).toBeNull();
    } finally {
      await db.execute(sql`DROP TRIGGER IF EXISTS __rolltest_block_trg ON positions;`);
      await db.execute(sql`DROP FUNCTION IF EXISTS __rolltest_block_insert();`);
    }
  });
});
