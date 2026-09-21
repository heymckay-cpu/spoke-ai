import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks -----------------------------------------------------------------

interface SettingsRow {
  userId: string;
  tier: string;
  digestEnabled: boolean;
  digestHourUtc: number;
  notificationEmail: string | null;
  lastDigestAt: Date | null;
}

const stores = {
  settings: [] as SettingsRow[],
  snapshots: [] as Array<Record<string, unknown>>,
};

vi.mock("@workspace/db", () => {
  const proxy = (name: string) =>
    new Proxy({ __t: name } as Record<string, unknown>, {
      get(t, prop: string) {
        if (prop === "__t") return t.__t;
        return { __c: prop };
      },
    });
  const settingsTable = proxy("settings");
  const scanSnapshotTable = proxy("snapshots");
  type Pred = (r: Record<string, unknown>) => boolean;
  const rowsOf = (t: { __t: string }) =>
    t.__t === "settings"
      ? (stores.settings as unknown as Array<Record<string, unknown>>)
      : stores.snapshots;
  const db = {
    select: (_proj?: unknown) => {
      let table: { __t: string } = { __t: "" };
      let predicate: Pred | null = null;
      const exec = async () =>
        predicate ? rowsOf(table).filter(predicate) : [...rowsOf(table)];
      const chain: Record<string, unknown> = {};
      chain.from = (t: { __t: string }) => ((table = t), chain);
      chain.where = (p?: Pred) => ((predicate = typeof p === "function" ? p : null), chain);
      chain.orderBy = () => chain;
      chain.then = (res: (r: unknown[]) => unknown, rej?: (e: unknown) => unknown) =>
        exec().then(res, rej);
      return chain;
    },
    update: (t: { __t: string }) => ({
      set: (patch: Record<string, unknown>) => {
        const apply = async (p: Pred) => {
          const updated: Array<Record<string, unknown>> = [];
          for (const r of rowsOf(t)) {
            if (p(r)) {
              Object.assign(r, patch);
              updated.push(r);
            }
          }
          return updated;
        };
        return {
          where: (p: Pred) => {
            const promise = apply(p);
            return {
              returning: async () => promise,
              then: (res: (r: unknown) => unknown, rej?: (e: unknown) => unknown) =>
                promise.then(res, rej),
              catch: (rej: (e: unknown) => unknown) => promise.catch(rej),
            };
          },
        };
      },
    }),
    insert: (t: { __t: string }) => ({
      values: (vals: Record<string, unknown>) => {
        rowsOf(t).push(vals);
        const p = Promise.resolve([vals]);
        return {
          returning: async () => [vals],
          then: (res: (r: unknown) => unknown, rej?: (e: unknown) => unknown) => p.then(res, rej),
        };
      },
    }),
  };
  return { db, settingsTable, scanSnapshotTable };
});

vi.mock("drizzle-orm", () => ({
  eq: (col: { __c?: string }, val: unknown) => (r: Record<string, unknown>) =>
    r[col.__c ?? ""] === val,
  and:
    (...preds: Array<(r: Record<string, unknown>) => boolean>) =>
    (r: Record<string, unknown>) =>
      preds.every((p) => p(r)),
  or:
    (...preds: Array<(r: Record<string, unknown>) => boolean>) =>
    (r: Record<string, unknown>) =>
      preds.some((p) => p(r)),
  isNull: (col: { __c?: string }) => (r: Record<string, unknown>) => r[col.__c ?? ""] == null,
  lt: (col: { __c?: string }, val: Date) => (r: Record<string, unknown>) => {
    const v = r[col.__c ?? ""];
    return v instanceof Date && v < val;
  },
  desc: (c: unknown) => c,
  asc: (c: unknown) => c,
  sql: () => undefined,
}));

const runScreenerMock = vi.fn();
vi.mock("./screener", () => ({
  runScreener: (...a: unknown[]) => runScreenerMock(...a),
}));

vi.mock("./settingsStore", () => ({
  getSettings: vi.fn(async () => ({ cacheTtlMinutes: 15 })),
}));

vi.mock("./quiver/client", () => ({ isQuiverConfigured: () => false }));
vi.mock("./quiver/signals", () => ({ getQuiverSignals: vi.fn() }));

const sendEmailMock = vi.fn();
let emailConfigured = true;
vi.mock("./email", () => ({
  isEmailConfigured: () => emailConfigured,
  sendEmail: (...a: unknown[]) => sendEmailMock(...a),
}));

vi.mock("./userEmail", () => ({
  getNotificationEmail: vi.fn(async () => "user@example.com"),
}));

import { buildDigestHtml, isDigestDay, isDue, runDigestSweep } from "./digest";

// --- Fixtures ----------------------------------------------------------------

// 2026-09-04 is a Friday.
const FRI_14_UTC = new Date("2026-09-04T14:05:00Z");
const SAT = new Date("2026-09-05T14:05:00Z");

