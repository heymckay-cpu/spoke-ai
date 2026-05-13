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
import { setUserTier } from "../lib/tierStore";
import { getUserId } from "../middlewares/auth";

const router: IRouter = Router();

function buildStatus(tier: ReturnType<typeof isTier> extends true ? never : string) {
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

router.put("/tier", async (req, res): Promise<void> => {
  const parsed = SetTierBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  // TODO: Gate this behind Stripe billing in the billing follow-up task.
  // No billing yet — test users can self-select any tier freely.
  const userId = getUserId(req);
  const next = await setUserTier(userId, parsed.data.tier);
  res.json(SetTierResponse.parse(buildStatus(next)));
});

export default router;
