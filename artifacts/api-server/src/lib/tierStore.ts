import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { isTier, type Tier } from "@workspace/tiers";
import { logger } from "./logger";

/**
 * Default tier for new users.
 * NOTE: No billing yet — test users can self-select any tier from the Settings
 * page. When Stripe billing is added, gate the PUT /tier endpoint there.
 * TODO: Gate tier mutation behind Stripe in the billing follow-up task.
 */
export function defaultTier(): Tier {
  return "free";
}

/**
 * Read the per-user tier from their settings row. If the row doesn't exist
 * yet (fresh account, first request), returns the default tier.
 */
export async function getCurrentTierForUser(userId: string): Promise<Tier> {
  const rows = await db
    .select({ tier: settingsTable.tier })
    .from(settingsTable)
    .where(eq(settingsTable.userId, userId));
  const raw = rows[0]?.tier;
  if (raw && isTier(raw)) return raw;
  if (raw) {
    logger.warn({ raw, userId }, "settings.tier holds a value outside the Tier enum; using default");
  }
  return defaultTier();
}

/**
 * Persist the per-user tier. The settings row is lazily created on first
 * read; if a tier write happens before that, upsert a minimal row so the
 * write succeeds.
 */
export async function setUserTier(userId: string, tier: Tier): Promise<Tier> {
  await db
    .insert(settingsTable)
    .values({
      userId,
      tickers: [],
      minDte: 25,
      maxDte: 50,
      targetDelta: 0.25,
      minDelta: 0.15,
      maxDelta: 0.35,
      minOpenInterest: 100,
      minBid: 0.1,
      minUnderlyingPrice: 5.0,
      riskFreeRate: 0.045,
      topN: 20,
      cacheTtlMinutes: 15,
      tier,
    })
    .onConflictDoUpdate({
      target: settingsTable.userId,
      set: { tier, updatedAt: new Date() },
    });
  return tier;
}
