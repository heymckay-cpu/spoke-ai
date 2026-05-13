import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { isTier, type Tier } from "@workspace/tiers";
import { logger } from "./logger";

/**
 * Default tier for fresh installs. Dev defaults to `ultra` so every gated
 * feature is exercisable end-to-end without flipping switches; production
 * defaults to `free` so monetization works as soon as billing lands.
 *
 * Centralized here so the schema default, the seed insert in settingsStore,
 * and the read-side fallback all agree on a single source of truth.
 */
export function defaultTier(): Tier {
  return process.env["NODE_ENV"] === "production" ? "free" : "ultra";
}

/**
 * Read the singleton tier from the settings row. The settings row is
 * lazily created by `getSettings`; if it doesn't exist yet (e.g. a fresh
 * install where /tier was hit before /settings), fall back to the
 * environment-aware default.
 */
export async function getCurrentTierForRequest(): Promise<Tier> {
  const rows = await db
    .select({ tier: settingsTable.tier })
    .from(settingsTable)
    .where(eq(settingsTable.id, 1));
  const raw = rows[0]?.tier;
  if (raw && isTier(raw)) return raw;
  if (raw) {
    logger.warn({ raw }, "settings.tier holds a value outside the Tier enum; using default");
  }
  return defaultTier();
}

/**
 * Persist the user's tier. The settings row is created on first read; if
 * a tier write happens before that (test / fresh install), seed a minimal
 * row so the upsert succeeds without violating NOT NULL on the screener
 * defaults.
 */
export async function setCurrentTier(tier: Tier): Promise<Tier> {
  const result = await db
    .update(settingsTable)
    .set({ tier, updatedAt: new Date() })
    .where(eq(settingsTable.id, 1))
    .returning({ tier: settingsTable.tier });
  if (result.length === 0) {
    // No settings row yet — defer to getSettings(), which seeds defaults,
    // then re-apply the tier.
    const { getSettings } = await import("./settingsStore");
    await getSettings();
    await db
      .update(settingsTable)
      .set({ tier, updatedAt: new Date() })
      .where(eq(settingsTable.id, 1));
  }
  return tier;
}
