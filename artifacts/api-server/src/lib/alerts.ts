import { db, positionsTable, notificationsTable } from "@workspace/db";
import { and, eq, isNull, inArray } from "drizzle-orm";
import { hasCapability } from "@workspace/tiers";
import { getSpot } from "./market";
import { logger } from "./logger";
import { getCurrentTierForUser } from "./tierStore";

export const EXPIRING_SOON_DTE = 3;

// Per-user single-flight mutex map so two scans for the same user can never
// run in parallel and double-fire alerts.
const inFlightByUser = new Map<string, Promise<AlertScanResult>>();

function dteFromIso(expiry: string): number {
  const exp = new Date(`${expiry}T00:00:00Z`).getTime();
  if (Number.isNaN(exp)) return 0;
  return Math.round((exp - Date.now()) / (24 * 60 * 60 * 1000));
}

export interface AlertScanResult {
  scanned: number;
  itmAlerts: number;
  expiringAlerts: number;
}

export async function scanPositionsForAlerts(userId: string): Promise<AlertScanResult> {
  const existing = inFlightByUser.get(userId);
  if (existing) return existing;
  const promise = (async (): Promise<AlertScanResult> => {
    try {
      return await runScan(userId);
    } finally {
      inFlightByUser.delete(userId);
    }
  })();
  inFlightByUser.set(userId, promise);
  return promise;
}

async function runScan(userId: string): Promise<AlertScanResult> {
  const open = await db
    .select()
    .from(positionsTable)
    .where(and(eq(positionsTable.userId, userId), isNull(positionsTable.closedAt)));

  let itmAlerts = 0;
  let expiringAlerts = 0;

  for (const row of open) {
    const dte = dteFromIso(row.expiry);

    let spot: number | null = null;
    try {
      spot = await getSpot(row.ticker);
    } catch (err) {
      logger.debug({ err, ticker: row.ticker }, "alert scan: getSpot failed");
    }

    const isItm = spot != null && spot < row.strike;
    if (isItm) {
      const claimed = await db
        .update(positionsTable)
        .set({ lastAlertedItmAt: new Date() })
        .where(
          and(
            eq(positionsTable.id, row.id),
            eq(positionsTable.userId, userId),
            isNull(positionsTable.lastAlertedItmAt),
          ),
        )
        .returning({ id: positionsTable.id });
      if (claimed.length > 0) {
        const message =
          `${row.ticker} ${row.strike}P ${row.expiry} is in the money ` +
          `(spot ${spot!.toFixed(2)} < strike ${row.strike.toFixed(2)}). ` +
          `Consider rolling or closing.`;
        await db.insert(notificationsTable).values({
          userId,
          positionId: row.id,
          kind: "itm",
          ticker: row.ticker,
          message,
        });
        itmAlerts += 1;
      }
    } else if (spot != null && row.lastAlertedItmAt != null) {
      await db
        .update(positionsTable)
        .set({ lastAlertedItmAt: null })
        .where(and(eq(positionsTable.id, row.id), eq(positionsTable.userId, userId)));
    }

    const isExpiringSoon = dte >= 0 && dte <= EXPIRING_SOON_DTE;
    if (isExpiringSoon) {
      const claimed = await db
        .update(positionsTable)
        .set({ lastAlertedExpiringSoonAt: new Date() })
        .where(
          and(
            eq(positionsTable.id, row.id),
            eq(positionsTable.userId, userId),
            isNull(positionsTable.lastAlertedExpiringSoonAt),
          ),
        )
        .returning({ id: positionsTable.id });
      if (claimed.length > 0) {
        const message =
          `${row.ticker} ${row.strike}P expires in ${dte} day${dte === 1 ? "" : "s"} ` +
          `(${row.expiry}). Plan to roll, close, or take assignment.`;
        await db.insert(notificationsTable).values({
          userId,
          positionId: row.id,
          kind: "expiring_soon",
          ticker: row.ticker,
          message,
        });
        expiringAlerts += 1;
      }
    }
  }

  return { scanned: open.length, itmAlerts, expiringAlerts };
}

let intervalHandle: NodeJS.Timeout | null = null;

export function startAlertScheduler(intervalMinutes = 15): void {
  if (intervalHandle) return;
  const intervalMs = Math.max(1, intervalMinutes) * 60 * 1000;

  const run = async () => {
    try {
      // Find all distinct userIds that have open positions so each gets their own alert scan.
      const userRows = await db
        .selectDistinct({ userId: positionsTable.userId })
        .from(positionsTable)
        .where(isNull(positionsTable.closedAt));

      for (const { userId } of userRows) {
        try {
          const tier = await getCurrentTierForUser(userId);
          if (!hasCapability(tier, "alerts.email")) {
            logger.debug({ tier, userId }, "alert scheduler: skipped (tier below alerts.email)");
            continue;
          }
          const result = await scanPositionsForAlerts(userId);
          if (result.itmAlerts > 0 || result.expiringAlerts > 0) {
            logger.info({ ...result, userId }, "alert scan: fired notifications");
          } else {
            logger.debug({ ...result, userId }, "alert scan: no new alerts");
          }
        } catch (err) {
          logger.warn({ err, userId }, "alert scan failed for user");
        }
      }
    } catch (err) {
      logger.warn({ err }, "alert scheduler: failed to fetch active users");
    }
  };

  setTimeout(run, 30_000);
  intervalHandle = setInterval(run, intervalMs);
  if (typeof intervalHandle.unref === "function") intervalHandle.unref();
  logger.info({ intervalMinutes }, "alert scheduler started");
}

export function stopAlertScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

export async function clearAlertMarkers(positionId: number): Promise<void> {
  await db
    .update(positionsTable)
    .set({ lastAlertedItmAt: null, lastAlertedExpiringSoonAt: null })
    .where(eq(positionsTable.id, positionId));
}

type DbExecutor = Pick<typeof db, "delete">;
export async function deleteNotificationsForPosition(
  positionId: number,
  executor: DbExecutor = db,
): Promise<void> {
  await executor.delete(notificationsTable).where(eq(notificationsTable.positionId, positionId));
}

export { and, isNull, inArray };
