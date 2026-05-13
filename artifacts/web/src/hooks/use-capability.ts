import { useGetTier } from "@workspace/api-client-react";
import {
  hasCapability,
  requiredTier as requiredTierFor,
  type Capability,
  type Tier,
} from "@workspace/tiers";

export interface UseCapabilityResult {
  /** True when the tier query has resolved and the user has access. */
  allowed: boolean;
  /** True until the tier query has resolved at least once. */
  loading: boolean;
  /** The user's current tier, or null while loading / on error. */
  tier: Tier | null;
  /** The minimum tier required for this capability. */
  required: Tier;
  /** True when the request to load tier info failed. */
  error: boolean;
}

/**
 * React hook returning whether the current user can use `capability`.
 *
 * Pairs with `<GatedFeature capability="...">` for the common case of
 * "render the feature, or render an upgrade prompt." Use this hook
 * directly when you need to branch on `loading` (e.g. don't show an
 * upgrade flash before the tier query resolves).
 */
export function useCapability(capability: Capability): UseCapabilityResult {
  const { data, isLoading, isError } = useGetTier();
  const required = requiredTierFor(capability);
  const tier = (data?.tier as Tier | undefined) ?? null;
  const allowed = tier ? hasCapability(tier, capability) : false;
  return {
    allowed,
    loading: isLoading,
    tier,
    required,
    error: isError,
  };
}
