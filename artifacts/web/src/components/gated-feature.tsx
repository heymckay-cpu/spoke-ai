import { type ReactNode } from "react";
import { Lock } from "lucide-react";
import { type Capability, type Tier } from "@workspace/tiers";
import { useCapability } from "@/hooks/use-capability";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface GatedFeatureProps {
  capability: Capability;
  children: ReactNode;
  /** Optional override for the upgrade prompt copy. */
  upgradeTitle?: string;
  upgradeDescription?: string;
  /** Optional render-prop for fully custom upgrade UI. */
  renderUpgrade?: (info: { required: Tier; current: Tier | null }) => ReactNode;
  className?: string;
}

const TIER_LABEL: Record<Tier, string> = {
  free: "Free",
  pro: "Pro",
  ultra: "Ultra",
};

/**
 * Wraps a feature behind a tier check. Renders `children` when the user
 * has the capability, an inline upgrade prompt when they don't, and a
 * skeleton placeholder while the tier query is loading. This lets gated
 * UI live next to ungated UI without breaking the surrounding layout.
 */
export function GatedFeature({
  capability,
  children,
  upgradeTitle,
  upgradeDescription,
  renderUpgrade,
  className,
}: GatedFeatureProps) {
  const { allowed, loading, tier, required } = useCapability(capability);

  if (loading) {
    return (
      <Skeleton
        className={cn("h-24 w-full", className)}
        data-testid={`gated-${capability}-loading`}
      />
    );
  }

  if (allowed) return <>{children}</>;

  if (renderUpgrade) {
    return <>{renderUpgrade({ required, current: tier })}</>;
  }

  const requiredLabel = TIER_LABEL[required];

  return (
    <Card
      className={cn("border-dashed border-card-border bg-muted/30", className)}
      data-testid={`gated-${capability}-upgrade`}
    >
      <CardContent className="flex items-start gap-3 p-5">
        <div className="rounded-md bg-accent/60 p-2 text-accent-foreground">
          <Lock className="h-4 w-4" aria-hidden />
        </div>
        <div className="space-y-1">
          <div className="text-sm font-semibold tracking-tight">
            {upgradeTitle ?? `Upgrade to ${requiredLabel} to unlock`}
          </div>
          <p className="text-xs text-muted-foreground">
            {upgradeDescription ??
              `This feature is part of the ${requiredLabel} plan. You're currently on ${tier ? TIER_LABEL[tier] : "an unknown plan"}.`}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
