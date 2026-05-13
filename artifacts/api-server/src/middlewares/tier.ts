import type { Request, RequestHandler } from "express";
import {
  buildTierBlockedPayload,
  hasCapability,
  isTier,
  type Capability,
  type Tier,
} from "@workspace/tiers";
import { getCurrentTierForUser } from "../lib/tierStore";
import { getUserId } from "./auth";

/**
 * Resolve the per-user tier from the settings row.
 */
export async function getCurrentTier(req: Request): Promise<Tier> {
  const userId = getUserId(req);
  return getCurrentTierForUser(userId);
}

/**
 * Express middleware that 403s when the caller's tier is below the
 * minimum required for `capability`. Always emits the canonical
 * `{ code: "tier_required", required, current, capability }` payload so
 * clients can render a single upgrade UI for any gated endpoint.
 */
export function requireCapability(capability: Capability): RequestHandler {
  return async (req, res, next) => {
    try {
      const tier = await getCurrentTier(req);
      if (!isTier(tier)) {
        res.status(403).json(buildTierBlockedPayload(capability, "free"));
        return;
      }
      if (!hasCapability(tier, capability)) {
        res.status(403).json(buildTierBlockedPayload(capability, tier));
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
