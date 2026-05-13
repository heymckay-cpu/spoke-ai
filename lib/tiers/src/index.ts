export const TIERS = ["free", "pro", "ultra"] as const;
export type Tier = (typeof TIERS)[number];

export function isTier(value: unknown): value is Tier {
  return typeof value === "string" && (TIERS as readonly string[]).includes(value);
}

const TIER_RANK: Record<Tier, number> = {
  free: 0,
  pro: 1,
  ultra: 2,
};

export function tierRank(t: Tier): number {
  return TIER_RANK[t];
}

export function tierAtLeast(actual: Tier, required: Tier): boolean {
  return TIER_RANK[actual] >= TIER_RANK[required];
}

export interface CapabilitySpec {
  /** Minimum tier required to use this capability. */
  tier: Tier;
  /** Short label for UI rendering (e.g. capability table). */
  label: string;
  /** One-line description shown in the plan table. */
  description: string;
}

/**
 * Single source of truth for every gateable capability in the app.
 * Adding a new gated feature: add a key here and reference it everywhere
 * (server middleware, client hook, plan-table UI). Removing a key is a
 * breaking change to the gating contract.
 */
export const CAPABILITIES = {
  "ai.explainer": {
    tier: "pro",
    label: "AI trade explainer",
    description: "Plain-English breakdown of why a candidate is (or isn't) a good wheel trade.",
  },
  "ai.advisor": {
    tier: "ultra",
    label: "AI roll advisor",
    description: "Recommend roll vs. assignment vs. close for each at-risk position.",
  },
  "ai.qa": {
    tier: "ultra",
    label: "Portfolio Q&A",
    description: "Ask plain-English questions about your positions and get answered by Claude.",
  },
  "alerts.email": {
    tier: "pro",
    label: "Email alerts",
    description: "Get position alerts (assignment risk, near-expiry) delivered to your inbox.",
  },
  "screener.fullUniverse": {
    tier: "pro",
    label: "Full screener universe",
    description: "Scan the full S&P universe rather than a small free-tier sample.",
  },
  "data.realtime": {
    tier: "ultra",
    label: "Real-time market data",
    description: "Live brokerage-grade quotes via Tradier instead of delayed feeds.",
  },
} as const satisfies Record<string, CapabilitySpec>;

export type Capability = keyof typeof CAPABILITIES;

export const CAPABILITY_KEYS = Object.keys(CAPABILITIES) as Capability[];

export function requiredTier(capability: Capability): Tier {
  return CAPABILITIES[capability].tier;
}

export function hasCapability(tier: Tier, capability: Capability): boolean {
  return tierAtLeast(tier, requiredTier(capability));
}

export interface TierBlocked {
  code: "tier_required";
  capability: Capability;
  required: Tier;
  current: Tier;
}

export function buildTierBlockedPayload(
  capability: Capability,
  current: Tier,
): TierBlocked {
  return {
    code: "tier_required",
    capability,
    required: requiredTier(capability),
    current,
  };
}
