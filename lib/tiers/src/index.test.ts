import { describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  CAPABILITY_KEYS,
  TIERS,
  buildTierBlockedPayload,
  hasCapability,
  isTier,
  requiredTier,
  tierAtLeast,
  tierRank,
  type Capability,
  type Tier,
} from "./index";

describe("tier utilities", () => {
  it("ranks tiers in monotonically increasing order", () => {
    expect(tierRank("free")).toBeLessThan(tierRank("pro"));
    expect(tierRank("pro")).toBeLessThan(tierRank("ultra"));
  });

  it("treats higher tiers as satisfying lower-tier requirements", () => {
    expect(tierAtLeast("ultra", "free")).toBe(true);
    expect(tierAtLeast("ultra", "pro")).toBe(true);
    expect(tierAtLeast("ultra", "ultra")).toBe(true);
    expect(tierAtLeast("pro", "ultra")).toBe(false);
    expect(tierAtLeast("free", "pro")).toBe(false);
  });

  it("validates tier strings via isTier", () => {
    for (const t of TIERS) expect(isTier(t)).toBe(true);
    expect(isTier("enterprise")).toBe(false);
    expect(isTier(undefined)).toBe(false);
    expect(isTier(null)).toBe(false);
    expect(isTier(42)).toBe(false);
  });
});

describe("entitlements map", () => {
  it("assigns a valid tier to every capability", () => {
    for (const cap of CAPABILITY_KEYS) {
      const t = requiredTier(cap);
      expect(TIERS).toContain(t);
    }
  });

  it("ships with a non-empty label and description per capability", () => {
    for (const cap of CAPABILITY_KEYS) {
      const spec = CAPABILITIES[cap];
      expect(spec.label.length).toBeGreaterThan(0);
      expect(spec.description.length).toBeGreaterThan(0);
    }
  });

  it("CAPABILITY_KEYS matches the entitlement object keys exactly", () => {
    expect(new Set(CAPABILITY_KEYS)).toEqual(new Set(Object.keys(CAPABILITIES)));
  });

  it("hasCapability follows the required-tier ladder", () => {
    // Pick a representative capability per tier to make the matrix explicit.
    const samples: Array<{ cap: Capability; minTier: Tier }> = [
      { cap: "ai.explainer", minTier: "pro" },
      { cap: "ai.advisor", minTier: "ultra" },
      { cap: "alerts.email", minTier: "pro" },
      { cap: "data.realtime", minTier: "ultra" },
    ];
    for (const { cap, minTier } of samples) {
      expect(requiredTier(cap)).toBe(minTier);
      expect(hasCapability("free", cap)).toBe(minTier === "free");
      expect(hasCapability("pro", cap)).toBe(minTier !== "ultra");
      expect(hasCapability("ultra", cap)).toBe(true);
    }
  });
});

describe("buildTierBlockedPayload", () => {
  it("emits the canonical 403 shape", () => {
    const payload = buildTierBlockedPayload("ai.advisor", "free");
    expect(payload).toEqual({
      code: "tier_required",
      capability: "ai.advisor",
      required: "ultra",
      current: "free",
    });
  });
});
