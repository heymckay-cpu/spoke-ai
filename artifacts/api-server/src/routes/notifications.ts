import { Router, type IRouter } from "express";
import { db, notificationsTable } from "@workspace/db";
import { and, desc, eq, isNull } from "drizzle-orm";
import {
  ListNotificationsResponse,
  AckNotificationParams,
  AckNotificationResponse,
  AckAllNotificationsResponse,
  ScanForAlertsResponse,
} from "@workspace/api-zod";
import { scanPositionsForAlerts } from "../lib/alerts";
import { requireCapability } from "../middlewares/tier";
import { getUserId } from "../middlewares/auth";

const router: IRouter = Router();

function rowToOut(row: typeof notificationsTable.$inferSelect) {
  return {
    id: row.id,
    positionId: row.positionId,
    kind: row.kind as "itm" | "expiring_soon",
    ticker: row.ticker,
    message: row.message,
    triggeredAt: row.triggeredAt.toISOString(),
    acknowledgedAt: row.acknowledgedAt ? row.acknowledgedAt.toISOString() : null,
  };
}

router.get("/notifications", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const rows = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, userId))
    .orderBy(desc(notificationsTable.triggeredAt))
    .limit(100);
  const items = rows.map(rowToOut);
  const unreadCount = items.filter((n) => n.acknowledgedAt == null).length;
  res.json(
    ListNotificationsResponse.parse({
      notifications: items,
      unreadCount,
    }),
  );
});

router.post("/notifications/:id/ack", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const params = AckNotificationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [updated] = await db
    .update(notificationsTable)
    .set({ acknowledgedAt: new Date() })
    .where(and(eq(notificationsTable.id, params.data.id), eq(notificationsTable.userId, userId)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }
  res.json(AckNotificationResponse.parse(rowToOut(updated)));
});

router.post("/notifications/ack-all", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const result = await db
    .update(notificationsTable)
    .set({ acknowledgedAt: new Date() })
    .where(and(eq(notificationsTable.userId, userId), isNull(notificationsTable.acknowledgedAt)))
    .returning({ id: notificationsTable.id });
  res.json(AckAllNotificationsResponse.parse({ acknowledged: result.length }));
});

router.post("/notifications/scan", requireCapability("alerts.email"), async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const result = await scanPositionsForAlerts(userId);
  res.json(ScanForAlertsResponse.parse(result));
});

export default router;