const candidate = (over: Record<string, unknown> = {}) => ({
  ticker: "AAPL",
  spot: 200,
  expiry: "2026-10-16",
  dte: 42,
  strike: 190,
  delta: -0.25,
  bid: 2.5,
  iv: 0.3,
  openInterest: 500,
  premiumPerContract: 250,
  collateralPerContract: 19000,
  staticReturnPct: 0.0131,
  annualizedPct: 0.114,
  breakeven: 187.5,
  pctOtm: 0.05,
  earningsInWindow: false,
  ivRank: 0.6,
  ivPercentile: 0.6,
  ivRankBasis: "real",
  ...over,
});

const settingsRow = (over: Partial<SettingsRow> = {}): SettingsRow => ({
  userId: "user-1",
  tier: "pro",
  digestEnabled: true,
  digestHourUtc: 13,
  notificationEmail: null,
  lastDigestAt: null,
  ...over,
});

beforeEach(() => {
  stores.settings = [];
  stores.snapshots = [];
  emailConfigured = true;
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue(true);
  runScreenerMock.mockReset();
  runScreenerMock.mockResolvedValue({
    scannedAt: FRI_14_UTC.toISOString(),
    candidates: [candidate()],
    errors: [],
    tickersScanned: 30,
    tickersWithCandidate: 1,
    hiddenByEarningsCount: 0,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

// --- Tests -------------------------------------------------------------------

describe("isDue / isDigestDay", () => {
  it("fires weekdays after the chosen hour, once per day", () => {
    expect(isDigestDay(FRI_14_UTC)).toBe(true);
    expect(isDigestDay(SAT)).toBe(false);
    expect(isDue(FRI_14_UTC, 13, null)).toBe(true);
    expect(isDue(FRI_14_UTC, 15, null)).toBe(false); // too early
    expect(isDue(FRI_14_UTC, 13, new Date("2026-09-04T13:10:00Z"))).toBe(false); // already sent today
    expect(isDue(FRI_14_UTC, 13, new Date("2026-09-03T13:10:00Z"))).toBe(true); // yesterday's send doesn't block
    expect(isDue(SAT, 13, null)).toBe(false); // weekend
  });
});

describe("buildDigestHtml", () => {
  it("renders top candidates with quiver scores and an honest footer", () => {
    const { subject, html, text } = buildDigestHtml({
      candidates: [
        { ...candidate(), quiverScore: 63 } as never,
        { ...candidate({ ticker: "MSFT", strike: 400 }), quiverScore: null } as never,
      ],
      tickersScanned: 30,
      appUrl: "https://example.com/dashboard",
      dateLabel: "2026-09-04",
    });
    expect(subject).toContain("AAPL");
    expect(html).toContain("MSFT");
    expect(html).toContain("63");
    expect(html).toContain("disclosures lag the trades");
    expect(html).toContain("https://example.com/dashboard");
    expect(text).toContain("AAPL $190.00P");
  });

  it("handles an empty candidate list", () => {
    const { subject, html } = buildDigestHtml({
      candidates: [],
      tickersScanned: 30,
      appUrl: "https://example.com",
      dateLabel: "2026-09-04",
    });
    expect(subject).toContain("no candidates");
    expect(html).toContain("Nothing cleared your filters");
  });
});

describe("runDigestSweep", () => {
  it("sends to due pro users, records the claim, and persists the scan", async () => {
    stores.settings = [settingsRow()];
    const result = await runDigestSweep(FRI_14_UTC);
    expect(result).toMatchObject({ checked: 1, sent: 1, failed: 0 });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][0].to).toBe("user@example.com");
    expect(stores.settings[0].lastDigestAt).toEqual(FRI_14_UTC);
    expect(stores.snapshots).toHaveLength(1);
  });

  it("is idempotent — a second sweep the same day sends nothing", async () => {
    stores.settings = [settingsRow()];
    await runDigestSweep(FRI_14_UTC);
    const second = await runDigestSweep(new Date("2026-09-04T15:00:00Z"));
    expect(second.sent).toBe(0);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("skips free-tier users, disabled users, not-yet-due hours, and weekends", async () => {
    stores.settings = [
      settingsRow({ userId: "free", tier: "free" }),
      settingsRow({ userId: "late", digestHourUtc: 20 }),
    ];
    const result = await runDigestSweep(FRI_14_UTC);
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(2);

    stores.settings = [settingsRow()];
    expect((await runDigestSweep(SAT)).sent).toBe(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("does nothing when the email transport is unconfigured", async () => {
    emailConfigured = false;
    stores.settings = [settingsRow()];
    const result = await runDigestSweep(FRI_14_UTC);
    expect(result.checked).toBe(0);
    expect(runScreenerMock).not.toHaveBeenCalled();
  });

  it("releases the claim when the send fails so a later sweep can retry", async () => {
    sendEmailMock.mockResolvedValue(false);
    stores.settings = [settingsRow()];
    const result = await runDigestSweep(FRI_14_UTC);
    expect(result.failed).toBe(1);
    expect(stores.settings[0].lastDigestAt).toBeNull();

    sendEmailMock.mockResolvedValue(true);
    const retry = await runDigestSweep(new Date("2026-09-04T15:00:00Z"));
    expect(retry.sent).toBe(1);
  });
});
