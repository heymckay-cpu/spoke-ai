import { Router, type IRouter } from "express";
import {
  CAPABILITY_KEYS,
  CAPABILITIES,
  hasCapability,
  isTier,
  type Capability,
} from "@workspace/tiers";
import { GetTierResponse, SetTierBody, SetTierResponse } from "@workspace/api-zod";
import { getCurrentTier } from "../middlewares/tier";
import { setCurrentTier } from "../lib/tierStore";

const router: IRouter = Router();

function buildStatus(tier: ReturnType<typeof isTier> extends true ? never : string) {
  // The cast is safe — every code path constructs `tier` from a validated source.
  const t = tier as "free" | "pro" | "ultra";
  return {
    tier: t,
    capabilities: CAPABILITY_KEYS.map((cap: Capability) => {
      const spec = CAPABILITIES[cap];
      return {
        capability: cap,
        label: spec.label,
        description: spec.description,
        requiredTier: spec.tier,
        available: hasCapability(t, cap),
      };
    }),
  };
}

router.get("/tier", async (req, res): Promise<void> => {
  const tier = await getCurrentTier(req);
  res.json(GetTierResponse.parse(buildStatus(tier)));
});

router.put("/tier", async (_req, res): Promise<void> => {
  const parsed = SetTierBody.safeParse(_req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const next = await setCurrentTier(parsed.data.tier);
  res.json(SetTierResponse.parse(buildStatus(next)));
});

export default router;
