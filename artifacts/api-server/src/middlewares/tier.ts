import type { Request, RequestHandler } from "express";
import {
  buildTierBlockedPayload,
  hasCapability,
  isTier,
  type Capability,
  type Tier,
} from "@workspace/tiers";
import { getCurrentTierForRequest } from "../lib/tierStore";

/**
 * Resolve the tier of the user behind this request.
 *
 * Today the app is single-tenant — there is no auth, and the tier lives on
 * the singleton settings row. This indirection exists so per-user storage
 * (post-auth) is a localized change.
 */
export async function getCurrentTier(_req: Request): Promise<Tier> {
  return getCurrentTierForRequest();
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
        // Defensive: a corrupt tier value should never silently allow access.
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
