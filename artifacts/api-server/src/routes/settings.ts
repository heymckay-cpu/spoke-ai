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
  // Cross-field invariants the per-field zod schema can't express.
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
  const s = await saveSettings(v);
  res.json(UpdateSettingsResponse.parse(s));
});

export default router;
