import { Router, type IRouter } from "express";
import { UpdateSettingsBody, GetSettingsResponse, UpdateSettingsResponse } from "@workspace/api-zod";
import { getSettings, saveSettings } from "../lib/settingsStore";

const router: IRouter = Router();

router.get("/settings", async (_req, res): Promise<void> => {
  const s = await getSettings();
  res.json(GetSettingsResponse.parse(s));
});

router.put("/settings", async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const s = await saveSettings(parsed.data);
  res.json(UpdateSettingsResponse.parse(s));
});

export default router;
