import { Router, type IRouter } from "express";
import {
  UpdateSettingsBody,
  GetSettingsResponse,
  UpdateSettingsResponse,
  GetDigestSettingsResponse,
  UpdateDigestSettingsBody,
  UpdateDigestSettingsResponse,
} from "@workspace/api-zod";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getSettings, saveSettings } from "../lib/settingsStore";
import { getUserId } from "../middlewares/auth";
import { requireCapability } from "../middlewares/tier";
import { isEmailConfigured } from "../lib/email";
import { getAccountEmail } from "../lib/userEmail";

const router: IRouter = Router();

router.get("/settings", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const s = await getSettings(userId);
  res.json(GetSettingsResponse.parse(s));
});

router.put("/settings", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const v = parsed.data;
  if (v.minDte > v.maxDte) {
    res.status(400).json({ error: "minDte must be <= maxDte" });
    return;
  }
  if (v.minDelta > v.maxDelta) {
    res.status(400).json({ error: "minDelta must be <= maxDelta" });
    return;
  }
  if (v.targetDelta < v.minDelta || v.targetDelta > v.maxDelta) {
    res.status(400).json({ error: "targetDelta must be within [minDelta, maxDelta]" });
    return;
  }
  const s = await saveSettings(userId, v);
  res.json(UpdateSettingsResponse.parse(s));
});

router.get("/settings/digest", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  // Ensure the settings row exists (seeds defaults on first touch).
  await getSettings(userId);
  const [row] = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.userId, userId));
  const accountEmail = await getAccountEmail(userId);
  res.json(
    GetDigestSettingsResponse.parse({
      enabled: row?.digestEnabled ?? false,
      hourUtc: row?.digestHourUtc ?? 13,
      email: row?.notificationEmail ?? null,
      accountEmail,
      emailConfigured: isEmailConfigured(),
      lastDigestAt: row?.lastDigestAt ? row.lastDigestAt.toISOString() : null,
    }),
  );
});

router.put(
  "/settings/digest",
  requireCapability("alerts.email"),
  async (req, res): Promise<void> => {
    const userId = getUserId(req);
    const parsed = UpdateDigestSettingsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const v = parsed.data;
    await getSettings(userId); // seed the row if needed
    const [updated] = await db
      .update(settingsTable)
      .set({
        digestEnabled: v.enabled,
        digestHourUtc: v.hourUtc,
        notificationEmail: v.email?.trim() || null,
      })
      .where(eq(settingsTable.userId, userId))
      .returning();
    if (!updated) {
      res.status(500).json({ error: "failed to update digest settings" });
      return;
    }
    const accountEmail = await getAccountEmail(userId);
    res.json(
      UpdateDigestSettingsResponse.parse({
        enabled: updated.digestEnabled,
        hourUtc: updated.digestHourUtc,
        email: updated.notificationEmail ?? null,
        accountEmail,
        emailConfigured: isEmailConfigured(),
        lastDigestAt: updated.lastDigestAt ? updated.lastDigestAt.toISOString() : null,
      }),
    );
  },
);

export default router;
