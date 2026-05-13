import { db, positionsTable, notificationsTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { hasCapability } from "@workspace/tiers";
import { getSpot } from "./market";
import { logger } from "./logger";
import { getCurrentTierForRequest } from "./tierStore";

export const EXPIRING_SOON_DTE = 3;

// Single-flight mutex: the scheduled interval and the manual /notifications/scan
// route share this lock so two scans can never run in parallel and double-fire
// alerts. Concurrent callers receive the in-flight scan's result.
let inFlight: Promise<AlertScanResult> | null = null;

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

// Scan all open positions and create notifications for any that have crossed
// into ITM or are within EXPIRING_SOON_DTE days of expiry. Each condition
// fires at most once per position (tracked via lastAlerted* columns); the
// alert resets when the underlying condition clears (e.g. spot recovers
// above strike).
export async function scanPositionsForAlerts(): Promise<AlertScanResult> {
  // De-dupe overlapping callers (scheduler tick + manual /scan) by handing
  // them the same in-flight promise.
  if (inFlight) return inFlight;
  inFlight = (async (): Promise<AlertScanResult> => {
    try {
      return await runScan();
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

async function runScan(): Promise<AlertScanResult> {
  const open = await db
    .select()
    .from(positionsTable)
    .where(isNull(positionsTable.closedAt));

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

    // ITM detection — fire once per crossing. The atomic conditional update
    // (set marker WHERE marker IS NULL) ensures only one writer can claim
    // the alert slot, even if a second scan slips past the in-process mutex
    // (e.g. across processes). Insert only happens when we won the claim.
    const isItm = spot != null && spot < row.strike;
    if (isItm) {
      const claimed = await db
        .update(positionsTable)
        .set({ lastAlertedItmAt: new Date() })
        .where(
          and(
            eq(positionsTable.id, row.id),
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
          positionId: row.id,
          kind: "itm",
          ticker: row.ticker,
          message,
        });
        itmAlerts += 1;
      }
    } else if (spot != null && row.lastAlertedItmAt != null) {
      // Spot recovered — reset so a future re-cross alerts again.
      await db
        .update(positionsTable)
        .set({ lastAlertedItmAt: null })
        .where(eq(positionsTable.id, row.id));
    }

    // Expiring soon — same atomic-claim pattern.
    const isExpiringSoon = dte >= 0 && dte <= EXPIRING_SOON_DTE;
    if (isExpiringSoon) {
      const claimed = await db
        .update(positionsTable)
        .set({ lastAlertedExpiringSoonAt: new Date() })
        .where(
          and(
            eq(positionsTable.id, row.id),
            isNull(positionsTable.lastAlertedExpiringSoonAt),
          ),
        )
        .returning({ id: positionsTable.id });
      if (claimed.length > 0) {
        const message =
          `${row.ticker} ${row.strike}P expires in ${dte} day${dte === 1 ? "" : "s"} ` +
          `(${row.expiry}). Plan to roll, close, or take assignment.`;
        await db.insert(notificationsTable).values({
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

// Start a background scheduler that periodically scans open positions for
// alert conditions. Safe to call multiple times — only one scheduler runs.
// First scan is delayed slightly so the server can finish booting.
export function startAlertScheduler(intervalMinutes = 15): void {
  if (intervalHandle) return;
  const intervalMs = Math.max(1, intervalMinutes) * 60 * 1000;

  const run = async () => {
    try {
      // Email-style alert delivery is gated behind `alerts.email` (Pro+).
      // Free-tier installs still see the in-app notifications produced by
      // the manual route on demand, but the scheduler — which is what
      // would feed an SMTP/Resend integration once added — is silenced
      // until the tier qualifies. This keeps the scheduler honest now
      // even though the actual email transport hasn't shipped yet.
      const tier = await getCurrentTierForRequest();
      if (!hasCapability(tier, "alerts.email")) {
        logger.debug({ tier }, "alert scheduler: skipped (tier below alerts.email)");
        return;
      }
      const result = await scanPositionsForAlerts();
      if (result.itmAlerts > 0 || result.expiringAlerts > 0) {
        logger.info(
          { ...result },
          "alert scan: fired notifications",
        );
      } else {
        logger.debug({ ...result }, "alert scan: no new alerts");
      }
    } catch (err) {
      logger.warn({ err }, "alert scan failed");
    }
  };

  // Initial delayed run, then on a fixed interval.
  setTimeout(run, 30_000);
  intervalHandle = setInterval(run, intervalMs);
  // Don't keep the event loop alive solely for this timer.
  if (typeof intervalHandle.unref === "function") intervalHandle.unref();
  logger.info({ intervalMinutes }, "alert scheduler started");
}

export function stopAlertScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

// Reset the alert marker for a position. Called when a position is closed
// (re-opening should alert fresh) or when the user acknowledges a stale
// alert and wants to be re-notified later.
export async function clearAlertMarkers(positionId: number): Promise<void> {
  await db
    .update(positionsTable)
    .set({ lastAlertedItmAt: null, lastAlertedExpiringSoonAt: null })
    .where(eq(positionsTable.id, positionId));
}

// Accepts an optional Drizzle transaction handle so callers running inside a
// db.transaction(...) can opt in to atomic cleanup. Default is the global db
// for backward compatibility with non-transactional call sites.
type DbExecutor = Pick<typeof db, "delete">;
export async function deleteNotificationsForPosition(
  positionId: number,
  executor: DbExecutor = db,
): Promise<void> {
  await executor.delete(notificationsTable).where(eq(notificationsTable.positionId, positionId));
}

export { and, isNull };
