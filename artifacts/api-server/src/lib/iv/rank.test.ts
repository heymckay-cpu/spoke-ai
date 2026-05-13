import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, ivSnapshotsTable } from "@workspace/db";
import {
  computeIvPercentile,
  computeIvRank,
  loadIvHistory,
  loadIvSeries,
  MIN_HISTORY_DAYS,
  percentileFromHistory,
  rankFromHistory,
  upsertIvSnapshot,
} from "./rank";

const TICKER = "__IVTEST_AAA";
const TICKER_PROVISIONAL = "__IVTEST_BBB";
const TICKER_FULL = "__IVTEST_FULL";
const TICKER_FLAT = "__IVTEST_FLAT";
const TICKER_SINGLE = "__IVTEST_ONE";

async function clean(): Promise<void> {
  await db.execute(sql`delete from iv_snapshots where ticker like '__IVTEST_%'`);
}

beforeAll(async () => {
  await clean();
});

afterEach(async () => {
  await clean();
});

afterAll(async () => {
  await clean();
});

function isoDate(daysAgo: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d;
}

describe("rankFromHistory / percentileFromHistory pure math", () => {
  it("returns 0..1 across a sorted range", () => {
    const hist = [0.1, 0.2, 0.3, 0.4, 0.5];
    expect(rankFromHistory(hist, 0.1)).toBeCloseTo(0, 6);
    expect(rankFromHistory(hist, 0.5)).toBeCloseTo(1, 6);
    expect(rankFromHistory(hist, 0.3)).toBeCloseTo(0.5, 6);
  });

  it("clamps a current IV outside the historical range to [0,1]", () => {
    const hist = [0.2, 0.3, 0.4];
    expect(rankFromHistory(hist, 0.9)).toBe(1);
    expect(rankFromHistory(hist, 0.05)).toBe(0);
  });

  it("returns null when every snapshot has the same IV (degenerate range)", () => {
    expect(rankFromHistory([0.3, 0.3, 0.3], 0.3)).toBeNull();
  });

  it("returns null on empty history", () => {
    expect(rankFromHistory([], 0.3)).toBeNull();
    expect(percentileFromHistory([], 0.3)).toBeNull();
  });

  it("percentile counts the share of days at or below current", () => {
    const hist = [0.1, 0.2, 0.3, 0.4, 0.5];
    expect(percentileFromHistory(hist, 0.3)).toBeCloseTo(3 / 5, 6);
    expect(percentileFromHistory(hist, 0.5)).toBeCloseTo(1, 6);
    expect(percentileFromHistory(hist, 0.05)).toBeCloseTo(0, 6);
  });
});

describe("upsertIvSnapshot idempotency", () => {
  it("re-running on the same day updates the row instead of duplicating", async () => {
    const today = isoDate(0);
    await upsertIvSnapshot(TICKER, 0.25, today);
    await upsertIvSnapshot(TICKER, 0.30, today);
    await upsertIvSnapshot(TICKER, 0.27, today);
    const series = await loadIvSeries(TICKER);
    expect(series).toHaveLength(1);
    expect(series[0]!.iv).toBeCloseTo(0.27, 6);
  });

  it("ignores non-finite or non-positive IVs", async () => {
    await upsertIvSnapshot(TICKER, 0, isoDate(0));
    await upsertIvSnapshot(TICKER, Number.NaN, isoDate(0));
    await upsertIvSnapshot(TICKER, -1, isoDate(0));
    const series = await loadIvSeries(TICKER);
    expect(series).toHaveLength(0);
  });

  it("stores distinct rows per (ticker, date)", async () => {
    await upsertIvSnapshot(TICKER, 0.20, isoDate(0));
    await upsertIvSnapshot(TICKER, 0.22, isoDate(1));
    await upsertIvSnapshot(TICKER, 0.24, isoDate(2));
    const series = await loadIvSeries(TICKER);
    expect(series).toHaveLength(3);
  });
});

describe("computeIvRank / computeIvPercentile against the snapshot table", () => {
  it("returns provisional with a null value when below MIN_HISTORY_DAYS", async () => {
    for (let i = 0; i < MIN_HISTORY_DAYS - 1; i++) {
      await upsertIvSnapshot(TICKER_PROVISIONAL, 0.2 + i * 0.001, isoDate(i));
    }
    const rank = await computeIvRank(TICKER_PROVISIONAL, 0.25);
    expect(rank.basis).toBe("provisional");
    expect(rank.value).toBeNull();
    const pct = await computeIvPercentile(TICKER_PROVISIONAL, 0.25);
    expect(pct.basis).toBe("provisional");
    expect(pct.value).toBeNull();
  });

  it("returns real basis and a sensible 0..1 value with a full year of data", async () => {
    // 252 days, IV ramps linearly 0.10 -> 0.50.
    for (let i = 0; i < 252; i++) {
      const iv = 0.1 + (0.4 * i) / 251;
      await upsertIvSnapshot(TICKER_FULL, iv, isoDate(251 - i));
    }
    const history = await loadIvHistory(TICKER_FULL);
    expect(history.length).toBe(252);

    const rankMid = await computeIvRank(TICKER_FULL, 0.30);
    expect(rankMid.basis).toBe("real");
    expect(rankMid.value!).toBeGreaterThan(0.45);
    expect(rankMid.value!).toBeLessThan(0.55);

    const pctMid = await computeIvPercentile(TICKER_FULL, 0.30);
    expect(pctMid.basis).toBe("real");
    expect(pctMid.value!).toBeGreaterThan(0.45);
    expect(pctMid.value!).toBeLessThan(0.55);
  });

  it("returns null for rank when every snapshot is identical (degenerate range)", async () => {
    for (let i = 0; i < MIN_HISTORY_DAYS + 5; i++) {
      await upsertIvSnapshot(TICKER_FLAT, 0.3, isoDate(i));
    }
    const rank = await computeIvRank(TICKER_FLAT, 0.3);
    expect(rank.basis).toBe("real");
    expect(rank.value).toBeNull();
    // Percentile is still well-defined: every day was <= current.
    const pct = await computeIvPercentile(TICKER_FLAT, 0.3);
    expect(pct.basis).toBe("real");
    expect(pct.value).toBeCloseTo(1, 6);
  });

  it("treats a single snapshot as provisional", async () => {
    await upsertIvSnapshot(TICKER_SINGLE, 0.4, isoDate(0));
    const rank = await computeIvRank(TICKER_SINGLE, 0.4);
    expect(rank.basis).toBe("provisional");
    expect(rank.value).toBeNull();
    expect(rank.sampleSize).toBe(1);
  });
});
